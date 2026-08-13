"""Connection pool — reusable HTTP connections to Ollama servers.

Maintains a pool of persistent connections per server URL, reducing TCP
handshake overhead for repeated requests. Connections are validated and
recycled automatically.
"""

from __future__ import annotations

import asyncio
import http.client
import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


@dataclass
class PooledConnection:
    host: str
    port: int
    conn: http.client.HTTPConnection
    last_used: float
    in_use: bool = False
    request_count: int = 0


class ConnectionPool:
    """Pool of reusable HTTP connections to Ollama servers."""

    def __init__(self, max_connections_per_host: int = 4, idle_timeout_s: int = 120) -> None:
        self.max_per_host = max_connections_per_host
        self.idle_timeout_s = idle_timeout_s
        self._pools: dict[str, list[PooledConnection]] = {}
        self._lock = asyncio.Lock()

    def _host_key(self, url: str) -> str:
        parsed = urlparse(url)
        return f"{parsed.hostname}:{parsed.port or 80}"

    async def acquire(self, url: str) -> PooledConnection:
        """Acquire a connection from the pool or create a new one."""
        key = self._host_key(url)
        parsed = urlparse(url)

        async with self._lock:
            pool = self._pools.setdefault(key, [])
            # Evict invalid connections
            valid: list[PooledConnection] = []
            for pc in pool:
                if pc.in_use:
                    valid.append(pc)
                elif self._is_valid(pc):
                    valid.append(pc)
                else:
                    try:
                        pc.conn.close()
                    except Exception:
                        pass
                    logger.debug("Evicted stale connection from %s", key)
            self._pools[key] = valid
            pool = valid

            # Try to reuse an available valid connection
            for pc in pool:
                if not pc.in_use:
                    pc.in_use = True
                    pc.last_used = time.time()
                    pc.request_count += 1
                    return pc

            # Create a new connection
            conn = http.client.HTTPConnection(parsed.hostname, parsed.port or 80, timeout=300)
            pc = PooledConnection(
                host=parsed.hostname, port=parsed.port or 80,
                conn=conn, last_used=time.time(), in_use=True, request_count=1,
            )
            pool.append(pc)
            logger.debug("Created new connection to %s (pool: %d)", key, len(pool))
            return pc

    async def release(self, pc: PooledConnection) -> None:
        """Release a connection back to the pool."""
        pc.in_use = False
        pc.last_used = time.time()

    async def destroy(self, pc: PooledConnection) -> None:
        """Remove a broken connection from the pool."""
        pc.in_use = False
        try:
            pc.conn.close()
        except Exception:
            pass
        key = f"{pc.host}:{pc.port}"
        pool = self._pools.get(key, [])
        if pc in pool:
            pool.remove(pc)
            logger.debug("Destroyed broken connection from %s (pool: %d)", key, len(pool))

    def _is_valid(self, pc: PooledConnection) -> bool:
        if time.time() - pc.last_used > self.idle_timeout_s:
            try:
                pc.conn.close()
            except Exception:
                pass
            return False
        if pc.conn.sock is None:
            return False
        return True

    async def cleanup(self) -> int:
        """Remove stale connections. Returns count removed."""
        removed = 0
        async with self._lock:
            for key, pool in self._pools.items():
                before = len(pool)
                self._pools[key] = [pc for pc in pool if self._is_valid(pc) or pc.in_use]
                removed += before - len(self._pools[key])
        if removed:
            logger.debug("Cleaned up %d stale connections", removed)
        return removed

    async def close_all(self) -> None:
        """Close all connections."""
        async with self._lock:
            for pool in self._pools.values():
                for pc in pool:
                    try:
                        pc.conn.close()
                    except Exception:
                        pass
            self._pools.clear()

    def get_stats(self) -> dict[str, Any]:
        stats: dict[str, Any] = {}
        for key, pool in self._pools.items():
            stats[key] = {
                "total": len(pool),
                "in_use": sum(1 for pc in pool if pc.in_use),
                "total_requests": sum(pc.request_count for pc in pool),
            }
        return stats
