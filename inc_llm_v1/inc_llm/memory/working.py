"""Working memory — context window management with sacred and compressible zones.

Manages the LLM context window by dividing it into:
- Sacred zone: System prompt, SOUL.md, MEMORY.md, active skills — never compressed
- Compressible zone: Conversation history — summarized when approaching token limit
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ContextTurn:
    role: str
    content: str
    compressed: bool = False
    token_estimate: int = 0

    def as_message(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


class WorkingMemory:
    """Working memory — manages the context window with compression."""

    def __init__(
        self,
        max_tokens: int = 2048,
        sacred_zone_ratio: float = 0.35,
        compression_threshold: float = 0.75,
        bus: Any = None,
    ) -> None:
        self.max_tokens = max_tokens
        self.sacred_zone_ratio = sacred_zone_ratio
        self.compression_threshold = compression_threshold
        self.bus = bus

        self.system_prompt: str = ""
        self.soul_content: str = ""
        self.memory_content: str = ""
        self.active_skills: list[dict[str, str]] = []

        self.turns: list[ContextTurn] = []
        self.injected_episodes: list[dict[str, Any]] = []
        self.injected_skills: list[dict[str, Any]] = []
        self.injected_facts: list[str] = []
        self.injected_peer_learnings: list[str] = []

    @property
    def sacred_zone_tokens(self) -> int:
        return int(self.max_tokens * self.sacred_zone_ratio)

    @property
    def compressible_zone_tokens(self) -> int:
        return self.max_tokens - self.sacred_zone_tokens

    def set_system_prompt(self, prompt: str) -> None:
        self.system_prompt = prompt

    def set_soul(self, content: str) -> None:
        self.soul_content = content

    def set_memory(self, content: str) -> None:
        self.memory_content = content

    def add_skill(self, name: str, description: str) -> None:
        self.active_skills.append({"name": name, "description": description})

    def add_turn(self, role: str, content: str) -> None:
        tokens = self._estimate_tokens(content)
        self.turns.append(ContextTurn(role=role, content=content, token_estimate=tokens))

    def inject_episodes(self, episodes: list[dict[str, Any]]) -> None:
        self.injected_episodes = episodes

    def inject_skills(self, skills: list[dict[str, Any]]) -> None:
        self.injected_skills = skills

    def inject_facts(self, facts: list[str]) -> None:
        self.injected_facts = facts

    def inject_peer_learnings(self, learnings: list[str]) -> None:
        self.injected_peer_learnings = learnings

    def build_messages(self) -> list[dict[str, str]]:
        system_parts: list[str] = []

        if self.system_prompt:
            system_parts.append(self.system_prompt)
        if self.soul_content:
            system_parts.append(f"## Persona\n{self.soul_content}")
        if self.memory_content:
            system_parts.append(f"## Durable Facts\n{self.memory_content}")
        if self.active_skills:
            skills_text = "\n".join(f"- {s['name']}: {s['description']}" for s in self.active_skills)
            system_parts.append(f"## Active Skills\n{skills_text}")
        if self.injected_episodes:
            eps_text = "\n".join(f"- {ep.get('task_description', '?')}: {ep.get('key_result', '')}" for ep in self.injected_episodes)
            system_parts.append(f"## Past Episodes\n{eps_text}")
        if self.injected_skills:
            sk_text = "\n".join(f"- {s.get('name', '?')}: {s.get('description', '')}" for s in self.injected_skills)
            system_parts.append(f"## Relevant Skills\n{sk_text}")
        if self.injected_facts:
            facts_text = "\n".join(f"- {f}" for f in self.injected_facts)
            system_parts.append(f"## Facts\n{facts_text}")
        if self.injected_peer_learnings:
            peer_text = "\n".join(f"- {p}" for p in self.injected_peer_learnings)
            system_parts.append(f"## Learned from Other Instances\n{peer_text}")

        messages: list[dict[str, str]] = []
        if system_parts:
            messages.append({"role": "system", "content": "\n\n".join(system_parts)})
        for turn in self.turns:
            messages.append(turn.as_message())
        return messages

    async def maybe_compress(self) -> bool:
        current_tokens = sum(t.token_estimate for t in self.turns)
        threshold_tokens = int(self.compressible_zone_tokens * self.compression_threshold)
        if current_tokens <= threshold_tokens:
            return False
        await self._compress_old_turns()
        return True

    async def _compress_old_turns(self) -> None:
        if not self.bus or len(self.turns) < 4:
            return
        to_compress = self.turns[:-2]
        to_keep = self.turns[-2:]
        if not to_compress:
            return
        old_text = "\n".join(f"{t.role}: {t.content}" for t in to_compress if not t.compressed)
        if not old_text.strip():
            self.turns = to_keep
            return
        try:
            response = await self.bus.complete(
                role="fast",
                messages=[{"role": "user", "content": f"Summarize concisely:\n\n{old_text}"}],
                max_tokens=200,
                temperature=0.0,
            )
            summary = response["content"]
        except Exception as e:
            logger.warning("Compression failed: %s", e)
            return
        compressed = ContextTurn(role="system", content=f"[Summary: {summary}]", compressed=True, token_estimate=self._estimate_tokens(summary) + 20)
        self.turns = [compressed] + to_keep

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(1, len(text) // 4)

    def get_token_usage(self) -> dict[str, int]:
        sacred = 0
        for s in [self.system_prompt, self.soul_content, self.memory_content]:
            if s:
                sacred += self._estimate_tokens(s)
        for skill in self.active_skills:
            sacred += self._estimate_tokens(skill.get("description", ""))
        compressible = sum(t.token_estimate for t in self.turns)
        return {"sacred": sacred, "compressible": compressible, "total": sacred + compressible, "max": self.max_tokens}

    def clear(self) -> None:
        self.turns = []
        self.injected_episodes = []
        self.injected_skills = []
        self.injected_facts = []
        self.injected_peer_learnings = []
