"""Tests for the orchestrator — end-to-end with deterministic provider."""

from __future__ import annotations

import pytest

from fable_mythos.config import ProviderBackend, Settings
from fable_mythos.core.orchestrator import Orchestrator
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider


@pytest.fixture
def orchestrator():
    settings = Settings()
    settings.provider_backend = ProviderBackend.DETERMINISTIC
    settings.harness.max_loops = 3
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return Orchestrator(settings=settings, bus=bus)


class TestOrchestrator:
    async def test_complete_returns_state(self, orchestrator):
        state = await orchestrator.complete(query="Fix the bug in main.py", thread_id="test-1")
        assert state.query == "Fix the bug in main.py"
        assert state.thread_id == "test-1"
        assert len(state.final_answer) > 0
        assert state.trajectory_id is not None

    async def test_complete_has_triage(self, orchestrator):
        state = await orchestrator.complete(query="Fix the bug", thread_id="test-2")
        assert "task_type" in state.triage
        assert "ask_shape" in state.triage

    async def test_complete_has_confidence(self, orchestrator):
        state = await orchestrator.complete(query="Fix the bug", thread_id="test-3")
        assert isinstance(state.confidence_summary, dict)

    async def test_complete_stream_yields_events(self, orchestrator):
        events = []
        async for event_type, payload in orchestrator.complete_stream(
            query="Fix the bug", thread_id="test-stream"
        ):
            events.append((event_type, payload))

        assert len(events) > 0
        # Should have status events and a final event
        event_types = [e[0] for e in events]
        assert "status" in event_types
        assert "final" in event_types

    async def test_complete_stream_has_triage(self, orchestrator):
        events = []
        async for event_type, payload in orchestrator.complete_stream(
            query="Fix the bug", thread_id="test-stream-2"
        ):
            events.append((event_type, payload))

        # Find the triage_done status
        triage_events = [e for e in events if e[0] == "status" and e[1].get("stage") == "triage_done"]
        assert len(triage_events) == 1
        assert "triage" in triage_events[0][1]

    async def test_readiness(self, orchestrator):
        result = await orchestrator.readiness()
        assert "ok" in result
        assert "checks" in result
        assert "model_bus" in result["checks"]

    async def test_complete_trivial_short_circuits(self, orchestrator):
        state = await orchestrator.complete(query="trivial fix", thread_id="test-trivial")
        assert state.final_answer is not None

    async def test_complete_logs_trajectory(self, orchestrator, tmp_path, monkeypatch):
        # Redirect trajectory path to temp
        orchestrator.settings.trajectory_path = str(tmp_path / "trajectories.jsonl")
        state = await orchestrator.complete(query="Fix the bug", thread_id="test-traj")
        assert state.trajectory_id is not None

        # Check trajectory was logged
        from pathlib import Path
        traj_file = Path(tmp_path / "trajectories.jsonl")
        assert traj_file.exists()
        content = traj_file.read_text()
        assert state.trajectory_id in content
