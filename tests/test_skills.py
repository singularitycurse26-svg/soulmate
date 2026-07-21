"""Tests for skill manager, skill factory, and domain adapters."""

from __future__ import annotations

import time

import pytest

from fable_mythos.config import Settings
from fable_mythos.memory.episodic import Episode
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.semantic import Skill
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.skills.domain_adapters import (
    ADAPTERS,
    CodingAdapter,
    MathAdapter,
    PlanningAdapter,
    get_adapter,
    list_adapters,
)
from fable_mythos.skills.skill_factory import SkillFactory
from fable_mythos.skills.skill_manager import SkillManager


@pytest.fixture
def memory(tmp_path):
    settings = Settings()
    settings.memory.episodic_db_path = str(tmp_path / "episodes.db")
    settings.memory.chroma_db_path = str(tmp_path / "chroma")
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return MemoryManager(settings=settings, bus=bus)


@pytest.fixture
def skill_manager(memory):
    return SkillManager(memory)


@pytest.fixture
def skill_factory(memory, skill_manager):
    settings = Settings()
    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    return SkillFactory(bus=bus, memory=memory, skill_manager=skill_manager)


class TestSkillManager:
    def test_create_skill(self, skill_manager):
        result = skill_manager.create(
            name="test-skill",
            description="A test skill",
            content="## Test Skill\nDo the thing.",
            category="coding",
        )
        assert result.success is True
        assert result.skill is not None
        assert result.skill.name == "test-skill"

    def test_create_duplicate_fails(self, skill_manager):
        skill_manager.create(name="dup", description="First")
        result = skill_manager.create(name="dup", description="Second")
        assert result.success is False
        assert "already exists" in result.message

    def test_read_skill(self, skill_manager):
        skill_manager.create(name="read-test", description="Read me")
        result = skill_manager.read("read-test")
        assert result.success is True
        assert result.skill.name == "read-test"

    def test_read_not_found(self, skill_manager):
        result = skill_manager.read("nonexistent")
        assert result.success is False

    def test_update_skill(self, skill_manager):
        skill_manager.create(name="update-me", description="Original")
        result = skill_manager.update(name="update-me", description="Updated")
        assert result.success is True
        assert result.skill.description == "Updated"

    def test_update_not_found(self, skill_manager):
        result = skill_manager.update(name="nope", description="x")
        assert result.success is False

    def test_delete_skill(self, skill_manager):
        skill_manager.create(name="delete-me", description="Bye")
        result = skill_manager.delete("delete-me")
        assert result.success is True
        # Verify it's gone
        assert skill_manager.read("delete-me").success is False

    def test_delete_not_found(self, skill_manager):
        result = skill_manager.delete("nonexistent")
        assert result.success is False

    def test_list_skills(self, skill_manager):
        skill_manager.create(name="s1", description="Skill 1")
        skill_manager.create(name="s2", description="Skill 2")
        result = skill_manager.list()
        assert result.success is True
        assert len(result.skills) == 2

    def test_search_skills(self, skill_manager):
        skill_manager.create(name="deploy", description="Deployment workflow")
        skill_manager.create(name="test-runner", description="Run tests")
        result = skill_manager.search(query="deploy")
        assert result.success is True
        assert len(result.skills) > 0

    def test_execute_action(self, skill_manager):
        result = skill_manager.execute("create", name="exec-test", description="Via execute")
        assert result.success is True

    def test_execute_unknown_action(self, skill_manager):
        result = skill_manager.execute("invalid")
        assert result.success is False


class TestSkillFactory:
    async def test_learn_from_episode_success(self, skill_factory, memory):
        episode = Episode(
            id="ep-learn-1",
            session_id="s1",
            timestamp=time.time(),
            task_description="Fix timezone bug in date parser",
            task_category="code",
            steps_taken=["read file", "edit code", "run tests"],
            tools_used=["edit", "bash"],
            success=True,
            key_result="Timezone bug fixed",
            confidence_achieved=0.85,
        )
        memory.episodic.store(episode)
        memory.graph.add_node(f"episode:{episode.id}", "episode", episode.id)

        result = await skill_factory.learn_from_episode(episode)
        assert result["success"] is True
        assert result["skill_name"] is not None

    async def test_learn_from_failed_episode(self, skill_factory):
        episode = Episode(
            id="ep-fail",
            session_id="s1",
            timestamp=time.time(),
            task_description="Failed task",
            task_category="code",
            success=False,
        )
        result = await skill_factory.learn_from_episode(episode)
        assert result["success"] is False

    async def test_learn_from_recent_no_episodes(self, skill_factory):
        result = await skill_factory.learn_from_recent()
        assert result["success"] is False

    async def test_learn_from_recent_with_episode(self, skill_factory, memory):
        episode = Episode(
            id="ep-recent",
            session_id="s1",
            timestamp=time.time(),
            task_description="Successful task",
            task_category="code",
            success=True,
            key_result="Done",
            confidence_achieved=0.9,
        )
        memory.episodic.store(episode)
        memory.graph.add_node(f"episode:{episode.id}", "episode", episode.id)

        result = await skill_factory.learn_from_recent()
        assert result["success"] is True


class TestDomainAdapters:
    def test_get_coding_adapter(self):
        adapter = get_adapter("code")
        assert isinstance(adapter, CodingAdapter)
        assert "Coding Domain" in adapter.get_instructions()
        assert "INTENT" in adapter.get_instructions()

    def test_get_math_adapter(self):
        adapter = get_adapter("math")
        assert isinstance(adapter, MathAdapter)
        assert "Math Domain" in adapter.get_instructions()

    def test_get_planning_adapter(self):
        adapter = get_adapter("planning")
        assert isinstance(adapter, PlanningAdapter)
        assert "Planning Domain" in adapter.get_instructions()

    def test_get_default_adapter(self):
        adapter = get_adapter("nonexistent")
        assert adapter.name == "default"

    def test_coding_gates(self):
        adapter = CodingAdapter()
        gates = adapter.get_gates()
        assert len(gates) > 0
        assert any("Intent" in g for g in gates)

    def test_coding_verification(self):
        adapter = CodingAdapter()
        assert "test" in adapter.get_verification_method().lower()

    def test_list_adapters(self):
        adapters = list_adapters()
        assert len(adapters) == len(ADAPTERS)
        names = [a["name"] for a in adapters]
        assert "coding" in names
        assert "math" in names
        assert "planning" in names

    def test_all_adapters_have_instructions(self):
        for task_type, adapter in ADAPTERS.items():
            instructions = adapter.get_instructions()
            assert len(instructions) > 0
            assert adapter.name.lower() in instructions.lower() or adapter.task_type.lower() in instructions.lower()
