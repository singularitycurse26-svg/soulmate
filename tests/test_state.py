"""Tests for the core state model."""

from __future__ import annotations

import pytest

from fable_mythos.core.state import (
    AskShape,
    FableMythosState,
    GroundedFact,
    Hypothesis,
    IntentLine,
    LoopPhase,
    StructuredState,
)


class TestLoopPhase:
    def test_in_order_has_all_phases(self):
        phases = LoopPhase.in_order()
        assert len(phases) == 10
        assert phases[0] == LoopPhase.CLASSIFY
        assert phases[-1] == LoopPhase.REPORT

    def test_phase_values_are_strings(self):
        for phase in LoopPhase:
            assert isinstance(phase.value, str)


class TestStructuredState:
    def test_empty_state(self):
        state = StructuredState()
        assert state.facts == []
        assert state.hypotheses == []
        assert state.active_hypotheses() == []

    def test_add_fact(self):
        state = StructuredState()
        state.add_fact("The sky is blue", "observation", 0.9, loop=0)
        assert len(state.facts) == 1
        assert state.facts[0].claim == "The sky is blue"
        assert state.facts[0].confidence == 0.9

    def test_add_contradiction(self):
        state = StructuredState()
        state.add_contradiction("A", "B", 0.8, loop=1)
        assert len(state.contradictions) == 1
        assert state.contradictions[0].severity == 0.8

    def test_add_artifact(self):
        state = StructuredState()
        state.add_artifact("test_run", "all tests passed", True, loop=2)
        assert len(state.artifacts) == 1
        assert state.artifacts[0].passes is True

    def test_active_hypotheses_filters_dead(self):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.8, alive=True))
        state.hypotheses.append(Hypothesis(id="h2", answer="B", confidence=0.3, alive=False))
        active = state.active_hypotheses()
        assert len(active) == 1
        assert active[0].id == "h1"

    def test_top_hypothesis(self):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.6))
        state.hypotheses.append(Hypothesis(id="h2", answer="B", confidence=0.9))
        top = state.top_hypothesis()
        assert top is not None
        assert top.id == "h2"

    def test_top_hypothesis_none(self):
        state = StructuredState()
        assert state.top_hypothesis() is None

    def test_should_branch_no_hypotheses(self):
        state = StructuredState()
        assert state.should_branch() is True

    def test_should_branch_low_confidence(self):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.3))
        assert state.should_branch() is True

    def test_should_branch_high_confidence(self):
        state = StructuredState()
        state.hypotheses.append(Hypothesis(id="h1", answer="A", confidence=0.9))
        assert state.should_branch() is False

    def test_should_branch_max_reached(self):
        state = StructuredState()
        for i in range(3):
            state.hypotheses.append(Hypothesis(id=f"h{i}", answer="A", confidence=0.3))
        assert state.should_branch() is False

    def test_as_dict_and_from_dict_roundtrip(self):
        state = StructuredState()
        state.add_fact("fact1", "source1", 0.8, loop=0)
        state.hypotheses.append(Hypothesis(id="h1", answer="test", confidence=0.7))
        state.intent_line = IntentLine(
            code_does="X", task_expects="Y", spec_says="Z", agreement=True
        )

        d = state.as_dict()
        restored = StructuredState.from_dict(d)

        assert len(restored.facts) == 1
        assert restored.facts[0].claim == "fact1"
        assert len(restored.hypotheses) == 1
        assert restored.hypotheses[0].id == "h1"
        assert restored.intent_line is not None
        assert restored.intent_line.code_does == "X"


class TestFableMythosState:
    def test_initial_state(self):
        state = FableMythosState(query="test query", thread_id="t1")
        assert state.query == "test query"
        assert state.thread_id == "t1"
        assert state.phase == LoopPhase.CLASSIFY
        assert state.loop_index == 0
        assert state.converged is False

    def test_advance_phase(self):
        state = FableMythosState(query="test", thread_id="t1")
        assert state.phase == LoopPhase.CLASSIFY
        state.advance_phase()
        assert state.phase == LoopPhase.DEFINE_DONE
        state.advance_phase()
        assert state.phase == LoopPhase.EVIDENCE

    def test_advance_phase_wraps(self):
        state = FableMythosState(query="test", thread_id="t1")
        state.phase = LoopPhase.REPORT
        state.advance_phase()
        assert state.phase == LoopPhase.CLASSIFY

    def test_should_halt_max_loops(self):
        state = FableMythosState(query="test", thread_id="t1", max_loops=2)
        state.loop_index = 2
        assert state.should_halt(0.72) is True
        assert state.halt_reason == "max_loops"

    def test_should_halt_converged(self):
        state = FableMythosState(query="test", thread_id="t1")
        state.converged = True
        state.structured_state.hypotheses.append(
            Hypothesis(id="h1", answer="A", confidence=0.9)
        )
        assert state.should_halt(0.72) is True
        assert state.halt_reason == "converged_confident"

    def test_should_halt_max_repair(self):
        state = FableMythosState(query="test", thread_id="t1")
        state.repair_cycles = 3
        assert state.should_halt(0.72) is True
        assert state.halt_reason == "max_repair_cycles"

    def test_should_not_halt(self):
        state = FableMythosState(query="test", thread_id="t1", max_loops=6)
        state.loop_index = 1
        state.converged = False
        state.repair_cycles = 0
        assert state.should_halt(0.72) is False

    def test_record_loop_metrics(self):
        state = FableMythosState(query="test", thread_id="t1")
        state.structured_state.hypotheses.append(
            Hypothesis(id="h1", answer="A", confidence=0.7)
        )
        state.record_loop_metrics()
        assert len(state.per_loop_metrics) == 1
        assert state.per_loop_metrics[0]["top_confidence"] == 0.7
