"""RenderCache — LRU cache for SoulMovies storyboards and scene renders.

Equivalent to RLOS PrefixCache (inc_llm/rlos/prefix_cache.py).
Caches storyboard templates keyed by text description hash + style preset.
Caches completed scene renders keyed by scene prompt hash.
LRU eviction with warm-set protection — entries accessed 3+ times are protected.

Zero-slowdown: O(1) dict lookup. No blocking operations.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class StoryboardCacheEntry:
    storyboard: dict[str, Any]
    text_hash: str
    style: str
    hit_count: int = 0
    last_used: float = field(default_factory=time.time)
    created_at: float = field(default_factory=time.time)


class RenderCache:
    """LRU cache for SoulMovies storyboards and scene renders.

    Same pattern as PrefixCache — O(1) lookup, warm-set protection,
    LRU eviction. Zero-slowdown.
    """

    def __init__(
        self,
        max_entries: int = 100,
        warm_threshold: int = 3,
        max_scene_cache_mb: int = 512,
    ) -> None:
        self.max_entries = max_entries
        self.warm_threshold = warm_threshold
        self.max_scene_cache_mb = max_scene_cache_mb
        self._storyboard_cache: OrderedDict[str, StoryboardCacheEntry] = OrderedDict()
        self._scene_renders: dict[str, bytes] = {}
        self._scene_sizes: dict[str, int] = {}
        self._total_scene_cache_bytes: int = 0
        self._hits = 0
        self._misses = 0
        self._scene_hits = 0
        self._scene_misses = 0

    @staticmethod
    def compute_text_hash(text: str, style: str = "") -> str:
        raw = f"{text.lower().strip()}|{style.lower().strip()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    @staticmethod
    def compute_scene_hash(scene_prompt: str, scene_index: int = 0) -> str:
        raw = f"{scene_prompt.lower().strip()}|{scene_index}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def lookup_storyboard(self, text: str, style: str = "") -> dict[str, Any] | None:
        key = self.compute_text_hash(text, style)
        entry = self._storyboard_cache.get(key)
        if entry:
            self._storyboard_cache.move_to_end(key)
            entry.last_used = time.time()
            entry.hit_count += 1
            self._hits += 1
            logger.debug("RenderCache storyboard hit: %s", key)
            return entry.storyboard
        self._misses += 1
        return None

    def store_storyboard(self, text: str, style: str, storyboard: dict[str, Any]) -> str:
        key = self.compute_text_hash(text, style)
        self._storyboard_cache[key] = StoryboardCacheEntry(
            storyboard=storyboard,
            text_hash=key,
            style=style,
        )
        self._storyboard_cache.move_to_end(key)
        self._evict_storyboards()
        return key

    def lookup_scene_render(self, scene_prompt: str, scene_index: int = 0) -> bytes | None:
        key = self.compute_scene_hash(scene_prompt, scene_index)
        data = self._scene_renders.get(key)
        if data:
            self._scene_hits += 1
            logger.debug("RenderCache scene render hit: %s", key)
            return data
        self._scene_misses += 1
        return None

    def store_scene_render(self, scene_prompt: str, scene_index: int, data: bytes) -> str:
        key = self.compute_scene_hash(scene_prompt, scene_index)
        self._scene_renders[key] = data
        self._scene_sizes[key] = len(data)
        self._total_scene_cache_bytes += len(data)
        self._evict_scene_renders()
        return key

    def _evict_storyboards(self) -> None:
        while len(self._storyboard_cache) > self.max_entries:
            evicted_key, evicted_val = self._storyboard_cache.popitem(last=False)
            if evicted_val.hit_count >= self.warm_threshold:
                self._storyboard_cache[evicted_key] = evicted_val
                self._storyboard_cache.move_to_end(evicted_key, last=False)
                continue
            logger.debug("Evicted storyboard cache entry: %s", evicted_key)

    def _evict_scene_renders(self) -> None:
        max_bytes = self.max_scene_cache_mb * 1024 * 1024
        while self._total_scene_cache_bytes > max_bytes and self._scene_renders:
            oldest_key = next(iter(self._scene_renders))
            size = self._scene_sizes.pop(oldest_key, 0)
            self._scene_renders.pop(oldest_key, None)
            self._total_scene_cache_bytes -= size
            logger.debug("Evicted scene render: %s (%d bytes)", oldest_key, size)

    def get_stats(self) -> dict[str, Any]:
        return {
            "storyboard_entries": len(self._storyboard_cache),
            "storyboard_hits": self._hits,
            "storyboard_misses": self._misses,
            "storyboard_hit_rate": round(self._hits / max(1, self._hits + self._misses), 4),
            "scene_entries": len(self._scene_renders),
            "scene_hits": self._scene_hits,
            "scene_misses": self._scene_misses,
            "scene_cache_mb": round(self._total_scene_cache_bytes / (1024 * 1024), 2),
            "warm_entries": sum(
                1 for v in self._storyboard_cache.values()
                if v.hit_count >= self.warm_threshold
            ),
        }

    def clear(self) -> None:
        self._storyboard_cache.clear()
        self._scene_renders.clear()
        self._scene_sizes.clear()
        self._total_scene_cache_bytes = 0
        self._hits = 0
        self._misses = 0
        self._scene_hits = 0
        self._scene_misses = 0
