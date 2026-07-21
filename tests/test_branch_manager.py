"""Tests for the branch manager."""

from __future__ import annotations

import pytest

from fable_mythos.core.branch_manager import BranchManager
from fable_mythos.core.state import Hypothesis, StructuredState
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.config import Settings


@pytest.fixture
def branch_manager():
    settings = Settings()
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return BranchManager(max_branches=3, bus=bus)


class TestBranchManager:
    async def test_seed_initial(self, branch_manager):
        state = StructuredState()
        await branch_manager.seed_initial(state, "test query")
        assert len(state.hypotheses) == 1
        assert state.hypotheses[0].confidence > 0

    async def test_step_generates_alternative(self, branch_manager):
        state = StructuredState()
        await branch_manager.seed_initial(state, "test query")
        # Lower confidence to trigger branching
        state.hypotheses[0].confidence = 0.3
        await branch_manager.step(state)
        assert len(state.active_hypotheses()) >= 1

    async def test_step_prunes_weak(self, branch_manager):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.1, alive=True))
        state.hypotheses.append(Hypothesis(id="h2", answer="B", confidence=0.8, alive=True))
        await branch_manager.step(state)
        # h1 should be pruned (confidence < 0.2)
        assert state.hypotheses[0].alive is False
        assert state.hypotheses[1].alive is True

    async def test_collapse_returns_best(self, branch_manager):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.6))
        state.hypotheses.append(Hypothesis(id="h2", answer="B", confidence=0.9))
        winner = await branch_manager.collapse(state)
        assert winner.id == "h2"

    async def test_collapse_no_alive_raises(self, branch_manager):
        state = StructuredState()
        with pytest.raises(RuntimeError):
            await branch_manager.collapse(state)

    async def test_collapse_penalizes_contradictions(self, branch_manager):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.9, contradictions=["c1", "c2"]))
        state.hypotheses.append(Hypothesis(id="h2", answer="B", confidence=0.7, contradictions=[]))
        winner = await branch_manager.collapse(state)
        # h1: 0.9 * (1 - 0.2) = 0.72, h2: 0.7 * 1.0 = 0.7 → h1 wins
        assert winner.id == "h1"

    async def test_max_branches_respected(self, branch_manager):
        state = StructuredState()
        for i in range(3):
            state.hypotheses.append(Hypothesis(id=f"h{i}", answer="A", confidence=0.3))
        await branch_manager.step(state)
        # Should not exceed max_branches
        assert len(state.active_hypotheses()) <= 3
