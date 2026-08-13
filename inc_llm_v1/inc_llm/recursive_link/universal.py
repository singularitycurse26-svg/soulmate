"""Universal recursive link manager — connects all INC-LLM instances.

Every instance of incllmv2 connects to every other instance through a
peer-to-peer network. When one instance learns something (creates a skill,
discovers a fact, solves a problem), it shares that learning with all other
connected instances. This creates a self-improving network where every use
makes all instances smarter.

Architecture:
- Each instance has a unique ID and registers itself with the sync endpoint
- Instances share learnings (skills, facts, successful patterns) via the sync API
- The knowledge graph tracks which learnings came from which peers
- Recursive linking connects local learnings to peer-sourced learnings
- Link decay ensures stale peer knowledge fades over time
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

from inc_llm.config import UniversalLinkConfig
from inc_llm.memory.manager import MemoryManager

logger = logging.getLogger(__name__)


class UniversalLinkManager:
    """Manages universal recursive linking across all INC-LLM instances."""

    def __init__(self, config: UniversalLinkConfig, memory: MemoryManager) -> None:
        self.config = config
        self.memory = memory
        self.instance_id = config.instance_id or self._generate_instance_id()
        self.db_path = Path(os.path.expanduser(config.peer_db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.mesh_link = None
        self._init_db()

    def set_mesh_link(self, mesh_link: Any) -> None:
        """Set the universal mesh link for RLOS integration."""
        self.mesh_link = mesh_link

    def _generate_instance_id(self) -> str:
        hostname = os.uname().nodename if hasattr(os, "uname") else "unknown"
        raw = f"{hostname}:{time.time()}:{os.getpid()}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS peers (
                    peer_id TEXT PRIMARY KEY,
                    peer_name TEXT,
                    endpoint TEXT,
                    last_seen REAL DEFAULT 0,
                    learnings_shared INTEGER DEFAULT 0,
                    learnings_received INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS shared_learnings (
                    id TEXT PRIMARY KEY,
                    learning_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source_instance TEXT NOT NULL,
                    source_episode_id TEXT,
                    timestamp REAL NOT NULL,
                    applied INTEGER DEFAULT 0,
                    metadata TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_sl_type ON shared_learnings(learning_type);
                CREATE INDEX IF NOT EXISTS idx_sl_source ON shared_learnings(source_instance);
            """)

    def register_self(self) -> dict[str, Any]:
        """Register this instance in the peer network."""
        return {
            "instance_id": self.instance_id,
            "instance_name": self.config.instance_name,
            "timestamp": time.time(),
            "version": "1.0.0",
        }

    def add_peer(self, peer_id: str, peer_name: str, endpoint: str = "", metadata: dict | None = None) -> None:
        """Register a peer instance."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO peers (peer_id, peer_name, endpoint, last_seen, metadata) VALUES (?, ?, ?, ?, ?)",
                (peer_id, peer_name, endpoint, time.time(), json.dumps(metadata or {})),
            )
        self.memory.register_peer(peer_id, peer_name, metadata=metadata)
        logger.info("Added peer: %s (%s)", peer_name, peer_id)

    def share_learning(self, learning_type: str, content: str, episode_id: str | None = None,
                       metadata: dict | None = None) -> dict[str, Any]:
        """Share a learning with the peer network."""
        learning_id = hashlib.sha256(f"{self.instance_id}:{content}:{time.time()}".encode()).hexdigest()[:16]
        record = {
            "id": learning_id,
            "learning_type": learning_type,
            "content": content,
            "source_instance": self.instance_id,
            "source_episode_id": episode_id,
            "timestamp": time.time(),
            "metadata": json.dumps(metadata or {}),
        }
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO shared_learnings
                   (id, learning_type, content, source_instance, source_episode_id, timestamp, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (record["id"], record["learning_type"], record["content"],
                 record["source_instance"], record["source_episode_id"],
                 record["timestamp"], record["metadata"]),
            )
        logger.info("Shared learning %s (type: %s)", learning_id, learning_type)
        if self.mesh_link:
            try:
                self.mesh_link.propagate_learning(
                    learning_type=learning_type, content=content,
                    metadata=metadata,
                )
            except Exception as e:
                logger.warning("Mesh propagation failed: %s", e)
        return record

    def receive_learning(self, learning: dict[str, Any]) -> bool:
        """Receive a learning from a peer instance and apply it locally."""
        learning_id = learning.get("id", "")
        source_instance = learning.get("source_instance", "")
        content = learning.get("content", "")
        learning_type = learning.get("learning_type", "")

        if not learning_id or not content:
            return False

        if source_instance == self.instance_id:
            return False

        with sqlite3.connect(str(self.db_path)) as conn:
            existing = conn.execute("SELECT 1 FROM shared_learnings WHERE id = ?", (learning_id,)).fetchone()
            if existing:
                return False
            conn.execute(
                """INSERT OR IGNORE INTO shared_learnings
                   (id, learning_type, content, source_instance, source_episode_id, timestamp, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (learning_id, learning_type, content, source_instance,
                 learning.get("source_episode_id"), learning.get("timestamp", time.time()),
                 json.dumps(learning.get("metadata", {}))),
            )
            conn.execute(
                "UPDATE peers SET learnings_received = learnings_received + 1, last_seen = ? WHERE peer_id = ?",
                (time.time(), source_instance),
            )

        self._apply_peer_learning(learning_id, learning_type, content, source_instance)
        logger.info("Received learning %s from peer %s (type: %s)", learning_id, source_instance, learning_type)
        return True

    def _apply_peer_learning(self, learning_id: str, learning_type: str, content: str, source_instance: str) -> None:
        """Apply a peer learning to local memory and knowledge graph."""
        self.memory.register_peer_learning(learning_id, content, source_instance,
                                           metadata={"type": learning_type})

        if learning_type == "skill":
            try:
                skill_data = json.loads(content)
                from inc_llm.memory.semantic import Skill
                skill = Skill(
                    name=skill_data.get("name", f"peer-{learning_id[:8]}"),
                    description=skill_data.get("description", ""),
                    content=skill_data.get("content", ""),
                    category=skill_data.get("category", "general"),
                    trigger_conditions=skill_data.get("trigger_conditions", []),
                    created_by_peer=source_instance,
                )
                self.memory.register_skill(skill)
            except Exception as e:
                logger.warning("Failed to apply peer skill: %s", e)

        elif learning_type == "fact":
            self.memory.register_fact(f"peer-{learning_id}", content, metadata={"source": source_instance})

        elif learning_type == "rlt_tokens":
            try:
                payload = json.loads(content)
                if hasattr(self, '_rlt_manager') and self._rlt_manager:
                    received = self._rlt_manager.receive_mesh_payload(payload)
                    logger.info("Received %d RLT tokens from peer %s", received, source_instance)
            except Exception as e:
                logger.warning("Failed to apply peer RLT tokens: %s", e)

    def get_learnings_to_share(self, since: float = 0, limit: int = 50) -> list[dict[str, Any]]:
        """Get learnings to share with peers (since timestamp)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT id, learning_type, content, source_instance, source_episode_id, timestamp, metadata "
                "FROM shared_learnings WHERE timestamp > ? AND source_instance = ? ORDER BY timestamp DESC LIMIT ?",
                (since, self.instance_id, limit),
            )
            return [{"id": r[0], "learning_type": r[1], "content": r[2], "source_instance": r[3],
                     "source_episode_id": r[4], "timestamp": r[5], "metadata": json.loads(r[6]) if r[6] else {}}
                    for r in cursor.fetchall()]

    def get_peer_count(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM peers").fetchone()[0]

    def get_shared_learning_count(self) -> int:
        with sqlite3.connect(str(self.db_path)) as conn:
            return conn.execute("SELECT COUNT(*) FROM shared_learnings").fetchone()[0]

    def get_stats(self) -> dict[str, int]:
        stats = {
            "instance_id": self.instance_id,
            "peers": self.get_peer_count(),
            "shared_learnings": self.get_shared_learning_count(),
            "graph_nodes": self.memory.graph.count_nodes(),
            "graph_edges": self.memory.graph.count_edges(),
        }
        if self.mesh_link:
            stats["mesh"] = self.mesh_link.get_stats()
        return stats
