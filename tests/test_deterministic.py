"""Tests for the deterministic provider."""

from __future__ import annotations

import pytest

from fable_mythos.providers.deterministic import DeterministicProvider, get_deterministic_provider


@pytest.fixture
def provider():
    return DeterministicProvider()


class TestDeterministicProvider:
    async def test_complete_returns_content(self, provider):
        result = await provider.complete(
            model="test",
            messages=[{"role": "user", "content": "Hello world"}],
        )
        assert "content" in result
        assert isinstance(result["content"], str)
        assert len(result["content"]) > 0

    async def test_complete_triage_response(self, provider):
        result = await provider.complete(
            model="test",
            messages=[{"role": "user", "content": "Classify this request for triage. QUERY: fix the bug"}],
        )
        import json
        parsed = json.loads(result["content"])
        assert "task_type" in parsed
        assert "difficulty" in parsed
        assert "execution_mode" in parsed

    async def test_complete_judge_pass(self, provider):
        result = await provider.complete(
            model="test",
            messages=[{"role": "user", "content": "Judge this hypothesis for consistency: ..."}],
        )
        assert "PASS" in result["content"]

    async def test_stream_complete(self, provider):
        chunks = []
        async for chunk in provider.stream_complete(
            model="test",
            messages=[{"role": "user", "content": "Test streaming"}],
        ):
            chunks.append(chunk)

        assert len(chunks) > 0
        full = "".join(chunks)
        assert len(full) > 0

    async def test_embed_returns_vector(self, provider):
        vec = await provider.embed(model="test", input="test text")
        assert isinstance(vec, list)
        assert len(vec) == 768
        # Check it's normalized (unit length)
        import math
        norm = math.sqrt(sum(x * x for x in vec))
        assert abs(norm - 1.0) < 0.01

    async def test_embed_deterministic(self, provider):
        vec1 = await provider.embed(model="test", input="same text")
        vec2 = await provider.embed(model="test", input="same text")
        assert vec1 == vec2  # same input → same output

    async def test_embed_different_inputs(self, provider):
        vec1 = await provider.embed(model="test", input="text one")
        vec2 = await provider.embed(model="test", input="text two")
        assert vec1 != vec2  # different inputs → different outputs

    async def test_list_models(self, provider):
        models = await provider.list_models()
        assert isinstance(models, list)
        assert len(models) > 0

    async def test_healthcheck(self, provider):
        ok, msg = await provider.healthcheck()
        assert ok is True
        assert "available" in msg.lower()

    async def test_get_deterministic_provider_singleton(self):
        p1 = get_deterministic_provider()
        p2 = get_deterministic_provider()
        assert p1 is p2
