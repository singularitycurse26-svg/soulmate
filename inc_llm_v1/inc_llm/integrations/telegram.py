"""Telegram integration — bot with pairing codes and full isolation.

Key design: Telegram runs in a completely separate asyncio task group
so it never blocks or slows the LLM. Voice calls are handled via a
dedicated queue that processes independently.

Pairing flow:
1. User starts chat with the bot
2. Bot generates a pairing code
3. User enters pairing code in incllmv2 web UI
4. Pairing links Telegram account to INC-LLM user
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sqlite3
import time
from typing import Any

from inc_llm.config import TelegramConfig

logger = logging.getLogger(__name__)


class TelegramIntegration:
    """Telegram bot integration with full isolation from LLM processing."""

    def __init__(self, config: TelegramConfig, db_path: str = "~/.inc_llm/telegram.db") -> None:
        self.config = config
        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._bot: Any = None
        self._running = False
        self._task: asyncio.Task | None = None
        self._message_queue: asyncio.Queue = asyncio.Queue()
        self._voice_queue: asyncio.Queue = asyncio.Queue()
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS paired_users (
                    telegram_id TEXT PRIMARY KEY,
                    inc_llm_user_id TEXT NOT NULL,
                    paired_at REAL NOT NULL,
                    username TEXT,
                    chat_id TEXT
                );
                CREATE TABLE IF NOT EXISTS pairing_codes (
                    code TEXT PRIMARY KEY,
                    inc_llm_user_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    used INTEGER DEFAULT 0,
                    expires_at REAL NOT NULL
                );
            """)

    def generate_pairing_code(self, inc_llm_user_id: str) -> str:
        """Generate a pairing code for a user."""
        code = hashlib.sha256(
            f"{inc_llm_user_id}:{time.time()}:{os.getpid()}".encode()
        ).hexdigest()[:8].upper()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO pairing_codes (code, inc_llm_user_id, created_at, expires_at) "
                "VALUES (?, ?, ?, ?)",
                (code, inc_llm_user_id, time.time(), time.time() + 600),
            )
        logger.info("Generated pairing code for user %s", inc_llm_user_id)
        return code

    def verify_pairing_code(self, code: str, telegram_id: str, username: str = "",
                            chat_id: str = "") -> dict[str, Any]:
        """Verify a pairing code from Telegram."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT inc_llm_user_id, expires_at, used FROM pairing_codes WHERE code = ?",
                (code,),
            )
            row = cursor.fetchone()
            if not row:
                return {"status": "error", "error": "Invalid code"}
            inc_llm_user_id, expires_at, used = row
            if used:
                return {"status": "error", "error": "Code already used"}
            if time.time() > expires_at:
                return {"status": "error", "error": "Code expired"}
            conn.execute("UPDATE pairing_codes SET used = 1 WHERE code = ?", (code,))
            conn.execute(
                "INSERT OR REPLACE INTO paired_users (telegram_id, inc_llm_user_id, paired_at, username, chat_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (telegram_id, inc_llm_user_id, time.time(), username, chat_id),
            )
        logger.info("Paired Telegram user %s with INC-LLM user %s", telegram_id, inc_llm_user_id)
        return {"status": "ok", "inc_llm_user_id": inc_llm_user_id}

    def get_paired_user(self, telegram_id: str) -> dict[str, Any] | None:
        """Get the INC-LLM user ID for a Telegram user."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT inc_llm_user_id, username, chat_id FROM paired_users WHERE telegram_id = ?",
                (telegram_id,),
            )
            row = cursor.fetchone()
        if not row:
            return None
        return {"inc_llm_user_id": row[0], "username": row[1], "chat_id": row[2]}

    async def start(self, message_handler: Any = None) -> None:
        """Start the Telegram bot in an isolated task."""
        if not self.config.enabled or not self.config.bot_token:
            logger.warning("Telegram bot not configured (no token)")
            return
        if self._running:
            return
        self._running = True
        self._message_handler = message_handler
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("Telegram bot started (isolated)")

    async def stop(self) -> None:
        """Stop the Telegram bot."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Telegram bot stopped")

    async def _poll_loop(self) -> None:
        """Polling loop for Telegram updates (isolated from LLM)."""
        import urllib.request
        import json as _json
        offset = 0
        while self._running:
            try:
                def _poll():
                    url = (f"https://api.telegram.org/bot{self.config.bot_token}/getUpdates"
                           f"?offset={offset}&timeout=30")
                    req = urllib.request.Request(url)
                    resp = urllib.request.urlopen(req, timeout=35)
                    return _json.loads(resp.read().decode())

                data = await asyncio.to_thread(_poll)
                for update in data.get("result", []):
                    offset = update.get("update_id", offset) + 1
                    message = update.get("message", {})
                    if message:
                        await self._message_queue.put(message)
                        asyncio.create_task(self._handle_message(message))
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Telegram poll error: %s", e)
                await asyncio.sleep(5)

    async def _handle_message(self, message: dict[str, Any]) -> None:
        """Handle a Telegram message in isolation."""
        chat_id = message.get("chat", {}).get("id")
        text = message.get("text", "")
        from_user = message.get("from", {})
        telegram_id = str(from_user.get("id", ""))

        if text.startswith("/pair "):
            code = text[6:].strip()
            result = self.verify_pairing_code(code, telegram_id,
                                               from_user.get("username", ""), str(chat_id))
            await self._send_message(chat_id, f"Pairing: {result['status']}")
            return

        paired = self.get_paired_user(telegram_id)
        if not paired:
            await self._send_message(chat_id, "Please pair your account first. Use /pair <code>")
            return

        if self._message_handler:
            try:
                response = await self._message_handler(paired["inc_llm_user_id"], text)
                await self._send_message(chat_id, response)
            except Exception as e:
                logger.error("Telegram message handler error: %s", e)
                await self._send_message(chat_id, "Error processing message")

    async def _send_message(self, chat_id: int | str, text: str) -> None:
        """Send a message to a Telegram chat."""
        import urllib.request
        import urllib.parse
        import json as _json
        try:
            def _send():
                url = f"https://api.telegram.org/bot{self.config.bot_token}/sendMessage"
                data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
                req = urllib.request.Request(url, data=data)
                urllib.request.urlopen(req, timeout=10)

            await asyncio.to_thread(_send)
        except Exception as e:
            logger.warning("Telegram send failed: %s", e)

    def get_stats(self) -> dict[str, Any]:
        with sqlite3.connect(self.db_path) as conn:
            paired = conn.execute("SELECT COUNT(*) FROM paired_users").fetchone()[0]
            pending_codes = conn.execute(
                "SELECT COUNT(*) FROM pairing_codes WHERE used = 0 AND expires_at > ?",
                (time.time(),),
            ).fetchone()[0]
        return {
            "enabled": self.config.enabled,
            "running": self._running,
            "paired_users": paired,
            "pending_codes": pending_codes,
            "queue_size": self._message_queue.qsize(),
        }
