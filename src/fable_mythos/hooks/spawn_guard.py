"""Spawn guard — PreToolUse hook enforcing design gate and model ceiling.

From fable5-mode/fable_spawn_guard.py: enforces two key disciplines:
1. Design gate: blocks detailed subagent delegations if no open task cards in ledger
2. Model ceiling: prevents spawning subagents that request a model stronger than
   the current session's model
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class GuardDecision:
    """Result of a spawn guard check."""

    allowed: bool
    reason: str
    blocked_by: str = ""  # "design_gate" | "model_ceiling" | ""


class SpawnGuard:
    """PreToolUse hook — enforces design gate and model ceiling.

    The design gate ensures structured planning: no detailed subagent delegations
    without open task cards in the ledger.

    The model ceiling ensures efficient resource use: no subagent can request
    a model stronger than the current session's model.
    """

    # Patterns that indicate a subagent delegation
    DELEGATION_PATTERNS = [
        r"spawn.*agent",
        r"delegate.*to",
        r"subagent",
        r"sub-agent",
        r"launch.*agent",
        r"create.*agent",
    ]

    # Model strength ordering (lower index = weaker model)
    MODEL_STRENGTH_ORDER = [
        "3b", "7b", "8b", "14b", "32b", "70b", "72b",
    ]

    def __init__(
        self,
        session_model: str = "",
        ledger_has_open_cards: bool = False,
    ) -> None:
        self.session_model = session_model
        self.ledger_has_open_cards = ledger_has_open_cards

    def check(self, tool_name: str, tool_input: dict[str, Any]) -> GuardDecision:
        """Check if a tool use should be allowed.

        Args:
            tool_name: Name of the tool being called.
            tool_input: Input parameters for the tool.

        Returns:
            GuardDecision indicating whether the action is allowed.
        """
        # Only check delegation-related tools
        if not self._is_delegation(tool_name, tool_input):
            return GuardDecision(allowed=True, reason="Not a delegation action")

        # Design gate: check for open task cards
        if not self.ledger_has_open_cards:
            # Check if this is a detailed delegation (not just a simple question)
            if self._is_detailed_delegation(tool_input):
                return GuardDecision(
                    allowed=False,
                    reason=(
                        "Design gate: Cannot delegate detailed work without open task cards. "
                        "Create a plan in the ledger first."
                    ),
                    blocked_by="design_gate",
                )

        # Model ceiling: check if requested model exceeds session model
        requested_model = self._extract_requested_model(tool_input)
        if requested_model and self.session_model:
            if self._model_exceeds_ceiling(requested_model, self.session_model):
                return GuardDecision(
                    allowed=False,
                    reason=(
                        f"Model ceiling: Requested model '{requested_model}' exceeds "
                        f"session model '{self.session_model}'. Use the session model or weaker."
                    ),
                    blocked_by="model_ceiling",
                )

        return GuardDecision(allowed=True, reason="Delegation approved")

    def _is_delegation(self, tool_name: str, tool_input: dict[str, Any]) -> bool:
        """Check if this tool call is a subagent delegation."""
        delegation_tools = {"spawn_agent", "delegate", "subagent", "launch_agent"}
        if tool_name.lower() in delegation_tools:
            return True

        # Check tool input for delegation patterns
        input_text = str(tool_input).lower()
        for pattern in self.DELEGATION_PATTERNS:
            if re.search(pattern, input_text):
                return True

        return False

    def _is_detailed_delegation(self, tool_input: dict[str, Any]) -> bool:
        """Check if this is a detailed delegation (not just a simple question).

        Detailed delegations have multi-step instructions, specific file references,
        or complex requirements.
        """
        prompt = tool_input.get("prompt", "") or tool_input.get("task", "") or ""
        if not prompt:
            return False

        # Heuristics for "detailed" delegation
        if len(prompt) > 200:
            return True
        if prompt.count("\n") > 3:
            return True
        if any(word in prompt.lower() for word in ("step", "first", "then", "after that", "finally")):
            return True
        if ".py" in prompt or ".ts" in prompt or ".js" in prompt or ".go" in prompt:
            return True

        return False

    def _extract_requested_model(self, tool_input: dict[str, Any]) -> str:
        """Extract the requested model from tool input."""
        return tool_input.get("model", "") or tool_input.get("model_name", "") or ""

    def _model_exceeds_ceiling(self, requested: str, session: str) -> bool:
        """Check if the requested model exceeds the session model's strength.

        Args:
            requested: Requested model name.
            session: Session model name.

        Returns:
            True if requested model is stronger than session model.
        """
        req_strength = self._get_model_strength(requested)
        sess_strength = self._get_model_strength(session)

        if req_strength is None or sess_strength is None:
            # If we can't determine, allow it
            return False

        return req_strength > sess_strength

    def _get_model_strength(self, model_name: str) -> int | None:
        """Get the strength index of a model.

        Args:
            model_name: Model name (e.g. "qwen2.5:14b")

        Returns:
            Strength index (higher = stronger), or None if unknown.
        """
        model_lower = model_name.lower()
        for i, size in enumerate(self.MODEL_STRENGTH_ORDER):
            if size in model_lower:
                return i
        return None

    def update_session_model(self, model: str) -> None:
        """Update the session model (e.g., if changed mid-session)."""
        self.session_model = model

    def update_ledger_state(self, has_open_cards: bool) -> None:
        """Update the ledger state (e.g., if cards were opened/closed)."""
        self.ledger_has_open_cards = has_open_cards
