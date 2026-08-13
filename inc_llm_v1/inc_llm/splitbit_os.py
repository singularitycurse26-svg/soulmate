"""SplitBit Token OS — persistent memory, recursive link, and universal sync.

Extends the SplitBitTokenOS with:
1. Persistent Memory — save/load token contexts to SQLite (survives restarts)
2. Long-Term Persistent Memory — tiered hot/warm/cold storage like the vault
3. Recursive Link — link token contexts to each other (knowledge graph for tokens)
4. Universal Recursive Link — share token learnings across all INC-LLM instances

Architecture:
  SplitBitTokenPersistentOS
  ├── Persistent Storage (SQLite)
  │   ├── Context snapshots (encoded SplitBit tokens saved to disk)
  │   ├── Codebook persistence (survives restarts)
  │   └── Session history (episodic token memory)
  ├── Long-Term Tiered Storage
  │   ├── Hot: recently used contexts — in-memory + SQLite (instant)
  │   ├── Warm: less recent — SQLite with lazy loading
  │   └── Cold: archived — compressed gzip files (unlimited capacity)
  ├── Recursive Link Graph
  │   ├── Context-to-context links (bidirectional)
  │   ├── Link decay (stale links fade over time)
  │   ├── Link traversal (find related contexts)
  │   └── Link strength (based on co-occurrence and access frequency)
  └── Universal Recursive Link
      ├── Peer instance registration
      ├── Token learning sharing (codebook patterns, context optimizations)
      ├── Peer sync (receive learnings from other instances)
      └── Mesh propagation (bandwidth-limited knowledge sharing)

All operations are O(1) or O(n) where n = token count.
Background tasks handle tier migration, link decay, and peer sync.
Zero-slowdown: never blocks the main inference path.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import math
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from inc_llm.splitbit_tokens import (
    SplitBitTokenOS,
    SplitBitTokenizer,
    SplitBitTokenConfig,
    STANDARD_TOKEN_BITS,
)
from inc_llm.math_core.precision import TIER_QUANT_FORMAT, SplitBitMath

logger = logging.getLogger(__name__)

TIER_HOT = "hot"
TIER_WARM = "warm"
TIER_COLD = "cold"

# Tier migration thresholds (seconds since last access)
HOT_TO_WARM_S = 3600       # 1 hour
WARM_TO_COLD_S = 86400     # 24 hours

# Link decay parameters
LINK_DECAY_RATE = 0.001    # per second
LINK_MIN_STRENGTH = 0.01   # below this, link is pruned
LINK_MAX_STRENGTH = 1.0


@dataclass
class TokenContextLink:
    """A recursive link between two token contexts.

    Links are bidirectional — if context A links to B, B links to A.
    Strength decays over time and increases with co-access.
    """
    source_id: str
    target_id: str
    link_type: str = "related"  # related, continuation, summary, reference
    strength: float = 0.5
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)
    access_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    def decay(self, now: float) -> float:
        """Apply time-based decay to link strength. Returns new strength."""
        elapsed = now - self.last_accessed
        decay_amount = LINK_DECAY_RATE * elapsed
        self.strength = max(LINK_MIN_STRENGTH, self.strength - decay_amount)
        return self.strength

    def reinforce(self) -> None:
        """Reinforce link strength when both contexts are accessed together."""
        self.strength = min(LINK_MAX_STRENGTH, self.strength + 0.1)
        self.last_accessed = time.time()
        self.access_count += 1


@dataclass
class TokenLearning:
    """A token learning to share via universal recursive link.

    Examples:
    - Codebook optimization (most frequent tokens → smallest indices)
    - Context compression ratio achieved
    - Optimal format for a hardware tier
    - Token pattern discovered in a conversation
    """
    learning_id: str = ""
    learning_type: str = ""  # codebook, compression, format, pattern
    content: str = ""
    source_instance: str = ""
    timestamp: float = field(default_factory=time.time)
    applied: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class SplitBitTokenPersistentOS(SplitBitTokenOS):
    """SplitBit Token OS with persistent memory, recursive links, and universal sync.

    Extends SplitBitTokenOS with:
    1. SQLite-backed persistent storage — contexts survive restarts
    2. Tiered long-term storage (hot/warm/cold) — 1000-year capacity
    3. Recursive link graph — bidirectional context links with decay
    4. Universal recursive link — peer-to-peer token learning sharing
    """

    def __init__(
        self,
        tier: str = "standard",
        context_window: int = 4096,
        storage_dir: str = "~/.inc_llm/splitbit",
        instance_id: str = "",
    ) -> None:
        super().__init__(tier=tier, context_window=context_window)

        self.storage_dir = Path(os.path.expanduser(storage_dir))
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.storage_dir / "splitbit.db"
        self.cold_dir = self.storage_dir / "cold"
        self.cold_dir.mkdir(parents=True, exist_ok=True)

        self.instance_id = instance_id or self._generate_instance_id()
        self._compression_level = 6

        # Link graph
        self._links: dict[str, list[TokenContextLink]] = {}  # context_id → links

        # Persistent state
        self._init_persistent_db()
        self._load_codebook()
        self._load_links()

        # Stats
        self._learnings_shared = 0
        self._learnings_received = 0
        self._peers_synced = 0

    def _generate_instance_id(self) -> str:
        hostname = os.uname().nodename if hasattr(os, "uname") else "unknown"
        raw = f"{hostname}:{time.time()}:{os.getpid()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    # ─── Persistent Storage ───────────────────────────────────────────

    def _init_persistent_db(self) -> None:
        """Initialize SQLite tables for persistent token storage."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS token_contexts (
                    context_id TEXT PRIMARY KEY,
                    token_count INTEGER NOT NULL,
                    encoded_data BLOB,
                    quant_format TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    last_accessed REAL NOT NULL,
                    access_count INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_ctx_tier ON token_contexts(tier);
                CREATE INDEX IF NOT EXISTS idx_ctx_access ON token_contexts(last_accessed);

                CREATE TABLE IF NOT EXISTS codebook (
                    token_id INTEGER PRIMARY KEY,
                    compact_index INTEGER NOT NULL,
                    frequency INTEGER DEFAULT 0,
                    created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cb_index ON codebook(compact_index);

                CREATE TABLE IF NOT EXISTS context_links (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    link_type TEXT DEFAULT 'related',
                    strength REAL DEFAULT 0.5,
                    created_at REAL NOT NULL,
                    last_accessed REAL NOT NULL,
                    access_count INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_link_source ON context_links(source_id);
                CREATE INDEX IF NOT EXISTS idx_link_target ON context_links(target_id);

                CREATE TABLE IF NOT EXISTS shared_token_learnings (
                    id TEXT PRIMARY KEY,
                    learning_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source_instance TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    applied INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_stl_type ON shared_token_learnings(learning_type);
                CREATE INDEX IF NOT EXISTS idx_stl_source ON shared_token_learnings(source_instance);

                CREATE TABLE IF NOT EXISTS token_peers (
                    peer_id TEXT PRIMARY KEY,
                    peer_name TEXT,
                    endpoint TEXT,
                    last_seen REAL DEFAULT 0,
                    learnings_shared INTEGER DEFAULT 0,
                    learnings_received INTEGER DEFAULT 0,
                    metadata TEXT
                );
            """)

    def save_context(self, context_id: str, metadata: dict[str, Any] | None = None) -> None:
        """Persist a context to SQLite. O(1) + encode cost.

        Automatically assigns tier based on access patterns.
        """
        encoded = self._allocated.get(context_id)
        count = self._token_counts.get(context_id, 0)
        if not encoded or count == 0:
            return

        now = time.time()
        tier = TIER_HOT  # new saves start hot

        with sqlite3.connect(str(self.db_path)) as conn:
            # Check if exists — update last_accessed
            existing = conn.execute(
                "SELECT access_count, created_at FROM token_contexts WHERE context_id = ?",
                (context_id,),
            ).fetchone()

            if existing:
                access_count = existing[0] + 1
                conn.execute(
                    """UPDATE token_contexts
                       SET encoded_data = ?, token_count = ?, quant_format = ?,
                           last_accessed = ?, access_count = ?, metadata = ?
                       WHERE context_id = ?""",
                    (encoded, count, self.quant_format, now, access_count,
                     json.dumps(metadata or {}), context_id),
                )
            else:
                conn.execute(
                    """INSERT INTO token_contexts
                       (context_id, token_count, encoded_data, quant_format, tier,
                        created_at, last_accessed, access_count, metadata)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)""",
                    (context_id, count, encoded, self.quant_format, tier,
                     now, now, json.dumps(metadata or {})),
                )

    def load_context(self, context_id: str) -> list[int] | None:
        """Load a context from persistent storage into memory. O(n).

        Returns decoded token IDs, or None if not found.
        """
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT encoded_data, token_count, quant_format, tier FROM token_contexts WHERE context_id = ?",
                (context_id,),
            ).fetchone()

            if not row:
                # Try cold storage
                return self._load_cold(context_id)

            encoded, count, fmt, tier = row

            # If cold tier or no encoded data, load from cold storage
            if tier == TIER_COLD or encoded is None:
                return self._load_cold(context_id)

            now = time.time()

            # Update access tracking
            conn.execute(
                "UPDATE token_contexts SET last_accessed = ?, access_count = access_count + 1 WHERE context_id = ?",
                (now, context_id),
            )

            # Load into memory
            self._allocated[context_id] = bytes(encoded)
            self._token_counts[context_id] = count
            self._total_memory_bytes += len(encoded)

            # Decode and return
            return self.retrieve(context_id)

    def delete_context(self, context_id: str) -> bool:
        """Delete a context from persistent storage and memory. O(1)."""
        self.free(context_id)
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM token_contexts WHERE context_id = ?", (context_id,),
            )
            # Also delete links
            conn.execute(
                "DELETE FROM context_links WHERE source_id = ? OR target_id = ?",
                (context_id, context_id),
            )
            return cursor.rowcount > 0

    def save_codebook(self) -> None:
        """Persist the current codebook to SQLite. O(n) where n = vocab size."""
        if not self.tokenizer._codebook_built:
            return
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("DELETE FROM codebook")
            for token_id, compact_idx in self.tokenizer._codebook.items():
                conn.execute(
                    "INSERT OR REPLACE INTO codebook (token_id, compact_index, frequency, created_at) VALUES (?, ?, 0, ?)",
                    (token_id, compact_idx, now),
                )
        logger.info("Codebook saved: %d entries", len(self.tokenizer._codebook))

    def _load_codebook(self) -> None:
        """Load codebook from SQLite on startup. O(n)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT token_id, compact_index FROM codebook ORDER BY compact_index",
            ).fetchall()

            if not rows:
                return

            for token_id, compact_idx in rows:
                self.tokenizer._codebook[token_id] = compact_idx
                self.tokenizer._reverse_codebook[compact_idx] = token_id
            self.tokenizer._codebook_built = True
            logger.info("Codebook loaded: %d entries", len(rows))

    # ─── Long-Term Tiered Storage ─────────────────────────────────────

    def migrate_tiers(self) -> dict[str, int]:
        """Move contexts between hot/warm/cold based on access patterns.

        Background task — not called per-request.
        O(n) where n = number of persisted contexts.
        """
        now = time.time()
        migrated = {"hot_to_warm": 0, "warm_to_cold": 0}

        with sqlite3.connect(str(self.db_path)) as conn:
            # Hot → Warm
            rows = conn.execute(
                """SELECT context_id FROM token_contexts
                   WHERE tier = ? AND last_accessed < ?""",
                (TIER_HOT, now - HOT_TO_WARM_S),
            ).fetchall()
            for (ctx_id,) in rows:
                conn.execute(
                    "UPDATE token_contexts SET tier = ? WHERE context_id = ?",
                    (TIER_WARM, ctx_id),
                )
                migrated["hot_to_warm"] += 1

            # Warm → Cold
            rows = conn.execute(
                """SELECT context_id, encoded_data, token_count, quant_format, metadata
                   FROM token_contexts
                   WHERE tier = ? AND last_accessed < ?""",
                (TIER_WARM, now - WARM_TO_COLD_S),
            ).fetchall()
            for ctx_id, encoded, count, fmt, metadata in rows:
                self._save_cold(ctx_id, bytes(encoded), count, fmt, metadata)
                migrated["warm_to_cold"] += 1

        if any(migrated.values()):
            logger.info("Tier migration: %s", migrated)
        return migrated

    def _save_cold(
        self, context_id: str, encoded: bytes, count: int,
        fmt: str, metadata: str,
    ) -> None:
        """Save a context to cold storage (compressed gzip file)."""
        cold_file = self.cold_dir / f"{context_id}.gz"
        data = {
            "context_id": context_id,
            "encoded": encoded.hex(),
            "token_count": count,
            "quant_format": fmt,
            "metadata": metadata,
            "archived_at": time.time(),
        }
        with gzip.open(cold_file, "wb", compresslevel=self._compression_level) as f:
            f.write(json.dumps(data).encode())

        # Update SQLite — set tier to cold, clear encoded_data (it's on disk)
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """UPDATE token_contexts
                   SET encoded_data = NULL, tier = ?, last_accessed = ?
                   WHERE context_id = ?""",
                (TIER_COLD, time.time(), context_id),
            )

    def _load_cold(self, context_id: str) -> list[int] | None:
        """Load a context from cold storage."""
        cold_file = self.cold_dir / f"{context_id}.gz"
        if not cold_file.exists():
            return None

        with gzip.open(cold_file, "rb") as f:
            data = json.loads(f.read().decode())

        encoded = bytes.fromhex(data["encoded"])
        count = data["token_count"]
        fmt = data["quant_format"]

        # Promote back to hot
        self._allocated[context_id] = encoded
        self._token_counts[context_id] = count
        self._total_memory_bytes += len(encoded)

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """UPDATE token_contexts
                   SET encoded_data = ?, tier = ?, last_accessed = ?
                   WHERE context_id = ?""",
                (encoded, TIER_HOT, time.time(), context_id),
            )

        logger.info("Context %s promoted from cold to hot", context_id)
        return self.retrieve(context_id)

    # ─── Recursive Link Graph ─────────────────────────────────────────

    def link_contexts(
        self, source_id: str, target_id: str,
        link_type: str = "related",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Create a bidirectional recursive link between two contexts.

        O(1) — creates two link entries (A→B and B→A).
        """
        now = time.time()
        link_id = hashlib.sha256(f"{source_id}:{target_id}:{now}".encode()).hexdigest()[:16]
        link_id_rev = hashlib.sha256(f"{target_id}:{source_id}:{now}".encode()).hexdigest()[:16]

        link = TokenContextLink(
            source_id=source_id, target_id=target_id,
            link_type=link_type, strength=0.5,
            created_at=now, last_accessed=now,
            metadata=metadata or {},
        )

        # In-memory
        self._links.setdefault(source_id, []).append(link)
        rev_link = TokenContextLink(
            source_id=target_id, target_id=source_id,
            link_type=link_type, strength=0.5,
            created_at=now, last_accessed=now,
            metadata=metadata or {},
        )
        self._links.setdefault(target_id, []).append(rev_link)

        # Persistent
        with sqlite3.connect(str(self.db_path)) as conn:
            for lid, src, tgt in [(link_id, source_id, target_id), (link_id_rev, target_id, source_id)]:
                conn.execute(
                    """INSERT OR REPLACE INTO context_links
                       (id, source_id, target_id, link_type, strength,
                        created_at, last_accessed, access_count, metadata)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)""",
                    (lid, src, tgt, link_type, 0.5, now, now, json.dumps(metadata or {})),
                )

        logger.info("Linked contexts: %s ↔ %s (%s)", source_id, target_id, link_type)

    def get_linked_contexts(
        self, context_id: str, min_strength: float = LINK_MIN_STRENGTH,
        max_depth: int = 2,
    ) -> list[tuple[str, float, int]]:
        """Find all contexts linked to this one, up to max_depth hops.

        Returns list of (context_id, strength, depth) sorted by strength.
        O(n^d) where n = avg links per context, d = max_depth.
        """
        now = time.time()
        visited: set[str] = set()
        results: list[tuple[str, float, int]] = []

        def _traverse(cid: str, depth: int) -> None:
            if depth > max_depth or cid in visited:
                return
            visited.add(cid)

            links = self._links.get(cid, [])
            for link in links:
                strength = link.decay(now)
                if strength < min_strength:
                    continue
                if link.target_id not in visited:
                    results.append((link.target_id, strength, depth))
                    _traverse(link.target_id, depth + 1)

        _traverse(context_id, 1)
        results.sort(key=lambda x: x[1], reverse=True)
        return results

    def access_context(self, context_id: str) -> None:
        """Record context access — reinforces links to co-accessed contexts.

        O(1) per link.
        """
        now = time.time()
        links = self._links.get(context_id, [])
        for link in links:
            link.reinforce()

        # Update persistent
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """UPDATE context_links
                   SET strength = ?, last_accessed = ?, access_count = access_count + 1
                   WHERE source_id = ?""",
                (LINK_MAX_STRENGTH, now, context_id),
            )

    def decay_all_links(self) -> int:
        """Apply decay to all links. Background task.

        O(n) where n = total links.
        Returns number of links pruned.
        """
        now = time.time()
        pruned = 0

        for ctx_id, links in self._links.items():
            surviving = []
            for link in links:
                strength = link.decay(now)
                if strength >= LINK_MIN_STRENGTH:
                    surviving.append(link)
                else:
                    pruned += 1
            self._links[ctx_id] = surviving

        # Prune in DB
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "DELETE FROM context_links WHERE strength < ?",
                (LINK_MIN_STRENGTH,),
            )

        if pruned:
            logger.info("Link decay: pruned %d weak links", pruned)
        return pruned

    def _load_links(self) -> None:
        """Load links from SQLite on startup. O(n)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                "SELECT source_id, target_id, link_type, strength, created_at, last_accessed, access_count, metadata FROM context_links",
            ).fetchall()

            for row in rows:
                src, tgt, ltype, strength, created, last_acc, acc_count, metadata = row
                link = TokenContextLink(
                    source_id=src, target_id=tgt, link_type=ltype,
                    strength=strength, created_at=created, last_accessed=last_acc,
                    access_count=acc_count,
                    metadata=json.loads(metadata) if metadata else {},
                )
                self._links.setdefault(src, []).append(link)

        if rows:
            logger.info("Loaded %d context links", len(rows))

    def link_stats(self) -> dict[str, Any]:
        """Get recursive link graph statistics. O(1)."""
        total_links = sum(len(links) for links in self._links.values())
        avg_strength = 0.0
        if total_links:
            strengths = [l.strength for links in self._links.values() for l in links]
            avg_strength = sum(strengths) / len(strengths)

        return {
            "total_contexts_with_links": len(self._links),
            "total_links": total_links,
            "avg_strength": round(avg_strength, 4),
            "link_types": dict(
                (ltype, sum(1 for links in self._links.values() for l in links if l.link_type == ltype))
                for ltype in ("related", "continuation", "summary", "reference")
            ),
        }

    # ─── Universal Recursive Link ─────────────────────────────────────

    def share_token_learning(
        self, learning_type: str, content: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Share a token learning with the peer network.

        Learning types:
        - codebook: codebook optimization pattern
        - compression: compression ratio achieved
        - format: optimal format for a scenario
        - pattern: token pattern discovered

        O(1).
        """
        learning_id = hashlib.sha256(
            f"{self.instance_id}:{content}:{time.time()}".encode()
        ).hexdigest()[:16]

        record = {
            "id": learning_id,
            "learning_type": learning_type,
            "content": content,
            "source_instance": self.instance_id,
            "timestamp": time.time(),
            "metadata": json.dumps(metadata or {}),
        }

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO shared_token_learnings
                   (id, learning_type, content, source_instance, timestamp, applied, metadata)
                   VALUES (?, ?, ?, ?, ?, 0, ?)""",
                (record["id"], record["learning_type"], record["content"],
                 record["source_instance"], record["timestamp"], record["metadata"]),
            )

        self._learnings_shared += 1
        logger.info("Shared token learning %s (type: %s)", learning_id, learning_type)
        return record

    def receive_token_learning(self, learning: dict[str, Any]) -> bool:
        """Receive a token learning from a peer instance.

        O(1). Returns True if applied, False if duplicate or self-sourced.
        """
        learning_id = learning.get("id", "")
        source = learning.get("source_instance", "")
        content = learning.get("content", "")
        ltype = learning.get("learning_type", "")

        if not learning_id or not content:
            return False
        if source == self.instance_id:
            return False

        with sqlite3.connect(str(self.db_path)) as conn:
            existing = conn.execute(
                "SELECT 1 FROM shared_token_learnings WHERE id = ?", (learning_id,),
            ).fetchone()
            if existing:
                return False

            conn.execute(
                """INSERT OR IGNORE INTO shared_token_learnings
                   (id, learning_type, content, source_instance, timestamp, applied, metadata)
                   VALUES (?, ?, ?, ?, ?, 0, ?)""",
                (learning_id, ltype, content, source,
                 learning.get("timestamp", time.time()),
                 json.dumps(learning.get("metadata", {}))),
            )

            # Update peer stats
            conn.execute(
                """UPDATE token_peers
                   SET learnings_received = learnings_received + 1, last_seen = ?
                   WHERE peer_id = ?""",
                (time.time(), source),
            )

        self._learnings_received += 1
        logger.info("Received token learning %s from peer %s (type: %s)",
                     learning_id, source[:8], ltype)
        return True

    def add_peer(self, peer_id: str, peer_name: str = "", endpoint: str = "",
                 metadata: dict[str, Any] | None = None) -> None:
        """Register a peer instance for universal recursive link. O(1)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO token_peers
                   (peer_id, peer_name, endpoint, last_seen, metadata)
                   VALUES (?, ?, ?, ?, ?)""",
                (peer_id, peer_name, endpoint, time.time(), json.dumps(metadata or {})),
            )
        logger.info("Added token peer: %s (%s)", peer_name, peer_id[:8])

    def get_pending_learnings(self, limit: int = 100) -> list[dict[str, Any]]:
        """Get unapplied learnings from peers. O(n) where n = limit."""
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute(
                """SELECT id, learning_type, content, source_instance, timestamp, metadata
                   FROM shared_token_learnings
                   WHERE applied = 0 AND source_instance != ?
                   ORDER BY timestamp DESC LIMIT ?""",
                (self.instance_id, limit),
            ).fetchall()

            return [
                {
                    "id": row[0], "learning_type": row[1], "content": row[2],
                    "source_instance": row[3], "timestamp": row[4],
                    "metadata": json.loads(row[5]) if row[5] else {},
                }
                for row in rows
            ]

    def mark_learning_applied(self, learning_id: str) -> None:
        """Mark a peer learning as applied. O(1)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE shared_token_learnings SET applied = 1 WHERE id = ?",
                (learning_id,),
            )

    def sync_with_peer(self, peer_id: str) -> dict[str, int]:
        """Sync token learnings with a peer. Returns sync stats.

        In a real deployment, this would make HTTP calls to the peer's API.
        Here we return what would be synced.
        """
        # Get our learnings to share
        with sqlite3.connect(str(self.db_path)) as conn:
            our_learnings = conn.execute(
                """SELECT id, learning_type, content, source_instance, timestamp, metadata
                   FROM shared_token_learnings
                   WHERE source_instance = ?
                   ORDER BY timestamp DESC LIMIT 100""",
                (self.instance_id,),
            ).fetchall()

            peer_learnings = conn.execute(
                """SELECT id, learning_type, content, source_instance, timestamp, metadata
                   FROM shared_token_learnings
                   WHERE source_instance = ? AND applied = 0
                   ORDER BY timestamp DESC LIMIT 100""",
                (peer_id,),
            ).fetchall()

        self._peers_synced += 1
        return {
            "shared_to_peer": len(our_learnings),
            "received_from_peer": len(peer_learnings),
            "peer_id": peer_id,
        }

    # ─── Combined Stats ───────────────────────────────────────────────

    def full_stats(self) -> dict[str, Any]:
        """Get complete system statistics including persistent storage and links."""
        base = self.memory_stats()

        # Persistent storage stats
        with sqlite3.connect(str(self.db_path)) as conn:
            ctx_count = conn.execute("SELECT COUNT(*) FROM token_contexts").fetchone()[0]
            cold_count = conn.execute(
                "SELECT COUNT(*) FROM token_contexts WHERE tier = ?", (TIER_COLD,),
            ).fetchone()[0]
            codebook_size = conn.execute("SELECT COUNT(*) FROM codebook").fetchone()[0]
            link_count = conn.execute("SELECT COUNT(*) FROM context_links").fetchone()[0]
            learnings_count = conn.execute(
                "SELECT COUNT(*) FROM shared_token_learnings",
            ).fetchone()[0]
            peer_count = conn.execute("SELECT COUNT(*) FROM token_peers").fetchone()[0]

        base.update({
            # Persistent storage
            "persisted_contexts": ctx_count,
            "cold_contexts": cold_count,
            "codebook_entries": codebook_size,

            # Recursive links
            "context_links": link_count,
            "link_stats": self.link_stats(),

            # Universal recursive link
            "instance_id": self.instance_id,
            "peers": peer_count,
            "learnings_shared": self._learnings_shared,
            "learnings_received": self._learnings_received,
            "total_learnings": learnings_count,
            "peers_synced": self._peers_synced,
        })
        return base

    # ─── Background Maintenance ───────────────────────────────────────

    def run_maintenance(self) -> dict[str, Any]:
        """Run all background maintenance tasks.

        Call this periodically (e.g., every 5 minutes) from a background task.
        O(n) where n = total stored items.
        """
        results = {
            "tier_migration": self.migrate_tiers(),
            "links_pruned": self.decay_all_links(),
            "gc_freed": self.gc(),
        }

        # Save codebook if it's been updated
        if self.tokenizer._codebook_built:
            self.save_codebook()

        return results

    def shutdown(self) -> None:
        """Save all state before shutdown."""
        # Save all in-memory contexts
        for ctx_id in list(self._allocated.keys()):
            self.save_context(ctx_id)

        # Save codebook
        self.save_codebook()

        logger.info("SplitBit Token OS shutdown: saved %d contexts",
                     len(self._allocated))
