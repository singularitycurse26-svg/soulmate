"""Tests for the feedback loop."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fable_mythos.config import Settings
from fable_mythos.core.feedback import FeedbackLoop
from fable_mythos.core.state import FableMythosState, Hypothesis, LoopPhase


@pytest.fixture
def feedback(tmp_path):
    settings = Settings()
    settings.trajectory_path = str(tmp_path / "trajectories.jsonl")
    return FeedbackLoop(settings=settings)


class TestFeedbackLoop:
    async def test_log_trajectory(self, feedback):
        state = FableMythosState(query="test query", thread_id="t1")
        state.final_answer = "test answer"
        state.triage = {"task_type": "code"}
        state.structured_state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.8))

        traj_id = await feedback.log_trajectory(state)
        assert traj_id is not None
        assert len(traj_id) == 16

        # Check file was written
        traj_file = Path(feedback.settings.trajectory_path)
        assert traj_file.exists()
        content = traj_file.read_text()
        assert traj_id in content
        assert "test query" in content

    async def test_get_feedback_signals(self, feedback):
        state = FableMythosState(query="test", thread_id="t1", max_loops=6)
        state.loop_index = 3
        state.converged = True
        state.halt_reason = "converged_confident"
        state.structured_state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.85))
        state.structured_state.add_contradiction("A", "B", 0.5, loop=1)

        signals = await feedback.get_feedback_signals(state)
        assert signals["confidence_achieved"] == 0.85
        assert signals["loops_used"] == 3
        assert signals["converged"] is True
        assert signals["contradictions_found"] == 1
        assert signals["halted_early"] is True

    async def test_read_trajectories_empty(self, feedback):
        result = await feedback.read_trajectories()
        assert result == []

    async def test_read_trajectories_after_logging(self, feedback):
        state = FableMythosState(query="q1", thread_id="t1")
        state.final_answer = "a1"
        await feedback.log_trajectory(state)

        state2 = FableMythosState(query="q2", thread_id="t2")
        state2.final_answer = "a2"
        await feedback.log_trajectory(state2)

        trajectories = await feedback.read_trajectories()
        assert len(trajectories) == 2
        # Most recent first
        assert trajectories[0]["query"] == "q2"
        assert trajectories[1]["query"] == "q1"

    async def test_read_trajectories_limit(self, feedback):
        for i in range(5):
            state = FableMythosState(query=f"q{i}", thread_id=f"t{i}")
            state.final_answer = f"a{i}"
            await feedback.log_trajectory(state)

        trajectories = await feedback.read_trajectories(limit=2)
        assert len(trajectories) == 2
