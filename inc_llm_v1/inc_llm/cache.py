"""Response cache — semantic similarity-based caching for LLM responses.

Stores recent (query, response) pairs and checks new queries against cached
ones using embedding similarity. If a new query is semantically similar to a
cached one (above threshold), the cached response is returned directly,
avoiding an LLM call.

Two levels:
- Hot cache: in-memory LRU dict for instant lookup
- Persistent cache: SQLite for cross-restart persistence
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import sqlite3
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

from inc_llm.config import CacheConfig

logger = logging.getLogger(__name__)


class ResponseCache:
    """Semantic response cache with hot + persistent tiers."""

    def __init__(self, config: CacheConfig) -> None:
        self.config = config
        self.db_path = Path(os.path.expanduser(config.db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._hot_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._hot_cache_size = config.hot_cache_size
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS response_cache (
                    id TEXT PRIMARY KEY,
                    query TEXT NOT NULL,
                    response TEXT NOT NULL,
                    embedding TEXT,
                    model TEXT,
                    timestamp REAL NOT NULL,
                    hit_count INTEGER DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_cache_ts ON response_cache(timestamp);
            """)

    async def lookup(self, query: str, query_embedding: list[float] | None = None) -> dict[str, Any] | None:
        """Check if a semantically similar query exists in cache."""
        if not self.config.enabled:
            return None

        query_hash = hashlib.sha256(query.encode()).hexdigest()[:16]

        if query_hash in self._hot_cache:
            entry = self._hot_cache[query_hash]
            self._hot_cache.move_to_end(query_hash)
            entry["hit_count"] = entry.get("hit_count", 0) + 1
            logger.debug("Cache hit (hot, exact): %s", query_hash)
            return {"response": entry["response"], "model": entry.get("model", ""), "cached": True}

        if query_embedding:
            match = self._semantic_lookup(query_embedding)
            if match:
                self._add_to_hot(query_hash, match["query"], match["response"],
                                 match.get("model", ""), query_embedding)
                self._increment_hit(match["id"])
                logger.debug("Cache hit (semantic): %s", match["id"])
                return {"response": match["response"], "model": match.get("model", ""), "cached": True}

        return None

    def _semantic_lookup(self, query_embedding: list[float]) -> dict[str, Any] | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT id, query, response, embedding, model FROM response_cache "
                "ORDER BY timestamp DESC LIMIT 200"
            )
            rows = cursor.fetchall()

        best_score = 0.0
        best_match: dict[str, Any] | None = None
        for row in rows:
            cached_embedding = json.loads(row[3]) if row[3] else []
            if not cached_embedding:
                continue
            sim = self._cosine_sim(query_embedding, cached_embedding)
            if sim > best_score:
                best_score = sim
                best_match = {"id": row[0], "query": row[1], "response": row[2], "model": row[4]}

        if best_match and best_score >= self.config.similarity_threshold:
            return best_match
        return None

    def store(self, query: str, response: str, model: str = "",
              embedding: list[float] | None = None) -> str:
        """Store a response in cache."""
        if not self.config.enabled:
            return ""
        query_hash = hashlib.sha256(query.encode()).hexdigest()[:16]
        embedding_json = json.dumps(embedding) if embedding else None

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO response_cache (id, query, response, embedding, model, timestamp, hit_count) "
                "VALUES (?, ?, ?, ?, ?, ?, 0)",
                (query_hash, query, response, embedding_json, model, time.time()),
            )

        self._add_to_hot(query_hash, query, response, model, embedding)
        logger.debug("Cached response for query: %s", query_hash)
        return query_hash

    def _add_to_hot(self, key: str, query: str, response: str, model: str,
                    embedding: list[float] | None) -> None:
        self._hot_cache[key] = {
            "query": query, "response": response, "model": model,
            "embedding": embedding, "hit_count": 0,
        }
        self._hot_cache.move_to_end(key)
        while len(self._hot_cache) > self._hot_cache_size:
            self._hot_cache.popitem(last=False)

    def _increment_hit(self, cache_id: str) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE response_cache SET hit_count = hit_count + 1 WHERE id = ?",
                (cache_id,),
            )

    @staticmethod
    def _cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    def get_stats(self) -> dict[str, int]:
        with sqlite3.connect(str(self.db_path)) as conn:
            total = conn.execute("SELECT COUNT(*) FROM response_cache").fetchone()[0]
            hits = conn.execute("SELECT SUM(hit_count) FROM response_cache").fetchone()[0] or 0
        return {"cached_responses": total, "total_hits": hits, "hot_cache_size": len(self._hot_cache)}

    def clear(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("DELETE FROM response_cache")
            count = cursor.rowcount
        self._hot_cache.clear()
        return count

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT COUNT(*), SUM(hit_count) FROM response_cache"
            ).fetchone()
        return {
            "total_entries": row[0] or 0,
            "total_hits": row[1] or 0,
            "hot_cache_size": len(self._hot_cache),
        }
