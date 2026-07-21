"""RML engine — reinforcement-based prompt and parameter tuning.

Adjusts prompt hints and model parameters based on feedback signals
from completed reasoning sessions. Uses a simple gradient-free approach:

- If a phase consistently fails, add a hint to help the model
- If a role's temperature is too high (verbose/fail), lower it
- If a role's temperature is too low (repetitive), raise it
- If outputs are consistently too long, reduce max_tokens

Preferences are persisted to JSON for cross-session continuity.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from fable_mythos.config import RMLConfig

logger = logging.getLogger(__name__)


@dataclass
class PromptHint:
    """An additive hint injected before a specific phase."""

    phase: str
    text: str
    weight: float = 1.0  # confidence in this hint (0-1)
    times_applied: int = 0
    times_helped: int = 0  # sessions where this hint correlated with success


@dataclass
class ParamAdjustment:
    """A parameter adjustment for a model role."""

    role: str
    temperature_offset: float = 0.0  # additive offset from baseline
    max_tokens_offset: int = 0  # additive offset from baseline
    times_applied: int = 0
    times_helped: int = 0


@dataclass
class RMLPreferences:
    """Persisted RML preferences."""

    prompt_hints: list[dict[str, Any]] = field(default_factory=list)
    param_adjustments: list[dict[str, Any]] = field(default_factory=list)
    total_sessions: int = 0
    total_successes: int = 0
    last_updated: float = 0.0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


class RMLEngine:
    """Reinforcement Machine Learning engine for prompt and parameter tuning.

    Learns from feedback signals (success/failure, confidence, loops used)
    and adjusts prompts and parameters to improve future sessions.
    """

    def __init__(self, config: RMLConfig) -> None:
        self.config = config
        self.preferences = RMLPreferences()
        self._hints: dict[str, PromptHint] = {}
        self._adjustments: dict[str, ParamAdjustment] = {}
        self._prefs_path: Path | None = None
        self._load_preferences()

    def _load_preferences(self) -> None:
        """Load preferences from the JSON file."""
        if not self.config.enabled:
            return

        self._prefs_path = Path(self.config.preferences_path).expanduser()

        if not self._prefs_path.exists():
            logger.info("RML preferences file not found, starting fresh")
            return

        try:
            data = json.loads(self._prefs_path.read_text(encoding="utf-8"))
            self.preferences = RMLPreferences(
                prompt_hints=data.get("prompt_hints", []),
                param_adjustments=data.get("param_adjustments", []),
                total_sessions=data.get("total_sessions", 0),
                total_successes=data.get("total_successes", 0),
                last_updated=data.get("last_updated", 0.0),
            )

            # Rebuild hint and adjustment objects
            for h in self.preferences.prompt_hints:
                hint = PromptHint(**h)
                self._hints[hint.phase] = hint

            for a in self.preferences.param_adjustments:
                adj = ParamAdjustment(**a)
                self._adjustments[adj.role] = adj

            logger.info(
                "Loaded RML preferences: %d hints, %d adjustments, %d sessions",
                len(self._hints), len(self._adjustments), self.preferences.total_sessions,
            )
        except (json.JSONDecodeError, TypeError, KeyError) as e:
            logger.warning("Failed to load RML preferences: %s", e)

    def _save_preferences(self) -> None:
        """Save preferences to the JSON file."""
        if not self.config.enabled or self._prefs_path is None:
            return

        # Sync objects back to preferences
        self.preferences.prompt_hints = [asdict(h) for h in self._hints.values()]
        self.preferences.param_adjustments = [asdict(a) for a in self._adjustments.values()]
        self.preferences.last_updated = time.time()

        try:
            self._prefs_path.parent.mkdir(parents=True, exist_ok=True)
            self._prefs_path.write_text(
                json.dumps(self.preferences.as_dict(), indent=2),
                encoding="utf-8",
            )
        except OSError as e:
            logger.warning("Failed to save RML preferences: %s", e)

    def get_hint(self, phase: str) -> str | None:
        """Get the prompt hint for a specific phase.

        Args:
            phase: The phase name (e.g. "evidence", "verify").

        Returns:
            Hint text if available, None otherwise.
        """
        hint = self._hints.get(phase)
        if hint is None or hint.weight < self.config.hint_threshold:
            return None
        hint.times_applied += 1
        return hint.text

    def get_adjusted_temperature(self, role: str, baseline: float) -> float:
        """Get the adjusted temperature for a role.

        Args:
            role: Model role (fast/base/judge/code/style).
            baseline: Baseline temperature from config.

        Returns:
            Adjusted temperature (clamped to [0.0, 1.0]).
        """
        adj = self._adjustments.get(role)
        if adj is None:
            return baseline

        adjusted = baseline + adj.temperature_offset
        # Clamp to valid range
        return max(0.0, min(1.0, adjusted))

    def get_adjusted_max_tokens(self, role: str, baseline: int) -> int:
        """Get the adjusted max_tokens for a role.

        Args:
            role: Model role.
            baseline: Baseline max_tokens.

        Returns:
            Adjusted max_tokens (minimum 100).
        """
        adj = self._adjustments.get(role)
        if adj is None:
            return baseline

        return max(100, baseline + adj.max_tokens_offset)

    def record_feedback(self, signals: dict[str, Any]) -> None:
        """Record feedback from a completed session and update preferences.

        Args:
            signals: Feedback signals from FeedbackLoop.get_feedback_signals().
        """
        if not self.config.enabled:
            return

        success = signals.get("halt_reason") == "converged_confident"
        confidence = signals.get("confidence_achieved", 0.0)
        loops_used = signals.get("loops_used", 0)
        max_loops = signals.get("max_loops", 6)
        contradictions = signals.get("contradictions_found", 0)

        self.preferences.total_sessions += 1
        if success:
            self.preferences.total_successes += 1

        # Update prompt hints — reinforce hints that were applied
        for hint in self._hints.values():
            if hint.times_applied > 0:
                if success:
                    hint.times_helped += 1
                    hint.weight = min(1.0, hint.weight + self.config.learning_rate)
                else:
                    hint.weight = max(0.0, hint.weight - self.config.learning_rate * 0.5)

        # Update parameter adjustments
        for adj in self._adjustments.values():
            if adj.times_applied > 0:
                if success:
                    adj.times_helped += 1
                else:
                    # If failing, move adjustments back toward zero
                    adj.temperature_offset *= (1 - self.config.learning_rate)
                    adj.max_tokens_offset = int(adj.max_tokens_offset * (1 - self.config.learning_rate))

        # Learn new adjustments based on patterns
        self._learn_from_signals(success, confidence, loops_used, max_loops, contradictions)

        self._save_preferences()
        logger.debug("RML feedback recorded: success=%s confidence=%.2f", success, confidence)

    def _learn_from_signals(
        self,
        success: bool,
        confidence: float,
        loops_used: int,
        max_loops: int,
        contradictions: int,
    ) -> None:
        """Learn new hints and adjustments from feedback signals."""

        # If too many contradictions, add a hint for the evidence phase
        if contradictions > 2 and "evidence" not in self._hints:
            self._hints["evidence"] = PromptHint(
                phase="evidence",
                text="Be especially careful to identify potential contradictions in the evidence. "
                     "List each fact separately with its source.",
                weight=2.0,
            )
            logger.info("RML: Added evidence hint due to high contradictions (%d)", contradictions)

        # If using too many loops, add a hint for the decide phase
        if loops_used > max_loops * 0.7 and "decide" not in self._hints:
            self._hints["decide"] = PromptHint(
                phase="decide",
                text="Be decisive. Pick one approach and commit. Don't hedge.",
                weight=2.0,
            )
            logger.info("RML: Added decide hint due to high loop usage (%d/%d)", loops_used, max_loops)

        # If confidence is consistently low, adjust judge temperature down
        if confidence < 0.5 and not success:
            adj = self._adjustments.setdefault("judge", ParamAdjustment(role="judge"))
            adj.temperature_offset = max(
                -self.config.max_param_offset,
                adj.temperature_offset - self.config.learning_rate * 0.1,
            )
            logger.info("RML: Lowered judge temperature offset to %.3f", adj.temperature_offset)

        # If confidence is high but not converging, raise solve temperature slightly
        if confidence > 0.7 and not success and loops_used > 3:
            adj = self._adjustments.setdefault("base", ParamAdjustment(role="base"))
            adj.temperature_offset = min(
                self.config.max_param_offset,
                adj.temperature_offset + self.config.learning_rate * 0.05,
            )
            logger.info("RML: Raised base temperature offset to %.3f", adj.temperature_offset)

    def get_stats(self) -> dict[str, Any]:
        """Get RML statistics."""
        return {
            "enabled": self.config.enabled,
            "total_sessions": self.preferences.total_sessions,
            "total_successes": self.preferences.total_successes,
            "success_rate": (
                self.preferences.total_successes / self.preferences.total_sessions
                if self.preferences.total_sessions > 0
                else 0.0
            ),
            "active_hints": len(self._hints),
            "active_adjustments": len(self._adjustments),
            "hints": [
                {"phase": h.phase, "weight": h.weight, "times_applied": h.times_applied}
                for h in self._hints.values()
            ],
            "adjustments": [
                {"role": a.role, "temp_offset": a.temperature_offset, "max_tokens_offset": a.max_tokens_offset}
                for a in self._adjustments.values()
            ],
        }

    def reset(self) -> None:
        """Reset all learned preferences."""
        self._hints.clear()
        self._adjustments.clear()
        self.preferences = RMLPreferences()
        self._save_preferences()
        logger.info("RML preferences reset")
