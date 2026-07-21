"""Tests for the triage module."""

from __future__ import annotations

import pytest

from fable_mythos.config import Settings
from fable_mythos.core.state import AskShape, FableMythosState
from fable_mythos.core.triage import Triage
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider


@pytest.fixture
def triage():
    settings = Settings()
    settings.provider_backend = None  # avoid provider creation
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return Triage(bus=bus, settings=settings)


class TestTriage:
    async def test_classify_returns_dict(self, triage):
        result = await triage.classify("Fix the bug in main.py")
        assert isinstance(result, dict)
        assert "task_type" in result
        assert "difficulty" in result
        assert "execution_mode" in result
        assert "ask_shape" in result

    async def test_classify_code_task(self, triage):
        result = await triage.classify("Fix the bug in main.py")
        assert result["task_type"] == "code"

    async def test_classify_planning_task(self, triage):
        result = await triage.classify("Plan the architecture for the new system")
        assert result["task_type"] == "planning"

    async def test_classify_ask_shape_trivial(self, triage):
        state = FableMythosState(query="test", thread_id="t1")
        state.triage = {"ask_shape": "trivial", "domain": "coding"}
        await triage.classify_ask_shape(state)
        assert state.ask_shape == AskShape.TRIVIAL
        assert state.converged is True

    async def test_classify_ask_shape_question(self, triage):
        state = FableMythosState(query="test", thread_id="t1")
        state.triage = {"ask_shape": "question", "domain": "coding"}
        await triage.classify_ask_shape(state)
        assert state.ask_shape == AskShape.QUESTION

    async def test_classify_ask_shape_task(self, triage):
        state = FableMythosState(query="test", thread_id="t1")
        state.triage = {"ask_shape": "task", "domain": "coding"}
        await triage.classify_ask_shape(state)
        assert state.ask_shape == AskShape.TASK

    async def test_classify_ask_shape_plan_first(self, triage):
        state = FableMythosState(query="test", thread_id="t1")
        state.triage = {"ask_shape": "plan_first", "domain": "coding"}
        await triage.classify_ask_shape(state)
        assert state.ask_shape == AskShape.PLAN_FIRST

    async def test_classify_ask_shape_no_triage_uses_model(self, triage):
        state = FableMythosState(query="fix the code bug", thread_id="t1")
        state.triage = {}  # no ask_shape from triage
        await triage.classify_ask_shape(state)
        assert state.ask_shape in [AskShape.TRIVIAL, AskShape.QUESTION, AskShape.TASK, AskShape.PLAN_FIRST]

    async def test_define_done_adds_facts(self, triage):
        state = FableMythosState(query="Fix the login bug", thread_id="t1")
        await triage.define_done(state)
        assert len(state.structured_state.facts) >= 2
        assert any("done" in f.claim.lower() for f in state.structured_state.facts)

    def test_safe_json_parse_valid(self):
        result = Triage._safe_json_parse('{"key": "value"}', {})
        assert result == {"key": "value"}

    def test_safe_json_parse_with_fences(self):
        result = Triage._safe_json_parse('```json\n{"key": "value"}\n```', {})
        assert result == {"key": "value"}

    def test_safe_json_parse_with_extra_text(self):
        result = Triage._safe_json_parse('Here is the result: {"key": "value"} done', {})
        assert result == {"key": "value"}

    def test_safe_json_parse_fallback(self):
        result = Triage._safe_json_parse("not json at all", {"default": True})
        assert result == {"default": True}

    def test_safe_json_parse_empty(self):
        result = Triage._safe_json_parse("", {"default": True})
        assert result == {"default": True}

    def test_default_triage(self):
        result = Triage._default_triage("fix the code bug")
        assert result["task_type"] == "code"
        assert "difficulty" in result
        assert "ask_shape" in result

    def test_default_triage_planning(self):
        result = Triage._default_triage("plan the system architecture")
        assert result["task_type"] == "planning"
        assert result["ask_shape"] == "plan_first"
