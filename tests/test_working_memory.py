"""Tests for working memory — context window management."""

from __future__ import annotations

import pytest

from fable_mythos.memory.working import WorkingMemory
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.config import Settings


@pytest.fixture
def bus():
    settings = Settings()
    return ModelBus(provider=DeterministicProvider(), models=settings.models)


@pytest.fixture
def working(bus):
    return WorkingMemory(
        max_tokens=1000,
        sacred_zone_ratio=0.35,
        compression_threshold=0.75,
        bus=bus,
    )


class TestWorkingMemory:
    def test_sacred_zone_tokens(self, working):
        assert working.sacred_zone_tokens == 350  # 35% of 1000

    def test_compressible_zone_tokens(self, working):
        assert working.compressible_zone_tokens == 650  # 65% of 1000

    def test_set_system_prompt(self, working):
        working.set_system_prompt("You are a helpful agent.")
        assert working.system_prompt == "You are a helpful agent."

    def test_set_soul(self, working):
        working.set_soul("Be direct and honest.")
        assert working.soul_content == "Be direct and honest."

    def test_set_memory(self, working):
        working.set_memory("User prefers Python 3.11")
        assert working.memory_content == "User prefers Python 3.11"

    def test_add_skill(self, working):
        working.add_skill("deploy", "Deployment workflow skill")
        assert len(working.active_skills) == 1
        assert working.active_skills[0]["name"] == "deploy"

    def test_add_turn(self, working):
        working.add_turn("user", "Fix the bug")
        working.add_turn("assistant", "I'll fix it now")
        assert len(working.turns) == 2
        assert working.turns[0].role == "user"
        assert working.turns[1].role == "assistant"

    def test_build_messages_with_sacred_zone(self, working):
        working.set_system_prompt("System prompt")
        working.set_soul("Persona")
        working.set_memory("Facts")
        working.add_skill("test", "Test skill")
        working.add_turn("user", "Hello")

        messages = working.build_messages()
        assert messages[0]["role"] == "system"
        assert "System prompt" in messages[0]["content"]
        assert "Persona" in messages[0]["content"]
        assert "Facts" in messages[0]["content"]
        assert "test" in messages[0]["content"]
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "Hello"

    def test_build_messages_empty(self, working):
        messages = working.build_messages()
        assert messages == []

    def test_inject_episodes(self, working):
        working.inject_episodes([{"task_description": "Fix bug", "key_result": "Fixed"}])
        messages = working.build_messages()
        assert any("Fix bug" in m["content"] for m in messages)

    def test_inject_skills(self, working):
        working.inject_skills([{"name": "deploy", "description": "Deploy stuff"}])
        messages = working.build_messages()
        assert any("deploy" in m["content"] for m in messages)

    def test_inject_facts(self, working):
        working.inject_facts(["The sky is blue"])
        messages = working.build_messages()
        assert any("sky is blue" in m["content"] for m in messages)

    def test_get_token_usage(self, working):
        working.set_system_prompt("A" * 100)  # ~25 tokens
        working.add_turn("user", "B" * 100)  # ~25 tokens
        usage = working.get_token_usage()
        assert usage["sacred"] > 0
        assert usage["compressible"] > 0
        assert usage["total"] == usage["sacred"] + usage["compressible"]

    def test_clear(self, working):
        working.add_turn("user", "Hello")
        working.inject_facts(["fact"])
        working.clear()
        assert len(working.turns) == 0
        assert len(working.injected_facts) == 0
        # Sacred zone should be preserved
        working.set_system_prompt("System")
        working.clear()
        assert working.system_prompt == "System"

    async def test_maybe_compress_no_need(self, working):
        working.add_turn("user", "Short message")
        compressed = await working.maybe_compress()
        assert compressed is False

    async def test_maybe_compress_triggers(self, working):
        # Add many turns to exceed threshold
        for i in range(20):
            working.add_turn("user", f"This is message number {i} with some padding text to make it longer")
            working.add_turn("assistant", f"Response to message {i} with additional text for length")

        compressed = await working.maybe_compress()
        assert compressed is True
        # Should have compressed old turns
        assert len(working.turns) < 40
