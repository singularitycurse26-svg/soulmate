"""Tests for slash commands."""

from __future__ import annotations

import pytest

from fable_mythos.cli.slash_commands import SlashCommandHandler, CommandResult
from fable_mythos.config import Settings
from fable_mythos.core.orchestrator import Orchestrator
from fable_mythos.hooks.fail_streak import FailStreakHook
from fable_mythos.hooks.session_end import SessionEndHook
from fable_mythos.hooks.session_start import SessionStartHook
from fable_mythos.memory.durable_facts import DurableFactsLoader
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.soul import SoulLoader
from fable_mythos.memory.profiles import ProfileManager
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.rml.engine import RMLEngine
from fable_mythos.skills.skill_factory import SkillFactory
from fable_mythos.skills.skill_manager import SkillManager


@pytest.fixture
def handler(tmp_path):
    settings = Settings()
    settings.memory.episodic_db_path = str(tmp_path / "episodes.db")
    settings.memory.chroma_db_path = str(tmp_path / "chroma")
    settings.memory.profiles_dir = str(tmp_path / "profiles")
    settings.memory.soul_path = str(tmp_path / "SOUL.md")
    settings.memory.memory_path = str(tmp_path / "MEMORY.md")
    settings.rml.preferences_path = str(tmp_path / "rml.json")
    settings.trajectory_path = str(tmp_path / "trajectories.jsonl")

    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    orchestrator = Orchestrator(settings=settings, bus=bus)
    memory = MemoryManager(settings=settings, bus=bus)
    skill_manager = SkillManager(memory)
    skill_factory = SkillFactory(bus, memory, skill_manager)
    rml = RMLEngine(settings.rml)
    profiles = ProfileManager(profiles_dir=tmp_path / "profiles")
    soul = SoulLoader(tmp_path / "SOUL.md")
    facts = DurableFactsLoader(tmp_path / "MEMORY.md")
    session_start = SessionStartHook()
    session_end = SessionEndHook()
    fail_streak = FailStreakHook()

    return SlashCommandHandler(
        orchestrator=orchestrator,
        memory_manager=memory,
        skill_manager=skill_manager,
        skill_factory=skill_factory,
        rml_engine=rml,
        profile_manager=profiles,
        soul_loader=soul,
        facts_loader=facts,
        session_start_hook=session_start,
        session_end_hook=session_end,
        fail_streak_hook=fail_streak,
    )


class TestSlashCommands:
    async def test_help(self, handler):
        result = await handler.handle("/help")
        assert "Available commands" in result.output
        assert "/skills" in result.output
        assert "/quit" in result.output

    async def test_unknown_command(self, handler):
        result = await handler.handle("/nonexistent")
        assert "Unknown command" in result.output

    async def test_empty_command(self, handler):
        result = await handler.handle("/")
        assert "Empty command" in result.output

    async def test_quit(self, handler):
        result = await handler.handle("/quit")
        assert result.should_exit is True
        assert "Goodbye" in result.output

    async def test_clear(self, handler):
        result = await handler.handle("/clear")
        assert result.should_clear is True

    async def test_skills_list_empty(self, handler):
        result = await handler.handle("/skills")
        assert "No skills found" in result.output

    async def test_skills_create_and_list(self, handler):
        # Create a skill via the manager
        handler.skill_manager.create(name="test-skill", description="Test")
        result = await handler.handle("/skills")
        assert "test-skill" in result.output

    async def test_skills_search(self, handler):
        handler.skill_manager.create(name="deploy", description="Deployment workflow")
        result = await handler.handle("/skills search deploy")
        assert "deploy" in result.output

    async def test_skills_read(self, handler):
        handler.skill_manager.create(name="readme", description="Read me", content="## Content")
        result = await handler.handle("/skills read readme")
        assert "Content" in result.output

    async def test_skills_delete(self, handler):
        handler.skill_manager.create(name="delme", description="Delete me")
        result = await handler.handle("/skills delete delme")
        assert "deleted" in result.output.lower()

    async def test_memory(self, handler):
        result = await handler.handle("/memory")
        assert "Memory State" in result.output
        assert "Episodic" in result.output
        assert "Semantic" in result.output
        assert "Graph" in result.output

    async def test_graph(self, handler):
        result = await handler.handle("/graph")
        assert "Knowledge Graph" in result.output
        assert "Nodes" in result.output

    async def test_profile_list(self, handler):
        result = await handler.handle("/profile")
        assert "Profiles" in result.output

    async def test_profile_switch(self, handler):
        result = await handler.handle("/profile switch work")
        assert "Switched" in result.output

    async def test_soul(self, handler):
        result = await handler.handle("/soul")
        assert "SOUL.md" in result.output

    async def test_facts(self, handler):
        result = await handler.handle("/facts")
        assert "MEMORY.md" in result.output

    async def test_facts_add(self, handler):
        result = await handler.handle("/facts add Test fact here")
        assert "Added fact" in result.output

    async def test_rml(self, handler):
        result = await handler.handle("/rml")
        assert "RML Stats" in result.output

    async def test_rml_reset(self, handler):
        result = await handler.handle("/rml reset")
        assert "reset" in result.output.lower()

    async def test_hooks(self, handler):
        result = await handler.handle("/hooks")
        assert "Hook Stats" in result.output

    async def test_health(self, handler):
        result = await handler.handle("/health")
        assert "System Health" in result.output

    async def test_learn_no_episodes(self, handler):
        result = await handler.handle("/learn")
        assert "No successful episodes" in result.output or "failed" in result.output.lower()

    def test_list_commands(self, handler):
        commands = handler.list_commands()
        assert "help" in commands
        assert "skills" in commands
        assert "quit" in commands
        assert len(commands) >= 10
