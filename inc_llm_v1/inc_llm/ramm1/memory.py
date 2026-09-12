"""Universal Memory + Recursive Link — makes Ramm1 smarter every use.

Wraps the existing MemoryManager + UniversalLinkManager + RecursiveLinkTokenManager
into one unified recall/search interface. Every chat turn is captured as a "turn"
learning, compressed into an RLT token, and propagated across the mesh so every
instance learns from every use.

Privacy default: only the compressed RLT token + metadata (channel, tier, outcome,
elapsed) is shared to the mesh — not the raw user message or response unless the
user explicitly opts in.
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class UniversalRamm1Memory:
    """Universal Memory + Recursive Link — gets smarter every use.

    Wraps the existing MemoryManager + UniversalLinkManager + RecursiveLinkTokenManager
    into one unified recall/search interface. Every turn is captured as a "turn"
    learning, compressed into an RLT token, and shared to the mesh.
    """

    def __init__(
        self,
        config: Any,
        universal_link: Any | None = None,
        rlt_manager: Any | None = None,
        memory_manager: Any | None = None,
    ) -> None:
        self.config = config
        self.universal_link = universal_link
        self.rlt = rlt_manager
        self.memory = memory_manager
        self._turn_db_path = Path(str(getattr(config, "peer_db_path", "~/.inc_llm/ramm1_peers.db"))).parent / "ramm1_turns.db"
        self._turn_db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: sqlite3.Connection | None = None
        self._init_turn_db()
        self._turn_count = 0

    def _conn_get(self) -> sqlite3.Connection:
        if self._conn is None:
            self._init_turn_db()
        return self._conn  # type: ignore[return-value]

    def _init_turn_db(self) -> None:
        """Initialize the turn-learning SQLite database."""
        self._conn = sqlite3.connect(str(self._turn_db_path), check_same_thread=False)
        self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS turns (
                    id TEXT PRIMARY KEY,
                    user_msg TEXT NOT NULL,
                    response TEXT NOT NULL,
                    outcome TEXT,
                    channel TEXT,
                    tier TEXT,
                    elapsed_s REAL,
                    rlt_token TEXT,
                    timestamp REAL NOT NULL,
                    shared INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_turn_ts ON turns(timestamp);
                CREATE INDEX IF NOT EXISTS idx_turn_channel ON turns(channel);
            """)

    # ── Turn recording ──

    def record_turn(
        self,
        user_msg: str,
        response: str,
        outcome: str = "success",
        channel: str = "cli",
        tier: str = "standard",
        elapsed_s: float = 0.0,
    ) -> dict[str, Any]:
        """Capture a turn, compress to RLT, and share to the mesh.

        Returns the turn record.
        """
        turn_id = hashlib.sha256(f"{user_msg}:{response}:{time.time()}".encode()).hexdigest()[:16]
        rlt_token = ""
        if self.rlt:
            try:
                self.rlt.register_episode({
                    "id": turn_id,
                    "task_description": user_msg[:200],
                    "key_result": response[:200],
                    "success": outcome == "success",
                })
                rlt_token = self._compress_turn_to_rlt(user_msg, response, outcome)
            except Exception as e:
                logger.warning("RLT compression failed: %s", e)

        record = {
            "id": turn_id,
            "user_msg": user_msg,
            "response": response,
            "outcome": outcome,
            "channel": channel,
            "tier": tier,
            "elapsed_s": elapsed_s,
            "rlt_token": rlt_token,
            "timestamp": time.time(),
            "shared": 0,
        }

        conn = self._conn_get()
        conn.execute(
            """INSERT OR REPLACE INTO turns
               (id, user_msg, response, outcome, channel, tier, elapsed_s, rlt_token, timestamp, shared, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (record["id"], record["user_msg"], record["response"], record["outcome"],
             record["channel"], record["tier"], record["elapsed_s"], record["rlt_token"],
             record["timestamp"], 0, "{}"),
        )
        conn.commit()
        self._turn_count += 1

        # Share to mesh
        if self.config.memory_share_turns and self.universal_link:
            self._share_turn_to_mesh(record)

        logger.debug("Recorded turn %s (channel: %s, outcome: %s, elapsed: %.2fs)", turn_id, channel, outcome, elapsed_s)
        return record

    def _compress_turn_to_rlt(self, user_msg: str, response: str, outcome: str) -> str:
        """Compress a turn into a compact RLT-style token."""
        # Compact format: [TURN:channel→outcome:elapsed] user_msg[:40] → response[:40]
        msg_summary = user_msg.strip().replace("\n", " ")[:40]
        resp_summary = response.strip().replace("\n", " ")[:40]
        return f"[TURN:{outcome}:{msg_summary}→{resp_summary}]"

    def _share_turn_to_mesh(self, record: dict[str, Any]) -> None:
        """Share a turn learning to the universal link mesh.

        Privacy default: share only the compressed RLT token + metadata, not raw text.
        """
        try:
            if self.config.memory_share_raw_turns:
                content = json.dumps({
                    "user_msg": record["user_msg"],
                    "response": record["response"],
                })
            else:
                # Privacy default: share only compressed token + metadata
                content = json.dumps({
                    "rlt_token": record["rlt_token"],
                    "outcome": record["outcome"],
                    "channel": record["channel"],
                    "tier": record["tier"],
                    "elapsed_s": record["elapsed_s"],
                })
            self.universal_link.share_learning(
                learning_type="turn",
                content=content,
                episode_id=record["id"],
                metadata={"channel": record["channel"], "tier": record["tier"]},
            )
            conn = self._conn_get()
            conn.execute("UPDATE turns SET shared = 1 WHERE id = ?", (record["id"],))
            conn.commit()
        except Exception as e:
            logger.warning("Failed to share turn to mesh: %s", e)

    # ── Recall + search ──

    def recall(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Semantic-ish recall — find past turns similar to the query.

        Uses a simple keyword-overlap + recency score (no embedding model required).
        Falls back to the memory manager's semantic search if available.
        """
        if self.memory and hasattr(self.memory, "prefetch_context"):
            try:
                ctx = asyncio_run(self.memory.prefetch_context(query))
                if ctx:
                    return [{"source": "memory_manager", "context": ctx}]
            except Exception:
                pass

        # Keyword-overlap recall from the turn DB
        query_words = set(query.lower().split())
        if not query_words:
            return []

        conn = self._conn_get()
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, user_msg, response, outcome, channel, tier, elapsed_s, rlt_token, timestamp FROM turns ORDER BY timestamp DESC LIMIT 200"
        )
        scored: list[tuple[float, dict[str, Any]]] = []
        for row in cursor.fetchall():
            turn = dict(row)
            turn_words = set(turn["user_msg"].lower().split())
            overlap = len(query_words & turn_words)
            if overlap == 0:
                continue
            # Score: overlap count + recency boost
            age_s = time.time() - turn["timestamp"]
            recency = max(0, 1.0 - age_s / (86400 * 7))  # decay over 7 days
            score = overlap + recency
            scored.append((score, turn))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in scored[:top_k]]

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """Keyword search over past turns."""
        conn = self._conn_get()
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT id, user_msg, response, outcome, channel, timestamp FROM turns WHERE user_msg LIKE ? OR response LIKE ? ORDER BY timestamp DESC LIMIT ?",
            (f"%{query}%", f"%{query}%", top_k),
        )
        return [dict(row) for row in cursor.fetchall()]

    def get_smart_context(self, query: str) -> str:
        """Build the smart-context block injected before inference.

        Recalls the top-K most relevant past turns + RLT tokens + relevant skills/facts.
        """
        top_k = getattr(self.config, "memory_recall_top_k", 5)
        max_tokens = getattr(self.config, "memory_smart_context_max_tokens", 200)

        # RLT context (existing)
        rlt_context = ""
        if self.rlt:
            try:
                rlt_context = self.rlt.build_context()
            except Exception:
                pass

        # Recalled turns
        recalled = self.recall(query, top_k=top_k)
        turn_lines: list[str] = []
        for turn in recalled:
            if "rlt_token" in turn and turn["rlt_token"]:
                turn_lines.append(turn["rlt_token"])
            elif "user_msg" in turn:
                turn_lines.append(f"[PAST:{turn['user_msg'][:40]}→{turn.get('response','')[:40]}]")

        # Build the context block, capped at max_tokens (~4 chars/token)
        max_chars = max_tokens * 4
        parts: list[str] = []
        if rlt_context:
            parts.append(rlt_context)
        if turn_lines:
            parts.append("[Recalled Turns]\n" + "\n".join(turn_lines))

        context = "\n\n".join(parts)
        if len(context) > max_chars:
            context = context[:max_chars]
        return context

    # ── Stats ──

    def get_stats(self) -> dict[str, Any]:
        """Get memory stats."""
        conn = self._conn_get()
        total = conn.execute("SELECT COUNT(*) FROM turns").fetchone()[0]
        shared = conn.execute("SELECT COUNT(*) FROM turns WHERE shared = 1").fetchone()[0]
        return {
            "turn_count": total,
            "shared_count": shared,
            "rlt_enabled": self.rlt is not None,
            "mesh_enabled": self.universal_link is not None,
            "share_raw_turns": getattr(self.config, "memory_share_raw_turns", False),
        }


def asyncio_run(coro: Any) -> Any:
    """Run a coroutine synchronously (helper for recall)."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # We're in an async context — create a task and return a placeholder
            return None
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)
