"""RenderBatchProcessor — batches scene render requests for parallel GPU execution.

Equivalent to RLOS BatchProcessor (inc_llm/rlos/batch_processor.py).
Groups concurrent scene render requests within a time window, priority-sorted,
sent to multiple GPU nodes in parallel for efficient utilization.

Zero-slowdown: async futures, non-blocking. Falls back to individual
processing when batch size is 1.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class RenderRequest:
    scene_prompt: str
    scene_index: int
    duration_s: int = 7
    resolution: str = "1080p"
    style: str = "cinematic"
    future: asyncio.Future = field(default_factory=lambda: asyncio.get_event_loop().create_future())
    timestamp: float = field(default_factory=time.time)
    priority: int = 0


class RenderBatchProcessor:
    """Batches scene render requests for parallel GPU execution.

    Same pattern as BatchProcessor — collects requests within a time window,
    priority-sorts, sends as batch. Falls back to individual when batch is 1.
    """

    def __init__(
        self,
        render_fn: Any,
        batch_window_ms: int = 500,
        max_batch_size: int = 5,
    ) -> None:
        self._render_fn = render_fn
        self.batch_window_ms = batch_window_ms
        self.max_batch_size = max_batch_size
        self._pending: list[RenderRequest] = []
        self._lock = asyncio.Lock()
        self._processing = False

    async def submit(
        self,
        scene_prompt: str,
        scene_index: int = 0,
        duration_s: int = 7,
        resolution: str = "1080p",
        style: str = "cinematic",
        priority: int = 0,
    ) -> bytes:
        req = RenderRequest(
            scene_prompt=scene_prompt,
            scene_index=scene_index,
            duration_s=duration_s,
            resolution=resolution,
            style=style,
            priority=priority,
        )

        async with self._lock:
            self._pending.append(req)
            if len(self._pending) >= self.max_batch_size:
                self._pending.sort(key=lambda r: r.priority, reverse=True)
                batch = self._pending[: self.max_batch_size]
                self._pending = self._pending[self.max_batch_size:]
                asyncio.create_task(self._process_batch(batch))
            elif not self._processing:
                asyncio.create_task(self._flush_after_window())

        return await req.future

    async def _flush_after_window(self) -> None:
        self._processing = True
        await asyncio.sleep(self.batch_window_ms / 1000.0)
        async with self._lock:
            if self._pending:
                self._pending.sort(key=lambda r: r.priority, reverse=True)
                batch = self._pending[:]
                self._pending = []
                asyncio.create_task(self._process_batch(batch))
        self._processing = False

    async def _process_batch(self, batch: list[RenderRequest]) -> None:
        if len(batch) == 1:
            result = await self._process_single(batch[0])
            if not batch[0].future.done():
                batch[0].future.set_result(result)
            return

        tasks = [self._process_single(req) for req in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for req, result in zip(batch, results):
            if isinstance(result, Exception):
                if not req.future.done():
                    req.future.set_exception(result)
            else:
                if not req.future.done():
                    req.future.set_result(result)

    async def _process_single(self, req: RenderRequest) -> bytes:
        try:
            result = await self._render_fn(
                scene_prompt=req.scene_prompt,
                scene_index=req.scene_index,
                duration_s=req.duration_s,
                resolution=req.resolution,
                style=req.style,
            )
            return result
        except Exception as e:
            logger.error("Render failed for scene %d: %s", req.scene_index, e)
            raise

    def get_stats(self) -> dict[str, Any]:
        return {
            "pending": len(self._pending),
            "max_batch_size": self.max_batch_size,
            "batch_window_ms": self.batch_window_ms,
        }
