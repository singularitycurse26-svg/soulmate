"""Tests for the model bus."""

from __future__ import annotations

import pytest

from fable_mythos.config import ModelConfig, ProviderBackend, Settings
from fable_mythos.providers.bus import ModelBus, create_bus, create_provider
from fable_mythos.providers.deterministic import DeterministicProvider


@pytest.fixture
def settings():
    s = Settings()
    s.provider_backend = ProviderBackend.DETERMINISTIC
    return s


@pytest.fixture
def bus(settings):
    provider = DeterministicProvider()
    return ModelBus(provider=provider, models=settings.models)


class TestModelBus:
    def test_get_model_valid_role(self, bus):
        assert bus.get_model("fast") == bus.models.fast
        assert bus.get_model("base") == bus.models.base
        assert bus.get_model("judge") == bus.models.judge

    def test_get_model_invalid_role(self, bus):
        with pytest.raises(KeyError):
            bus.get_model("nonexistent")

    async def test_complete_with_role(self, bus):
        result = await bus.complete(
            role="fast",
            messages=[{"role": "user", "content": "Hello"}],
        )
        assert "content" in result

    async def test_complete_default_role(self, bus):
        result = await bus.complete(
            messages=[{"role": "user", "content": "Hello"}],
        )
        assert "content" in result

    async def test_stream_complete(self, bus):
        chunks = []
        async for chunk in bus.stream_complete(
            role="base",
            messages=[{"role": "user", "content": "Stream test"}],
        ):
            chunks.append(chunk)
        assert len(chunks) > 0

    async def test_embed(self, bus):
        vec = await bus.embed(input="test text")
        assert isinstance(vec, list)
        assert len(vec) > 0

    async def test_healthcheck(self, bus):
        health = await bus.healthcheck()
        assert "ok" in health
        assert "detail" in health

    async def test_list_models(self, bus):
        models = await bus.list_models()
        assert isinstance(models, list)

    def test_validate_roles_all_present(self):
        provider = DeterministicProvider()
        models = ModelConfig(fast="a", base="b", judge="c", code="d", style="e")
        bus = ModelBus(provider=provider, models=models)
        # Should not raise
        assert bus.get_model("fast") == "a"


class TestCreateProvider:
    def test_create_deterministic(self, settings):
        provider = create_provider(settings)
        assert isinstance(provider, DeterministicProvider)

    def test_create_bus(self, settings):
        bus = create_bus(settings)
        assert isinstance(bus, ModelBus)
        assert bus.provider is not None
