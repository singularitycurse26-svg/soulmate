"""Log Channel — write-optimized channel for high-volume activity logging.

Designed specifically for the observer use case:
- Volume: 50-200 events per minute (reduced to 10-30/min by frontend dedup/throttle)
- Size: 100-200 bytes per event (tiny — no compression needed)
- Delivery: fire-and-forget (losing an event is acceptable)
- Latency: none (batch flush every 5 seconds is fine)
- Ordering: loose (events within a batch ordered by timestamp)
- Persistence: append-only, auto-pruned after 90 days
- Network: local only (frontend → local backend)
- Priority: lowest (never competes with user-facing requests)

Architecture:
1. ingest() is O(1) — extends a deque, returns immediately (no I/O)
2. Background flush loop runs every 5 seconds
3. Takes up to 100 events from buffer, batch-inserts via executemany()
4. Runs in asyncio.to_thread — never blocks the event loop
5. Ring buffer (maxlen=10000) — if SQLite is slow, oldest events dropped
6. WAL mode — readers never block writers
7. Auto-prune — deletes events older than 90 days every 24 hours
"""

from __future__ import annotations

import asyncio
import collections
import json
import logging
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class LogChannel:
    """High-volume, fire-and-forget channel for activity logging.

    Optimized for the observer use case — write-optimized, batch inserts,
    ring buffer fallback, WAL mode, auto-prune. Never blocks the event loop.
    """

    def __init__(
        self,
        db_path: str = "~/.inc_llm/observer.db",
        buffer_size: int = 10000,
        batch_size: int = 100,
        flush_interval: float = 5.0,
        prune_after_days: int = 90,
        prune_interval_s: int = 86400,
    ) -> None:
        self.db_path = Path(os.path.expanduser(db_path))
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._buffer: collections.deque = collections.deque(maxlen=buffer_size)
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._prune_after_days = prune_after_days
        self._prune_interval_s = prune_interval_s
        self._flush_task: asyncio.Task | None = None
        self._prune_task: asyncio.Task | None = None
        self._total_ingested = 0
        self._total_flushed = 0
        self._total_dropped = 0
        self._total_pruned = 0
        self._running = False

        # Initialize database immediately (sync, runs once at startup)
        self._init_db()

    def _init_db(self) -> None:
        """Initialize the observer database with WAL mode and all tables."""
        with sqlite3.connect(str(self.db_path)) as conn:
            # Enable WAL mode — readers never block writers
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            conn.execute("PRAGMA cache_size=-64000")  # 64MB cache

            conn.executescript("""
                CREATE TABLE IF NOT EXISTS activity_events (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    session_id TEXT,
                    event_type TEXT NOT NULL,
                    page TEXT,
                    action TEXT,
                    target TEXT,
                    metadata TEXT,
                    timestamp REAL NOT NULL,
                    duration_ms INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS work_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    start_time REAL NOT NULL,
                    end_time REAL,
                    event_count INTEGER DEFAULT 0,
                    summary TEXT,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT,
                    steps_json TEXT NOT NULL,
                    frequency INTEGER DEFAULT 1,
                    success_rate REAL DEFAULT 1.0,
                    first_seen REAL NOT NULL,
                    last_seen REAL NOT NULL,
                    created_at REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS daily_routines (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    day_of_week INTEGER,
                    time_block TEXT,
                    confidence REAL DEFAULT 0.0,
                    occurrences INTEGER DEFAULT 1,
                    last_seen REAL NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (workflow_id) REFERENCES workflows(id)
                );

                CREATE TABLE IF NOT EXISTS improvement_notes (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    evidence TEXT,
                    suggested_fix TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at REAL NOT NULL,
                    updated_at REAL,
                    approved_at REAL,
                    implemented_at REAL
                );

                CREATE TABLE IF NOT EXISTS monthly_reports (
                    id TEXT PRIMARY KEY,
                    month TEXT NOT NULL,
                    report_json TEXT NOT NULL,
                    notes_count INTEGER DEFAULT 0,
                    approved_count INTEGER DEFAULT 0,
                    rejected_count INTEGER DEFAULT 0,
                    implemented_count INTEGER DEFAULT 0,
                    created_at REAL NOT NULL
                );

                -- Indexes created AFTER table creation (not on hot path)
                CREATE INDEX IF NOT EXISTS idx_events_timestamp ON activity_events(timestamp);
                CREATE INDEX IF NOT EXISTS idx_events_session ON activity_events(session_id);
                CREATE INDEX IF NOT EXISTS idx_events_type ON activity_events(event_type);
                CREATE INDEX IF NOT EXISTS idx_notes_status ON improvement_notes(status);
                CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);
            """)
        logger.info("LogChannel initialized: %s (WAL mode)", self.db_path)

    async def start(self) -> None:
        """Start the background flush and prune loops."""
        if self._running:
            return
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        self._prune_task = asyncio.create_task(self._prune_loop())
        logger.info("LogChannel started (flush every %ss, prune after %s days)",
                    self._flush_interval, self._prune_after_days)

    async def stop(self) -> None:
        """Stop the background loops and flush remaining events."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        if self._prune_task:
            self._prune_task.cancel()
            try:
                await self._prune_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush_all()
        logger.info("LogChannel stopped (ingested=%s, flushed=%s, dropped=%s)",
                    self._total_ingested, self._total_flushed, self._total_dropped)

    async def ingest(self, events: list[dict]) -> dict:
        """Add events to the buffer — returns immediately (fire-and-forget).

        O(1) operation — just extends the deque. No I/O, no waiting.
        If the buffer is full (ring buffer), oldest events are dropped.
        """
        if not events:
            return {"status": "ok", "buffered": 0}
        self._buffer.extend(events)
        self._total_ingested += len(events)
        dropped = len(events) - len(events)  # deque handles overflow silently
        if len(self._buffer) == self._buffer.maxlen:
            self._total_dropped += max(0, len(events) - 1)
        return {
            "status": "ok",
            "buffered": len(events),
            "buffer_size": len(self._buffer),
        }

    async def _flush_loop(self) -> None:
        """Background loop — flushes buffer to SQLite every flush_interval seconds."""
        while self._running:
            await asyncio.sleep(self._flush_interval)
            try:
                await self._flush_batch()
            except Exception as e:
                logger.warning("LogChannel flush failed: %s", e)

    async def _flush_batch(self) -> int:
        """Take up to batch_size events from buffer and batch-insert to SQLite."""
        if not self._buffer:
            return 0
        batch = []
        while len(batch) < self._batch_size and self._buffer:
            batch.append(self._buffer.popleft())
        if not batch:
            return 0
        # Insert in a background thread — never blocks the event loop
        await asyncio.to_thread(self._batch_insert, batch)
        self._total_flushed += len(batch)
        return len(batch)

    async def _flush_all(self) -> int:
        """Flush ALL remaining events from buffer (used on shutdown)."""
        total = 0
        while self._buffer:
            flushed = await self._flush_batch()
            total += flushed
        return total

    def _batch_insert(self, batch: list[dict]) -> None:
        """Runs in a background thread — safe to block. Single transaction, batch insert."""
        rows = []
        for evt in batch:
            rows.append((
                evt.get("id", f"evt-{time.time_ns()}"),
                evt.get("user_id", ""),
                evt.get("session_id", ""),
                evt.get("event_type", evt.get("type", "unknown")),
                evt.get("page", ""),
                evt.get("action", ""),
                evt.get("target", ""),
                json.dumps(evt.get("metadata", {})),
                evt.get("timestamp", time.time()),
                evt.get("duration_ms", 0),
            ))
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.executemany(
                "INSERT OR REPLACE INTO activity_events "
                "(id, user_id, session_id, event_type, page, action, target, metadata, timestamp, duration_ms) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )

    async def _prune_loop(self) -> None:
        """Background loop — prunes old events every prune_interval_s (default 24h)."""
        while self._running:
            await asyncio.sleep(self._prune_interval_s)
            try:
                await asyncio.to_thread(self._prune_old_events)
            except Exception as e:
                logger.warning("LogChannel prune failed: %s", e)

    def _prune_old_events(self) -> int:
        """Delete events older than prune_after_days. Returns count deleted."""
        cutoff = time.time() - (self._prune_after_days * 86400)
        with sqlite3.connect(str(self.db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM activity_events WHERE timestamp < ?", (cutoff,)
            )
            deleted = cursor.rowcount
        if deleted > 0:
            self._total_pruned += deleted
            logger.info("LogChannel pruned %s old events", deleted)
        return deleted

    def get_stats(self) -> dict:
        """Return channel statistics."""
        return {
            "running": self._running,
            "buffer_size": len(self._buffer),
            "buffer_max": self._buffer.maxlen,
            "total_ingested": self._total_ingested,
            "total_flushed": self._total_flushed,
            "total_dropped": self._total_dropped,
            "total_pruned": self._total_pruned,
            "db_path": str(self.db_path),
        }

    def query_events(
        self,
        limit: int = 100,
        offset: int = 0,
        event_type: str | None = None,
        session_id: str | None = None,
        since: float = 0,
    ) -> list[dict]:
        """Query events from the database (read-only, safe to call from any thread)."""
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            query = "SELECT * FROM activity_events WHERE timestamp >= ?"
            params: list[Any] = [since]
            if event_type:
                query += " AND event_type = ?"
                params.append(event_type)
            if session_id:
                query += " AND session_id = ?"
                params.append(session_id)
            query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
            params.extend([limit, offset])
            rows = conn.execute(query, params).fetchall()
            return [dict(r) for r in rows]

    def count_events(self, since: float = 0) -> int:
        """Count events since timestamp."""
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM activity_events WHERE timestamp >= ?", (since,)
            ).fetchone()
            return row[0] if row else 0
