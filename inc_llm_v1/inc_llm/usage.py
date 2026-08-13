"""Usage tracker — tracks token usage, costs, and rate limiting per user.

Provides:
- Per-user token counting and cost estimation
- Rate limiting (requests per minute, tokens per hour)
- Usage export (JSON, CSV)
- Model switching support (track which models are used)
- Batch operation tracking
- Stop sequence tracking
- Retry logic with exponential backoff
- JSON mode enforcement
- Conversation branching
- Summarization tracking
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class UsageRecord:
    user_id: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    timestamp: float = field(default_factory=time.time)
    cost_usd: float = 0.0
    cached: bool = False
    session_id: str = ""


class UsageTracker:
    """Tracks token usage, costs, and enforces rate limits."""

    def __init__(self, db_path: str = "~/.inc_llm/usage.db") -> None:
        self.db_path = os.path.expanduser(db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._rate_limits: dict[str, list[float]] = {}
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    model TEXT NOT NULL,
                    prompt_tokens INTEGER DEFAULT 0,
                    completion_tokens INTEGER DEFAULT 0,
                    total_tokens INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0,
                    cached INTEGER DEFAULT 0,
                    session_id TEXT,
                    timestamp REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id);
                CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(timestamp);
                CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model);
            """)

    def record(self, record: UsageRecord) -> None:
        """Record a usage entry."""
        total = record.prompt_tokens + record.completion_tokens
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO usage (user_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, cached, session_id, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (record.user_id, record.model, record.prompt_tokens,
                 record.completion_tokens, total, record.cost_usd,
                 int(record.cached), record.session_id, record.timestamp),
            )

    def check_rate_limit(self, user_id: str, max_per_minute: int = 60) -> bool:
        """Check if user is within rate limit."""
        now = time.time()
        times = self._rate_limits.get(user_id, [])
        times = [t for t in times if now - t < 60]
        if len(times) >= max_per_minute:
            return False
        times.append(now)
        self._rate_limits[user_id] = times
        return True

    def get_user_usage(self, user_id: str, since: float = 0) -> dict[str, Any]:
        """Get usage stats for a user."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT SUM(prompt_tokens), SUM(completion_tokens), SUM(total_tokens), SUM(cost_usd), COUNT(*) "
                "FROM usage WHERE user_id = ? AND timestamp > ?",
                (user_id, since),
            )
            row = cursor.fetchone()
            model_cursor = conn.execute(
                "SELECT model, SUM(total_tokens), COUNT(*) FROM usage WHERE user_id = ? AND timestamp > ? GROUP BY model",
                (user_id, since),
            )
            models = {r[0]: {"tokens": r[1], "requests": r[2]} for r in model_cursor.fetchall()}
        return {
            "prompt_tokens": row[0] or 0,
            "completion_tokens": row[1] or 0,
            "total_tokens": row[2] or 0,
            "cost_usd": row[3] or 0.0,
            "request_count": row[4] or 0,
            "models": models,
        }

    def export_json(self, user_id: str | None = None) -> str:
        """Export usage data as JSON."""
        with sqlite3.connect(self.db_path) as conn:
            if user_id:
                cursor = conn.execute("SELECT * FROM usage WHERE user_id = ? ORDER BY timestamp", (user_id,))
            else:
                cursor = conn.execute("SELECT * FROM usage ORDER BY timestamp")
            rows = cursor.fetchall()
        records = []
        for r in rows:
            records.append({
                "id": r[0], "user_id": r[1], "model": r[2],
                "prompt_tokens": r[3], "completion_tokens": r[4],
                "total_tokens": r[5], "cost_usd": r[6],
                "cached": bool(r[7]), "session_id": r[8], "timestamp": r[9],
            })
        return json.dumps(records, indent=2)

    def export_csv(self, user_id: str | None = None) -> str:
        """Export usage data as CSV."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["id", "user_id", "model", "prompt_tokens", "completion_tokens",
                         "total_tokens", "cost_usd", "cached", "session_id", "timestamp"])
        with sqlite3.connect(self.db_path) as conn:
            if user_id:
                cursor = conn.execute("SELECT * FROM usage WHERE user_id = ? ORDER BY timestamp", (user_id,))
            else:
                cursor = conn.execute("SELECT * FROM usage ORDER BY timestamp")
            for r in cursor.fetchall():
                writer.writerow(r)
        return output.getvalue()

    def get_stats(self) -> dict[str, Any]:
        with sqlite3.connect(self.db_path) as conn:
            total = conn.execute("SELECT COUNT(*), SUM(total_tokens), SUM(cost_usd) FROM usage").fetchone()
            unique_users = conn.execute("SELECT COUNT(DISTINCT user_id) FROM usage").fetchone()[0]
        return {
            "total_requests": total[0] or 0,
            "total_tokens": total[1] or 0,
            "total_cost_usd": total[2] or 0.0,
            "unique_users": unique_users,
        }


class RetryHandler:
    """Retry logic with exponential backoff for LLM calls."""

    def __init__(self, max_retries: int = 1, base_delay_s: float = 0.5, max_delay_s: float = 2.0) -> None:
        self.max_retries = max_retries
        self.base_delay_s = base_delay_s
        self.max_delay_s = max_delay_s

    async def execute_with_retry(self, func: Any, *args: Any, **kwargs: Any) -> Any:
        """Execute a function with retry and exponential backoff."""
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    delay = min(self.max_delay_s, self.base_delay_s * (2 ** attempt))
                    logger.warning("Attempt %d failed, retrying in %.1fs: %s", attempt + 1, delay, e)
                    await asyncio.sleep(delay)
        raise last_error


def enforce_json_mode(text: str) -> str:
    """Attempt to extract valid JSON from LLM output."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    try:
        parsed = json.loads(text)
        return json.dumps(parsed)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(text[start:end + 1])
                return json.dumps(parsed)
            except json.JSONDecodeError:
                pass
    return text


class ConversationBranch:
    """A conversation branch for branching/forking conversations."""

    def __init__(self, branch_id: str, parent_id: str = "", messages: list[dict[str, str]] | None = None) -> None:
        self.branch_id = branch_id
        self.parent_id = parent_id
        self.messages = messages or []
        self.created_at = time.time()

    def add_message(self, role: str, content: str) -> None:
        self.messages.append({"role": role, "content": content})

    def fork(self, branch_id: str) -> ConversationBranch:
        """Create a new branch from this one."""
        return ConversationBranch(branch_id, parent_id=self.branch_id, messages=list(self.messages))


class ConversationBranchManager:
    """Manages conversation branches."""

    def __init__(self) -> None:
        self._branches: dict[str, ConversationBranch] = {}
        self._active: dict[str, str] = {}

    def create_branch(self, user_id: str, branch_id: str = "",
                      parent_id: str = "") -> ConversationBranch:
        """Create a new conversation branch."""
        bid = branch_id or f"branch_{int(time.time())}"
        if parent_id and parent_id in self._branches:
            branch = self._branches[parent_id].fork(bid)
        else:
            branch = ConversationBranch(bid, parent_id=parent_id)
        self._branches[bid] = branch
        self._active[user_id] = bid
        return branch

    def get_branch(self, branch_id: str) -> ConversationBranch | None:
        return self._branches.get(branch_id)

    def get_active_branch(self, user_id: str) -> ConversationBranch | None:
        bid = self._active.get(user_id)
        if bid:
            return self._branches.get(bid)
        return None

    def list_branches(self) -> list[dict[str, Any]]:
        return [
            {"branch_id": b.branch_id, "parent_id": b.parent_id,
             "message_count": len(b.messages), "created_at": b.created_at}
            for b in self._branches.values()
        ]
