"""Tests for the safety gate."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fable_mythos.config import Settings
from fable_mythos.core.safety import SafetyGate
from fable_mythos.core.state import FableMythosState
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider


@pytest.fixture
def safety_gate(tmp_path, monkeypatch):
    settings = Settings()
    settings.policy_path = str(tmp_path / "policy.json")
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return SafetyGate(bus=bus, settings=settings)


class TestSafetyGate:
    async def test_no_policy_file_uses_empty(self, safety_gate):
        state = FableMythosState(query="test", thread_id="t1")
        state.final_answer = "Hello world"
        result = await safety_gate.apply(state)
        assert result.final_answer == "Hello world"

    async def test_blocked_term_withholds(self, safety_gate, tmp_path):
        # Write policy with blocked term
        policy = {"blocked_terms": ["secret_password"], "revision_required_terms": []}
        Path(safety_gate.settings.policy_path).write_text(json.dumps(policy))
        safety_gate._policy_cache = None  # force reload

        state = FableMythosState(query="test", thread_id="t1")
        state.final_answer = "The secret_password is 12345"
        result = await safety_gate.apply(state)
        assert "withheld" in result.final_answer.lower()

    async def test_revision_required_revises(self, safety_gate, tmp_path):
        policy = {"blocked_terms": [], "revision_required_terms": ["sensitive_data"]}
        Path(safety_gate.settings.policy_path).write_text(json.dumps(policy))
        safety_gate._policy_cache = None

        state = FableMythosState(query="test", thread_id="t1")
        state.final_answer = "The sensitive_data shows revenue of $1M"
        result = await safety_gate.apply(state)
        # Should be revised (deterministic provider returns canned revision)
        assert "revised" in result.final_answer.lower() or result.final_answer != "The sensitive_data shows revenue of $1M"

    async def test_no_blocked_no_revision_passes_through(self, safety_gate, tmp_path):
        policy = {"blocked_terms": ["xxx"], "revision_required_terms": ["yyy"]}
        Path(safety_gate.settings.policy_path).write_text(json.dumps(policy))
        safety_gate._policy_cache = None

        state = FableMythosState(query="test", thread_id="t1")
        state.final_answer = "Clean answer with no issues"
        result = await safety_gate.apply(state)
        assert result.final_answer == "Clean answer with no issues"

    def test_set_policy_cache(self, safety_gate):
        policy = {"blocked_terms": ["test"], "revision_required_terms": []}
        safety_gate.set_policy_cache(policy)
        assert safety_gate._policy_cache == policy
