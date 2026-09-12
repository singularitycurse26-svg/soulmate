"""Aceline Smart Work Watcher — background activity observation and learning.

Design philosophy: "Observe, Learn, Improve"
1. Observe — Watch everything you do in the background with zero impact on performance
2. Learn — Detect patterns, cluster workflows, identify daily routines, take improvement notes
3. Improve — Every month, present a polished report, let user approve, Aceline auto-implements

Privacy by design:
- No keystroke logging, no input content, no file contents, no conversation content
- Only action metadata: what page, what action, what target, when, how long

Architecture:
- Uses LogChannel for write-optimized event storage (fire-and-forget, batch inserts)
- Workflow detection runs every 30 minutes (GLM-assisted, with priority queue)
- Improvement notes generated from statistical analysis + GLM analysis
- Monthly reports generated on the 1st of each month
- All background work uses GLMPriorityQueue (user always preempts observer)
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
import uuid
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from inc_llm.messaging.log_channel import LogChannel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/observer", tags=["observer"])

_harness = None
_settings = None
_observer: AcelineObserver | None = None


def init_observer(harness, settings) -> None:
    """Initialize the observer with the harness and settings."""
    global _harness, _settings, _observer
    _harness = harness
    _settings = settings
    if not hasattr(settings, "observer") or not settings.observer.enabled:
        logger.info("Observer disabled in config")
        return
    _observer = AcelineObserver(
        db_path=settings.observer.db_path,
        detection_interval_s=settings.observer.detection_interval_s,
        prune_after_days=settings.observer.prune_after_days,
        observer_model=getattr(settings.observer, "observer_model", ""),
        batch_analysis=getattr(settings.observer, "batch_analysis", True),
        glm_queue=getattr(harness, "glm_queue", None),
        ollama_base=getattr(settings.ollama, "base_url", "http://localhost:11434"),
    )
    logger.info("Observer initialized: db=%s, detection_interval=%ss",
                settings.observer.db_path, settings.observer.detection_interval_s)


def get_observer() -> AcelineObserver | None:
    return _observer


# ── Request Models ──────────────────────────────────────────────────────

class EventBatch(BaseModel):
    events: list[dict]


class NoteApproval(BaseModel):
    approved: bool = True
    note_ids: list[str] = []


class MonthlyReportApproval(BaseModel):
    report_id: str
    approved_note_ids: list[str] = []


class WorkflowRunRequest(BaseModel):
    workflow_id: str


# ── AcelineObserver ─────────────────────────────────────────────────────

class AcelineObserver:
    """Smart Work Watcher — observes, learns, and suggests improvements.

    Uses LogChannel for write-optimized event storage.
    Background tasks for workflow detection, improvement notes, and monthly reports.
    All GLM calls go through GLMPriorityQueue (user always preempts).
    """

    def __init__(
        self,
        db_path: str = "~/.inc_llm/observer.db",
        detection_interval_s: int = 1800,
        prune_after_days: int = 90,
        observer_model: str = "",
        batch_analysis: bool = True,
        glm_queue=None,
        ollama_base: str = "http://localhost:11434",
    ) -> None:
        self.log_channel = LogChannel(
            db_path=db_path,
            prune_after_days=prune_after_days,
        )
        self.detection_interval_s = detection_interval_s
        self.observer_model = observer_model
        self.batch_analysis = batch_analysis
        self.glm_queue = glm_queue
        self.ollama_base = ollama_base
        self._detection_task: asyncio.Task | None = None
        self._monthly_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """Start the observer — log channel, detection loop, monthly loop."""
        if self._running:
            return
        self._running = True
        await self.log_channel.start()
        self._detection_task = asyncio.create_task(self._detection_loop())
        self._monthly_task = asyncio.create_task(self._monthly_loop())
        logger.info("AcelineObserver started")

    async def stop(self) -> None:
        """Stop the observer and all background tasks."""
        self._running = False
        for task in (self._detection_task, self._monthly_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        await self.log_channel.stop()
        logger.info("AcelineObserver stopped")

    # ── Event Ingestion (fire-and-forget via LogChannel) ──

    async def ingest_events(self, events: list[dict]) -> dict:
        """Ingest a batch of activity events — fire-and-forget."""
        # Enrich events with IDs and timestamps if missing
        for evt in events:
            if "id" not in evt:
                evt["id"] = f"evt-{uuid.uuid4().hex[:12]}"
            if "timestamp" not in evt:
                evt["timestamp"] = time.time()
        return await self.log_channel.ingest(events)

    # ── Workflow Detection (background, every 30 min) ──

    async def _detection_loop(self) -> None:
        """Background loop — runs workflow detection every detection_interval_s."""
        while self._running:
            await asyncio.sleep(self.detection_interval_s)
            try:
                await self._run_detection()
            except Exception as e:
                logger.warning("Observer detection failed: %s", e)

    async def _run_detection(self) -> dict:
        """Run workflow detection on recent events.

        1. Extract event sequences from last 24 hours, group by session
        2. Find repeated sequences (sliding window 3-15 events + hash matching)
        3. Cluster similar sequences (80%+ similarity)
        4. Name workflows via GLM (or rule-based fallback)
        5. Detect daily routines (same workflow at same time on same day, 3+ times)
        6. Generate improvement notes from statistical analysis
        """
        now = time.time()
        since = now - 86400  # last 24 hours
        events = self.log_channel.query_events(limit=5000, since=since)
        if len(events) < 10:
            return {"status": "insufficient_data", "event_count": len(events)}

        # Group by session
        sessions = defaultdict(list)
        for evt in events:
            sid = evt.get("session_id") or "default"
            sessions[sid].append(evt)

        # Find repeated sequences using sliding window + hash matching
        sequence_hashes = Counter()
        sequence_examples: dict[str, list[dict]] = {}
        for sid, session_events in sessions.items():
            sorted_events = sorted(session_events, key=lambda e: e.get("timestamp", 0))
            for window_size in range(3, 16):
                for i in range(len(sorted_events) - window_size + 1):
                    window = sorted_events[i:i + window_size]
                    # Hash based on event type + page + action (not content)
                    sig = "|".join(
                        f"{e.get('event_type', '?')}:{e.get('page', '?')}:{e.get('action', '?')}"
                        for e in window
                    )
                    h = hashlib.md5(sig.encode()).hexdigest()[:12]
                    sequence_hashes[h] += 1
                    if h not in sequence_examples:
                        sequence_examples[h] = window

        # Find sequences that repeat 3+ times
        repeated = {h: count for h, count in sequence_hashes.items() if count >= 3}
        if not repeated:
            return {"status": "no_patterns", "event_count": len(events)}

        # Cluster similar sequences (80%+ similarity via edit distance)
        clusters = self._cluster_sequences(repeated, sequence_examples)

        # Name workflows via GLM (or rule-based fallback)
        workflows_created = 0
        for cluster in clusters:
            name = await self._name_workflow(cluster["examples"][0])
            workflow_id = f"wf-{uuid.uuid4().hex[:12]}"
            steps_json = json.dumps([
                {"type": e.get("event_type"), "page": e.get("page"), "action": e.get("action")}
                for e in cluster["examples"][0]
            ])
            self._save_workflow(workflow_id, name, cluster, steps_json)
            workflows_created += 1

        # Detect daily routines
        routines_detected = self._detect_routines(clusters, sequence_examples)

        # Generate improvement notes from statistical analysis
        notes_created = await self._generate_improvement_notes(events)

        logger.info("Observer detection: %s events, %s workflows, %s routines, %s notes",
                    len(events), workflows_created, routines_detected, notes_created)
        return {
            "status": "ok",
            "event_count": len(events),
            "workflows_created": workflows_created,
            "routines_detected": routines_detected,
            "notes_created": notes_created,
        }

    def _cluster_sequences(
        self, repeated: dict[str, int], examples: dict[str, list[dict]]
    ) -> list[dict]:
        """Cluster similar sequences together (80%+ similarity)."""
        clusters = []
        used = set()
        for h, count in sorted(repeated.items(), key=lambda x: -x[1]):
            if h in used:
                continue
            cluster = {"hashes": [h], "count": count, "examples": [examples[h]]}
            used.add(h)
            # Find similar sequences
            for h2, count2 in repeated.items():
                if h2 in used:
                    continue
                similarity = self._sequence_similarity(examples[h], examples[h2])
                if similarity >= 0.8:
                    cluster["hashes"].append(h2)
                    cluster["count"] += count2
                    used.add(h2)
            clusters.append(cluster)
        return clusters[:20]  # Top 20 workflows

    def _sequence_similarity(self, seq1: list[dict], seq2: list[dict]) -> float:
        """Calculate similarity between two event sequences (0.0 to 1.0)."""
        if not seq1 or not seq2:
            return 0.0
        # Simple: compare event type + page + action signatures
        sig1 = [f"{e.get('event_type', '?')}:{e.get('page', '?')}" for e in seq1]
        sig2 = [f"{e.get('event_type', '?')}:{e.get('page', '?')}" for e in seq2]
        # Use longest common subsequence ratio
        lcs_len = self._lcs_length(sig1, sig2)
        return lcs_len / max(len(sig1), len(sig2))

    def _lcs_length(self, s1: list[str], s2: list[str]) -> int:
        """Longest common subsequence length."""
        m, n = len(s1), len(s2)
        dp = [[0] * (n + 1) for _ in range(m + 1)]
        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if s1[i - 1] == s2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1] + 1
                else:
                    dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
        return dp[m][n]

    async def _name_workflow(self, example: list[dict]) -> str:
        """Name a workflow via GLM (or rule-based fallback)."""
        # Try GLM first (with priority — user preempts)
        if self.glm_queue:
            try:
                steps_desc = "\n".join(
                    f"  {i+1}. {e.get('event_type', '?')} on {e.get('page', '?')} — {e.get('action', '?')}"
                    for i, e in enumerate(example[:10])
                )
                prompt = (
                    "You are naming a workflow pattern detected from user activity. "
                    "Give it a short, descriptive name (2-4 words). Examples: 'Morning Build Check', "
                    "'Pre-Deploy Verification', 'Daily Code Review'.\n\n"
                    f"Workflow steps:\n{steps_desc}\n\nName:"
                )
                result = await asyncio.wait_for(
                    self.glm_queue.submit(GLMRequest(
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=30,
                        temperature=0.3,
                        priority=3,  # Observer priority — user preempts
                        timeout=15,
                    )),
                    timeout=20,
                )
                name = result.get("content", "").strip().strip('"').strip("'")
                if name and len(name) < 60:
                    return name
            except Exception as e:
                logger.debug("GLM workflow naming failed: %s", e)

        # Rule-based fallback
        pages = [e.get("page", "") for e in example if e.get("page")]
        actions = [e.get("action", "") for e in example if e.get("action")]
        if pages:
            return f"{pages[0].title()} Workflow"
        return "Unnamed Workflow"

    def _save_workflow(self, workflow_id: str, name: str, cluster: dict, steps_json: str) -> None:
        """Save a detected workflow to the database."""
        now = time.time()
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO workflows "
                "(id, name, category, steps_json, frequency, success_rate, first_seen, last_seen, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (workflow_id, name, "detected", steps_json, cluster["count"],
                 1.0, now, now, now),
            )

    def _detect_routines(self, clusters: list[dict], examples: dict[str, list]) -> int:
        """Detect daily routines (same workflow at same time on same day, 3+ times)."""
        # Simplified: check if workflows occur at similar times
        routines = 0
        now = time.time()
        for cluster in clusters[:10]:
            # Get timestamps of occurrences
            timestamps = []
            for h in cluster["hashes"][:5]:
                if h in examples:
                    for e in examples[h]:
                        timestamps.append(e.get("timestamp", 0))
            if len(timestamps) < 3:
                continue
            # Check if timestamps are at similar times of day
            hours = [time.localtime(ts).tm_hour for ts in timestamps if ts > 0]
            if not hours:
                continue
            avg_hour = sum(hours) / len(hours)
            within_2h = sum(1 for h in hours if abs(h - avg_hour) <= 2)
            if within_2h >= 3:
                # Save as routine
                routine_id = f"routine-{uuid.uuid4().hex[:8]}"
                workflow_id = cluster["hashes"][0]
                with sqlite3.connect(str(self.log_channel.db_path)) as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO daily_routines "
                        "(id, workflow_id, day_of_week, time_block, confidence, occurrences, last_seen, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (routine_id, workflow_id, -1, f"{int(avg_hour):02d}:00",
                         within_2h / len(hours), len(timestamps), now, now),
                    )
                routines += 1
        return routines

    # ── Improvement Notes ──

    async def _generate_improvement_notes(self, events: list[dict]) -> int:
        """Generate improvement notes from statistical analysis + GLM analysis."""
        notes_created = 0
        stats = self._compute_stats(events)

        # Statistical analysis (no GLM needed)
        notes = []

        # Check for high error rates
        error_events = [e for e in events if e.get("event_type") == "error"]
        if len(error_events) > len(events) * 0.05:  # >5% errors
            notes.append({
                "category": "reliability",
                "severity": "high",
                "title": "High error rate detected",
                "description": f"{len(error_events)} errors in {len(events)} events ({len(error_events)/len(events)*100:.1f}%)",
                "evidence": json.dumps({"error_count": len(error_events), "total": len(events)}),
                "suggested_fix": "Investigate error sources and add error handling",
            })

        # Check for slow page loads (if duration data available)
        slow_events = [e for e in events if e.get("duration_ms", 0) > 1000 and e.get("event_type") == "navigation"]
        if slow_events:
            notes.append({
                "category": "performance",
                "severity": "medium",
                "title": "Slow page navigation detected",
                "description": f"{len(slow_events)} navigations took >1s",
                "evidence": json.dumps({"slow_count": len(slow_events)}),
                "suggested_fix": "Optimize page loading — consider lazy loading or caching",
            })

        # Check for repetitive sequences (could be automated)
        if stats.get("repeated_sequences", 0) > 5:
            notes.append({
                "category": "automation",
                "severity": "low",
                "title": "Repetitive workflow detected",
                "description": f"{stats['repeated_sequences']} repeated sequences found — could be automated",
                "evidence": json.dumps(stats),
                "suggested_fix": "Consider creating an Aceline workflow to automate this",
            })

        # Check for high idle time
        idle_pct = stats.get("idle_percentage", 0)
        if idle_pct > 30:
            notes.append({
                "category": "productivity",
                "severity": "low",
                "title": "High idle time detected",
                "description": f"{idle_pct:.1f}% of session time was idle",
                "evidence": json.dumps({"idle_percentage": idle_pct}),
                "suggested_fix": "Consider scheduling automated tasks during idle periods",
            })

        # GLM analysis (only if statistical analysis found something)
        if notes and self.glm_queue and self.batch_analysis:
            try:
                glm_notes = await self._glm_analyze_notes(stats, notes)
                if glm_notes:
                    notes = glm_notes
            except Exception as e:
                logger.debug("GLM note analysis failed: %s", e)

        # Save notes
        for note in notes:
            note_id = f"note-{uuid.uuid4().hex[:12]}"
            now = time.time()
            with sqlite3.connect(str(self.log_channel.db_path)) as conn:
                conn.execute(
                    "INSERT OR REPLACE INTO improvement_notes "
                    "(id, category, severity, title, description, evidence, suggested_fix, status, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                    (note_id, note["category"], note["severity"], note["title"],
                     note["description"], note.get("evidence", ""),
                     note.get("suggested_fix", ""), now, now),
                )
            notes_created += 1

        return notes_created

    def _compute_stats(self, events: list[dict]) -> dict:
        """Compute statistics from events."""
        if not events:
            return {}
        total_duration = sum(e.get("duration_ms", 0) for e in events)
        event_types = Counter(e.get("event_type", "unknown") for e in events)
        pages = Counter(e.get("page", "") for e in events if e.get("page"))
        # Estimate idle time (gaps > 5 min between events)
        timestamps = sorted(e.get("timestamp", 0) for e in events if e.get("timestamp", 0) > 0)
        idle_time = 0
        for i in range(1, len(timestamps)):
            gap = timestamps[i] - timestamps[i - 1]
            if gap > 300:  # 5 min
                idle_time += gap
        total_time = timestamps[-1] - timestamps[0] if len(timestamps) > 1 else 0
        idle_pct = (idle_time / total_time * 100) if total_time > 0 else 0
        return {
            "total_events": len(events),
            "total_duration_ms": total_duration,
            "event_types": dict(event_types),
            "top_pages": dict(pages.most_common(10)),
            "idle_percentage": idle_pct,
            "repeated_sequences": sum(1 for v in Counter(
                f"{e.get('event_type', '?')}:{e.get('page', '?')}" for e in events
            ).values() if v >= 3),
        }

    async def _glm_analyze_notes(self, stats: dict, notes: list[dict]) -> list[dict]:
        """Use GLM to refine improvement notes (batched into one call)."""
        prompt = (
            "You are analyzing user activity statistics to generate improvement notes. "
            "For each issue found, provide a JSON array of notes with fields: "
            "category, severity (low/medium/high/critical), title, description, suggested_fix.\n\n"
            f"Statistics:\n{json.dumps(stats, indent=2)}\n\n"
            f"Initial notes:\n{json.dumps(notes, indent=2)}\n\n"
            "Refined notes as JSON array:"
        )
        result = await asyncio.wait_for(
            self.glm_queue.submit(GLMRequest(
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1000,
                temperature=0.3,
                priority=3,  # Observer priority
                timeout=30,
            )),
            timeout=35,
        )
        content = result.get("content", "")
        # Try to parse JSON from response
        try:
            # Find JSON array in response
            start = content.find("[")
            end = content.rfind("]")
            if start >= 0 and end > start:
                parsed = json.loads(content[start:end + 1])
                if isinstance(parsed, list) and parsed:
                    return parsed
        except (json.JSONDecodeError, ValueError):
            pass
        return notes  # Fallback to statistical notes

    # ── Monthly Reports ──

    async def _monthly_loop(self) -> None:
        """Background loop — checks for monthly report generation on the 1st of each month."""
        while self._running:
            now = time.time()
            # Check if it's the 1st of the month and we haven't generated a report yet
            tm = time.localtime(now)
            month_key = f"{tm.tm_year}-{tm.tm_mon:02d}"
            if tm.tm_mday == 1 and not self._report_exists(month_key):
                # Wait until 9 AM
                target_hour = 9
                if tm.tm_hour < target_hour:
                    wait_s = (target_hour - tm.tm_hour) * 3600
                    await asyncio.sleep(min(wait_s, 3600))
                    continue
                try:
                    await self._generate_monthly_report(month_key)
                except Exception as e:
                    logger.warning("Monthly report generation failed: %s", e)
            # Check again in 1 hour
            await asyncio.sleep(3600)

    def _report_exists(self, month_key: str) -> bool:
        """Check if a monthly report already exists for this month."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            row = conn.execute(
                "SELECT id FROM monthly_reports WHERE month = ?", (month_key,)
            ).fetchone()
            return row is not None

    async def _generate_monthly_report(self, month_key: str) -> dict:
        """Generate a monthly improvement report."""
        now = time.time()
        month_ago = now - 30 * 86400

        # Get all pending notes from the last month
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM improvement_notes WHERE created_at >= ? ORDER BY "
                "CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 "
                "WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at",
                (month_ago,),
            ).fetchall()
            notes = [dict(r) for r in rows]

        if not notes:
            logger.info("No improvement notes for monthly report %s", month_key)
            return {"status": "no_notes"}

        # Group by category and severity
        by_category = defaultdict(list)
        for note in notes:
            by_category[note["category"]].append(note)

        report_data = {
            "month": month_key,
            "total_notes": len(notes),
            "by_category": {k: len(v) for k, v in by_category.items()},
            "notes": notes,
            "generated_at": now,
        }

        # Try to generate a polished summary via GLM
        if self.glm_queue:
            try:
                summary_prompt = (
                    "You are generating a monthly improvement report for a software development platform. "
                    "Summarize the following improvement notes into a polished, readable report.\n\n"
                    f"Notes:\n{json.dumps(notes, indent=2, default=str)}\n\n"
                    "Provide a concise summary (2-3 paragraphs) highlighting the most important improvements:"
                )
                result = await asyncio.wait_for(
                    self.glm_queue.submit(GLMRequest(
                        messages=[{"role": "user", "content": summary_prompt}],
                        max_tokens=500,
                        temperature=0.5,
                        priority=3,
                        timeout=30,
                    )),
                    timeout=35,
                )
                report_data["summary"] = result.get("content", "")
            except Exception as e:
                logger.debug("GLM report summary failed: %s", e)
                report_data["summary"] = f"{len(notes)} improvement notes found for {month_key}."

        # Save report
        report_id = f"report-{month_key}"
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO monthly_reports "
                "(id, month, report_json, notes_count, approved_count, rejected_count, implemented_count, created_at) "
                "VALUES (?, ?, ?, ?, 0, 0, 0, ?)",
                (report_id, month_key, json.dumps(report_data), len(notes), now),
            )

        logger.info("Monthly report generated: %s (%s notes)", month_key, len(notes))
        return {"status": "ok", "report_id": report_id, "notes_count": len(notes)}

    # ── Query Methods ──

    def get_stats(self) -> dict:
        """Get observer statistics."""
        stats = self.log_channel.get_stats()
        stats["detection_interval_s"] = self.detection_interval_s
        stats["observer_model"] = self.observer_model or "(using primary model)"
        stats["running"] = self._running
        return stats

    def get_workflows(self) -> list[dict]:
        """Get all detected workflows."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM workflows ORDER BY frequency DESC, last_seen DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_routines(self) -> list[dict]:
        """Get all detected daily routines."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM daily_routines ORDER BY confidence DESC, occurrences DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_notes(self, status: str | None = None) -> list[dict]:
        """Get improvement notes, optionally filtered by status."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            if status:
                rows = conn.execute(
                    "SELECT * FROM improvement_notes WHERE status = ? ORDER BY created_at DESC",
                    (status,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM improvement_notes ORDER BY created_at DESC"
                ).fetchall()
            return [dict(r) for r in rows]

    def approve_note(self, note_id: str) -> bool:
        """Approve an improvement note."""
        now = time.time()
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            cursor = conn.execute(
                "UPDATE improvement_notes SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
                (now, now, note_id),
            )
            return cursor.rowcount > 0

    def reject_note(self, note_id: str) -> bool:
        """Reject an improvement note."""
        now = time.time()
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            cursor = conn.execute(
                "UPDATE improvement_notes SET status = 'rejected', updated_at = ? WHERE id = ? AND status = 'pending'",
                (now, now, note_id),
            )
            return cursor.rowcount > 0

    def get_monthly_reports(self) -> list[dict]:
        """Get all monthly reports."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM monthly_reports ORDER BY month DESC"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_monthly_report(self, report_id: str) -> dict | None:
        """Get a specific monthly report with full data."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM monthly_reports WHERE id = ?", (report_id,)
            ).fetchone()
            return dict(row) if row else None

    def get_sessions(self, limit: int = 50) -> list[dict]:
        """Get work sessions."""
        with sqlite3.connect(str(self.log_channel.db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM work_sessions ORDER BY start_time DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_activity_timeline(self, limit: int = 100, since: float = 0) -> list[dict]:
        """Get activity timeline."""
        return self.log_channel.query_events(limit=limit, since=since)


# ── Import GLMRequest for type hints ──

try:
    from inc_llm.messaging.glm_queue import GLMRequest
except ImportError:
    # glm_queue.py created in Phase 3 — define a minimal stub for now
    class GLMRequest:
        def __init__(self, messages, max_tokens=128, temperature=0.7, priority=3, timeout=30):
            self.messages = messages
            self.max_tokens = max_tokens
            self.temperature = temperature
            self.priority = priority
            self.timeout = timeout
            self.future = asyncio.get_event_loop().create_future()


# ── API Endpoints ───────────────────────────────────────────────────────

@router.post("/events")
async def post_events(batch: EventBatch):
    """Batch upload activity events — fire-and-forget (Log Channel)."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return await _observer.ingest_events(batch.events)


@router.get("/stats")
async def get_stats():
    """Get observer statistics."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return _observer.get_stats()


@router.get("/workflows")
async def get_workflows():
    """List learned workflows."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"workflows": _observer.get_workflows()}


@router.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: str):
    """Run a workflow via Aceline Agent (uses Message Channel)."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    workflows = _observer.get_workflows()
    wf = next((w for w in workflows if w["id"] == workflow_id), None)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    # TODO: Phase 4 — route through Message Channel to Aceline Agent
    return {"status": "queued", "workflow": wf["name"], "steps": wf["steps_json"]}


@router.get("/routines")
async def get_routines():
    """List daily routines."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"routines": _observer.get_routines()}


@router.get("/notes")
async def get_notes(status: str | None = None):
    """List improvement notes, optionally filtered by status."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"notes": _observer.get_notes(status)}


@router.post("/notes/{note_id}/approve")
async def approve_note(note_id: str):
    """Approve an improvement note."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    if _observer.approve_note(note_id):
        return {"status": "approved", "note_id": note_id}
    raise HTTPException(404, "Note not found or not pending")


@router.post("/notes/{note_id}/reject")
async def reject_note(note_id: str):
    """Reject an improvement note."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    if _observer.reject_note(note_id):
        return {"status": "rejected", "note_id": note_id}
    raise HTTPException(404, "Note not found or not pending")


@router.get("/monthly-report")
async def get_monthly_reports():
    """Get monthly reports."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"reports": _observer.get_monthly_reports()}


@router.get("/monthly-report/{report_id}")
async def get_monthly_report(report_id: str):
    """Get a specific monthly report."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    report = _observer.get_monthly_report(report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report


@router.post("/monthly-report/approve")
async def approve_monthly_report(approval: MonthlyReportApproval):
    """Approve selected improvements from a monthly report."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    approved = 0
    for note_id in approval.approved_note_ids:
        if _observer.approve_note(note_id):
            approved += 1
    return {"status": "ok", "approved": approved, "report_id": approval.report_id}


@router.get("/sessions")
async def get_sessions(limit: int = 50):
    """List work sessions."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"sessions": _observer.get_sessions(limit)}


@router.get("/activity")
async def get_activity(limit: int = 100, since: float = 0):
    """Get activity timeline."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return {"events": _observer.get_activity_timeline(limit, since)}


@router.post("/detect")
async def trigger_detection():
    """Manually trigger workflow detection (for testing)."""
    if not _observer:
        raise HTTPException(503, "Observer not initialized")
    return await _observer._run_detection()
