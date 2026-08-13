"""API key system for model-to-model connections.

Allows larger models (Fable 5, GLM 5.2, Mythos, etc.) to connect to incllmv2
and use it as a backend reasoning/memory/skill engine. Keys can be:
- Created with specific scopes (chat, embed, skills, goals, memory)
- Rate-limited per key
- Tracked for usage statistics
- Free for local/Ollama connections (no payment required for model-to-model)

This makes incllmv2 a "reasoning provider" that bigger models can offload to:
- A large model can send queries → INC-LLM responds with its memory-enhanced output
- A large model can request skill lookups → INC-LLM returns relevant skills
- A large model can store episodes → INC-LLM remembers for next time
- A large model can create/manage goals → INC-LLM tracks long-term execution
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SCOPES = ("chat", "chat_stream", "embed", "skills", "goals", "memory", "sync", "admin")


@dataclass
class APIKey:
    """An API key for model-to-model connections."""
    key: str
    name: str
    scopes: list[str]
    created_at: float
    last_used: float
    usage_count: int
    rate_limit_per_min: int
    is_active: bool
    connected_model: str
    metadata: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key[:8] + "..." if len(self.key) > 8 else self.key,
            "name": self.name, "scopes": self.scopes,
            "created_at": self.created_at, "last_used": self.last_used,
            "usage_count": self.usage_count, "rate_limit_per_min": self.rate_limit_per_min,
            "is_active": self.is_active, "connected_model": self.connected_model,
        }


class APIKeyManager:
    """Manages API keys for model-to-model connections."""

    def __init__(self, db_path: str = "~/.inc_llm/api_keys.db") -> None:
        self.db_path = Path(os.path.expanduser(db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    key TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    scopes TEXT NOT NULL DEFAULT '["chat"]',
                    created_at REAL NOT NULL,
                    last_used REAL DEFAULT 0,
                    usage_count INTEGER DEFAULT 0,
                    rate_limit_per_min INTEGER DEFAULT 60,
                    is_active INTEGER DEFAULT 1,
                    connected_model TEXT DEFAULT '',
                    metadata TEXT DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS usage_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key_hash TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    tokens_used INTEGER DEFAULT 0,
                    success INTEGER DEFAULT 1
                );
                CREATE INDEX IF NOT EXISTS idx_usage_key ON usage_log(key_hash);
                CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_log(timestamp);
            """)

    def create_key(self, name: str, scopes: list[str] | None = None,
                   connected_model: str = "", rate_limit: int = 60,
                   metadata: dict | None = None) -> APIKey:
        """Create a new API key for a model to connect."""
        raw = f"{name}:{time.time()}:{os.urandom(32).hex()}"
        key = "inc-" + hashlib.sha256(raw.encode()).hexdigest()[:48]
        scopes = scopes or ["chat"]
        now = time.time()
        api_key = APIKey(
            key=key, name=name, scopes=scopes, created_at=now, last_used=0,
            usage_count=0, rate_limit_per_min=rate_limit, is_active=True,
            connected_model=connected_model, metadata=metadata or {},
        )
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT INTO api_keys
                   (key, name, scopes, created_at, last_used, usage_count,
                    rate_limit_per_min, is_active, connected_model, metadata)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (key, name, json.dumps(scopes), now, 0, 0, rate_limit, 1, connected_model,
                 json.dumps(metadata or {})),
            )
        logger.info("Created API key for '%s' (model: %s, scopes: %s)", name, connected_model, scopes)
        return api_key

    def verify_key(self, key: str, required_scope: str = "chat") -> APIKey | None:
        """Verify an API key and check if it has the required scope."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("SELECT * FROM api_keys WHERE key = ? AND is_active = 1", (key,)).fetchone()
        if row is None:
            return None
        api_key = self._row_to_key(row)
        if required_scope not in api_key.scopes and "admin" not in api_key.scopes:
            return None
        if not self._check_rate_limit(api_key):
            return None
        self._record_usage(api_key, required_scope)
        return api_key

    def _check_rate_limit(self, api_key: APIKey) -> bool:
        if api_key.rate_limit_per_min <= 0:
            return True
        cutoff = time.time() - 60
        key_hash = hashlib.sha256(api_key.key.encode()).hexdigest()[:16]
        with sqlite3.connect(str(self.db_path)) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM usage_log WHERE key_hash = ? AND timestamp > ?",
                (key_hash, cutoff),
            ).fetchone()[0]
        return count < api_key.rate_limit_per_min

    def _record_usage(self, api_key: APIKey, endpoint: str) -> None:
        now = time.time()
        key_hash = hashlib.sha256(api_key.key.encode()).hexdigest()[:16]
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE api_keys SET last_used = ?, usage_count = usage_count + 1 WHERE key = ?",
                (now, api_key.key),
            )
            conn.execute(
                "INSERT INTO usage_log (key_hash, endpoint, timestamp, success) VALUES (?, ?, ?, 1)",
                (key_hash, endpoint, now),
            )

    def revoke_key(self, key: str) -> bool:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("UPDATE api_keys SET is_active = 0 WHERE key = ?", (key,))
            return cursor.rowcount > 0

    def list_keys(self) -> list[APIKey]:
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute("SELECT * FROM api_keys ORDER BY created_at DESC").fetchall()
        return [self._row_to_key(r) for r in rows]

    def get_key(self, key: str) -> APIKey | None:
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("SELECT * FROM api_keys WHERE key = ?", (key,)).fetchone()
        return self._row_to_key(row) if row else None

    def _row_to_key(self, row: tuple) -> APIKey:
        return APIKey(
            key=row[0], name=row[1], scopes=json.loads(row[2]), created_at=row[3],
            last_used=row[4], usage_count=row[5], rate_limit_per_min=row[6],
            is_active=bool(row[7]), connected_model=row[8], metadata=json.loads(row[9]),
        )

    def get_stats(self) -> dict[str, Any]:
        with sqlite3.connect(str(self.db_path)) as conn:
            total = conn.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0]
            active = conn.execute("SELECT COUNT(*) FROM api_keys WHERE is_active = 1").fetchone()[0]
            total_requests = conn.execute("SELECT COUNT(*) FROM usage_log").fetchone()[0]
            models = conn.execute("SELECT DISTINCT connected_model FROM api_keys WHERE connected_model != ''").fetchall()
        return {
            "total_keys": total, "active_keys": active,
            "total_requests": total_requests,
            "connected_models": [m[0] for m in models],
        }
