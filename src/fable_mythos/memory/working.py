"""Working memory — context window management with sacred and compressible zones.

Manages the LLM context window by dividing it into:
- Sacred zone: System prompt, SOUL.md, MEMORY.md, active skills — never compressed
- Compressible zone: Conversation history — summarized when approaching token limit

Implements automatic context compression using the model bus to summarize old turns.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


@dataclass
class ContextTurn:
    """A single conversation turn in working memory."""

    role: str  # "system", "user", "assistant", "tool"
    content: str
    compressed: bool = False
    token_estimate: int = 0

    def as_message(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


class WorkingMemory:
    """Working memory — manages the context window with compression.

    The context window is divided into:
    - Sacred zone (35% by default): System prompt, SOUL.md, MEMORY.md, active skills
    - Compressible zone (65%): Conversation history

    When the compressible zone exceeds the threshold, old turns are summarized.
    """

    def __init__(
        self,
        max_tokens: int = 32768,
        sacred_zone_ratio: float = 0.35,
        compression_threshold: float = 0.75,
        bus: ModelBus | None = None,
    ) -> None:
        self.max_tokens = max_tokens
        self.sacred_zone_ratio = sacred_zone_ratio
        self.compression_threshold = compression_threshold
        self.bus = bus

        # Sacred zone content
        self.system_prompt: str = ""
        self.soul_content: str = ""
        self.memory_content: str = ""
        self.active_skills: list[dict[str, str]] = []  # [{"name": ..., "description": ...}]

        # Compressible zone — conversation turns
        self.turns: list[ContextTurn] = []

        # Injected context from episodic and semantic memory
        self.injected_episodes: list[dict[str, Any]] = []
        self.injected_skills: list[dict[str, Any]] = []
        self.injected_facts: list[str] = []

    @property
    def sacred_zone_tokens(self) -> int:
        """Token budget for the sacred zone."""
        return int(self.max_tokens * self.sacred_zone_ratio)

    @property
    def compressible_zone_tokens(self) -> int:
        """Token budget for the compressible zone."""
        return self.max_tokens - self.sacred_zone_tokens

    def set_system_prompt(self, prompt: str) -> None:
        """Set the base system prompt."""
        self.system_prompt = prompt

    def set_soul(self, content: str) -> None:
        """Set the SOUL.md persona content."""
        self.soul_content = content

    def set_memory(self, content: str) -> None:
        """Set the MEMORY.md durable facts content."""
        self.memory_content = content

    def add_skill(self, name: str, description: str) -> None:
        """Add an active skill to the sacred zone."""
        self.active_skills.append({"name": name, "description": description})

    def add_turn(self, role: str, content: str) -> None:
        """Add a conversation turn to the compressible zone."""
        tokens = self._estimate_tokens(content)
        self.turns.append(ContextTurn(role=role, content=content, token_estimate=tokens))

    def inject_episodes(self, episodes: list[dict[str, Any]]) -> None:
        """Inject relevant episodes from episodic memory."""
        self.injected_episodes = episodes

    def inject_skills(self, skills: list[dict[str, Any]]) -> None:
        """Inject relevant skills from semantic memory."""
        self.injected_skills = skills

    def inject_facts(self, facts: list[str]) -> None:
        """Inject durable facts."""
        self.injected_facts = facts

    def build_messages(self) -> list[dict[str, str]]:
        """Build the full message list for the model.

        Constructs the system message (sacred zone) and conversation turns
        (compressible zone), with injected context.
        """
        # Build sacred zone system message
        system_parts: list[str] = []

        if self.system_prompt:
            system_parts.append(self.system_prompt)

        if self.soul_content:
            system_parts.append(f"## Persona\n{self.soul_content}")

        if self.memory_content:
            system_parts.append(f"## Durable Facts\n{self.memory_content}")

        if self.active_skills:
            skills_text = "\n".join(
                f"- **{s['name']}**: {s['description']}" for s in self.active_skills
            )
            system_parts.append(f"## Active Skills\n{skills_text}")

        if self.injected_episodes:
            episodes_text = "\n".join(
                f"- {ep.get('task_description', 'Unknown')}: {ep.get('key_result', '')}"
                for ep in self.injected_episodes
            )
            system_parts.append(f"## Relevant Past Episodes\n{episodes_text}")

        if self.injected_skills:
            skills_text = "\n".join(
                f"- {s.get('name', 'Unknown')}: {s.get('description', '')}"
                for s in self.injected_skills
            )
            system_parts.append(f"## Relevant Skills\n{skills_text}")

        if self.injected_facts:
            facts_text = "\n".join(f"- {f}" for f in self.injected_facts)
            system_parts.append(f"## Additional Facts\n{facts_text}")

        messages: list[dict[str, str]] = []

        # System message (sacred zone)
        if system_parts:
            messages.append({"role": "system", "content": "\n\n".join(system_parts)})

        # Conversation turns (compressible zone)
        for turn in self.turns:
            messages.append(turn.as_message())

        return messages

    async def maybe_compress(self) -> bool:
        """Compress old turns if the compressible zone exceeds threshold.

        Returns:
            True if compression was performed, False otherwise.
        """
        current_tokens = sum(t.token_estimate for t in self.turns)
        threshold_tokens = int(self.compressible_zone_tokens * self.compression_threshold)

        if current_tokens <= threshold_tokens:
            return False

        logger.info(
            "Compressing working memory: %d tokens > %d threshold",
            current_tokens, threshold_tokens,
        )

        await self._compress_old_turns()
        return True

    async def _compress_old_turns(self) -> None:
        """Compress old conversation turns by summarizing them."""
        if not self.bus or len(self.turns) < 4:
            # Not enough turns to compress, or no bus available
            return

        # Keep the most recent 2 turns uncompressed
        to_compress = self.turns[:-2]
        to_keep = self.turns[-2:]

        if not to_compress:
            return

        # Build a summary of old turns
        old_text = "\n".join(f"{t.role}: {t.content}" for t in to_compress if not t.compressed)

        if not old_text.strip():
            self.turns = to_keep
            return

        try:
            response = await self.bus.complete(
                role="fast",
                messages=[{
                    "role": "user",
                    "content": (
                        "Compress this conversation history into a concise summary. "
                        "Preserve key decisions, facts, and outcomes:\n\n"
                        f"{old_text}"
                    ),
                }],
                max_tokens=300,
                temperature=0.0,
            )
            summary = response["content"]
        except Exception as e:
            logger.warning("Context compression failed: %s", e)
            return

        # Replace old turns with a single compressed summary turn
        compressed_turn = ContextTurn(
            role="system",
            content=f"[Summary of previous conversation: {summary}]",
            compressed=True,
            token_estimate=self._estimate_tokens(summary) + 20,
        )

        self.turns = [compressed_turn] + to_keep
        logger.debug("Compressed %d turns into 1 summary", len(to_compress))

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        """Estimate token count for a string.

        Uses a simple heuristic: ~4 characters per token for English text.
        """
        return max(1, len(text) // 4)

    def get_token_usage(self) -> dict[str, int]:
        """Get current token usage breakdown."""
        sacred = 0
        if self.system_prompt:
            sacred += self._estimate_tokens(self.system_prompt)
        if self.soul_content:
            sacred += self._estimate_tokens(self.soul_content)
        if self.memory_content:
            sacred += self._estimate_tokens(self.memory_content)
        for skill in self.active_skills:
            sacred += self._estimate_tokens(skill.get("description", ""))

        compressible = sum(t.token_estimate for t in self.turns)

        return {
            "sacred": sacred,
            "compressible": compressible,
            "total": sacred + compressible,
            "max": self.max_tokens,
            "sacred_budget": self.sacred_zone_tokens,
            "compressible_budget": self.compressible_zone_tokens,
        }

    def clear(self) -> None:
        """Clear all conversation turns (keep sacred zone)."""
        self.turns = []
        self.injected_episodes = []
        self.injected_skills = []
        self.injected_facts = []
