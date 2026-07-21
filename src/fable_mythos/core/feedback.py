"""Feedback loop — logs trajectories for episodic memory and RML.

Records each completed reasoning session as a trajectory entry,
which feeds into:
- Episodic memory (session history search)
- RML (reinforcement signals for prompt/param tuning)
- Audit trail (decision traces)
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any

from fable_mythos.config import Settings
from fable_mythos.core.state import FableMythosState

logger = logging.getLogger(__name__)


class FeedbackLoop:
    """Logs trajectories and generates feedback signals.

    Trajectories are appended to a JSONL file for durability and later
    ingestion by the episodic memory system.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._trajectory_path: Path | None = None

    @property
    def trajectory_path(self) -> Path:
        """Resolve and cache the trajectory file path."""
        if self._trajectory_path is None:
            self._trajectory_path = self.settings.resolve_path(self.settings.trajectory_path)
            self._trajectory_path.parent.mkdir(parents=True, exist_ok=True)
        return self._trajectory_path

    async def log_trajectory(self, state: FableMythosState) -> str:
        """Log a completed reasoning session as a trajectory entry.

        Args:
            state: The final state after the reasoning loop.

        Returns:
            The trajectory ID (sha256 hash).
        """
        trajectory_id = hashlib.sha256(
            f"{state.thread_id}:{state.query}:{time.time()}".encode()
        ).hexdigest()[:16]

        entry = {
            "trajectory_id": trajectory_id,
            "thread_id": state.thread_id,
            "query": state.query,
            "triage": state.triage,
            "ask_shape": state.ask_shape.value,
            "domain": state.domain,
            "loops": state.loop_index,
            "halt_reason": state.halt_reason,
            "converged": state.converged,
            "final_answer": state.final_answer[:1000],
            "confidence_summary": state.confidence_summary,
            "citations": state.citations,
            "per_loop_metrics": state.per_loop_metrics,
            "trace": state.structured_state.trace[-20:],  # last 20 trace entries
            "facts_count": len(state.structured_state.facts),
            "hypotheses_count": len(state.structured_state.hypotheses),
            "contradictions_count": len(state.structured_state.contradictions),
            "artifacts_count": len(state.structured_state.artifacts),
            "timestamp": time.time(),
        }

        try:
            with open(self.trajectory_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
            logger.debug("Logged trajectory %s to %s", trajectory_id, self.trajectory_path)
        except OSError as e:
            logger.warning("Failed to log trajectory: %s", e)

        return trajectory_id

    async def get_feedback_signals(self, state: FableMythosState) -> dict[str, Any]:
        """Extract feedback signals from a completed session for RML.

        Returns signals like:
        - confidence_achieved: final top hypothesis confidence
        - loops_used: how many loops were needed
        - contradictions_found: how many contradictions were detected
        - converged: whether the loop converged naturally
        - halted_early: whether it stopped before max_loops
        """
        top = state.structured_state.top_hypothesis()
        return {
            "confidence_achieved": top.confidence if top else 0.0,
            "loops_used": state.loop_index,
            "max_loops": state.max_loops,
            "contradictions_found": len(state.structured_state.contradictions),
            "artifacts_produced": len(state.structured_state.artifacts),
            "converged": state.converged,
            "halt_reason": state.halt_reason,
            "halted_early": state.loop_index < state.max_loops,
        }

    async def read_trajectories(self, limit: int = 100) -> list[dict[str, Any]]:
        """Read recent trajectories from the log.

        Args:
            limit: Maximum number of entries to return.

        Returns:
            List of trajectory entries, most recent first.
        """
        if not self.trajectory_path.exists():
            return []

        entries: list[dict[str, Any]] = []
        try:
            with open(self.trajectory_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        except OSError as e:
            logger.warning("Failed to read trajectories: %s", e)
            return []

        # Return most recent first
        entries.reverse()
        return entries[:limit]
