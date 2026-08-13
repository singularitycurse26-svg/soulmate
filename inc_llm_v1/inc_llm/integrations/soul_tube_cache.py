"""SegmentCache — LRU cache for SoulTube segment-to-node mapping.

Equivalent to RLOS PrefixCache (inc_llm/rlos/prefix_cache.py).
Caches which RLOS nodes have which video segments for O(1) lookup.
Popular videos' segment locations stay in warm cache.

Zero-slowdown: O(1) dict lookup. No querying all nodes.
"""

from __future__ import annotations

import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SegmentLocationEntry:
    video_id: str
    segment_num: int
    node_url: str
    resolution: str = "720p"
    hit_count: int = 0
    last_used: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)


@dataclass
class VideoMetadataCacheEntry:
    metadata: dict[str, Any]
    hit_count: int = 0
    last_used: float = field(default_factory=time.time)


class SegmentCache:
    """LRU cache for SoulTube segment locations and video metadata.

    Same pattern as PrefixCache — O(1) lookup, warm-set protection,
    LRU eviction. Zero-slowdown.
    """

    def __init__(
        self,
        max_entries: int = 500,
        warm_threshold: int = 3,
        max_metadata_entries: int = 200,
    ) -> None:
        self.max_entries = max_entries
        self.warm_threshold = warm_threshold
        self.max_metadata_entries = max_metadata_entries
        self._segment_cache: OrderedDict[str, SegmentLocationEntry] = OrderedDict()
        self._metadata_cache: OrderedDict[str, VideoMetadataCacheEntry] = OrderedDict()
        self._hits = 0
        self._misses = 0
        self._metadata_hits = 0
        self._metadata_misses = 0

    @staticmethod
    def _segment_key(video_id: str, segment_num: int, resolution: str = "720p") -> str:
        return f"{video_id}:{segment_num}:{resolution}"

    def lookup_segment(
        self, video_id: str, segment_num: int, resolution: str = "720p"
    ) -> str | None:
        """Look up which node has a segment — O(1) dict lookup."""
        key = self._segment_key(video_id, segment_num, resolution)
        entry = self._segment_cache.get(key)
        if entry:
            self._segment_cache.move_to_end(key)
            entry.last_used = time.time()
            entry.hit_count += 1
            self._hits += 1
            logger.debug("SegmentCache hit: %s -> %s", key, entry.node_url)
            return entry.node_url
        self._misses += 1
        return None

    def store_segment_location(
        self,
        video_id: str,
        segment_num: int,
        node_url: str,
        resolution: str = "720p",
    ) -> str:
        key = self._segment_key(video_id, segment_num, resolution)
        self._segment_cache[key] = SegmentLocationEntry(
            video_id=video_id,
            segment_num=segment_num,
            node_url=node_url,
            resolution=resolution,
        )
        self._segment_cache.move_to_end(key)
        self._evict_segments()
        return key

    def invalidate_segment(
        self, video_id: str, segment_num: int, resolution: str = "720p"
    ) -> None:
        key = self._segment_key(video_id, segment_num, resolution)
        self._segment_cache.pop(key, None)

    def invalidate_video(self, video_id: str) -> None:
        keys_to_remove = [
            k for k in self._segment_cache
            if k.startswith(f"{video_id}:")
        ]
        for k in keys_to_remove:
            self._segment_cache.pop(k, None)
        self._metadata_cache.pop(video_id, None)

    def lookup_metadata(self, video_id: str) -> dict[str, Any] | None:
        entry = self._metadata_cache.get(video_id)
        if entry:
            self._metadata_cache.move_to_end(video_id)
            entry.last_used = time.time()
            entry.hit_count += 1
            self._metadata_hits += 1
            return entry.metadata
        self._metadata_misses += 1
        return None

    def store_metadata(self, video_id: str, metadata: dict[str, Any]) -> None:
        self._metadata_cache[video_id] = VideoMetadataCacheEntry(metadata=metadata)
        self._metadata_cache.move_to_end(video_id)
        while len(self._metadata_cache) > self.max_metadata_entries:
            evicted_key, evicted_val = self._metadata_cache.popitem(last=False)
            if evicted_val.hit_count >= self.warm_threshold:
                self._metadata_cache[evicted_key] = evicted_val
                self._metadata_cache.move_to_end(evicted_key, last=False)
                continue

    def _evict_segments(self) -> None:
        while len(self._segment_cache) > self.max_entries:
            evicted_key, evicted_val = self._segment_cache.popitem(last=False)
            if evicted_val.hit_count >= self.warm_threshold:
                self._segment_cache[evicted_key] = evicted_val
                self._segment_cache.move_to_end(evicted_key, last=False)
                continue
            logger.debug("Evicted segment cache entry: %s", evicted_key)

    def get_stats(self) -> dict[str, Any]:
        return {
            "segment_entries": len(self._segment_cache),
            "segment_hits": self._hits,
            "segment_misses": self._misses,
            "segment_hit_rate": round(self._hits / max(1, self._hits + self._misses), 4),
            "metadata_entries": len(self._metadata_cache),
            "metadata_hits": self._metadata_hits,
            "metadata_misses": self._metadata_misses,
            "warm_entries": sum(
                1 for v in self._segment_cache.values()
                if v.hit_count >= self.warm_threshold
            ),
        }

    def clear(self) -> None:
        self._segment_cache.clear()
        self._metadata_cache.clear()
        self._hits = 0
        self._misses = 0
        self._metadata_hits = 0
        self._metadata_misses = 0
