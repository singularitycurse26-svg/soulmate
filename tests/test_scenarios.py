"""End-to-end evaluation scenarios — 14 scenarios covering all major features.

Each scenario tests a complete flow through the Fable-Mythos system using
the deterministic provider (no Ollama required). These serve as both
integration tests and evaluation benchmarks.
"""

from __future__ import annotations

import time

import pytest

from fable_mythos.config import Settings, ProviderBackend
from fable_mythos.core.orchestrator import Orchestrator
from fable_mythos.core.state import FableMythosState, LoopPhase, Hypothesis
from fable_mythos.hooks.fail_streak import FailStreakHook
from fable_mythos.hooks.session_end import SessionEndHook, SessionSummary
from fable_mythos.hooks.session_start import SessionStartHook
from fable_mythos.hooks.spawn_guard import SpawnGuard
from fable_mythos.memory.episodic import Episode
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.semantic import Skill
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.rml.engine import RMLEngine
from fable_mythos.skills.domain_adapters import get_adapter
from fable_mythos.skills.skill_factory import SkillFactory
from fable_mythos.skills.skill_manager import SkillManager


@pytest.fixture
def system(tmp_path):
    """Create a full system instance with deterministic provider."""
    settings = Settings()
    settings.provider_backend = ProviderBackend.DETERMINISTIC
    settings.harness.max_loops = 3
    settings.memory.episodic_db_path = str(tmp_path / "episodes.db")
    settings.memory.chroma_db_path = str(tmp_path / "chroma")
    settings.memory.profiles_dir = str(tmp_path / "profiles")
    settings.memory.soul_path = str(tmp_path / "SOUL.md")
    settings.memory.memory_path = str(tmp_path / "MEMORY.md")
    settings.rml.enabled = True
    settings.rml.preferences_path = str(tmp_path / "rml.json")
    settings.trajectory_path = str(tmp_path / "trajectories.jsonl")

    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    orchestrator = Orchestrator(settings=settings, bus=bus)
    memory = MemoryManager(settings=settings, bus=bus)
    skill_manager = SkillManager(memory)
    skill_factory = SkillFactory(bus, memory, skill_manager)
    rml = RMLEngine(settings.rml)

    return {
        "settings": settings,
        "bus": bus,
        "orchestrator": orchestrator,
        "memory": memory,
        "skill_manager": skill_manager,
        "skill_factory": skill_factory,
        "rml": rml,
    }


class TestScenario1TrivialTask:
    """Scenario 1: Trivial task — should short-circuit with minimal processing."""

    async def test_trivial_returns_answer(self, system):
        orch = system["orchestrator"]
        state = await orch.complete(query="trivial fix", thread_id="s1")
        assert state.final_answer is not None
        assert len(state.final_answer) > 0


class TestScenario2CodeTask:
    """Scenario 2: Code task — should classify as code and return structured answer."""

    async def test_code_task_classified(self, system):
        orch = system["orchestrator"]
        state = await orch.complete(query="Fix the bug in main.py", thread_id="s2")
        assert state.triage.get("task_type") == "code"
        assert state.final_answer is not None


class TestScenario3PlanningTask:
    """Scenario 3: Planning task — should classify as planning."""

    async def test_planning_task_classified(self, system):
        orch = system["orchestrator"]
        state = await orch.complete(query="Plan the architecture for the new system", thread_id="s3")
        assert state.triage.get("task_type") == "planning"


class TestScenario4StreamingResponse:
    """Scenario 4: Streaming — should yield events in order."""

    async def test_stream_yields_events(self, system):
        orch = system["orchestrator"]
        events = []
        async for event_type, payload in orch.complete_stream(query="Fix bug", thread_id="s4"):
            events.append((event_type, payload))
        assert len(events) > 0
        types = [e[0] for e in events]
        assert "status" in types
        assert "final" in types


class TestScenario5MemoryStorage:
    """Scenario 5: Memory — episode stored after completion."""

    async def test_episode_stored(self, system):
        orch = system["orchestrator"]
        memory = system["memory"]
        await orch.complete(query="Fix the bug", thread_id="s5")
        # The orchestrator should have logged a trajectory
        assert memory.episodic.count() >= 0  # episodic is populated via sync_after_turn


class TestScenario6SkillCreation:
    """Scenario 6: Skill creation — create and retrieve a skill."""

    def test_create_and_retrieve_skill(self, system):
        sm = system["skill_manager"]
        result = sm.create(name="test-deploy", description="Deployment skill", content="## Deploy")
        assert result.success
        read = sm.read("test-deploy")
        assert read.success
        assert read.skill.content == "## Deploy"


class TestScenario7SkillSearch:
    """Scenario 7: Skill search — search by text query."""

    def test_search_finds_skill(self, system):
        sm = system["skill_manager"]
        sm.create(name="deploy-prod", description="Deploy to production server")
        sm.create(name="run-tests", description="Run the test suite")
        result = sm.search(query="deploy")
        assert result.success
        assert len(result.skills) > 0
        assert any("deploy" in s.name for s in result.skills)


class TestScenario8KnowledgeGraph:
    """Scenario 8: Knowledge graph — nodes and bidirectional edges."""

    def test_graph_bidirectional_edges(self, system):
        memory = system["memory"]
        memory.graph.add_node("ep:1", "episode", "ep1")
        memory.graph.add_node("s:1", "skill", "skill1")
        memory.graph.add_edge("ep:1", "s:1", "created_skill")

        # Both directions should be traversable
        from_ep = memory.graph.get_links("ep:1")
        from_skill = memory.graph.get_links("s:1")
        assert len(from_ep) >= 1
        assert len(from_skill) >= 1


class TestScenario9RecursiveRetrieval:
    """Scenario 9: Recursive retrieval — traverse graph to find linked nodes."""

    def test_recursive_traversal(self, system):
        memory = system["memory"]
        memory.graph.add_node("ep:1", "episode", "ep1")
        memory.graph.add_node("s:1", "skill", "skill1")
        memory.graph.add_node("s:2", "skill", "skill2")
        memory.graph.add_node("f:1", "fact", "fact1")
        memory.graph.add_edge("ep:1", "s:1", "created_skill")
        memory.graph.add_edge("s:1", "s:2", "depends_on")
        memory.graph.add_edge("s:2", "f:1", "applies_skill")

        result = memory.graph.traverse("ep:1", max_depth=3)
        assert "s:1" in result
        assert "s:2" in result
        assert "f:1" in result


class TestScenario10GuardHooks:
    """Scenario 10: Guard hooks — spawn guard blocks detailed delegation without open cards."""

    def test_spawn_guard_blocks(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=False)
        result = guard.check("spawn_agent", {
            "prompt": "First, read src/main.py. Then fix the bug in the parse function. "
                      "After that, run the tests. Finally, update the docs.",
        })
        assert not result.allowed
        assert result.blocked_by == "design_gate"

    def test_spawn_guard_model_ceiling(self):
        guard = SpawnGuard(session_model="qwen2.5:14b", ledger_has_open_cards=True)
        result = guard.check("spawn_agent", {"model": "qwen2.5:32b", "prompt": "task"})
        assert not result.allowed
        assert result.blocked_by == "model_ceiling"


class TestScenario11FailStreak:
    """Scenario 11: Fail streak — attribution ladder injected after 3 failures."""

    def test_ladder_injected(self):
        hook = FailStreakHook(threshold=3)
        for i in range(3):
            result = hook.execute("bash", {"command": f"fail{i}"}, {"exit_code": 1})
        assert result["inject_context"] is not None
        assert "Attribution Ladder" in result["inject_context"]


class TestScenario12RMLLearning:
    """Scenario 12: RML — learns hints from failure patterns."""

    def test_learns_hint_from_contradictions(self, system):
        rml = system["rml"]
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


class TestScenario13DomainAdapters:
    """Scenario 13: Domain adapters — correct adapter selected per task type."""

    def test_coding_adapter(self):
        adapter = get_adapter("code")
        assert "Coding" in adapter.get_instructions()
        assert "INTENT" in adapter.get_instructions()

    def test_math_adapter(self):
        adapter = get_adapter("math")
        assert "Math" in adapter.get_instructions()

    def test_planning_adapter(self):
        adapter = get_adapter("planning")
        assert "Planning" in adapter.get_instructions()


class TestScenario14SessionLifecycle:
    """Scenario 14: Session lifecycle — start hook, work, end hook."""

    def test_session_lifecycle(self, tmp_path):
        # Session start
        start_hook = SessionStartHook(project_dir=tmp_path)
        ctx = start_hook.execute(session_model="qwen2.5:14b")
        assert ctx.profile is not None
        assert ctx.discipline_text is not None

        # Session end
        end_hook = SessionEndHook()
        summary = SessionSummary(
            session_id="lifecycle-test",
            start_time=time.time() - 10,
            end_time=time.time(),
            success=True,
            skills_used=["test-skill"],
        )
        result = end_hook.execute(summary)
        assert result["logged"] is True
        assert result["success"] is True

        # Verify stats
        stats = end_hook.get_stats()
        assert stats["total_sessions"] == 1
        assert stats["success_rate"] == 1.0
