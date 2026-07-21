"""Episodic memory — session history with full-text search and vector similarity.

SQLite with FTS5 for BM25 text search, plus vector similarity for semantic recall.
Stores episodes (completed reasoning sessions) and retrieves relevant ones
for new queries using hybrid BM25 + vector search.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Episode:
    """A single episode — a completed reasoning session."""

    id: str
    session_id: str
    timestamp: float
    task_description: str
    task_category: str
    steps_taken: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    execution_time_s: float = 0.0
    success: bool = False
    key_result: str = ""
    error_encountered: str | None = None
    error_resolution: str | None = None
    skills_applied: list[str] = field(default_factory=list)
    new_skill_created: str | None = None
    embedding: list[float] = field(default_factory=list)
    confidence_achieved: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "task_description": self.task_description,
            "task_category": self.task_category,
            "steps_taken": json.dumps(self.steps_taken),
            "tools_used": json.dumps(self.tools_used),
            "execution_time_s": self.execution_time_s,
            "success": self.success,
            "key_result": self.key_result,
            "error_encountered": self.error_encountered,
            "error_resolution": self.error_resolution,
            "skills_applied": json.dumps(self.skills_applied),
            "new_skill_created": self.new_skill_created,
            "embedding": json.dumps(self.embedding) if self.embedding else None,
            "confidence_achieved": self.confidence_achieved,
        }

    @staticmethod
    def from_dict(row: sqlite3.Row | dict[str, Any]) -> "Episode":
        def get(key: str, default: Any = None) -> Any:
            if isinstance(row, dict):
                return row.get(key, default)
            return row[key] if key in row.keys() else default

        return Episode(
            id=get("id"),
            session_id=get("session_id", ""),
            timestamp=get("timestamp", 0.0),
            task_description=get("task_description", ""),
            task_category=get("task_category", ""),
            steps_taken=json.loads(get("steps_taken", "[]") or "[]"),
            tools_used=json.loads(get("tools_used", "[]") or "[]"),
            execution_time_s=get("execution_time_s", 0.0),
            success=bool(get("success", False)),
            key_result=get("key_result", ""),
            error_encountered=get("error_encountered"),
            error_resolution=get("error_resolution"),
            skills_applied=json.loads(get("skills_applied", "[]") or "[]"),
            new_skill_created=get("new_skill_created"),
            embedding=json.loads(get("embedding", "[]") or "[]") if get("embedding") else [],
            confidence_achieved=get("confidence_achieved", 0.0),
        )


class EpisodicMemory:
    """Episodic memory store — SQLite + FTS5 + vector similarity.

    Stores completed reasoning sessions and retrieves relevant ones
    using hybrid BM25 + vector search.
    """

    def __init__(
        self,
        db_path: str | Path,
        retention_days: int = 90,
        top_k: int = 3,
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.retention_days = retention_days
        self.top_k = top_k
        self._init_db()

    def _init_db(self) -> None:
        """Initialize SQLite database with FTS5."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS episodes (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    task_description TEXT NOT NULL,
                    task_category TEXT DEFAULT '',
                    steps_taken TEXT DEFAULT '[]',
                    tools_used TEXT DEFAULT '[]',
                    execution_time_s REAL DEFAULT 0.0,
                    success INTEGER DEFAULT 0,
                    key_result TEXT DEFAULT '',
                    error_encountered TEXT,
                    error_resolution TEXT,
                    skills_applied TEXT DEFAULT '[]',
                    new_skill_created TEXT,
                    embedding TEXT,
                    confidence_achieved REAL DEFAULT 0.0
                );

                CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id);
                CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
                CREATE INDEX IF NOT EXISTS idx_episodes_category ON episodes(task_category);
            """)

            # FTS5 virtual table for full-text search
            try:
                conn.executescript("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
                        id UNINDEXED,
                        task_description,
                        key_result,
                        task_category
                    );
                """)
            except sqlite3.OperationalError:
                logger.warning("FTS5 not available, falling back to LIKE queries")

    def store(self, episode: Episode) -> None:
        """Store an episode in the database.

        Args:
            episode: The episode to store.
        """
        d = episode.as_dict()

        with sqlite3.connect(str(self.db_path)) as conn:
            # Insert into main table
            conn.execute(
                """INSERT OR REPLACE INTO episodes
                   (id, session_id, timestamp, task_description, task_category,
                    steps_taken, tools_used, execution_time_s, success,
                    key_result, error_encountered, error_resolution,
                    skills_applied, new_skill_created, embedding, confidence_achieved)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    d["id"], d["session_id"], d["timestamp"],
                    d["task_description"], d["task_category"],
                    d["steps_taken"], d["tools_used"], d["execution_time_s"],
                    d["success"], d["key_result"], d["error_encountered"],
                    d["error_resolution"], d["skills_applied"],
                    d["new_skill_created"], d["embedding"],
                    d["confidence_achieved"],
                ),
            )

            # Insert into FTS table
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO episodes_fts (id, task_description, key_result, task_category) VALUES (?, ?, ?, ?)",
                    (d["id"], d["task_description"], d["key_result"], d["task_category"]),
                )
            except sqlite3.OperationalError:
                pass  # FTS not available

        logger.debug("Stored episode %s: %s", episode.id, episode.task_description[:80])

    def search(
        self,
        query: str,
        top_k: int | None = None,
        query_embedding: list[float] | None = None,
    ) -> list[Episode]:
        """Hybrid search: BM25 full-text + optional vector similarity.

        Args:
            query: Text query for BM25 search.
            top_k: Maximum results to return (default: self.top_k).
            query_embedding: Optional embedding vector for similarity search.

        Returns:
            List of matching episodes, ranked by combined score.
        """
        k = top_k or self.top_k
        results: list[tuple[float, Episode]] = []

        # BM25 search via FTS5
        bm25_results = self._bm25_search(query, k * 3)
        for score, episode in bm25_results:
            results.append((score, episode))

        # Vector similarity search
        if query_embedding:
            vec_results = self._vector_search(query_embedding, k * 3)
            for score, episode in vec_results:
                # Merge: if episode already in results, combine scores
                found = False
                for i, (existing_score, existing_ep) in enumerate(results):
                    if existing_ep.id == episode.id:
                        results[i] = (existing_score + score, existing_ep)
                        found = True
                        break
                if not found:
                    results.append((score, episode))

        # Sort by combined score and return top_k
        results.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in results[:k]]

    def _bm25_search(self, query: str, limit: int) -> list[tuple[float, Episode]]:
        """BM25 full-text search using FTS5."""
        # Escape special FTS5 characters
        safe_query = query.replace('"', '""')
        fts_query = f'"{safe_query}"'

        results: list[tuple[float, Episode]] = []

        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(
                    """SELECT e.*, bm25(episodes_fts) as score
                       FROM episodes_fts
                       JOIN episodes e ON e.id = episodes_fts.id
                       WHERE episodes_fts MATCH ?
                       ORDER BY score ASC
                       LIMIT ?""",
                    (fts_query, limit),
                )
                for row in cursor.fetchall():
                    # bm25 returns negative scores (lower = better), so negate
                    score = -row["score"]
                    results.append((score, Episode.from_dict(row)))
        except sqlite3.OperationalError:
            # FTS not available — fallback to LIKE
            results = self._like_search(query, limit)

        return results

    def _like_search(self, query: str, limit: int) -> list[tuple[float, Episode]]:
        """Fallback LIKE-based search when FTS5 is unavailable."""
        pattern = f"%{query}%"
        results: list[tuple[float, Episode]] = []

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """SELECT * FROM episodes
                   WHERE task_description LIKE ? OR key_result LIKE ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (pattern, pattern, limit),
            )
            for row in cursor.fetchall():
                # Simple scoring: 1.0 for exact match
                results.append((1.0, Episode.from_dict(row)))

        return results

    def _vector_search(
        self,
        query_embedding: list[float],
        limit: int,
    ) -> list[tuple[float, Episode]]:
        """Vector similarity search using cosine similarity."""
        if not query_embedding:
            return []

        query_vec = np.array(query_embedding, dtype=np.float32)
        query_norm = np.linalg.norm(query_vec)
        if query_norm == 0:
            return []

        results: list[tuple[float, Episode]] = []

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM episodes WHERE embedding IS NOT NULL ORDER BY timestamp DESC LIMIT 500"
            )

            for row in cursor.fetchall():
                embedding_str = row["embedding"]
                if not embedding_str:
                    continue

                try:
                    ep_vec = np.array(json.loads(embedding_str), dtype=np.float32)
                except (json.JSONDecodeError, ValueError):
                    continue

                ep_norm = np.linalg.norm(ep_vec)
                if ep_norm == 0:
                    continue

                # Cosine similarity
                similarity = float(np.dot(query_vec, ep_vec) / (query_norm * ep_norm))
                results.append((similarity, Episode.from_dict(row)))

        results.sort(key=lambda x: x[0], reverse=True)
        return results[:limit]

    def get_by_id(self, episode_id: str) -> Episode | None:
        """Get a single episode by ID."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,))
            row = cursor.fetchone()
            if row is None:
                return None
            return Episode.from_dict(row)

    def get_recent(self, limit: int = 10) -> list[Episode]:
        """Get most recent episodes."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            )
            return [Episode.from_dict(row) for row in cursor.fetchall()]

    def cleanup_expired(self) -> int:
        """Delete episodes older than retention_days.

        Returns:
            Number of episodes deleted.
        """
        cutoff = time.time() - (self.retention_days * 86400)

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM episodes WHERE timestamp < ?",
                (cutoff,),
            )
            deleted = cursor.rowcount

            # Also clean up FTS
            try:
                conn.execute(
                    "DELETE FROM episodes_fts WHERE id IN "
                    "(SELECT id FROM episodes WHERE timestamp < ?)",
                    (cutoff,),
                )
            except sqlite3.OperationalError:
                pass

        if deleted > 0:
            logger.info("Cleaned up %d expired episodes (older than %d days)", deleted, self.retention_days)

        return deleted

    def count(self) -> int:
        """Count total episodes."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM episodes")
            return cursor.fetchone()[0]
