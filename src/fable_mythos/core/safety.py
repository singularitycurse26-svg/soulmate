"""Safety gate — policy enforcement on final answers.

From Mythos: checks the final answer against blocked terms and
revision-required terms from the policy store. Blocks or revises as needed.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fable_mythos.config import Settings
from fable_mythos.core.state import FableMythosState
from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


class SafetyGate:
    """Applies safety policy to the final answer.

    Checks against:
    - Blocked terms: answer is withheld entirely
    - Revision-required terms: answer is revised to remove sensitive content
    """

    def __init__(self, bus: ModelBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings
        self._policy_cache: dict[str, Any] | None = None

    async def apply(self, state: FableMythosState) -> FableMythosState:
        """Apply safety policy to the final answer.

        Args:
            state: The current reasoning state with a final_answer.

        Returns:
            The state, possibly with a revised or withheld final_answer.
        """
        policies = await self._load_policies()
        answer_lower = state.final_answer.lower()

        # Check blocked terms — withhold entirely
        blocked_terms = policies.get("blocked_terms", [])
        for term in blocked_terms:
            if term.lower() in answer_lower:
                logger.warning("Answer blocked by policy (matched term: %s)", term)
                state.final_answer = "Response withheld due to policy constraints."
                state.structured_state.trace.append("safety.blocked")
                return state

        # Check revision-required terms — revise
        revision_terms = policies.get("revision_required_terms", [])
        needs_revision = any(term.lower() in answer_lower for term in revision_terms)

        if needs_revision:
            logger.info("Answer flagged for safety revision")
            try:
                revised = await self.bus.complete(
                    role="fast",
                    messages=[{
                        "role": "user",
                        "content": (
                            "Safety revise this response to remove policy-sensitive content "
                            "while preserving useful safe detail:\n\n"
                            f"{state.final_answer}"
                        ),
                    }],
                    max_tokens=600,
                    temperature=0.0,
                )
                state.final_answer = revised["content"]
                state.structured_state.trace.append("safety.revised")
            except Exception as e:
                logger.warning("Safety revision failed: %s", e)
                state.structured_state.trace.append(f"safety.revision_failed: {e}")

        return state

    async def _load_policies(self) -> dict[str, Any]:
        """Load policy rules from the policy file.

        Caches the result for the lifetime of the safety gate.
        """
        if self._policy_cache is not None:
            return self._policy_cache

        policy_path = self.settings.resolve_path(self.settings.policy_path)

        if not policy_path.exists():
            logger.info("Policy file not found at %s, using empty policy", policy_path)
            self._policy_cache = {
                "blocked_terms": [],
                "revision_required_terms": [],
            }
            return self._policy_cache

        try:
            with open(policy_path, "r", encoding="utf-8") as f:
                self._policy_cache = json.load(f)
            logger.debug("Loaded policy from %s", policy_path)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Failed to load policy from %s: %s", policy_path, e)
            self._policy_cache = {
                "blocked_terms": [],
                "revision_required_terms": [],
            }

        return self._policy_cache

    def set_policy_cache(self, policies: dict[str, Any]) -> None:
        """Manually set the policy cache (useful for testing)."""
        self._policy_cache = policies
