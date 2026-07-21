"""SessionEnd hook — logs session summary and syncs memory.

Called when a session ends. Logs the session outcome, syncs episodic memory,
and records any new skills created during the session.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SessionSummary:
    """Summary of a completed session."""

    session_id: str
    start_time: float
    end_time: float
    queries: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    skills_used: list[str] = field(default_factory=list)
    new_skills_created: list[str] = field(default_factory=list)
    success: bool = False
    error: str | None = None
    confidence_achieved: float = 0.0
    loops: int = 0

    @property
    def duration_s(self) -> float:
        return self.end_time - self.start_time

    def as_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_s": self.duration_s,
            "queries": self.queries,
            "tools_used": self.tools_used,
            "skills_used": self.skills_used,
            "new_skills_created": self.new_skills_created,
            "success": self.success,
            "error": self.error,
            "confidence_achieved": self.confidence_achieved,
            "loops": self.loops,
        }


class SessionEndHook:
    """SessionEnd hook — logs session summary and triggers memory sync.

    Called when a session ends to:
    - Log the session summary for audit
    - Sync episodic memory with the session outcome
    - Record any new skills created
    - Clean up temporary state
    """

    def __init__(self) -> None:
        self._summaries: list[SessionSummary] = []

    def execute(self, summary: SessionSummary) -> dict[str, Any]:
        """Execute the SessionEnd hook.

        Args:
            summary: The session summary.

        Returns:
            Dict with sync results.
        """
        self._summaries.append(summary)

        logger.info(
            "SessionEnd: id=%s duration=%.1fs success=%s skills_used=%d new_skills=%d",
            summary.session_id,
            summary.duration_s,
            summary.success,
            len(summary.skills_used),
            len(summary.new_skills_created),
        )

        return {
            "logged": True,
            "session_id": summary.session_id,
            "duration_s": summary.duration_s,
            "success": summary.success,
            "new_skills": summary.new_skills_created,
        }

    def get_recent_summaries(self, limit: int = 10) -> list[dict[str, Any]]:
        """Get recent session summaries.

        Args:
            limit: Maximum number to return.

        Returns:
            List of summary dicts, most recent first.
        """
        summaries = self._summaries[-limit:]
        summaries.reverse()
        return [s.as_dict() for s in summaries]

    def get_stats(self) -> dict[str, Any]:
        """Get aggregate session statistics."""
        total = len(self._summaries)
        if total == 0:
            return {"total_sessions": 0}

        successes = sum(1 for s in self._summaries if s.success)
        total_duration = sum(s.duration_s for s in self._summaries)
        all_skills = set()
        all_new_skills = set()
        for s in self._summaries:
            all_skills.update(s.skills_used)
            all_new_skills.update(s.new_skills_created)

        return {
            "total_sessions": total,
            "success_rate": successes / total,
            "avg_duration_s": total_duration / total,
            "total_duration_s": total_duration,
            "unique_skills_used": len(all_skills),
            "total_new_skills": len(all_new_skills),
        }
