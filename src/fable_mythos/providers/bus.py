"""5-model routing bus.

Routes requests to the appropriate model based on role:
  fast  → triage, routing, cheap passes
  base  → main reasoning, solving
  judge → verification, critique, consistency
  code  → code/math specialist reasoning
  style → final answer polish

All roles can map to the same model (minimal tier) or different models (standard/full).
The bus abstracts away which provider serves which role.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

from fable_mythos.config import ModelConfig, ProviderBackend, Settings
from fable_mythos.providers.base import ModelProvider
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.providers.ollama import OllamaProvider

logger = logging.getLogger(__name__)

# Valid roles in the 5-model bus
VALID_ROLES = ("fast", "base", "judge", "code", "style")


class ModelBus:
    """5-model routing bus — routes completions by role to the right model.

    Wraps a single provider instance and routes based on role → model mapping.
    All roles can point to the same model (minimal) or different models (standard/full).
    """

    def __init__(
        self,
        provider: ModelProvider,
        models: ModelConfig,
    ) -> None:
        self.provider = provider
        self.models = models
        self._validate_roles()

    def _validate_roles(self) -> None:
        """Ensure all model roles are configured."""
        for role in VALID_ROLES:
            model = self.models.get(role)
            if not model:
                raise ValueError(f"Model role '{role}' is not configured")

    def get_model(self, role: str) -> str:
        """Get the model name for a given role.

        Args:
            role: One of 'fast', 'base', 'judge', 'code', 'style'

        Returns:
            Model name string.

        Raises:
            KeyError: If role is not valid.
        """
        if role not in VALID_ROLES:
            raise KeyError(f"Invalid model role: '{role}'. Valid roles: {VALID_ROLES}")
        return self.models.get(role)

    async def complete(
        self,
        *,
        role: str = "base",
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> dict[str, str]:
        """Generate a completion using the model assigned to the given role.

        Args:
            role: Which model role to use (fast/base/judge/code/style)
            messages: Chat messages
            max_tokens: Max tokens to generate
            temperature: Sampling temperature
            stop: Optional stop sequences

        Returns:
            Dict with 'content' key.
        """
        model = self.get_model(role)
        logger.debug("ModelBus.complete role=%s model=%s tokens=%d temp=%.2f", role, model, max_tokens, temperature)
        return await self.provider.complete(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop,
        )

    async def stream_complete(
        self,
        *,
        role: str = "base",
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a completion using the model assigned to the given role."""
        model = self.get_model(role)
        logger.debug("ModelBus.stream role=%s model=%s", role, model)
        async for chunk in self.provider.stream_complete(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop,
        ):
            yield chunk

    async def embed(
        self,
        *,
        model: str | None = None,
        input: str,
    ) -> list[float]:
        """Generate an embedding vector.

        Args:
            model: Embedding model name. If None, uses the fast model.
            input: Text to embed

        Returns:
            Embedding vector.
        """
        embed_model = model or self.models.fast
        return await self.provider.embed(model=embed_model, input=input)

    async def healthcheck(self) -> dict[str, bool | str]:
        """Check health of the underlying provider."""
        ok, msg = await self.provider.healthcheck()
        return {"ok": ok, "detail": msg, "provider": type(self.provider).__name__}

    async def list_models(self) -> list[str]:
        """List available models from the provider."""
        return await self.provider.list_models()

    async def close(self) -> None:
        """Close the underlying provider if it has a close method."""
        if hasattr(self.provider, "close"):
            await self.provider.close()


def create_provider(settings: Settings) -> ModelProvider:
    """Create the appropriate provider based on settings.

    Args:
        settings: Framework settings

    Returns:
        A ModelProvider instance.

    Raises:
        ValueError: If the provider backend is not supported.
    """
    backend = settings.provider_backend

    if backend == ProviderBackend.DETERMINISTIC:
        logger.info("Using deterministic provider (no model required)")
        return DeterministicProvider()

    if backend == ProviderBackend.OLLAMA:
        logger.info("Using Ollama provider at %s", settings.ollama.base_url)
        return OllamaProvider(settings.ollama)

    if backend == ProviderBackend.OPENAI_COMPATIBLE:
        from fable_mythos.providers.openai_compat import OpenAICompatibleProvider

        if not settings.openai_api_key:
            raise ValueError("OpenAI-compatible provider requires openai_api_key to be set")
        logger.info("Using OpenAI-compatible provider at %s", settings.openai_base_url)
        return OpenAICompatibleProvider(
            base_url=settings.openai_base_url,
            api_key=settings.openai_api_key,
        )

    raise ValueError(f"Unsupported provider backend: {backend}")


def create_bus(settings: Settings) -> ModelBus:
    """Create a ModelBus from settings.

    Args:
        settings: Framework settings

    Returns:
        Configured ModelBus ready to use.
    """
    provider = create_provider(settings)
    return ModelBus(provider=provider, models=settings.models)
