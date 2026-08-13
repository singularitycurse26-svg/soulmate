"""SegmentBatchProcessor — batches HLS segment fetch requests for efficient retrieval.

Equivalent to RLOS BatchProcessor (inc_llm/rlos/batch_processor.py).
Groups concurrent segment fetch requests within a time window, priority-sorted.
Multiple viewers requesting the same popular video → batched fetch from same node.

Zero-slowdown: async futures, non-blocking.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SegmentFetchRequest:
    video_id: str
    segment_num: int
    resolution: str = "720p"
    node_url: str = ""
    future: asyncio.Future = field(default_factory=lambda: asyncio.get_event_loop().create_future())
    timestamp: float = field(default_factory=time.time)
    priority: int = 0


class SegmentBatchProcessor:
    """Batches HLS segment fetch requests for efficient retrieval.

    Same pattern as BatchProcessor — collects requests within a time window,
    priority-sorts, sends as batch. Falls back to individual when batch is 1.
    """

    def __init__(
        self,
        fetch_fn: Any,
        batch_window_ms: int = 200,
        max_batch_size: int = 10,
    ) -> None:
        self._fetch_fn = fetch_fn
        self.batch_window_ms = batch_window_ms
        self.max_batch_size = max_batch_size
        self._pending: list[SegmentFetchRequest] = []
        self._lock = asyncio.Lock()
        self._processing = False

    async def submit(
        self,
        video_id: str,
        segment_num: int,
        resolution: str = "720p",
        node_url: str = "",
        priority: int = 0,
    ) -> bytes:
        req = SegmentFetchRequest(
            video_id=video_id,
            segment_num=segment_num,
            resolution=resolution,
            node_url=node_url,
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

    async def _process_batch(self, batch: list[SegmentFetchRequest]) -> None:
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

    async def _process_single(self, req: SegmentFetchRequest) -> bytes:
        try:
            result = await self._fetch_fn(
                video_id=req.video_id,
                segment_num=req.segment_num,
                resolution=req.resolution,
                node_url=req.node_url,
            )
            return result
        except Exception as e:
            logger.error("Segment fetch failed for %s:%d: %s", req.video_id, req.segment_num, e)
            raise

    def get_stats(self) -> dict[str, Any]:
        return {
            "pending": len(self._pending),
            "max_batch_size": self.max_batch_size,
            "batch_window_ms": self.batch_window_ms,
        }
