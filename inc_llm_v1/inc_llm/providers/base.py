"""Base model provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class ModelProvider(ABC):
    """Abstract base class for model providers."""

    @abstractmethod
    async def complete(self, model: str, messages: list[dict[str, str]],
                       max_tokens: int = 128, temperature: float = 0.7,
                       stop: list[str] | None = None) -> dict[str, str]:
        ...

    @abstractmethod
    async def stream_complete(self, model: str, messages: list[dict[str, str]],
                              max_tokens: int = 128, temperature: float = 0.7,
                              stop: list[str] | None = None) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def embed(self, model: str, input: str) -> list[float]:
        ...

    @abstractmethod
    async def healthcheck(self) -> tuple[bool, str]:
        ...

    @abstractmethod
    async def list_models(self) -> list[str]:
        ...
