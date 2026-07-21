"""Tests for RML engine."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fable_mythos.config import RMLConfig
from fable_mythos.rml.engine import RMLEngine


@pytest.fixture
def rml(tmp_path):
    config = RMLConfig(
        enabled=True,
        learning_rate=0.05,
        preferences_path=str(tmp_path / "rml_prefs.json"),
    )
    return RMLEngine(config)


class TestRMLEngine:
    def test_disabled_engine_does_nothing(self, tmp_path):
        config = RMLConfig(enabled=False, preferences_path=str(tmp_path / "rml.json"))
        engine = RMLEngine(config)
        engine.record_feedback({"halt_reason": "converged_confident", "confidence_achieved": 0.9})
        assert engine.get_hint("evidence") is None

    def test_get_hint_no_hints(self, rml):
        assert rml.get_hint("evidence") is None

    def test_get_adjusted_temperature_no_adjustments(self, rml):
        assert rml.get_adjusted_temperature("base", 0.2) == 0.2

    def test_get_adjusted_max_tokens_no_adjustments(self, rml):
        assert rml.get_adjusted_max_tokens("base", 512) == 512

    def test_record_feedback_success(self, rml):
        rml.record_feedback({
            "halt_reason": "converged_confident",
            "confidence_achieved": 0.9,
            "loops_used": 2,
            "max_loops": 6,
            "contradictions_found": 0,
        })
        assert rml.preferences.total_sessions == 1
        assert rml.preferences.total_successes == 1

    def test_record_feedback_failure(self, rml):
        rml.record_feedback({
            "halt_reason": "max_loops",
            "confidence_achieved": 0.3,
            "loops_used": 6,
            "max_loops": 6,
            "contradictions_found": 0,
        })
        assert rml.preferences.total_sessions == 1
        assert rml.preferences.total_successes == 0

    def test_learn_hint_from_contradictions(self, rml):
        rml.record_feedback({
            "halt_reason": "max_loops",
            "confidence_achieved": 0.3,
            "loops_used": 4,
            "max_loops": 6,
            "contradictions_found": 3,
        })
        hint = rml.get_hint("evidence")
        assert hint is not None
        assert "contradiction" in hint.lower()

    def test_learn_hint_from_high_loops(self, rml):
        rml.record_feedback({
            "halt_reason": "max_loops",
            "confidence_achieved": 0.5,
            "loops_used": 5,
            "max_loops": 6,
            "contradictions_found": 0,
        })
        hint = rml.get_hint("decide")
        assert hint is not None
        assert "decisive" in hint.lower()

    def test_persistence(self, tmp_path):
        config = RMLConfig(
            enabled=True,
            preferences_path=str(tmp_path / "rml_prefs.json"),
        )
        engine1 = RMLEngine(config)
        engine1.record_feedback({
            "halt_reason": "max_loops",
            "confidence_achieved": 0.3,
            "loops_used": 4,
            "max_loops": 6,
            "contradictions_found": 3,
        })

        # Create new engine — should load persisted preferences
        engine2 = RMLEngine(config)
        assert engine2.preferences.total_sessions == 1
        hint = engine2.get_hint("evidence")
        assert hint is not None

    def test_get_stats(self, rml):
        rml.record_feedback({
            "halt_reason": "converged_confident",
            "confidence_achieved": 0.9,
            "loops_used": 2,
            "max_loops": 6,
            "contradictions_found": 0,
        })
        stats = rml.get_stats()
        assert stats["enabled"] is True
        assert stats["total_sessions"] == 1
        assert stats["success_rate"] == 1.0

    def test_reset(self, rml):
        rml.record_feedback({
            "halt_reason": "max_loops",
            "confidence_achieved": 0.3,
            "loops_used": 5,
            "max_loops": 6,
            "contradictions_found": 3,
        })
        rml.reset()
        assert rml.preferences.total_sessions == 0
        assert len(rml._hints) == 0

    def test_temperature_clamped(self, tmp_path):
        config = RMLConfig(
            enabled=True,
            max_param_offset=2.0,
            preferences_path=str(tmp_path / "rml.json"),
        )
        engine = RMLEngine(config)
        # Manually set a large offset
        from fable_mythos.rml.engine import ParamAdjustment
        engine._adjustments["base"] = ParamAdjustment(role="base", temperature_offset=5.0)
        temp = engine.get_adjusted_temperature("base", 0.5)
        assert temp == 1.0  # clamped to max

    def test_max_tokens_minimum(self, tmp_path):
        config = RMLConfig(enabled=True, preferences_path=str(tmp_path / "rml.json"))
        engine = RMLEngine(config)
        from fable_mythos.rml.engine import ParamAdjustment
        engine._adjustments["base"] = ParamAdjustment(role="base", max_tokens_offset=-1000)
        tokens = engine.get_adjusted_max_tokens("base", 512)
        assert tokens == 100  # minimum
