"""5-model routing bus for INC-LLM-v1.

Routes requests to the appropriate model based on role:
  fast  → triage, routing, cheap passes
  base  → main reasoning, solving
  judge → verification, critique, consistency
  code  → code/math specialist reasoning
  style → final answer polish
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from inc_llm.config import ModelConfig, ProviderBackend, Settings
from inc_llm.providers.base import ModelProvider
from inc_llm.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

VALID_ROLES = ("fast", "base", "judge", "code", "style")


class ModelBus:
    """5-model routing bus — routes completions by role to the right model."""

    def __init__(self, provider: ModelProvider, models: ModelConfig) -> None:
        self.provider = provider
        self.models = models

    def get_model(self, role: str) -> str:
        if role not in VALID_ROLES:
            raise KeyError(f"Invalid model role: '{role}'. Valid: {VALID_ROLES}")
        return self.models.get(role)

    async def complete(self, *, role: str = "base", messages: list[dict[str, str]],
                       max_tokens: int = 128, temperature: float = 0.7,
                       stop: list[str] | None = None) -> dict[str, str]:
        model = self.get_model(role)
        return await self.provider.complete(model=model, messages=messages,
                                            max_tokens=max_tokens, temperature=temperature, stop=stop)

    async def stream_complete(self, *, role: str = "base", messages: list[dict[str, str]],
                              max_tokens: int = 128, temperature: float = 0.7,
                              stop: list[str] | None = None) -> AsyncIterator[str]:
        model = self.get_model(role)
        async for chunk in self.provider.stream_complete(model=model, messages=messages,
                                                         max_tokens=max_tokens, temperature=temperature, stop=stop):
            yield chunk

    async def embed(self, *, model: str | None = None, input: str) -> list[float]:
        embed_model = model or self.models.fast
        return await self.provider.embed(model=embed_model, input=input)

    async def healthcheck(self) -> dict:
        ok, msg = await self.provider.healthcheck()
        return {"ok": ok, "detail": msg, "provider": type(self.provider).__name__}

    async def list_models(self) -> list[str]:
        return await self.provider.list_models()

    async def close(self) -> None:
        if hasattr(self.provider, "close"):
            await self.provider.close()


def create_bus(settings: Settings) -> ModelBus:
    """Create a ModelBus from settings."""
    if settings.provider_backend == ProviderBackend.OLLAMA:
        provider = OllamaProvider(settings.ollama)
    else:
        raise ValueError(f"Unsupported provider backend: {settings.provider_backend}")
    return ModelBus(provider=provider, models=settings.models)
