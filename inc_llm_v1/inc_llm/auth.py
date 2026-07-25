"""Authentication system for INC-LLM-v1.

Supports:
- Secret password for free access (owner only)
- Session token management with expiry
- User registration and tracking
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from inc_llm.config import AuthConfig

logger = logging.getLogger(__name__)


class AuthManager:
    """Manages authentication and session tokens."""

    def __init__(self, config: AuthConfig) -> None:
        self.config = config
        self.db_path = Path(os.path.expanduser("~/.inc_llm/auth.db"))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    email TEXT UNIQUE,
                    created_at REAL NOT NULL,
                    is_owner INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL,
                    is_free_access INTEGER DEFAULT 0,
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
            """)

    def authenticate_password(self, password: str) -> dict[str, Any]:
        """Check if the provided password matches the secret password."""
        if password == self.config.secret_password and self.config.password_grants_free_access:
            user_id = "owner"
            token = self._create_session(user_id, free_access=True)
            self._ensure_user(user_id, email="hawpetossjustin25@gmail.com", is_owner=True)
            logger.info("Owner authenticated via secret password")
            return {"status": "ok", "token": token, "user_id": user_id, "free_access": True}
        return {"status": "error", "message": "Invalid password"}

    def register_user(self, email: str, metadata: dict | None = None) -> dict[str, Any]:
        """Register a new user."""
        user_id = hashlib.sha256(f"{email}:{time.time()}".encode()).hexdigest()[:16]
        self._ensure_user(user_id, email=email, is_owner=False, metadata=metadata)
        token = self._create_session(user_id, free_access=False)
        return {"status": "ok", "token": token, "user_id": user_id}

    def verify_token(self, token: str) -> dict[str, Any] | None:
        """Verify a session token and return user info."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT s.user_id, s.expires_at, s.is_free_access, u.email, u.is_owner "
                "FROM sessions s JOIN users u ON s.user_id = u.user_id WHERE s.token = ?",
                (token,),
            )
            row = cursor.fetchone()
        if row is None:
            return None
        user_id, expires_at, is_free, email, is_owner = row
        if time.time() > expires_at:
            return None
        return {
            "user_id": user_id, "email": email,
            "is_owner": bool(is_owner), "free_access": bool(is_free),
            "expires_at": expires_at,
        }

    def revoke_token(self, token: str) -> bool:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return cursor.rowcount > 0

    def _create_session(self, user_id: str, free_access: bool = False) -> str:
        token = hashlib.sha256(f"{user_id}:{time.time()}:{os.urandom(16).hex()}".encode()).hexdigest()
        now = time.time()
        expires = now + self.config.session_token_expiry_s
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at, is_free_access) VALUES (?, ?, ?, ?, ?)",
                (token, user_id, now, expires, int(free_access)),
            )
        return token

    def _ensure_user(self, user_id: str, email: str = "", is_owner: bool = False, metadata: dict | None = None) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (user_id, email, created_at, is_owner, metadata) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, time.time(), int(is_owner), json.dumps(metadata or {})),
            )

    def cleanup_expired(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
            return cursor.rowcount
