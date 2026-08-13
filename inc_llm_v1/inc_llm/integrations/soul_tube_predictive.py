"""VideoPredictiveLoader — pre-fetches popular video segments to edge nodes.

Equivalent to RLOS PredictiveLoader (inc_llm/rlos/predictive_loader.py).
Tracks which videos are trending, which segments are being requested most.
Pre-fetches popular segments to nodes closer to viewers before they're requested.

Background pre-fetching via asyncio.create_task — zero-slowdown.
Pre-fetch count auto-scales by hardware tier.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class VideoPredictiveLoader:
    """Predicts which video segments will be needed next and pre-fetches them.

    Same pattern as PredictiveLoader — transition counts, frequency tracking,
    background pre-fetching via asyncio.create_task.
    """

    def __init__(
        self,
        prefetch_fn: Any,
        max_history: int = 100,
        prefetch_count: int = 3,
    ) -> None:
        self._prefetch_fn = prefetch_fn
        self._max_history = max_history
        self._prefetch_count = prefetch_count
        self._segment_frequency: dict[str, int] = defaultdict(int)
        self._video_frequency: dict[str, int] = defaultdict(int)
        self._segment_transitions: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._last_segment: str = ""
        self._history: list[str] = []
        self._preloading: set[str] = set()

    @staticmethod
    def _segment_key(video_id: str, segment_num: int) -> str:
        return f"{video_id}:{segment_num}"

    def record_segment_request(self, video_id: str, segment_num: int) -> None:
        """Record that a segment was requested. Call on every viewer segment fetch."""
        key = self._segment_key(video_id, segment_num)
        self._segment_frequency[key] += 1
        self._video_frequency[video_id] += 1

        if self._last_segment and self._last_segment != key:
            self._segment_transitions[self._last_segment][key] += 1

        self._last_segment = key
        self._history.append(key)
        if len(self._history) > self._max_history:
            self._history.pop(0)

    def predict_next_segments(
        self, video_id: str, current_segment: int, top_k: int = 3
    ) -> list[int]:
        """Predict the next segment numbers likely to be requested."""
        current_key = self._segment_key(video_id, current_segment)
        transitions = self._segment_transitions.get(current_key, {})

        if transitions:
            ranked = sorted(transitions.items(), key=lambda x: x[1], reverse=True)
            result = []
            for seg_key, _ in ranked[:top_k]:
                parts = seg_key.split(":")
                if len(parts) == 2 and parts[0] == video_id:
                    result.append(int(parts[1]))
            return result

        return [current_segment + i for i in range(1, top_k + 1)]

    def get_trending_videos(self, top_k: int = 10) -> list[tuple[str, int]]:
        """Get the most frequently requested videos."""
        ranked = sorted(self._video_frequency.items(), key=lambda x: x[1], reverse=True)
        return ranked[:top_k]

    async def prefetch_predicted(
        self, video_id: str, current_segment: int
    ) -> list[str]:
        """Pre-fetch predicted next segments in the background."""
        predicted = self.predict_next_segments(
            video_id, current_segment, top_k=self._prefetch_count
        )
        prefetched: list[str] = []

        for seg_num in predicted:
            key = self._segment_key(video_id, seg_num)
            if key in self._preloading:
                continue
            self._preloading.add(key)
            asyncio.create_task(self._do_prefetch(video_id, seg_num, key, prefetched))

        return prefetched

    async def _do_prefetch(
        self, video_id: str, segment_num: int, key: str, prefetched: list[str]
    ) -> None:
        try:
            success = await self._prefetch_fn(video_id, segment_num)
            if success:
                prefetched.append(key)
                logger.debug("VideoPredictive pre-fetched: %s", key)
        except Exception as e:
            logger.debug("VideoPredictive pre-fetch failed for %s: %s", key, e)
        finally:
            self._preloading.discard(key)

    def get_stats(self) -> dict[str, Any]:
        return {
            "history_size": len(self._history),
            "unique_segments": len(self._segment_frequency),
            "unique_videos": len(self._video_frequency),
            "video_frequency": dict(self._video_frequency),
            "top_trending": self.get_trending_videos(5),
            "last_segment": self._last_segment,
        }
