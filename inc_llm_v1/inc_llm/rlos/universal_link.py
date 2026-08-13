"""Universal mesh link — extends universal recursive linking through the RLOS server mesh.

This module bridges the existing UniversalLinkManager (peer-to-peer instance
sync) with the RLOS server mesh. It enables:
1. Propagation of learnings through server nodes (not just instance-to-instance)
2. Knowledge file (RAG) propagation across the mesh
3. Bandwidth-limited sync to prevent overwhelming slow connections
4. Version-tagged updates for backward compatibility
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from inc_llm.config import UniversalMeshConfig
from inc_llm.recursive_link.universal import UniversalLinkManager

logger = logging.getLogger(__name__)


class UniversalMeshLink:
    """Extends universal recursive linking through the RLOS server mesh."""

    def __init__(
        self,
        config: UniversalMeshConfig,
        universal_link: UniversalLinkManager,
        mesh_db_path: str = "~/.inc_llm/rlos_mesh.db",
    ) -> None:
        self.config = config
        self.universal = universal_link
        self.db_path = Path(os.path.expanduser(mesh_db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        self._bandwidth_used = 0
        self._bandwidth_window_start = time.time()
        self._running = False

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS mesh_propagations (
                    id TEXT PRIMARY KEY,
                    item_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source_instance TEXT NOT NULL,
                    target_server TEXT,
                    timestamp REAL NOT NULL,
                    status TEXT DEFAULT 'pending',
                    metadata TEXT
                );
                CREATE TABLE IF NOT EXISTS mesh_knowledge_files (
                    id TEXT PRIMARY KEY,
                    domain TEXT NOT NULL,
                    content TEXT NOT NULL,
                    version TEXT NOT NULL,
                    source_instance TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    applied INTEGER DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_mesh_status ON mesh_propagations(status);
                CREATE INDEX IF NOT EXISTS idx_mesh_domain ON mesh_knowledge_files(domain);
            """)

    def propagate_learning(self, learning_type: str, content: str,
                           target_server: str = "", metadata: dict | None = None) -> str:
        """Queue a learning for mesh propagation."""
        if not self.config.enabled or not self.config.propagate_learnings:
            return ""

        propagation_id = hashlib.sha256(
            f"{learning_type}:{content}:{time.time()}".encode()
        ).hexdigest()[:16]

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO mesh_propagations "
                "(id, item_type, content, source_instance, target_server, timestamp, metadata) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (propagation_id, learning_type, content,
                 self.universal.instance_id, target_server, time.time(),
                 json.dumps(metadata or {})),
            )

        logger.debug("Queued mesh propagation: %s (type: %s)", propagation_id, learning_type)
        return propagation_id

    def propagate_knowledge_file(self, domain: str, content: str,
                                 version: str = "", metadata: dict | None = None) -> str:
        """Queue a knowledge file for mesh propagation."""
        if not self.config.enabled or not self.config.propagate_knowledge:
            return ""

        file_id = hashlib.sha256(
            f"knowledge:{domain}:{content}:{time.time()}".encode()
        ).hexdigest()[:16]
        version_tag = version or self.config.version_tag

        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO mesh_knowledge_files "
                "(id, domain, content, version, source_instance, timestamp) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (file_id, domain, content, version_tag,
                 self.universal.instance_id, time.time()),
            )

        logger.info("Propagated knowledge file for domain: %s (version: %s)", domain, version_tag)
        return file_id

    def receive_knowledge_file(self, file_data: dict[str, Any]) -> bool:
        """Receive a knowledge file from the mesh."""
        file_id = file_data.get("id", "")
        domain = file_data.get("domain", "")
        content = file_data.get("content", "")
        source = file_data.get("source_instance", "")

        if not file_id or not content or source == self.universal.instance_id:
            return False

        with sqlite3.connect(str(self.db_path)) as conn:
            existing = conn.execute(
                "SELECT 1 FROM mesh_knowledge_files WHERE id = ?", (file_id,)
            ).fetchone()
            if existing:
                return False
            conn.execute(
                "INSERT OR IGNORE INTO mesh_knowledge_files "
                "(id, domain, content, version, source_instance, timestamp, applied) "
                "VALUES (?, ?, ?, ?, ?, ?, 0)",
                (file_id, domain, content, file_data.get("version", "1.0.0"),
                 source, file_data.get("timestamp", time.time())),
            )

        logger.info("Received knowledge file for domain: %s from %s", domain, source)
        return True

    def get_pending_propagations(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get pending learnings to propagate through the mesh."""
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT id, item_type, content, source_instance, target_server, timestamp, metadata "
                "FROM mesh_propagations WHERE status = 'pending' ORDER BY timestamp ASC LIMIT ?",
                (limit,),
            )
            return [
                {"id": r[0], "item_type": r[1], "content": r[2],
                 "source_instance": r[3], "target_server": r[4],
                 "timestamp": r[5], "metadata": json.loads(r[6]) if r[6] else {}}
                for r in cursor.fetchall()
            ]

    def mark_propagated(self, propagation_id: str) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE mesh_propagations SET status = 'propagated' WHERE id = ?",
                (propagation_id,),
            )

    def _check_bandwidth(self) -> bool:
        """Check if we're within bandwidth limits."""
        now = time.time()
        elapsed = now - self._bandwidth_window_start
        if elapsed >= 1.0:
            self._bandwidth_used = 0
            self._bandwidth_window_start = now
        return self._bandwidth_used < self.config.bandwidth_limit_kbps * 1024

    def _record_bandwidth(self, bytes_transferred: int) -> None:
        self._bandwidth_used += bytes_transferred

    async def start_mesh_sync(self) -> None:
        """Start background mesh sync loop."""
        if self._running:
            return
        self._running = True
        asyncio.create_task(self._mesh_sync_loop())
        logger.info("Universal mesh link sync started")

    async def stop_mesh_sync(self) -> None:
        self._running = False

    async def _mesh_sync_loop(self) -> None:
        """Periodically propagate pending learnings through the mesh."""
        # C3: Initial delay so server starts before first mesh sync
        await asyncio.sleep(60)
        while self._running:
            try:
                pending = self.get_pending_propagations(limit=20)
                for item in pending:
                    if not self._check_bandwidth():
                        break
                    content_bytes = len(item["content"].encode())
                    self.universal.share_learning(
                        learning_type=item["item_type"],
                        content=item["content"],
                        metadata=item.get("metadata"),
                    )
                    self.mark_propagated(item["id"])
                    self._record_bandwidth(content_bytes)
            except Exception as e:
                logger.warning("Mesh sync loop error: %s", e)
            await asyncio.sleep(60)

    def get_stats(self) -> dict[str, Any]:
        with sqlite3.connect(str(self.db_path)) as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM mesh_propagations WHERE status = 'pending'"
            ).fetchone()[0]
            propagated = conn.execute(
                "SELECT COUNT(*) FROM mesh_propagations WHERE status = 'propagated'"
            ).fetchone()[0]
            knowledge_files = conn.execute(
                "SELECT COUNT(*) FROM mesh_knowledge_files"
            ).fetchone()[0]
        return {
            "enabled": self.config.enabled,
            "pending_propagations": pending,
            "propagated": propagated,
            "knowledge_files": knowledge_files,
            "bandwidth_used_bytes": self._bandwidth_used,
            "bandwidth_limit_kbps": self.config.bandwidth_limit_kbps,
        }
