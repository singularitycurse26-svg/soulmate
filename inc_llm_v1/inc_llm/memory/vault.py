"""Vault memory — mega mass storage vault with auto-sizing and auto-expansion.

Three tiers:
- Hot:  Recently accessed items — in-memory cache + fast SQLite (instant access)
- Warm: Less recent but still relevant — SQLite with lazy loading
- Cold: Archived, rarely accessed — compressed gzip files on disk (unlimited capacity)

Auto-sizing: detects available disk space at startup and assigns quotas based on
hardware tier (mobile → datacenter). Designed for 1000 years of learning.

Auto-expansion: when a tier reaches 90% capacity, automatically expands its quota
(if disk space allows). When all tiers are near capacity and disk is full, triggers
aggressive re-compression and archiving. Never slows down the LLM.

A background maintenance task periodically moves items between tiers based on
last-access time and usage frequency. This keeps the hot path fast regardless
of total knowledge size — even with billions of items over 1000 years.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from inc_llm.config import VaultConfig
from inc_llm.hardware_detector import HardwareTier
from inc_llm.storage.auto_sizer import StorageAutoSizer

logger = logging.getLogger(__name__)

TIER_HOT = "hot"
TIER_WARM = "warm"
TIER_COLD = "cold"


class VaultMemory:
    """Tiered vault memory — prevents knowledge growth from slowing the system."""

    def __init__(self, config: VaultConfig, tier: HardwareTier = HardwareTier.MINIMAL) -> None:
        self.config = config
        self.vault_dir = Path(os.path.expanduser(config.vault_dir))
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.vault_dir / "vault.db"
        self.cold_dir = self.vault_dir / "cold"
        self.cold_dir.mkdir(parents=True, exist_ok=True)
        self._hot_cache: dict[str, dict[str, Any]] = {}
        self._hot_cache_max = config.hot_cache_max_entries
        self._init_db()
        self._auto_sizer = StorageAutoSizer(vault_dir=config.vault_dir, tier=tier)
        self._compression_level = 6

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS vault_index (
                    id TEXT PRIMARY KEY,
                    item_type TEXT NOT NULL,
                    tier TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at REAL NOT NULL,
                    last_accessed REAL NOT NULL,
                    access_count INTEGER DEFAULT 0,
                    cold_file TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_vault_tier ON vault_index(tier);
                CREATE INDEX IF NOT EXISTS idx_vault_type ON vault_index(item_type);
                CREATE INDEX IF NOT EXISTS idx_vault_access ON vault_index(last_accessed);
            """)

    def store(self, item_id: str, item_type: str, content: str,
              metadata: dict[str, Any] | None = None, tier: str = TIER_HOT) -> None:
        """Store an item in the vault at the specified tier."""
        now = time.time()
        meta_json = json.dumps(metadata) if metadata else None
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO vault_index "
                "(id, item_type, tier, content, metadata, created_at, last_accessed, access_count, cold_file) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)",
                (item_id, item_type, tier, content, meta_json, now, now),
            )
        if tier == TIER_HOT:
            self._hot_cache[item_id] = {
                "item_type": item_type, "content": content,
                "metadata": metadata or {}, "last_accessed": now,
            }
            self._evict_hot_cache()

    def retrieve(self, item_id: str) -> dict[str, Any] | None:
        """Retrieve an item, promoting it to hot tier on access."""
        if item_id in self._hot_cache:
            entry = self._hot_cache[item_id]
            entry["last_accessed"] = time.time()
            self._touch_db(item_id)
            return entry

        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "SELECT item_type, tier, content, metadata, cold_file FROM vault_index WHERE id = ?",
                (item_id,),
            )
            row = cursor.fetchone()

        if row is None:
            return None

        item_type, tier, content, meta_json, cold_file = row
        metadata = json.loads(meta_json) if meta_json else {}

        if tier == TIER_COLD and cold_file:
            content = self._load_cold(cold_file)

        self._promote_to_hot(item_id, item_type, content, metadata)
        return {"item_type": item_type, "content": content, "metadata": metadata}

    def _promote_to_hot(self, item_id: str, item_type: str, content: str,
                        metadata: dict[str, Any]) -> None:
        now = time.time()
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE vault_index SET tier = ?, last_accessed = ?, access_count = access_count + 1, cold_file = NULL "
                "WHERE id = ?",
                (TIER_HOT, now, item_id),
            )
        self._hot_cache[item_id] = {
            "item_type": item_type, "content": content,
            "metadata": metadata, "last_accessed": now,
        }
        self._evict_hot_cache()

    def _touch_db(self, item_id: str) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute(
                "UPDATE vault_index SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?",
                (time.time(), item_id),
            )

    def _evict_hot_cache(self) -> None:
        if len(self._hot_cache) <= self._hot_cache_max:
            return
        sorted_items = sorted(self._hot_cache.items(), key=lambda x: x[1]["last_accessed"])
        while len(self._hot_cache) > self._hot_cache_max:
            item_id, _ = sorted_items.pop(0)
            del self._hot_cache[item_id]
            with sqlite3.connect(str(self.db_path)) as conn:
                conn.execute("UPDATE vault_index SET tier = ? WHERE id = ?", (TIER_WARM, item_id))

    def _load_cold(self, cold_file: str) -> str:
        path = self.cold_dir / cold_file
        if not path.exists():
            return ""
        with gzip.open(str(path), "rt") as f:
            return f.read()

    def _save_cold(self, item_id: str, content: str) -> str:
        filename = f"{item_id}.gz"
        path = self.cold_dir / filename
        with gzip.open(str(path), "wt", compresslevel=self._compression_level) as f:
            f.write(content)
        return filename

    def run_maintenance(self) -> dict[str, int]:
        """Move items between tiers based on access patterns + auto-expand storage."""
        now = time.time()
        archive_cutoff = now - (self.config.archive_after_days * 86400)
        skill_archive_cutoff = now - (self.config.archive_unused_skills_after_days * 86400)

        moved_to_warm = 0
        moved_to_cold = 0

        with sqlite3.connect(str(self.db_path)) as conn:
            warm_candidates = conn.execute(
                "SELECT id FROM vault_index WHERE tier = ? AND last_accessed < ?",
                (TIER_HOT, archive_cutoff),
            ).fetchall()
            for (item_id,) in warm_candidates:
                conn.execute("UPDATE vault_index SET tier = ? WHERE id = ?", (TIER_WARM, item_id))
                self._hot_cache.pop(item_id, None)
                moved_to_warm += 1

            cold_candidates = conn.execute(
                "SELECT id, item_type, content FROM vault_index WHERE tier = ? AND last_accessed < ?",
                (TIER_WARM, skill_archive_cutoff),
            ).fetchall()
            for item_id, item_type, content in cold_candidates:
                cold_file = self._save_cold(item_id, content)
                conn.execute(
                    "UPDATE vault_index SET tier = ?, content = '', cold_file = ? WHERE id = ?",
                    (TIER_COLD, cold_file, item_id),
                )
                moved_to_cold += 1

        # Auto-expand storage if needed
        expansion_result = self._auto_sizer.check_and_expand()
        if expansion_result["expanded"]:
            logger.info("Vault auto-expanded: %s", expansion_result["expanded"])

        logger.info("Vault maintenance: %d -> warm, %d -> cold", moved_to_warm, moved_to_cold)
        return {"moved_to_warm": moved_to_warm, "moved_to_cold": moved_to_cold, "expansion": expansion_result}

    def get_tier_stats(self) -> dict[str, Any]:
        with sqlite3.connect(str(self.db_path)) as conn:
            hot = conn.execute("SELECT COUNT(*) FROM vault_index WHERE tier = ?", (TIER_HOT,)).fetchone()[0]
            warm = conn.execute("SELECT COUNT(*) FROM vault_index WHERE tier = ?", (TIER_WARM,)).fetchone()[0]
            cold = conn.execute("SELECT COUNT(*) FROM vault_index WHERE tier = ?", (TIER_COLD,)).fetchone()[0]
        return {
            "hot": hot, "warm": warm, "cold": cold,
            "hot_cache": len(self._hot_cache),
            "total": hot + warm + cold,
            "storage_quotas": self._auto_sizer.get_quotas(),
        }

    def search_hot(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Search only the hot tier (fast path)."""
        query_lower = query.lower()
        results: list[tuple[float, dict[str, Any]]] = []
        for item_id, entry in self._hot_cache.items():
            score = sum(1.0 for w in query_lower.split() if w in entry["content"].lower())
            if score > 0:
                results.append((score, {"id": item_id, **entry}))
        results.sort(key=lambda x: x[0], reverse=True)
        return [r[1] for r in results[:limit]]

    def update_tier(self, tier: HardwareTier) -> None:
        """Update hardware tier and recalculate storage quotas."""
        self._auto_sizer.update_tier(tier)

    def get_storage_info(self) -> dict[str, Any]:
        """Get storage quota and usage information (for dashboard/API)."""
        return self._auto_sizer.get_quotas()

    def force_expansion_check(self) -> dict[str, Any]:
        """Force an immediate storage expansion check (founder endpoint)."""
        return self._auto_sizer.check_and_expand()

    def recompress_cold(self) -> dict[str, int]:
        """Re-compress all cold-tier files with higher compression ratio.

        Called when disk is near full. Trades CPU time for disk space.
        Runs in background — zero-slowdown.
        """
        old_level = self._compression_level
        self._compression_level = 9
        recompressed = 0
        saved_bytes = 0

        for gz_file in self.cold_dir.glob("*.gz"):
            try:
                old_size = gz_file.stat().st_size
                with gzip.open(str(gz_file), "rt") as f:
                    content = f.read()
                with gzip.open(str(gz_file), "wt", compresslevel=9) as f:
                    f.write(content)
                new_size = gz_file.stat().st_size
                saved_bytes += max(0, old_size - new_size)
                recompressed += 1
            except Exception as e:
                logger.debug("Failed to recompress %s: %s", gz_file, e)

        self._compression_level = old_level
        logger.info("Recompressed %d cold files, saved %d bytes", recompressed, saved_bytes)
        return {"recompressed": recompressed, "saved_bytes": saved_bytes}
