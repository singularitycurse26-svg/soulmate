"""INC-LLM-v1 harness — the core LLM wrapper.

This is the heart of INC-LLM-v1. It wraps a base model (qwen2.5) with:
- 3-layer memory system (working, episodic, semantic + knowledge graph)
- Skill creation via recursive links
- Universal recursive linking (all instances connected, learn from each other)
- Self-improving (gets smarter with every use)
- Payment gating and auth

The harness follows the same 5-model routing pattern as Fable 5 / Mythos:
  fast  → triage, routing, cheap passes
  base  → main reasoning, solving
  judge → verification, critique, consistency
  code  → code/math specialist reasoning
  style → final answer polish
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Any, AsyncIterator

from inc_llm.auth import AuthManager
from inc_llm.config import Settings
from inc_llm.memory.manager import MemoryManager
from inc_llm.payment.subscription import SubscriptionManager
from inc_llm.providers.bus import ModelBus, create_bus
from inc_llm.recursive_link.sync import PeerSyncManager
from inc_llm.recursive_link.universal import UniversalLinkManager
from inc_llm.skills.skill_factory import SkillFactory
from inc_llm.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class IncLLMHarness:
    """Main harness for INC-LLM-v1.

    Wraps a base LLM with memory, skills, recursive linking, auth, and payments.
    Every interaction makes the system smarter through:
    1. Episodic memory (stores what happened)
    2. Skill creation (abstracts patterns from episodes)
    3. Knowledge graph (recursive links between everything)
    4. Universal peer sync (shares learnings with all other instances)
    """

    SYSTEM_PROMPT = (
        "You are INC-LLM, a fast, self-improving AI assistant. "
        "You learn from every interaction and get smarter over time. "
        "Be concise and direct. Use tools when needed. "
        "Call tools with: [TOOL: name(args)]"
    )

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or Settings.from_env()
        self.bus = create_bus(self.settings)
        self.memory = MemoryManager(self.settings, bus=self.bus)
        self.skill_manager = SkillManager(self.memory)
        self.skill_factory = SkillFactory(self.bus, self.memory, self.skill_manager)
        self.auth = AuthManager(self.settings.auth)
        self.subscription = SubscriptionManager(self.settings.payment)
        self.universal_link = UniversalLinkManager(self.settings.universal_link, self.memory)
        self.peer_sync = PeerSyncManager(self.universal_link)
        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the harness — load SOUL.md, MEMORY.md, start peer sync."""
        if self._initialized:
            return
        self.memory.load_soul("You are INC-LLM-v1, a self-improving AI with persistent memory and universal recursive linking.")
        self.memory.working.set_system_prompt(self.SYSTEM_PROMPT)
        if self.settings.universal_link.enabled:
            await self.peer_sync.start()
        self._initialized = True
        logger.info("INC-LLM-v1 harness initialized (instance: %s)", self.universal_link.instance_id)

    async def chat(self, user_id: str, message: str, session_id: str | None = None,
                   is_owner: bool = False, free_access: bool = False) -> dict[str, Any]:
        """Process a chat message through the full harness pipeline.

        Pipeline:
        1. Check access (auth + payment)
        2. Prefetch context from all memory layers
        3. Add user turn to working memory
        4. Generate response via model bus
        5. Sync memory after turn (store episode, update graph)
        6. Share learning with peer network
        7. Return response
        """
        await self.initialize()

        if not self.subscription.has_access(user_id, is_owner, free_access):
            status = self.subscription.get_status(user_id)
            return {
                "status": "payment_required",
                "message": "Your free trial has ended. Please subscribe to continue.",
                "payment_instructions": self.subscription.get_payment_instructions(user_id),
                "subscription_status": status,
            }

        sid = session_id or hashlib.sha256(f"{user_id}:{time.time()}".encode()).hexdigest()[:16]

        context = await self.memory.prefetch_context(message)
        self.memory.add_turn("user", message)

        await self.memory.maybe_compress()
        messages = self.memory.build_messages()

        t0 = time.time()
        response = await self.bus.complete(role="base", messages=messages, max_tokens=128, temperature=0.7)
        elapsed = time.time() - t0
        response_text = response.get("content", "")

        self.memory.add_turn("assistant", response_text)

        episode_id = await self.memory.sync_after_turn(
            session_id=sid, query=message, result=response_text,
            success=True, execution_time_s=elapsed,
        )

        if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
            self.universal_link.share_learning(
                learning_type="episode",
                content=f"{message} -> {response_text[:200]}",
                episode_id=episode_id,
            )

        return {
            "status": "ok",
            "response": response_text,
            "model": response.get("model", ""),
            "episode_id": episode_id,
            "execution_time_s": round(elapsed, 2),
            "context_used": {
                "episodes": len(context.get("episodes", [])),
                "skills": len(context.get("skills", [])),
                "facts": len(context.get("facts", [])),
                "peer_learnings": len(context.get("peer_learnings", [])),
            },
        }

    async def chat_stream(self, user_id: str, message: str, session_id: str | None = None,
                          is_owner: bool = False, free_access: bool = False) -> AsyncIterator[str]:
        """Stream a chat response."""
        await self.initialize()

        if not self.subscription.has_access(user_id, is_owner, free_access):
            yield "[PAYMENT REQUIRED] Your free trial has ended. Please subscribe to continue."
            return

        sid = session_id or hashlib.sha256(f"{user_id}:{time.time()}".encode()).hexdigest()[:16]
        await self.memory.prefetch_context(message)
        self.memory.add_turn("user", message)
        await self.memory.maybe_compress()
        messages = self.memory.build_messages()

        full_response = ""
        t0 = time.time()
        async for chunk in self.bus.stream_complete(role="base", messages=messages, max_tokens=128, temperature=0.7):
            full_response += chunk
            yield chunk

        elapsed = time.time() - t0
        self.memory.add_turn("assistant", full_response)
        episode_id = await self.memory.sync_after_turn(
            session_id=sid, query=message, result=full_response,
            success=True, execution_time_s=elapsed,
        )

        if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
            self.universal_link.share_learning(
                learning_type="episode",
                content=f"{message} -> {full_response[:200]}",
                episode_id=episode_id,
            )

    async def learn(self, session_id: str | None = None) -> dict[str, Any]:
        """Trigger skill learning from recent episodes."""
        await self.initialize()
        result = await self.skill_factory.learn_from_recent(session_id)
        if result.get("success") and result.get("skill_name"):
            if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
                skill = self.memory.semantic.get_skill(result["skill_name"])
                if skill:
                    import json
                    self.universal_link.share_learning(
                        learning_type="skill",
                        content=json.dumps(skill.as_dict()),
                    )
        return result

    async def verify_password(self, password: str) -> dict[str, Any]:
        """Verify the secret password for free access."""
        return self.auth.authenticate_password(password)

    async def register_user(self, email: str) -> dict[str, Any]:
        """Register a new user and start their trial."""
        result = self.auth.register_user(email)
        if result["status"] == "ok":
            self.subscription.start_trial(result["user_id"])
        return result

    async def get_stats(self) -> dict[str, Any]:
        """Get comprehensive stats about the system."""
        return {
            "memory": self.memory.get_stats(),
            "universal_link": self.universal_link.get_stats(),
            "subscription": self.subscription.get_stats(),
            "peer_sync_running": self.peer_sync.is_running,
            "last_peer_sync": self.peer_sync.last_sync,
        }

    async def close(self) -> None:
        """Clean up resources."""
        await self.peer_sync.stop()
        await self.bus.close()
        logger.info("INC-LLM-v1 harness closed")
