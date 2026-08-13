"""Prefix cache — caches conversation prefixes to avoid recomputation.

Ollama processes the entire message history on each call. When the prefix
(system prompt + earlier turns) hasn't changed, we can cache the prefix hash
and reuse the KV cache on the Ollama side by sending a keep_alive with the
same context. This module tracks prefix hashes and provides hints.
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import OrderedDict
from typing import Any

logger = logging.getLogger(__name__)


class PrefixCache:
    """LRU cache of conversation prefixes keyed by hash.

    Also stores partial responses for multi-turn conversations, enabling
    instant prefix reconstruction when the same conversation continues.
    Warm-set tracking keeps frequently-used entries from being evicted.
    """

    def __init__(self, max_entries: int = 50, warm_threshold: int = 3) -> None:
        self.max_entries = max_entries
        self.warm_threshold = warm_threshold
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._responses: dict[str, str] = {}
        self._hits = 0
        self._misses = 0
        self._response_hits = 0

    def compute_prefix_hash(self, messages: list[dict[str, str]]) -> str:
        """Compute a hash of the conversation prefix (all but last message)."""
        if len(messages) <= 1:
            return ""
        prefix = messages[:-1]
        raw = "|".join(f"{m['role']}:{m['content']}" for m in prefix)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def lookup(self, messages: list[dict[str, str]]) -> dict[str, Any] | None:
        """Check if a prefix is cached."""
        prefix_hash = self.compute_prefix_hash(messages)
        if not prefix_hash:
            self._misses += 1
            return None

        entry = self._cache.get(prefix_hash)
        if entry:
            self._cache.move_to_end(prefix_hash)
            entry["last_used"] = time.time()
            entry["hit_count"] += 1
            self._hits += 1
            logger.debug("Prefix cache hit: %s", prefix_hash)
            return entry

        self._misses += 1
        return None

    def store(self, messages: list[dict[str, str]], context_size: int = 0,
              model: str = "") -> str:
        """Store a prefix in the cache."""
        prefix_hash = self.compute_prefix_hash(messages)
        if not prefix_hash:
            return ""

        self._cache[prefix_hash] = {
            "prefix_hash": prefix_hash,
            "context_size": context_size,
            "model": model,
            "last_used": time.time(),
            "hit_count": 0,
            "created_at": time.time(),
        }
        self._cache.move_to_end(prefix_hash)

        while len(self._cache) > self.max_entries:
            evicted_key, evicted_val = self._cache.popitem(last=False)
            if evicted_val.get("hit_count", 0) >= self.warm_threshold:
                self._cache[evicted_key] = evicted_val
                self._cache.move_to_end(evicted_key, last=False)
                continue
            self._responses.pop(evicted_key, None)
            logger.debug("Evicted prefix cache entry: %s", evicted_key)

        return prefix_hash

    def store_response(self, prefix_hash: str, response: str) -> None:
        """Store the response for a prefix, enabling instant reconstruction."""
        if prefix_hash and response:
            self._responses[prefix_hash] = response
            if len(self._responses) > self.max_entries * 2:
                oldest = next(iter(self._responses))
                del self._responses[oldest]

    def lookup_response(self, prefix_hash: str) -> str | None:
        """Look up a stored response for a prefix hash."""
        resp = self._responses.get(prefix_hash)
        if resp:
            self._response_hits += 1
        return resp

    def get_stats(self) -> dict[str, Any]:
        return {
            "entries": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self._hits / max(1, self._hits + self._misses), 4),
            "response_entries": len(self._responses),
            "response_hits": self._response_hits,
            "warm_entries": sum(1 for v in self._cache.values() if v.get("hit_count", 0) >= self.warm_threshold),
        }

    def clear(self) -> None:
        self._cache.clear()
        self._responses.clear()
        self._hits = 0
        self._misses = 0
        self._response_hits = 0
