"""Recursive Link Token (RLT) system — compact token representation for learnings.

Instead of injecting full-text episodes, skills, facts, and peer learnings into
the LLM context (which bloats the prompt to 10K+ chars and slows inference to
a crawl), RLT compresses each learning into a tiny token string like:

    [EP:fix-login-bug→patched-auth-flow]
    [SK:python-debug→step-by-step-isolation]
    [FC:server-runs-on-port-8547]
    [PL:peer-abc→use-smaller-context-window]

These link tokens take ~10-20 chars each vs 200-500 chars for full text,
a 10-25x compression. This keeps the context window lean and the model fast.

Architecture:
- LinkToken: compressed representation of a single learning
- LinkTokenBuilder: converts episodes/skills/facts/peer learnings into link tokens
- LinkTokenBudget: manages a token budget, selects highest-priority tokens to inject
- LinkTokenCache: pre-computes and caches link tokens for reuse across turns
"""

from __future__ import annotations

import hashlib
import logging
import re
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class LinkToken:
    """A single recursive link token — compact representation of a learning.

    Format: [TYPE:key→value] or [TYPE:key] for facts
    Examples:
        [EP:fix-login→patched-auth]
        [SK:python-debug→isolate-repro-test-fix]
        [FC:ollama-port-11434]
        [PL:peer-abc→reduce-ctx-for-speed]
    """

    token_type: str  # EP=episode, SK=skill, FC=fact, PL=peer_learning
    key: str
    value: str = ""
    priority: float = 0.0
    source: str = ""  # instance_id or "local"
    created_at: float = field(default_factory=time.time)
    raw_id: str = ""  # original learning ID for tracing

    @property
    def compact(self) -> str:
        """Render as compact link token string."""
        if self.value:
            return f"[{self.token_type}:{self.key}→{self.value}]"
        return f"[{self.token_type}:{self.key}]"

    @property
    def estimated_tokens(self) -> int:
        """Estimate token count (rough: 4 chars per token, minimum 1)."""
        return max(1, len(self.compact) // 4)

    def as_dict(self) -> dict[str, Any]:
        return {
            "token_type": self.token_type,
            "key": self.key,
            "value": self.value,
            "priority": self.priority,
            "source": self.source,
            "compact": self.compact,
            "estimated_tokens": self.estimated_tokens,
        }


def _slugify(text: str, max_len: int = 20) -> str:
    """Compress text into a short slug suitable for a link token key/value."""
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    text = text.strip("-")
    if len(text) <= max_len:
        return text
    # Keep first and last parts, drop middle
    parts = text.split("-")
    if len(parts) <= 2:
        return text[:max_len]
    return f"{parts[0]}-{parts[-1]}"[:max_len]


def _compress_value(text: str, max_len: int = 25) -> str:
    """Compress a longer text into a short value string."""
    text = text.strip()
    if len(text) <= max_len:
        return _slugify(text, max_len)
    # Take first sentence or clause, then slugify
    first_clause = re.split(r"[.;\n]", text)[0]
    return _slugify(first_clause, max_len)


class LinkTokenBuilder:
    """Converts memory learnings into compact LinkTokens."""

    @staticmethod
    def from_episode(episode: dict[str, Any], source: str = "local") -> LinkToken:
        """Convert an episodic memory entry into a link token."""
        task = episode.get("task_description", episode.get("query", ""))
        result = episode.get("key_result", episode.get("result", ""))
        success = episode.get("success", True)

        key = _slugify(task, max_len=20)
        if not success:
            value = f"failed-{_compress_value(result, 15)}"
        else:
            value = _compress_value(result, max_len=25)

        return LinkToken(
            token_type="EP",
            key=key,
            value=value,
            priority=0.5,
            source=source,
            raw_id=episode.get("id", ""),
        )

    @staticmethod
    def from_skill(skill: dict[str, Any], source: str = "local") -> LinkToken:
        """Convert a skill into a link token."""
        name = skill.get("name", "")
        desc = skill.get("description", "")

        key = _slugify(name, max_len=20)
        value = _compress_value(desc, max_len=25)

        return LinkToken(
            token_type="SK",
            key=key,
            value=value,
            priority=0.7,
            source=source,
            raw_id=skill.get("name", ""),
        )

    @staticmethod
    def from_fact(fact: str, source: str = "local") -> LinkToken:
        """Convert a fact into a link token."""
        key = _slugify(fact, max_len=25)
        return LinkToken(
            token_type="FC",
            key=key,
            value="",
            priority=0.3,
            source=source,
        )

    @staticmethod
    def from_peer_learning(learning_id: str, content: str, source_instance: str) -> LinkToken:
        """Convert a peer learning into a link token."""
        key = _slugify(content, max_len=20)
        value = _compress_value(content, max_len=25)
        return LinkToken(
            token_type="PL",
            key=key,
            value=value,
            priority=0.4,
            source=source_instance,
            raw_id=learning_id,
        )

    @staticmethod
    def from_goal(goal: dict[str, Any]) -> LinkToken:
        """Convert a goal into a link token."""
        title = goal.get("title", goal.get("description", ""))
        status = goal.get("status", "active")
        key = _slugify(title, max_len=20)
        return LinkToken(
            token_type="GL",
            key=key,
            value=status,
            priority=0.6,
            source="local",
        )


class LinkTokenBudget:
    """Manages a token budget and selects the highest-priority link tokens to inject.

    Given a pool of link tokens and a max token budget, selects which tokens
    to include in the context. Higher priority tokens are included first.
    Tokens of the same type are deduplicated by key (keep highest priority).
    """

    def __init__(self, max_tokens: int = 200) -> None:
        self.max_tokens = max_tokens

    def select(self, tokens: list[LinkToken]) -> list[LinkToken]:
        """Select link tokens that fit within the token budget."""
        if not tokens:
            return []

        # Deduplicate by (type, key) — keep highest priority
        seen: dict[tuple[str, str], LinkToken] = {}
        for tok in tokens:
            k = (tok.token_type, tok.key)
            if k not in seen or tok.priority > seen[k].priority:
                seen[k] = tok

        unique = list(seen.values())

        # Sort by priority descending
        unique.sort(key=lambda t: t.priority, reverse=True)

        # Greedy fill within budget
        selected: list[LinkToken] = []
        used_tokens = 0
        for tok in unique:
            if used_tokens + tok.estimated_tokens <= self.max_tokens:
                selected.append(tok)
                used_tokens += tok.estimated_tokens

        return selected

    def render(self, tokens: list[LinkToken]) -> str:
        """Render selected tokens into a compact context string for the LLM."""
        if not tokens:
            return ""

        # Group by type for readability
        by_type: dict[str, list[LinkToken]] = {}
        for tok in tokens:
            by_type.setdefault(tok.token_type, []).append(tok)

        type_labels = {
            "EP": "Past conversations",
            "SK": "Skills",
            "FC": "Facts",
            "PL": "Peer",
            "GL": "Goals",
        }

        parts: list[str] = []
        for ttype in ["GL", "SK", "EP", "FC", "PL"]:
            if ttype not in by_type:
                continue
            label = type_labels.get(ttype, ttype)
            toks = by_type[ttype]
            # Human-readable format: "key: value" instead of cryptic [TYPE:key→value]
            items = []
            for t in toks:
                if t.value:
                    items.append(f"{t.key}: {t.value}")
                else:
                    items.append(t.key)
            parts.append(f"{label}: {', '.join(items)}")

        return " | ".join(parts)


class LinkTokenCache:
    """Persistent cache for link tokens — avoids recomputing on every turn.

    Stores link tokens in SQLite keyed by learning ID. When a learning is
    updated, its link token is regenerated. This makes context injection
    nearly free (just a DB lookup + string join).
    """

    def __init__(self, db_path: str = "~/.inc_llm/link_tokens.db") -> None:
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS link_tokens (
                    id TEXT PRIMARY KEY,
                    token_type TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT DEFAULT '',
                    compact TEXT NOT NULL,
                    priority REAL DEFAULT 0,
                    source TEXT DEFAULT 'local',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_lt_type ON link_tokens(token_type);
                CREATE INDEX IF NOT EXISTS idx_lt_priority ON link_tokens(priority DESC);
            """)

    def store(self, token: LinkToken) -> None:
        """Store or update a link token."""
        token_id = token.raw_id or hashlib.sha256(
            f"{token.token_type}:{token.key}:{token.source}".encode()
        ).hexdigest()[:16]
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO link_tokens
                   (id, token_type, key, value, compact, priority, source, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (token_id, token.token_type, token.key, token.value,
                 token.compact, token.priority, token.source,
                 token.created_at, now),
            )

    def get(self, learning_id: str) -> LinkToken | None:
        """Retrieve a link token by learning ID."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT token_type, key, value, priority, source, created_at FROM link_tokens WHERE id = ?",
                (learning_id,),
            ).fetchone()
        if not row:
            return None
        return LinkToken(
            token_type=row[0], key=row[1], value=row[2],
            priority=row[3], source=row[4], created_at=row[5],
            raw_id=learning_id,
        )

    def get_all(self, token_type: str | None = None, limit: int = 100) -> list[LinkToken]:
        """Get all cached link tokens, optionally filtered by type."""
        with sqlite3.connect(str(self.db_path)) as conn:
            if token_type:
                rows = conn.execute(
                    "SELECT id, token_type, key, value, priority, source, created_at "
                    "FROM link_tokens WHERE token_type = ? ORDER BY priority DESC LIMIT ?",
                    (token_type, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, token_type, key, value, priority, source, created_at "
                    "FROM link_tokens ORDER BY priority DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [
            LinkToken(
                token_type=r[1], key=r[2], value=r[3],
                priority=r[4], source=r[5], created_at=r[6],
                raw_id=r[0],
            )
            for r in rows
        ]

    def get_all_as_dicts(self, token_type: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        """Get all cached link tokens as dicts."""
        return [t.as_dict() for t in self.get_all(token_type, limit)]

    def remove(self, learning_id: str) -> None:
        """Remove a link token."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("DELETE FROM link_tokens WHERE id = ?", (learning_id,))

    def count(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM link_tokens").fetchone()[0]

    def total_tokens(self) -> int:
        """Total estimated tokens across all cached link tokens."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT SUM(LENGTH(compact)) FROM link_tokens"
            ).fetchone()
        total_chars = row[0] or 0
        return total_chars // 4


class RecursiveLinkTokenManager:
    """Main interface for the RLT system.

    Integrates with the harness to:
    1. Convert memory learnings into link tokens (cached for speed)
    2. Select the best tokens within a budget
    3. Render them as a compact context string for the LLM
    4. Share compact tokens across the mesh (instead of full text)
    """

    def __init__(self, budget_tokens: int = 200, db_path: str = "~/.inc_llm/link_tokens.db") -> None:
        self.cache = LinkTokenCache(db_path)
        self.budget = LinkTokenBudget(max_tokens=budget_tokens)
        self.builder = LinkTokenBuilder()

    def register_episode(self, episode: dict[str, Any], source: str = "local") -> LinkToken:
        """Convert and cache an episode as a link token."""
        token = self.builder.from_episode(episode, source)
        self.cache.store(token)
        return token

    def register_skill(self, skill: dict[str, Any], source: str = "local") -> LinkToken:
        """Convert and cache a skill as a link token."""
        token = self.builder.from_skill(skill, source)
        self.cache.store(token)
        return token

    def register_fact(self, fact: str, source: str = "local") -> LinkToken:
        """Convert and cache a fact as a link token."""
        token = self.builder.from_fact(fact, source)
        self.cache.store(token)
        return token

    def register_peer_learning(self, learning_id: str, content: str, source_instance: str) -> LinkToken:
        """Convert and cache a peer learning as a link token."""
        token = self.builder.from_peer_learning(learning_id, content, source_instance)
        self.cache.store(token)
        return token

    def register_goal(self, goal: dict[str, Any]) -> LinkToken:
        """Convert and cache a goal as a link token."""
        token = self.builder.from_goal(goal)
        self.cache.store(token)
        return token

    def build_context(self, max_tokens: int | None = None) -> str:
        """Build the compact context string from cached link tokens.

        This replaces the verbose episode/skill/fact injection in the harness.
        Returns a string like:
            Goals: [GL:fix-auth→active] | Skills: [SK:python-debug→isolate-repro] | Episodes: [EP:fix-login→patched-auth]
        """
        budget = max_tokens or self.budget.max_tokens
        tokens = self.cache.get_all(limit=200)
        if not tokens:
            return ""

        selector = LinkTokenBudget(max_tokens=budget)
        selected = selector.select(tokens)
        return selector.render(selected)

    def get_mesh_payload(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get compact link tokens to share across the mesh.

        Instead of sharing full-text learnings (which are large and slow to process),
        share compact link tokens. Peers can decode and cache them locally.
        """
        tokens = self.cache.get_all(limit=limit)
        return [t.as_dict() for t in tokens]

    def receive_mesh_payload(self, payload: list[dict[str, Any]]) -> int:
        """Receive link tokens from a mesh peer and cache them locally.

        Returns the number of new tokens received.
        """
        count = 0
        for item in payload:
            token = LinkToken(
                token_type=item.get("token_type", ""),
                key=item.get("key", ""),
                value=item.get("value", ""),
                priority=item.get("priority", 0.3),
                source=item.get("source", "peer"),
                raw_id=item.get("raw_id", ""),
            )
            if token.token_type and token.key:
                existing = self.cache.get(token.raw_id) if token.raw_id else None
                if not existing:
                    self.cache.store(token)
                    count += 1
        return count

    def get_stats(self) -> dict[str, Any]:
        """Get RLT system stats."""
        return {
            "cached_tokens": self.cache.count(),
            "total_estimated_tokens": self.cache.total_tokens(),
            "budget_tokens": self.budget.max_tokens,
        }
