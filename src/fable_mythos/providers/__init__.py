"""Model provider abstraction layer.

Defines the protocol that all providers (Ollama, OpenAI-compatible, deterministic)
must implement, plus the Message dataclass used throughout the system.
"""

from fable_mythos.providers.base import Message, ModelProvider

__all__ = ["Message", "ModelProvider"]
