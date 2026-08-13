"""Batch processor — groups concurrent requests for batched processing.

Collects requests within a small time window and sends them as a batch
to Ollama, reducing per-request overhead. Falls back to individual
processing when batch size is 1 or timeout is reached.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from inc_llm.rlos.connection_pool import ConnectionPool

logger = logging.getLogger(__name__)


@dataclass
class BatchRequest:
    model: str
    messages: list[dict[str, str]]
    max_tokens: int = 128
    temperature: float = 0.7
    future: asyncio.Future = field(default_factory=lambda: asyncio.get_event_loop().create_future())
    timestamp: float = field(default_factory=time.time)
    priority: int = 0  # higher = processed first (cache hits get priority)


class BatchProcessor:
    """Groups requests into batches for efficient processing."""

    def __init__(self, pool: ConnectionPool, config: Any) -> None:
        self.pool = pool
        self.batch_window_ms = config.batch_window_ms
        self.max_batch_size = config.max_batch_size
        self._pending: list[BatchRequest] = []
        self._lock = asyncio.Lock()
        self._processing = False

    async def submit(self, server_url: str, model: str,
                     messages: list[dict[str, str]],
                     max_tokens: int = 128, temperature: float = 0.7,
                     priority: int = 0) -> dict[str, Any]:
        """Submit a request to the batch processor."""
        req = BatchRequest(
            model=model, messages=messages,
            max_tokens=max_tokens, temperature=temperature,
            priority=priority,
        )

        async with self._lock:
            self._pending.append(req)
            if len(self._pending) >= self.max_batch_size:
                self._pending.sort(key=lambda r: r.priority, reverse=True)
                batch = self._pending[:self.max_batch_size]
                self._pending = self._pending[self.max_batch_size:]
                asyncio.create_task(self._process_batch(server_url, batch))
            elif not self._processing:
                asyncio.create_task(self._flush_after_window(server_url))

        return await req.future

    async def _flush_after_window(self, server_url: str) -> None:
        """Flush pending requests after the batch window expires."""
        self._processing = True
        await asyncio.sleep(self.batch_window_ms / 1000.0)
        async with self._lock:
            if self._pending:
                self._pending.sort(key=lambda r: r.priority, reverse=True)
                batch = self._pending[:]
                self._pending = []
                asyncio.create_task(self._process_batch(server_url, batch))
        self._processing = False

    async def _process_batch(self, server_url: str, batch: list[BatchRequest]) -> None:
        """Process a batch of requests."""
        if len(batch) == 1:
            result = await self._process_single(server_url, batch[0])
            if not batch[0].future.done():
                batch[0].future.set_result(result)
            return

        for req in batch:
            try:
                result = await self._process_single(server_url, req)
                if not req.future.done():
                    req.future.set_result(result)
            except Exception as e:
                if not req.future.done():
                    req.future.set_exception(e)

    async def _process_single(self, server_url: str, req: BatchRequest) -> dict[str, Any]:
        """Process a single request through the connection pool."""
        for attempt in range(2):
            pc = await self.pool.acquire(server_url)
            try:
                body = json.dumps({
                    "model": req.model,
                    "messages": req.messages,
                    "stream": False,
                    "options": {
                        "num_predict": req.max_tokens,
                        "temperature": req.temperature,
                    },
                }).encode()

                def _do_request():
                    pc.conn.request("POST", "/api/chat", body=body,
                                    headers={"Content-Type": "application/json"})
                    resp = pc.conn.getresponse()
                    return json.loads(resp.read().decode())

                try:
                    data = await asyncio.to_thread(_do_request)
                    content = data.get("message", {}).get("content", "")
                    return {"content": content, "model": data.get("model", req.model), "raw": data}
                except Exception as e:
                    if attempt == 0:
                        await self.pool.destroy(pc)
                        pc = None
                        continue
                    raise
            finally:
                if pc is not None:
                    await self.pool.release(pc)
        return {"content": "", "model": req.model, "error": "request failed after retries"}

    def get_stats(self) -> dict[str, Any]:
        return {
            "pending": len(self._pending),
            "max_batch_size": self.max_batch_size,
            "batch_window_ms": self.batch_window_ms,
        }
