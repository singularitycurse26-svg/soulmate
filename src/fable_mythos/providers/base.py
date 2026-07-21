"""Model provider base classes and protocol definitions.

Defines the protocol that all providers (Ollama, OpenAI-compatible, deterministic)
must implement, plus the Message dataclass used throughout the system.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator, Protocol, runtime_checkable


@dataclass(slots=True)
class Message:
    """A single chat message."""

    role: str  # "system", "user", "assistant", "tool"
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@runtime_checkable
class ModelProvider(Protocol):
    """Protocol for model providers — the contract every backend must satisfy."""

    async def complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> dict[str, str]:
        """Generate a completion. Returns dict with 'content' key."""
        ...

    async def stream_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a completion, yielding text chunks."""
        ...

    async def embed(
        self,
        *,
        model: str,
        input: str,
    ) -> list[float]:
        """Generate an embedding vector for the input text."""
        ...

    async def list_models(self) -> list[str]:
        """List available models on this provider."""
        ...

    async def healthcheck(self) -> tuple[bool, str]:
        """Check if the provider is reachable. Returns (ok, message)."""
        ...


__all__ = ["Message", "ModelProvider"]
