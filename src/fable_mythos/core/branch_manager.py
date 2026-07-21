"""Branch manager — maintains competing hypotheses and prunes weak branches.

From Mythos: maintains multiple hypotheses, generates alternatives when
confidence is low or contradictions are detected, and collapses to the
best hypothesis at synthesis time.
"""

from __future__ import annotations

import hashlib
import logging

from fable_mythos.core.state import Hypothesis, StructuredState
from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


class BranchManager:
    """Manages competing hypothesis branches during the reasoning loop.

    Responsibilities:
    - Generate alternative hypotheses when confidence is low or contradictions exist
    - Prune hypotheses that are too weak (low confidence or too many contradictions)
    - Collapse to the single best hypothesis at synthesis time
    """

    def __init__(self, max_branches: int = 3, bus: ModelBus | None = None) -> None:
        self.max_branches = max_branches
        self.bus = bus

    async def step(self, state: StructuredState) -> StructuredState:
        """Advance the branch manager — possibly spawn a new hypothesis.

        Called during the explore/evidence phase.
        """
        if state.should_branch() and len(state.active_hypotheses()) < self.max_branches:
            new_hypothesis = await self._generate_alternative(state)
            state.hypotheses.append(new_hypothesis)
            logger.debug("Spawned hypothesis %s (total: %d)", new_hypothesis.id, len(state.active_hypotheses()))

        # Prune dead branches
        for hypothesis in state.hypotheses:
            if hypothesis.confidence < 0.2 or len(hypothesis.contradictions) >= 3:
                if hypothesis.alive:
                    logger.debug("Pruning hypothesis %s (confidence=%.2f, contradictions=%d)",
                                hypothesis.id, hypothesis.confidence, len(hypothesis.contradictions))
                hypothesis.alive = False

        return state

    async def collapse(self, state: StructuredState) -> Hypothesis:
        """Collapse to the single best hypothesis.

        Selects the alive hypothesis with the highest confidence, penalized
        by the number of contradictions.

        Raises:
            RuntimeError: If no alive hypotheses remain.
        """
        alive = state.active_hypotheses()
        if not alive:
            raise RuntimeError("No live hypotheses at collapse time")

        winner = max(alive, key=lambda h: h.confidence * (1 - 0.1 * len(h.contradictions)))
        logger.debug("Collapsed to hypothesis %s (score=%.3f)", winner.id, winner.confidence)
        return winner

    async def seed_initial(self, state: StructuredState, query: str) -> None:
        """Seed the initial hypothesis from the query."""
        import hashlib as h

        digest = h.sha256(query.encode("utf-8")).hexdigest()[:10]
        state.hypotheses.append(Hypothesis(
            id=f"h0-{digest}",
            answer=f"Initial hypothesis: address the query '{query[:200]}' with structured analysis.",
            reasoning_path=["prelude.seed"],
            confidence=0.42,
        ))
        state.confidence_map["initial"] = 0.42

    async def _generate_alternative(self, state: StructuredState) -> Hypothesis:
        """Generate an alternative hypothesis using the model bus."""
        basis = state.top_hypothesis()
        basis_text = basis.answer if basis else "No basis hypothesis."

        if self.bus:
            try:
                response = await self.bus.complete(
                    role="base",
                    messages=[{
                        "role": "user",
                        "content": (
                            "Generate an alternative hypothesis that takes a different approach. "
                            f"Current top hypothesis: {basis_text}\n\n"
                            "Provide a distinct approach with clear reasoning."
                        ),
                    }],
                    max_tokens=250,
                    temperature=0.6,
                )
                answer = response["content"]
            except Exception as e:
                logger.warning("Alternative hypothesis generation failed: %s", e)
                answer = f"Alternative approach: decompose the problem and solve incrementally. (fallback: {e})"
        else:
            answer = "Alternative approach: decompose the problem and solve incrementally."

        seed = hashlib.sha256(answer.encode("utf-8")).hexdigest()[:8]
        return Hypothesis(
            id=f"h-{seed}",
            answer=answer,
            reasoning_path=["explore.branch_manager"],
            confidence=0.38,
        )
