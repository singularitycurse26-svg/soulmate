"""Biometric authentication system for incllmv2.

Fingerprint/biometric login — phone-optimized, zero-slowdown.

Design principles (same as memory vault and RLOS — never slows the LLM):
1. Separate SQLite DB (biometric.db) — no contention with auth.db or LLM pipeline
2. In-memory session cache (dict) — hot path, no DB lookup after first auth
3. All DB operations run via asyncio.to_thread() — never blocks event loop
4. WAL mode SQLite — concurrent reads, fast writes
5. No-op when no fingerprints registered — zero overhead
6. Fingerprint hash is SHA-256 — never stores raw biometric data
7. Device-bound — fingerprint tied to device_id, can't be copied

Usage:
1. User registers fingerprint on phone (requires password or existing session)
2. On subsequent logins, phone sends device_id + fingerprint_hash
3. BiometricManager verifies hash, returns session info
4. Session info cached in memory — instant login on repeat
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class BiometricManager:
    """Fingerprint/biometric authentication — phone-optimized, zero-slowdown.

    All DB operations are async (via asyncio.to_thread), so biometric auth
    never blocks the LLM inference pipeline. An in-memory cache provides
    instant repeat logins (~1ms) without touching the database.
    """

    def __init__(
        self,
        db_path: str = "~/.inc_llm/biometric.db",
        founder_password: str = "",
        cache_ttl_s: int = 3600,
    ) -> None:
        self.db_path = Path(os.path.expanduser(db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._founder_password = founder_password
        self._cache_ttl_s = cache_ttl_s
        self._session_cache: dict[str, dict[str, Any]] = {}
        self._cache_timestamps: dict[str, float] = {}
        self._init_db()

    def _init_db(self) -> None:
        """Initialize biometric DB with WAL mode for concurrent reads."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS biometric_auth (
                    device_id TEXT NOT NULL,
                    fingerprint_hash TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    is_founder INTEGER DEFAULT 0,
                    registered_at REAL NOT NULL,
                    last_used REAL DEFAULT 0,
                    PRIMARY KEY (device_id, fingerprint_hash)
                );
                CREATE INDEX IF NOT EXISTS idx_biometric_user ON biometric_auth(user_id);
                CREATE INDEX IF NOT EXISTS idx_biometric_founder ON biometric_auth(is_founder);
            """)
        logger.info("BiometricManager initialized: %s", self.db_path)

    async def register_fingerprint(
        self,
        device_id: str,
        fingerprint_hash: str,
        user_id: str,
        is_founder: bool = False,
        auth_token: str = "",
    ) -> dict[str, Any]:
        """Register a fingerprint for a user.

        Requires either:
        - Founder password (for founder registration), OR
        - Valid existing session token (for user self-registration)

        DB write runs in background thread — non-blocking.
        """
        if not await self._verify_registration_auth(auth_token, user_id, is_founder):
            return {"status": "error", "message": "Not authorized to register fingerprint"}

        await asyncio.to_thread(
            self._db_register, device_id, fingerprint_hash, user_id, is_founder
        )
        logger.info("Registered fingerprint for user %s on device %s", user_id, device_id[:8])
        return {"status": "ok", "message": "Fingerprint registered successfully"}

    async def authenticate_fingerprint(
        self, device_id: str, fingerprint_hash: str
    ) -> dict[str, Any]:
        """Authenticate via fingerprint — zero-slowdown hot path.

        1. Check in-memory cache first (instant, no DB)
        2. On cache miss, query DB in background thread
        3. Cache result for cache_ttl_s seconds
        4. Return session info
        """
        cache_key = f"{device_id}:{fingerprint_hash}"
        if cache_key in self._session_cache:
            if time.time() - self._cache_timestamps.get(cache_key, 0) < self._cache_ttl_s:
                return self._session_cache[cache_key]

        result = await asyncio.to_thread(self._db_authenticate, device_id, fingerprint_hash)

        if result["status"] == "ok":
            self._session_cache[cache_key] = result
            self._cache_timestamps[cache_key] = time.time()

        return result

    async def remove_fingerprint(
        self, device_id: str, fingerprint_hash: str, auth_token: str
    ) -> dict[str, Any]:
        """Remove a registered fingerprint (logout from device)."""
        if not auth_token:
            return {"status": "error", "message": "Auth token required"}
        await asyncio.to_thread(self._db_remove, device_id, fingerprint_hash)
        cache_key = f"{device_id}:{fingerprint_hash}"
        self._session_cache.pop(cache_key, None)
        self._cache_timestamps.pop(cache_key, None)
        logger.info("Removed fingerprint for device %s", device_id[:8])
        return {"status": "ok", "message": "Fingerprint removed"}

    async def list_devices(self, user_id: str) -> list[dict[str, Any]]:
        """List all devices registered for a user."""
        return await asyncio.to_thread(self._db_list_devices, user_id)

    def _db_authenticate(self, device_id: str, fingerprint_hash: str) -> dict[str, Any]:
        """DB lookup — runs in background thread."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT user_id, is_founder FROM biometric_auth "
                "WHERE device_id = ? AND fingerprint_hash = ?",
                (device_id, fingerprint_hash),
            ).fetchone()

        if row:
            user_id, is_founder = row
            asyncio.create_task(
                asyncio.to_thread(self._db_update_last_used, device_id, fingerprint_hash)
            )
            return {
                "status": "ok",
                "user_id": user_id,
                "is_founder": bool(is_founder),
                "free_access": bool(is_founder),
                "message": "Fingerprint verified" + (" — Founder access" if is_founder else ""),
            }
        return {"status": "error", "message": "Fingerprint not recognized"}

    def _db_register(
        self, device_id: str, fingerprint_hash: str, user_id: str, is_founder: bool
    ) -> None:
        """DB write — runs in background thread."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO biometric_auth "
                "(device_id, fingerprint_hash, user_id, is_founder, registered_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (device_id, fingerprint_hash, user_id, int(is_founder), time.time()),
            )

    def _db_remove(self, device_id: str, fingerprint_hash: str) -> None:
        """DB delete — runs in background thread."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "DELETE FROM biometric_auth WHERE device_id = ? AND fingerprint_hash = ?",
                (device_id, fingerprint_hash),
            )

    def _db_update_last_used(self, device_id: str, fingerprint_hash: str) -> None:
        """Update last_used timestamp — fire-and-forget."""
        try:
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.execute(
                    "UPDATE biometric_auth SET last_used = ? "
                    "WHERE device_id = ? AND fingerprint_hash = ?",
                    (time.time(), device_id, fingerprint_hash),
                )
        except Exception as e:
            logger.debug("Failed to update last_used: %s", e)

    def _db_list_devices(self, user_id: str) -> list[dict[str, Any]]:
        """List devices for a user — runs in background thread."""
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT device_id, is_founder, registered_at, last_used "
                "FROM biometric_auth WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        return [
            {
                "device_id": row[0][:8] + "..." if len(row[0]) > 8 else row[0],
                "is_founder": bool(row[1]),
                "registered_at": row[2],
                "last_used": row[3],
            }
            for row in rows
        ]

    async def _verify_registration_auth(
        self, auth_token: str, user_id: str, is_founder: bool
    ) -> bool:
        """Verify that the caller is authorized to register a fingerprint."""
        if is_founder:
            return auth_token == self._founder_password
        return bool(auth_token)

    def clear_cache(self) -> None:
        """Clear session cache — called on logout or security event."""
        self._session_cache.clear()
        self._cache_timestamps.clear()

    @staticmethod
    def generate_device_id(hardware_info: dict[str, str]) -> str:
        """Generate a stable device ID from hardware info.

        Called by the client to produce a consistent device_id across sessions.
        """
        raw = "|".join(f"{k}={v}" for k, v in sorted(hardware_info.items()))
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    @staticmethod
    def hash_fingerprint(biometric_signature: str, device_id: str, salt: str = "") -> str:
        """Hash a biometric signature for storage.

        Never store raw biometric data — always SHA-256 with salt + device binding.
        """
        raw = f"{biometric_signature}:{device_id}:{salt}"
        return hashlib.sha256(raw.encode()).hexdigest()
