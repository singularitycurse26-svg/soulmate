"""Authentication system for incllmv2.

Supports:
- Secret password for founder permanent free access (never expires)
- Fingerprint biometric login (via BiometricManager)
- Session token management with expiry (or permanent for founder)
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
            # Migrations: add columns safely (idempotent)
            self._safe_add_column(conn, "users", "is_founder", "INTEGER DEFAULT 0")
            self._safe_add_column(conn, "sessions", "is_permanent", "INTEGER DEFAULT 0")

    @staticmethod
    def _safe_add_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        """Safely add a column if it doesn't already exist (idempotent migration)."""
        cursor = conn.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in cursor.fetchall()]
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            logger.info("Migration: added column %s.%s", table, column)

    def authenticate_password(self, password: str) -> dict[str, Any]:
        """Check if the provided password matches the secret password.

        The founder password grants permanent free access (never expires).
        """
        if password == self.config.secret_password and self.config.password_grants_free_access:
            user_id = "founder"
            token = self._create_session(user_id, free_access=True, permanent=True)
            self._ensure_user(user_id, email="hawpetossjustin25@gmail.com", is_owner=True, is_founder=True)
            logger.info("Founder authenticated via secret password")
            return {
                "status": "ok",
                "token": token,
                "user_id": user_id,
                "free_access": True,
                "is_founder": True,
                "message": "Welcome back, Founder. Full access granted — free forever.",
            }
        return {"status": "error", "message": "Invalid password"}

    def register_user(self, email: str, metadata: dict | None = None) -> dict[str, Any]:
        """Register a new user."""
        user_id = hashlib.sha256(f"{email}:{time.time()}".encode()).hexdigest()[:16]
        self._ensure_user(user_id, email=email, is_owner=False, metadata=metadata)
        token = self._create_session(user_id, free_access=False)
        return {"status": "ok", "token": token, "user_id": user_id}

    def signup_user(self, email: str, password: str) -> dict[str, Any]:
        """Sign up a new user with email and password."""
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        with sqlite3.connect(str(self.db_path)) as conn:
            existing = conn.execute("SELECT user_id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                return {"status": "error", "detail": "Email already registered"}
            user_id = hashlib.sha256(f"{email}:{time.time()}".encode()).hexdigest()[:16]
            conn.execute(
                "INSERT INTO users (user_id, email, created_at, is_owner, is_founder, metadata) "
                "VALUES (?, ?, ?, 0, 0, ?)",
                (user_id, email, time.time(), json.dumps({"password_hash": password_hash})),
            )
        token = self._create_session(user_id, free_access=False)
        logger.info("New user signed up: %s", email)
        return {"status": "created", "session_token": token, "user_id": user_id}

    def login_user(self, email: str, password: str) -> dict[str, Any]:
        """Login a user with email and password."""
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT user_id, is_owner, is_founder, metadata FROM users WHERE email = ?",
                (email,),
            ).fetchone()
        if row is None:
            return {"status": "error", "detail": "Invalid email or password"}
        user_id, is_owner, is_founder, metadata_str = row
        try:
            metadata = json.loads(metadata_str or "{}")
        except Exception:
            metadata = {}
        stored_hash = metadata.get("password_hash", "")
        if stored_hash != password_hash:
            # Also check founder password
            if password == self.config.secret_password and self.config.password_grants_free_access:
                self._ensure_user(user_id, email=email, is_owner=True, is_founder=True)
                token = self._create_session(user_id, free_access=True, permanent=True)
                return {
                    "status": "ok", "session_token": token, "user_id": user_id,
                    "is_founder": True,
                }
            return {"status": "error", "detail": "Invalid email or password"}
        token = self._create_session(user_id, free_access=False)
        return {
            "status": "ok", "session_token": token, "user_id": user_id,
            "is_founder": bool(is_founder),
        }

    def get_session_info(self, token: str) -> dict[str, Any]:
        """Get session info for checkSession endpoint."""
        info = self.verify_token(token)
        if info is None:
            return {"status": "invalid"}
        return {"status": "valid", "email": info.get("email", ""), "user_id": info["user_id"]}

    def save_wallet(self, token: str, wallet_key_encrypted: str, wallet_address: str) -> dict[str, Any]:
        """Save wallet info for a user."""
        info = self.verify_token(token)
        if info is None:
            return {"status": "error", "detail": "Invalid token"}
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("SELECT metadata FROM users WHERE user_id = ?", (info["user_id"],)).fetchone()
            metadata = json.loads(row[0] or "{}") if row else {}
            metadata["wallet_key_encrypted"] = wallet_key_encrypted
            metadata["wallet_address"] = wallet_address
            conn.execute("UPDATE users SET metadata = ? WHERE user_id = ?", (json.dumps(metadata), info["user_id"]))
        return {"status": "ok"}

    def get_wallet(self, token: str) -> dict[str, Any]:
        """Get wallet info for a user."""
        info = self.verify_token(token)
        if info is None:
            return {"status": "error", "detail": "Invalid token"}
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute("SELECT metadata FROM users WHERE user_id = ?", (info["user_id"],)).fetchone()
            metadata = json.loads(row[0] or "{}") if row else {}
        return {
            "status": "ok",
            "wallet_key_encrypted": metadata.get("wallet_key_encrypted", ""),
            "wallet_address": metadata.get("wallet_address", ""),
        }

    def verify_token(self, token: str) -> dict[str, Any] | None:
        """Verify a session token and return user info.

        Permanent sessions (founder) never expire.
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT s.user_id, s.expires_at, s.is_free_access, s.is_permanent, "
                "u.email, u.is_owner, u.is_founder "
                "FROM sessions s JOIN users u ON s.user_id = u.user_id WHERE s.token = ?",
                (token,),
            )
            row = cursor.fetchone()
        if row is None:
            return None
        user_id, expires_at, is_free, is_permanent, email, is_owner, is_founder = row
        # Skip expiry check for permanent sessions (founder)
        if not is_permanent and time.time() > expires_at:
            return None
        return {
            "user_id": user_id, "email": email,
            "is_owner": bool(is_owner), "free_access": bool(is_free),
            "is_founder": bool(is_founder), "is_permanent": bool(is_permanent),
            "expires_at": expires_at,
        }

    def revoke_token(self, token: str) -> bool:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return cursor.rowcount > 0

    def _create_session(self, user_id: str, free_access: bool = False, permanent: bool = False) -> str:
        token = hashlib.sha256(f"{user_id}:{time.time()}:{os.urandom(16).hex()}".encode()).hexdigest()
        now = time.time()
        if permanent:
            expires = 4070937600  # Year 2099 — effectively never
        else:
            expires = now + self.config.session_token_expiry_s
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at, is_free_access, is_permanent) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (token, user_id, now, expires, int(free_access), int(permanent)),
            )
        return token

    def _ensure_user(self, user_id: str, email: str = "", is_owner: bool = False,
                      is_founder: bool = False, metadata: dict | None = None) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (user_id, email, created_at, is_owner, is_founder, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, email, time.time(), int(is_owner), int(is_founder), json.dumps(metadata or {})),
            )
            # Update is_founder if user already exists
            if is_founder:
                conn.execute(
                    "UPDATE users SET is_founder = 1, is_owner = 1 WHERE user_id = ?",
                    (user_id,),
                )

    def cleanup_expired(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM sessions WHERE expires_at < ? AND is_permanent = 0",
                (time.time(),),
            )
            return cursor.rowcount
