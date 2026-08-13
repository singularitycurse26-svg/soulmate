"""Server node — represents a single Ollama server in the RLOS mesh.

Each server node tracks its health, loaded models, capacity, and
serves as the interface for sending requests to that server.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from inc_llm.rlos.connection_pool import ConnectionPool

logger = logging.getLogger(__name__)


class ServerStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    OFFLINE = "offline"


@dataclass
class ServerNode:
    """A single Ollama server in the RLOS mesh."""
    url: str
    name: str = ""
    status: ServerStatus = ServerStatus.HEALTHY
    models: list[str] = field(default_factory=list)
    gpu_available: bool = False
    vram_total_gb: float = 0.0
    vram_used_gb: float = 0.0
    last_health_check: float = 0.0
    request_count: int = 0
    error_count: int = 0
    avg_latency_ms: float = 0.0
    is_free: bool = False
    max_parallel: int = 4
    active_requests: int = 0
    # Video rendering support (SoulMovies)
    active_render_jobs: int = 0
    max_render_jobs: int = 2
    video_models: list[str] = field(default_factory=list)
    # Streaming support (SoulTube)
    bandwidth_available_mbps: float = 0.0
    stored_segments: int = 0
    storage_capacity_gb: float = 0.0
    storage_used_gb: float = 0.0

    @property
    def is_available(self) -> bool:
        return self.status == ServerStatus.HEALTHY and self.active_requests < self.max_parallel

    @property
    def has_gpu_available(self) -> bool:
        """Check if this node has GPU capacity for video rendering."""
        return self.gpu_available and self.active_render_jobs < self.max_render_jobs

    @property
    def vram_free_gb(self) -> float:
        """Free VRAM in GB."""
        return max(0.0, self.vram_total_gb - self.vram_used_gb)

    @property
    def render_load_factor(self) -> float:
        """0.0 = idle GPU, 1.0 = fully loaded with render jobs."""
        return self.active_render_jobs / max(1, self.max_render_jobs)

    @property
    def storage_free_gb(self) -> float:
        """Free storage in GB."""
        return max(0.0, self.storage_capacity_gb - self.storage_used_gb)

    @property
    def load_factor(self) -> float:
        """0.0 = idle, 1.0 = fully loaded."""
        return self.active_requests / max(1, self.max_parallel)

    def health_score(self) -> float:
        """Higher is better. Combines status, load, and latency."""
        if self.status == ServerStatus.OFFLINE:
            return 0.0
        if self.status == ServerStatus.DEGRADED:
            return 0.3 * (1.0 - self.load_factor)
        base = 1.0 - self.load_factor
        latency_penalty = min(0.3, self.avg_latency_ms / 10000.0)
        return max(0.0, base - latency_penalty)


class ServerNodeManager:
    """Manages server nodes and their health checks."""

    def __init__(self, pool: ConnectionPool, health_check_interval_s: int = 30) -> None:
        self.pool = pool
        self.health_check_interval_s = health_check_interval_s
        self._servers: dict[str, ServerNode] = {}
        self._running = False

    def add_server(self, url: str, name: str = "", is_free: bool = False) -> ServerNode:
        """Add a server to the mesh."""
        node = ServerNode(url=url, name=name or url, is_free=is_free)
        self._servers[url] = node
        logger.info("Added server node: %s (%s)", name or url, url)
        return node

    def remove_server(self, url: str) -> bool:
        return self._servers.pop(url, None) is not None

    def get_server(self, url: str) -> ServerNode | None:
        return self._servers.get(url)

    def get_all_servers(self) -> list[ServerNode]:
        return list(self._servers.values())

    def get_available_servers(self) -> list[ServerNode]:
        return [s for s in self._servers.values() if s.is_available]

    async def health_check(self, server: ServerNode) -> None:
        """Check health of a single server."""
        pc = None
        try:
            pc = await self.pool.acquire(server.url)
            def _do_health():
                pc.conn.request("GET", "/api/tags")
                resp = pc.conn.getresponse()
                return json.loads(resp.read().decode())

            data = await asyncio.to_thread(_do_health)
            server.models = [m.get("name", "") for m in data.get("models", [])]
            server.status = ServerStatus.HEALTHY
            server.last_health_check = time.time()
            server.error_count = 0
        except Exception as e:
            server.error_count += 1
            if server.error_count > 3:
                server.status = ServerStatus.OFFLINE
            else:
                server.status = ServerStatus.DEGRADED
            logger.warning("Health check failed for %s: %s (errors: %d)",
                           server.url, e, server.error_count)
        finally:
            if pc is not None:
                await self.pool.release(pc)

    async def start_health_checks(self) -> None:
        """Start periodic health checks for all servers."""
        self._running = True
        while self._running:
            tasks = [self.health_check(s) for s in self._servers.values()]
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(self.health_check_interval_s)

    async def stop_health_checks(self) -> None:
        self._running = False

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_servers": len(self._servers),
            "healthy": sum(1 for s in self._servers.values() if s.status == ServerStatus.HEALTHY),
            "degraded": sum(1 for s in self._servers.values() if s.status == ServerStatus.DEGRADED),
            "offline": sum(1 for s in self._servers.values() if s.status == ServerStatus.OFFLINE),
            "total_requests": sum(s.request_count for s in self._servers.values()),
            "servers": [
                {"url": s.url, "name": s.name, "status": s.status.value,
                 "models": len(s.models), "load_factor": round(s.load_factor, 2),
                 "is_free": s.is_free,
                 "gpu_available": s.gpu_available,
                 "vram_free_gb": round(s.vram_free_gb, 2),
                 "render_load": round(s.render_load_factor, 2),
                 "bandwidth_mbps": round(s.bandwidth_available_mbps, 1),
                 "stored_segments": s.stored_segments,
                 "storage_free_gb": round(s.storage_free_gb, 2)}
                for s in self._servers.values()
            ],
        }
