"""Tests for guard hooks — SessionStart, SpawnGuard, FailStreak, SessionEnd."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from fable_mythos.hooks.fail_streak import FailStreakHook, FailStreakState
from fable_mythos.hooks.session_end import SessionEndHook, SessionSummary
from fable_mythos.hooks.session_start import (
    RoutingMode,
    SessionProfile,
    SessionStartHook,
)
from fable_mythos.hooks.spawn_guard import GuardDecision, SpawnGuard


class TestSessionStartHook:
    def test_no_ledger_conservative(self, tmp_path):
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute(session_model="qwen2.5:14b")
        assert ctx.profile == SessionProfile.CONSERVATIVE
        assert ctx.routing == RoutingMode.BALANCED
        assert ctx.ledger_has_open_cards is False
        assert ctx.session_model == "qwen2.5:14b"

    def test_ledger_with_open_cards(self, tmp_path):
        ledger_dir = tmp_path / ".fable"
        ledger_dir.mkdir()
        (ledger_dir / "LEDGER.md").write_text("- [ ] Fix the bug\n- [x] Done task\n")
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute(session_model="qwen2.5:14b")
        assert ctx.profile == SessionProfile.THROUGHPUT
        assert ctx.routing == RoutingMode.QUALITY
        assert ctx.ledger_has_open_cards is True

    def test_ledger_no_open_cards(self, tmp_path):
        ledger_dir = tmp_path / ".fable"
        ledger_dir.mkdir()
        (ledger_dir / "LEDGER.md").write_text("- [x] Done task 1\n- [x] Done task 2\n")
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute()
        assert ctx.ledger_has_open_cards is False
        assert ctx.profile == SessionProfile.CONSERVATIVE

    def test_discipline_text_included(self, tmp_path):
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute()
        assert "Fable-Mythos Discipline" in ctx.discipline_text
        assert "Classify before acting" in ctx.discipline_text

    def test_build_system_prefix(self, tmp_path):
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute(session_model="qwen2.5:14b")
        prefix = hook.build_system_prefix(ctx)
        assert "Fable-Mythos Discipline" in prefix
        assert "Conservative" in prefix
        assert "qwen2.5:14b" in prefix

    def test_injects_memory_facts(self, tmp_path):
        fable_dir = tmp_path / ".fable"
        fable_dir.mkdir()
        (fable_dir / "MEMORY.md").write_text("User prefers Python 3.11")
        hook = SessionStartHook(project_dir=tmp_path)
        ctx = hook.execute()
        assert len(ctx.injected_facts) == 1
        assert "Python 3.11" in ctx.injected_facts[0]


class TestSpawnGuard:
    def test_non_delegation_allowed(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=False)
        result = guard.check("edit", {"file": "main.py", "content": "print('hello')"})
        assert result.allowed is True

    def test_design_gate_blocks_detailed_delegation(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=False)
        result = guard.check("spawn_agent", {
            "prompt": "First, read the file src/main.py. Then, fix the bug in the parse function. "
                      "After that, run the tests. Finally, update the documentation.",
        })
        assert result.allowed is False
        assert result.blocked_by == "design_gate"

    def test_design_gate_allows_with_open_cards(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {
            "prompt": "First, read the file src/main.py. Then fix the bug.",
        })
        assert result.allowed is True

    def test_model_ceiling_blocks_stronger_model(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {
            "model": "qwen2.5:32b",
            "prompt": "Simple task",
        })
        assert result.allowed is False
        assert result.blocked_by == "model_ceiling"

    def test_model_ceiling_allows_weaker_model(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {
            "model": "qwen2.5:7b",
            "prompt": "Simple task",
        })
        assert result.allowed is True

    def test_model_ceiling_allows_same_model(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {
            "model": "qwen2.5:14b",
            "prompt": "Simple task",
        })
        assert result.allowed is True

    def test_simple_delegation_without_open_cards(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=False)
        result = guard.check("spawn_agent", {
            "prompt": "What is 2+2?",
        })
        # Short, simple delegation should be allowed even without open cards
        assert result.allowed is True

    def test_update_session_model(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        guard.update_session_model("qwen2.5:32b")
        result = guard.check("spawn_agent", {"model": "qwen2.5:32b", "prompt": "task"})
        assert result.allowed is True

    def test_unknown_model_allowed(self):
        guard = SpawnGuard(session_model="custom-model", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {"model": "another-custom", "prompt": "task"})
        # Unknown models can't be compared, so allowed
        assert result.allowed is True


class TestFailStreakHook:
    def test_success_resets_counter(self):
        hook = FailStreakHook(threshold=3)
        hook.execute("bash", {"command": "ls"}, {"exit_code": 1})
        hook.execute("bash", {"command": "ls"}, {"exit_code": 0})
        assert hook.state.consecutive_failures == 0

    def test_failure_increments_counter(self):
        hook = FailStreakHook(threshold=3)
        hook.execute("bash", {"command": "bad"}, {"exit_code": 1})
        assert hook.state.consecutive_failures == 1
        hook.execute("bash", {"command": "bad"}, {"exit_code": 1})
        assert hook.state.consecutive_failures == 2

    def test_ladder_injected_at_threshold(self):
        hook = FailStreakHook(threshold=3)
        for i in range(3):
            result = hook.execute("bash", {"command": f"bad{i}"}, {"exit_code": 1})
        assert result["inject_context"] is not None
        assert "Attribution Ladder" in result["inject_context"]
        assert result["should_pause"] is True

    def test_ladder_not_injected_before_threshold(self):
        hook = FailStreakHook(threshold=3)
        result = hook.execute("bash", {"command": "bad"}, {"exit_code": 1})
        assert result["inject_context"] is None

    def test_ladder_not_re_injected(self):
        hook = FailStreakHook(threshold=3)
        for i in range(3):
            hook.execute("bash", {"command": f"bad{i}"}, {"exit_code": 1})
        # 4th failure should not re-inject
        result = hook.execute("bash", {"command": "bad4"}, {"exit_code": 1})
        assert result["inject_context"] is None

    def test_success_clears_ladder_flag(self):
        hook = FailStreakHook(threshold=3)
        for i in range(3):
            hook.execute("bash", {"command": f"bad{i}"}, {"exit_code": 1})
        # Success
        hook.execute("bash", {"command": "good"}, {"exit_code": 0})
        assert hook.state.ladder_injected is False
        # Now 3 more failures should inject again
        for i in range(3):
            result = hook.execute("bash", {"command": f"bad{i}"}, {"exit_code": 1})
        assert result["inject_context"] is not None

    def test_error_output_detected(self):
        hook = FailStreakHook(threshold=3)
        result = hook.execute("bash", {"command": "test"}, {"output": "Traceback (most recent call last):"})
        assert hook.state.consecutive_failures == 1

    def test_get_stats(self):
        hook = FailStreakHook(threshold=3)
        hook.execute("bash", {"command": "good"}, {"exit_code": 0})
        hook.execute("bash", {"command": "bad"}, {"exit_code": 1})
        stats = hook.get_stats()
        assert stats["total_failures"] == 1
        assert stats["total_successes"] == 1
        assert stats["failure_rate"] == 0.5

    def test_reset(self):
        hook = FailStreakHook(threshold=3)
        hook.execute("bash", {"command": "bad"}, {"exit_code": 1})
        hook.reset()
        assert hook.state.consecutive_failures == 0


class TestSessionEndHook:
    def test_execute_logs_summary(self):
        hook = SessionEndHook()
        summary = SessionSummary(
            session_id="s1",
            start_time=time.time() - 10,
            end_time=time.time(),
            success=True,
            skills_used=["deploy"],
            new_skills_created=["fix-tz-bug"],
        )
        result = hook.execute(summary)
        assert result["logged"] is True
        assert result["success"] is True
        assert "fix-tz-bug" in result["new_skills"]

    def test_get_recent_summaries(self):
        hook = SessionEndHook()
        for i in range(5):
            hook.execute(SessionSummary(
                session_id=f"s{i}",
                start_time=time.time() - 10,
                end_time=time.time(),
                success=i % 2 == 0,
            ))
        recent = hook.get_recent_summaries(limit=3)
        assert len(recent) == 3
        # Most recent first
        assert recent[0]["session_id"] == "s4"

    def test_get_stats(self):
        hook = SessionEndHook()
        hook.execute(SessionSummary(
            session_id="s1", start_time=0, end_time=10, success=True,
            skills_used=["a", "b"], new_skills_created=["c"],
        ))
        hook.execute(SessionSummary(
            session_id="s2", start_time=0, end_time=20, success=False,
            skills_used=["a"], new_skills_created=[],
        ))
        stats = hook.get_stats()
        assert stats["total_sessions"] == 2
        assert stats["success_rate"] == 0.5
        assert stats["unique_skills_used"] == 2
        assert stats["total_new_skills"] == 1

    def test_get_stats_empty(self):
        hook = SessionEndHook()
        stats = hook.get_stats()
        assert stats["total_sessions"] == 0

    def test_duration_calculation(self):
        summary = SessionSummary(
            session_id="s1",
            start_time=100.0,
            end_time=150.0,
        )
        assert summary.duration_s == 50.0
