"""Peer registry — opt-in, consent-based peer admission for the Universal RAM Supply.

SQLite-backed (like the existing UniversalLinkManager). Each peer registers with a
signed capability advertisement (HMAC of instance ID + reserved RAM + timestamp
using the peer token). No peer is admitted without explicit user consent.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PeerRecord:
    """A peer in the Ramm1 mesh."""
    peer_id: str
    endpoint: str = ""
    peer_name: str = ""
    reserved_gb: float = 0.0
    used_gb: float = 0.0
    free_gb: float = 0.0
    models: list[str] = field(default_factory=list)
    gpu: bool = False
    vram_gb: float = 0.0
    consent: bool = False
    last_seen: float = field(default_factory=time.time)
    capability_signature: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


class PeerRegistry:
    """Opt-in, consent-based peer registry for the Universal RAM Supply.

    Peers register with a signed capability advertisement. No peer is admitted
    without explicit user consent. Peers can be removed (leave the mesh) at any time.
    """

    def __init__(self, config: Any) -> None:
        self.config = config
        self.db_path = Path(os.path.expanduser(getattr(config, "peer_db_path", "~/.inc_llm/ramm1_peers.db")))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.peer_token = getattr(config, "peer_token", "")
        self._conn: sqlite3.Connection | None = None
        self._init_db()

    def _init_db(self) -> None:
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS ramm1_peers (
                    peer_id TEXT PRIMARY KEY,
                    endpoint TEXT,
                    peer_name TEXT,
                    reserved_gb REAL DEFAULT 0,
                    used_gb REAL DEFAULT 0,
                    free_gb REAL DEFAULT 0,
                    models TEXT,
                    gpu INTEGER DEFAULT 0,
                    vram_gb REAL DEFAULT 0,
                    consent INTEGER DEFAULT 0,
                    last_seen REAL DEFAULT 0,
                    capability_signature TEXT,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_peer_endpoint ON ramm1_peers(endpoint);
            """)

    def _conn_get(self) -> sqlite3.Connection:
        if self._conn is None:
            self._init_db()
        return self._conn  # type: ignore[return-value]

    def _sign_capability(self, peer_id: str, reserved_gb: float, timestamp: float) -> str:
        """HMAC-sign a capability advertisement."""
        if not self.peer_token:
            return ""
        msg = f"{peer_id}:{reserved_gb}:{timestamp}".encode()
        return hmac.new(self.peer_token.encode(), msg, hashlib.sha256).hexdigest()[:32]

    def verify_capability(self, peer_id: str, reserved_gb: float, timestamp: float, signature: str) -> bool:
        """Verify a peer's capability signature."""
        if not self.peer_token or not signature:
            return False
        expected = self._sign_capability(peer_id, reserved_gb, timestamp)
        return hmac.compare_digest(expected, signature)

    def register_peer(self, peer: PeerRecord) -> bool:
        """Register or update a peer. Consent defaults to False — must be approved separately."""
        conn = self._conn_get()
        conn.execute(
            """INSERT OR REPLACE INTO ramm1_peers
               (peer_id, endpoint, peer_name, reserved_gb, used_gb, free_gb, models, gpu, vram_gb,
                consent, last_seen, capability_signature, metadata)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (peer.peer_id, peer.endpoint, peer.peer_name, peer.reserved_gb, peer.used_gb,
             peer.free_gb, json.dumps(peer.models), int(peer.gpu), peer.vram_gb,
             int(peer.consent), time.time(), peer.capability_signature, json.dumps(peer.metadata)),
        )
        conn.commit()
        logger.info("Registered peer %s (%s) — reserved %.2f GB, consent=%s", peer.peer_id, peer.endpoint, peer.reserved_gb, peer.consent)
        return True

    def approve_peer(self, peer_id: str) -> bool:
        """Approve a peer — grant consent."""
        conn = self._conn_get()
        cur = conn.execute("UPDATE ramm1_peers SET consent = 1 WHERE peer_id = ?", (peer_id,))
        conn.commit()
        return cur.rowcount > 0

    def remove_peer(self, peer_id: str) -> bool:
        """Remove a peer from the registry."""
        conn = self._conn_get()
        cur = conn.execute("DELETE FROM ramm1_peers WHERE peer_id = ?", (peer_id,))
        conn.commit()
        return cur.rowcount > 0

    def update_heartbeat(self, peer_id: str, free_gb: float | None = None, used_gb: float | None = None, models: list[str] | None = None) -> None:
        """Update a peer's heartbeat + capacity."""
        updates: list[str] = []
        params: list[Any] = []
        if free_gb is not None:
            updates.append("free_gb = ?")
            params.append(free_gb)
        if used_gb is not None:
            updates.append("used_gb = ?")
            params.append(used_gb)
        if models is not None:
            updates.append("models = ?")
            params.append(json.dumps(models))
        updates.append("last_seen = ?")
        params.append(time.time())
        params.append(peer_id)
        conn = self._conn_get()
        conn.execute(f"UPDATE ramm1_peers SET {', '.join(updates)} WHERE peer_id = ?", params)
        conn.commit()

    def list_peers(self, include_unconsented: bool = True) -> list[dict[str, Any]]:
        """List all peers."""
        conn = self._conn_get()
        conn.row_factory = sqlite3.Row
        query = "SELECT * FROM ramm1_peers"
        if not include_unconsented:
            query += " WHERE consent = 1"
        cursor = conn.execute(query)
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def get_peer(self, peer_id: str) -> dict[str, Any] | None:
        """Get a single peer."""
        conn = self._conn_get()
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM ramm1_peers WHERE peer_id = ?", (peer_id,)).fetchone()
        return self._row_to_dict(row) if row else None

    def get_consented_peers(self) -> list[dict[str, Any]]:
        """Get all peers with consent granted."""
        return self.list_peers(include_unconsented=False)

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        d = dict(row)
        d["models"] = json.loads(d["models"]) if d.get("models") else []
        d["gpu"] = bool(d.get("gpu", 0))
        d["consent"] = bool(d.get("consent", 0))
        d["metadata"] = json.loads(d["metadata"]) if d.get("metadata") else {}
        return d

    def get_stats(self) -> dict[str, Any]:
        conn = self._conn_get()
        total = conn.execute("SELECT COUNT(*) FROM ramm1_peers").fetchone()[0]
        consented = conn.execute("SELECT COUNT(*) FROM ramm1_peers WHERE consent = 1").fetchone()[0]
        total_reserved = conn.execute("SELECT COALESCE(SUM(reserved_gb), 0) FROM ramm1_peers WHERE consent = 1").fetchone()[0]
        return {
            "total_peers": total,
            "consented_peers": consented,
            "total_reserved_gb": round(total_reserved, 3),
        }
