"""Episodic memory — session history with SQLite storage.

Stores completed episodes (task + result + metadata) for later retrieval.
Supports vector similarity search when embeddings are available.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Episode:
    """A single episode in episodic memory."""

    id: str
    session_id: str
    timestamp: float
    task_description: str
    task_category: str = "general"
    execution_time_s: float = 0.0
    success: bool = True
    key_result: str = ""
    skills_applied: list[str] = field(default_factory=list)
    new_skill_created: str | None = None
    embedding: list[float] = field(default_factory=list)
    confidence_achieved: float = 0.0
    error_encountered: str | None = None
    error_resolution: str | None = None
    steps_taken: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    peer_instance_id: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "task_description": self.task_description,
            "task_category": self.task_category,
            "execution_time_s": self.execution_time_s,
            "success": self.success,
            "key_result": self.key_result,
            "skills_applied": self.skills_applied,
            "new_skill_created": self.new_skill_created,
            "confidence_achieved": self.confidence_achieved,
            "peer_instance_id": self.peer_instance_id,
        }


class EpisodicMemory:
    """SQLite-backed episodic memory."""

    def __init__(self, db_path: str | Path, retention_days: int = 365, top_k: int = 3) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.retention_days = retention_days
        self.top_k = top_k
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS episodes (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    task_description TEXT NOT NULL,
                    task_category TEXT DEFAULT 'general',
                    execution_time_s REAL DEFAULT 0,
                    success INTEGER DEFAULT 1,
                    key_result TEXT DEFAULT '',
                    skills_applied TEXT DEFAULT '[]',
                    new_skill_created TEXT,
                    embedding TEXT DEFAULT '[]',
                    confidence_achieved REAL DEFAULT 0,
                    error_encountered TEXT,
                    error_resolution TEXT,
                    steps_taken TEXT DEFAULT '[]',
                    tools_used TEXT DEFAULT '[]',
                    peer_instance_id TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_ep_session ON episodes(session_id);
                CREATE INDEX IF NOT EXISTS idx_ep_timestamp ON episodes(timestamp);
                CREATE INDEX IF NOT EXISTS idx_ep_success ON episodes(success);
            """)

    def store(self, episode: Episode) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO episodes
                   (id, session_id, timestamp, task_description, task_category,
                    execution_time_s, success, key_result, skills_applied,
                    new_skill_created, embedding, confidence_achieved,
                    error_encountered, error_resolution, steps_taken, tools_used,
                    peer_instance_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    episode.id, episode.session_id, episode.timestamp,
                    episode.task_description, episode.task_category,
                    episode.execution_time_s, int(episode.success),
                    episode.key_result, json.dumps(episode.skills_applied),
                    episode.new_skill_created, json.dumps(episode.embedding),
                    episode.confidence_achieved, episode.error_encountered,
                    episode.error_resolution, json.dumps(episode.steps_taken),
                    json.dumps(episode.tools_used), episode.peer_instance_id,
                ),
            )
        logger.debug("Stored episode %s", episode.id)

    def search(self, query: str, query_embedding: list[float] | None = None, top_k: int | None = None) -> list[Episode]:
        k = top_k or self.top_k
        if query_embedding:
            return self._vector_search(query_embedding, k)
        return self._text_search(query, k)

    def _text_search(self, query: str, k: int) -> list[Episode]:
        query_lower = query.lower()
        query_words = set(query_lower.split())
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT * FROM episodes WHERE success = 1 ORDER BY timestamp DESC LIMIT ?",
                (k * 5,),
            )
            rows = cursor.fetchall()
        scored: list[tuple[float, Episode]] = []
        for row in self._rows_to_episodes(rows):
            desc_lower = row.task_description.lower()
            score = sum(1.0 for w in query_words if w in desc_lower)
            if score > 0:
                scored.append((score, row))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in scored[:k]]

    def _vector_search(self, query_embedding: list[float], k: int) -> list[Episode]:
        import math
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT * FROM episodes WHERE success = 1 ORDER BY timestamp DESC LIMIT 200")
            rows = cursor.fetchall()
        scored: list[tuple[float, Episode]] = []
        for ep in self._rows_to_episodes(rows):
            if not ep.embedding:
                continue
            sim = self._cosine_sim(query_embedding, ep.embedding)
            if sim > 0.3:
                scored.append((sim, ep))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [ep for _, ep in scored[:k]]

    @staticmethod
    def _cosine_sim(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(y * y for y in b))
        if na == 0 or nb == 0:
            return 0.0
        return dot / (na * nb)

    def _rows_to_episodes(self, rows: list[tuple]) -> list[Episode]:
        episodes: list[Episode] = []
        for r in rows:
            episodes.append(Episode(
                id=r[0], session_id=r[1], timestamp=r[2],
                task_description=r[3], task_category=r[4],
                execution_time_s=r[5], success=bool(r[6]),
                key_result=r[7], skills_applied=json.loads(r[8]),
                new_skill_created=r[9], embedding=json.loads(r[10]),
                confidence_achieved=r[11], error_encountered=r[12],
                error_resolution=r[13], steps_taken=json.loads(r[14]),
                tools_used=json.loads(r[15]), peer_instance_id=r[16],
            ))
        return episodes

    def get_by_id(self, episode_id: str) -> Episode | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT * FROM episodes WHERE id = ?", (episode_id,))
            row = cursor.fetchone()
        if row is None:
            return None
        return self._rows_to_episodes([row])[0]

    def get_recent(self, limit: int = 10) -> list[Episode]:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
        return self._rows_to_episodes(rows)

    def get_by_peer(self, peer_id: str, limit: int = 10) -> list[Episode]:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT * FROM episodes WHERE peer_instance_id = ? ORDER BY timestamp DESC LIMIT ?",
                (peer_id, limit),
            )
            rows = cursor.fetchall()
        return self._rows_to_episodes(rows)

    def cleanup_old(self) -> int:
        cutoff = time.time() - (self.retention_days * 86400)
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("DELETE FROM episodes WHERE timestamp < ?", (cutoff,))
            return cursor.rowcount

    def count(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM episodes").fetchone()[0]
