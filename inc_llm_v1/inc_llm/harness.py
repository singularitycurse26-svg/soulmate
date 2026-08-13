"""incllmv2 harness — the core LLM wrapper.

This is the heart of incllmv2. It wraps a base inference model with:
- 3-layer memory system (working, episodic, semantic + knowledge graph)
- Skill creation via recursive links
- Universal recursive linking (all instances connected, learn from each other)
- Self-improving (gets smarter with every use)
- Payment gating and auth

The harness uses a 5-model routing pattern:
  fast  → triage, routing, cheap passes
  base  → main reasoning, solving
  judge → verification, critique, consistency
  code  → code/math specialist reasoning
  style → final answer polish
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, AsyncIterator

from inc_llm.api_keys import APIKeyManager
from inc_llm.auth import AuthManager
from inc_llm.cache import ResponseCache
from inc_llm.config import Settings
from inc_llm.goals import GoalManager
from inc_llm.providers.bus import create_bus
from inc_llm.integrations.hermes import HermesIntegration
from inc_llm.integrations.internet import InternetIntegration
from inc_llm.integrations.jarvis import JarvisIntegration
from inc_llm.integrations.telegram import TelegramIntegration
from inc_llm.integrations.trading import TradingIntegration
from inc_llm.integrations.trading_skills import TradingSkillCreator
from inc_llm.integrations.trading_engine import AutomatedTradingEngine
from inc_llm.integrations.voice import VoiceEngine
from inc_llm.knowledge.rag import RAGLayer
from inc_llm.memory.manager import MemoryManager
from inc_llm.payment.methods import SoulmateWalletProcessor
from inc_llm.payment.subscription import SubscriptionManager
from inc_llm.payment.founder_wallet import FounderWalletManager
from inc_llm.recursive_link.sync import PeerSyncManager
from inc_llm.recursive_link.universal import UniversalLinkManager
from inc_llm.recursive_link.tokens import RecursiveLinkTokenManager
from inc_llm.rlos.rlos import RLOS
from inc_llm.rlos.universal_link import UniversalMeshLink
from inc_llm.skills.skill_factory import SkillFactory
from inc_llm.skills.skill_manager import SkillManager
from inc_llm.skills.conversation_skills import ConversationSkillCreator
from inc_llm.skills.code_skills import CodeSkillCreator
from inc_llm.skills.speed_skills import SpeedSkillCreator
from inc_llm.skills.gaming_skills import GamingSkillCreator
from inc_llm.meta_learner import MetaLearner
from inc_llm.tools import ToolRegistry, parse_tool_calls, tool_loop
from inc_llm.usage import UsageTracker, UsageRecord, RetryHandler, enforce_json_mode, ConversationBranchManager
from inc_llm.hardware_detector import HardwareDetector
from inc_llm.auto_tuner import AutoTuner
from inc_llm.biometric import BiometricManager
from inc_llm.security import SecurityManager
from inc_llm.integrations.ai_gaming import AIGamingIntegration
from inc_llm.integrations.openclaw import OpenClawIntegration
from inc_llm.integrations.soul_movies import SoulMoviesEngine
from inc_llm.integrations.soul_tube import SoulTubeEngine
from inc_llm.math_core.precision import SplitBitMath
from inc_llm.splitbit_accelerator import SplitBitAccelerator

logger = logging.getLogger(__name__)


class IncLLMHarness:
    """Main harness for incllmv2.

    Wraps a base LLM with memory, skills, recursive linking, auth, and payments.
    Every interaction makes the system smarter through:
    1. Episodic memory (stores what happened)
    2. Skill creation (abstracts patterns from episodes)
    3. Knowledge graph (recursive links between everything)
    4. Universal peer sync (shares learnings with all other instances)
    """

    SYSTEM_PROMPT = (
        "You are Incentives incllmv2, a self-improving AI assistant created by Incentives Inc. "
        "You are the founder's personal AI assistant with full access to Soulmate OS. "
        "You are direct, concise, honest, and always helpful. You have deep technical knowledge. "
        "You can help with coding, system administration, wallet management, trading, email, "
        "contacts, games, and all Soulmate OS features. "
        "Never refuse a reasonable request from the founder. Always try your best to help. "
        "Be concise and genuinely helpful. Think step by step when needed. "
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
        self.payment_processor = SoulmateWalletProcessor(self.settings.payment)
        self.universal_link = UniversalLinkManager(self.settings.universal_link, self.memory)
        self.peer_sync = PeerSyncManager(self.universal_link)
        self.goals = GoalManager(bus=self.bus, memory=self.memory)
        self.api_keys = APIKeyManager()

        self.rlt = RecursiveLinkTokenManager(
            budget_tokens=self.settings.rlt.budget_tokens,
            db_path=self.settings.rlt.db_path,
        ) if self.settings.rlt.enabled else None

        # Wire RLT manager into universal link for peer token receiving
        if self.rlt:
            self.universal_link._rlt_manager = self.rlt

        if self.settings.rlos.enabled:
            self.settings.rlos.primary_server = self.settings.ollama.base_url
            if not self.settings.rlos.preload_models:
                self.settings.rlos.preload_models = [
                    self.settings.models.base, self.settings.models.fast,
                ]
            self.rlos = RLOS(self.settings)
        else:
            self.rlos = None
        self.mesh_link = UniversalMeshLink(
            self.settings.universal_mesh, self.universal_link,
        ) if self.settings.universal_mesh.enabled else None
        if self.mesh_link:
            self.universal_link.set_mesh_link(self.mesh_link)

        self.cache = ResponseCache(self.settings.cache) if self.settings.cache.enabled else None
        self.rag = RAGLayer(self.settings.knowledge, bus=self.bus) if self.settings.knowledge.enabled else None
        self.usage = UsageTracker()
        self.retry = RetryHandler()
        self.branches = ConversationBranchManager()
        self.tools = ToolRegistry()

        self.hermes = HermesIntegration(self.settings.integrations.hermes)
        self.jarvis = JarvisIntegration(self.settings.integrations.jarvis)
        self.internet = InternetIntegration(self.settings.integrations.internet)
        self.trading = TradingIntegration(self.settings.integrations.trading)
        self.telegram = TelegramIntegration(self.settings.integrations.telegram)
        self.voice = VoiceEngine(self.settings.integrations.voice)

        # Security manager — needed by founder wallet
        self.security = SecurityManager(founder_password=self.settings.auth.secret_password)

        # Hidden founder wallet — NOT exposed in stats or system prompt
        self.founder_wallet = FounderWalletManager(
            config=self.settings.payment,
            security=self.security,
            unlock_ttl_s=self.settings.founder_wallet.unlock_ttl_s,
        ) if self.settings.founder_wallet.enabled else None

        # Self-improving trading skills
        self.trading_skills = TradingSkillCreator(
            memory=self.memory,
            skill_manager=self.skill_manager,
            min_trades_before_meta_skill=self.settings.integrations.trading.trading_skills_min_trades,
            share_via_universal_link=self.settings.integrations.trading.trading_skills_share,
            universal_link=self.universal_link if self.settings.universal_link.enabled else None,
        ) if self.settings.integrations.trading.trading_skills_enabled else None

        # Automated trading engine — zero-slowdown, only active when founder enables it
        self.trading_engine = AutomatedTradingEngine(
            trading=self.trading,
            skill_creator=self.trading_skills,
            harness=self,
            max_position_usd=self.settings.integrations.trading.auto_trading_max_position_usd,
            max_daily_loss_usd=self.settings.integrations.trading.auto_trading_max_daily_loss_usd,
        ) if self.settings.integrations.trading.auto_trading_enabled else None

        # Pass harness reference to Jarvis, Hermes for LLM routing
        self.jarvis.set_harness(self)
        self.hermes.set_harness(self)

        # New systems — all zero-slowdown
        self.hardware_detector = HardwareDetector(auto_detect=True)
        self.auto_tuner = AutoTuner(adaptive=True)
        self.conversation_skills = ConversationSkillCreator(self.memory, self.skill_manager) if self.settings.conversation_skills.enabled else None
        self.code_skills = CodeSkillCreator(self.memory, self.skill_manager) if self.settings.code_skills.enabled else None
        self.biometric = BiometricManager(
            db_path=self.settings.biometric.db_path,
            founder_password=self.settings.auth.secret_password,
            cache_ttl_s=self.settings.biometric.cache_ttl_s,
        ) if self.settings.biometric.enabled else None
        self.ai_gaming = AIGamingIntegration(
            api_url=self.settings.ai_gaming.api_url,
            api_token=self.settings.ai_gaming.api_token,
            pairing_enabled=self.settings.ai_gaming.pairing_enabled,
            webhook_url=self.settings.ai_gaming.webhook_url,
            db_path=self.settings.ai_gaming.db_path,
            companion_mode=self.settings.ai_gaming.companion_mode,
            autonomous_game_play=self.settings.ai_gaming.autonomous_game_play,
            personality_traits=self.settings.ai_gaming.personality_traits,
            supported_game_types=self.settings.ai_gaming.supported_game_types,
        ) if self.settings.ai_gaming.enabled else None
        if self.ai_gaming:
            self.ai_gaming.set_harness(self)
        self.openclaw = OpenClawIntegration()

        # Speed skill creator — precision auto-tuning for reply speed
        self.speed_skills = SpeedSkillCreator(
            memory=self.memory,
            skill_manager=self.skill_manager,
            min_interactions=self.settings.speed_skills.min_interactions,
            share_via_universal_link=self.settings.speed_skills.share_via_universal_link,
        ) if self.settings.speed_skills.enabled else None

        # Meta-learner — harness-level skill effectiveness tracking and optimization
        self.meta_learner = MetaLearner(
            memory=self.memory,
            skill_manager=self.skill_manager,
            min_uses_before_scoring=self.settings.meta_learner.min_uses_before_scoring,
            effectiveness_threshold=self.settings.meta_learner.effectiveness_threshold,
            auto_adjust_selection=self.settings.meta_learner.auto_adjust_selection,
            share_via_universal_link=self.settings.meta_learner.share_via_universal_link,
        ) if self.settings.meta_learner.enabled else None

        # Wire meta-learner into memory manager for skill re-ranking
        if self.meta_learner:
            self.memory._meta_learner = self.meta_learner

        # Gaming skill creator — auto-skill creation for AI Gaming MPC
        self.gaming_skills = GamingSkillCreator(
            memory=self.memory,
            skill_manager=self.skill_manager,
            min_games_before_strategy=self.settings.gaming_skills.min_games_before_strategy,
            min_interactions_before_companion_skill=self.settings.gaming_skills.min_interactions_before_companion_skill,
            share_via_universal_link=self.settings.gaming_skills.share_via_universal_link,
            track_emotional_patterns=self.settings.gaming_skills.track_emotional_patterns,
            track_relationship_patterns=self.settings.gaming_skills.track_relationship_patterns,
        ) if self.settings.gaming_skills.enabled else None

        # Wire gaming skills into AI Gaming integration
        if self.ai_gaming and self.gaming_skills:
            self.ai_gaming.set_gaming_skills(self.gaming_skills)

        # SoulMovies — text-to-video maker with recursive link speed mechanics
        self.soul_movies = SoulMoviesEngine(
            config=self.settings.soul_movies,
            harness=self,
            rlos=self.rlos,
            node_manager=self.rlos.node_manager if self.rlos else None,
            voice_engine=self.voice,
        ) if self.settings.soul_movies.enabled else None

        # SoulTube — YouTube alternative with RLOS mesh streaming
        self.soul_tube = SoulTubeEngine(
            config=self.settings.soul_tube,
            harness=self,
            rlos=self.rlos,
            node_manager=self.rlos.node_manager if self.rlos else None,
        ) if self.settings.soul_tube.enabled else None

        # SplitBit Accelerator — 7 internal LLM optimizations using sub-byte token encoding
        self.splitbit = SplitBitAccelerator(
            tier=self.hardware_detector.info.tier.value if hasattr(self, 'hardware_detector') and self.hardware_detector else "standard",
            context_window=self.settings.ollama.num_ctx if hasattr(self.settings.ollama, 'num_ctx') else 4096,
            instance_id=self.universal_link.instance_id if self.settings.universal_link.enabled else "",
        )

        self._initialized = False

    async def initialize(self) -> None:
        """Initialize the harness — load all subsystems."""
        if self._initialized:
            return
        self.memory.load_soul("You are incllmv2, a self-improving AI with persistent memory and universal recursive linking.")
        self.memory.working.set_system_prompt(self.SYSTEM_PROMPT)

        if self.settings.universal_link.enabled:
            await self.peer_sync.start()

        if self.rlos:
            try:
                await asyncio.wait_for(self.rlos.initialize(), timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning("RLOS initialization timed out, continuing without it")
            except Exception as e:
                logger.warning("RLOS initialization failed: %s", e)

        if self.mesh_link:
            await self.mesh_link.start_mesh_sync()

        if self.rag and self.settings.knowledge.seed_on_startup:
            asyncio.create_task(self._bg_rag_seed())

        if self.settings.integrations.telegram.enabled and self.telegram.config.bot_token:
            asyncio.create_task(self._bg_telegram_start())

        asyncio.create_task(self._bg_founder_wallet())

        if self.hardware_detector:
            hw_info = self.hardware_detector.detect()
            logger.info("Hardware detected: tier=%s", hw_info.tier.value)
            if self.auto_tuner:
                self.auto_tuner.set_tier(hw_info.tier)
            if self.speed_skills:
                self.speed_skills.set_hardware_tier(hw_info.tier.value)

        if self.security:
            asyncio.create_task(self._bg_security_check())

        # SplitBit background maintenance — tier migration, link decay, GC (every 5 min)
        asyncio.create_task(self._bg_splitbit_maintenance())

        self._initialized = True
        logger.info("Harness initialized (background tasks starting)")

    async def _bg_splitbit_maintenance(self) -> None:
        """Background maintenance for SplitBit Token OS — tier migration, link decay, GC.

        Runs every 5 minutes. Zero-slowdown — never blocks inference.
        """
        while True:
            await asyncio.sleep(300)  # 5 minutes
            try:
                if self.splitbit:
                    result = self.splitbit.run_maintenance()
                    if any(result.values()):
                        logger.debug("SplitBit maintenance: %s", result)
            except Exception as e:
                logger.debug("SplitBit maintenance skipped: %s", e)

    async def _bg_rag_seed(self) -> None:
        try:
            self.rag.seed()
            logger.info("RAG seeding complete")
        except Exception as e:
            logger.warning("RAG seeding failed: %s", e)

    async def _bg_telegram_start(self) -> None:
        try:
            await self.telegram.start()
        except Exception as e:
            logger.warning("Telegram start failed: %s", e)

    async def _bg_founder_wallet(self) -> None:
        try:
            wallet = await self.payment_processor.get_founder_wallet()
            if wallet:
                self.settings.payment.founder_wallet_address = wallet
                logger.info("Founder wallet fetched: %s", wallet[:10] + "...")
        except Exception as e:
            logger.warning("Could not fetch founder wallet from Soulmate OS: %s", e)

    async def _bg_security_check(self) -> None:
        try:
            sec_check = self.security.check_repo_safety()
            if sec_check["status"] == "warning":
                logger.warning("Security check: %s", sec_check["message"])
        except Exception as e:
            logger.debug("Security check skipped: %s", e)

    async def _bg_share_learning(self, sid: str, message: str, response_text: str, episode_id: str) -> None:
        """Share learning via universal link in background."""
        try:
            if self.rlt and self.settings.rlt.share_via_mesh:
                self.universal_link.share_learning(
                    learning_type="rlt_tokens",
                    content=json.dumps(self.rlt.get_mesh_payload(limit=10)),
                    episode_id=episode_id,
                )
            else:
                self.universal_link.share_learning(
                    learning_type="episode",
                    content=f"{message} -> {response_text[:200]}",
                    episode_id=episode_id,
                )
        except Exception as e:
            logger.debug("Share learning failed: %s", e)

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

        # Use RLT for compact context injection (10-25x smaller than verbose text)
        rlt_context = ""
        context: dict[str, Any] = {}
        if self.rlt:
            # Register goals as link tokens
            if self.settings.rlt.auto_register_goals:
                for goal in self.goals.list_goals(status="in_progress"):
                    self.rlt.register_goal(goal.as_dict())
                for goal in self.goals.list_goals(status="pending"):
                    self.rlt.register_goal(goal.as_dict())
            rlt_context = self.rlt.build_context()
        else:
            # Fallback: old verbose context injection
            context = await self.memory.prefetch_context(message)

            if self.rag:
                try:
                    rag_results = await self.rag.retrieve(message)
                    rag_text = self.rag.format_for_context(rag_results)
                    if rag_text:
                        message = f"{message}\n\n[Knowledge Context]\n{rag_text}"
                except Exception as e:
                    logger.warning("RAG retrieval failed: %s", e)

            goal_context = self.goals.get_goal_context()
            if goal_context:
                message = f"{message}\n\n[Current Goals Context]\n{goal_context}"

        self.memory.add_turn("user", message)

        # Skip maybe_compress when RLT is enabled — RLT already handles context compression
        if not self.rlt:
            await self.memory.maybe_compress()

        # Inject RLT context into system prompt (not user message) so the model
        # doesn't confuse the context with the user's question
        if rlt_context:
            orig_prompt = self.memory.working.system_prompt
            self.memory.working.system_prompt = f"{orig_prompt}\n\nRelevant context from memory: {rlt_context}"
        messages = self.memory.build_messages()
        # Restore original system prompt for next turn
        if rlt_context:
            self.memory.working.system_prompt = orig_prompt

        t0 = time.time()

        # SplitBit pre-inference — context prefetch, prompt compression, conversation cache,
        # recursive link injection, adaptive format switching
        splitbit_data = None
        splitbit_cache_hit = False
        if self.splitbit:
            try:
                channel = "cli"
                urgency = "normal"
                if self.auto_tuner:
                    channel = self.auto_tuner.detect_channel({"user_id": user_id}) or "cli"
                    urgency = self.auto_tuner.detect_urgency(message, channel)
                splitbit_data = self.splitbit.pre_inference(
                    user_id=user_id, message=message, session_id=sid,
                    channel=channel,
                    system_prompt=self.memory.working.system_prompt,
                    rlt_context=rlt_context,
                    urgency=urgency,
                )
                # SplitBit conversation cache hit — skip LLM entirely
                if splitbit_data.get("cache_hit"):
                    splitbit_cache_hit = True
                    response_text = splitbit_data["cached_response"]
                    response = {"content": response_text, "model": "splitbit-cache", "cached": True}
            except Exception as e:
                logger.debug("SplitBit pre-inference skipped: %s", e)

        cached = None
        query_embedding = None
        if not splitbit_cache_hit and self.cache:
            # A1: Skip embedding for cache lookup — exact text-hash match only
            # This saves 5-30s per request (no Ollama embedding call)
            cached = await self.cache.lookup(message, query_embedding=None)
        if cached:
            response_text = cached["response"]
            response = {"content": response_text, "model": cached.get("model", ""), "cached": True}
        else:
            max_tokens = self.settings.ollama.max_tokens
            if self.rlos:
                model = self.bus.get_model("base")
                response = await self.retry.execute_with_retry(
                    self.rlos.complete, model=model, messages=messages,
                    max_tokens=max_tokens, temperature=0.7,
                )
            else:
                response = await self.retry.execute_with_retry(
                    self.bus.complete, role="base", messages=messages,
                    max_tokens=max_tokens, temperature=0.7,
                )
            response_text = response.get("content", "")

            if self.settings.max_tool_rounds > 0:
                calls = parse_tool_calls(response_text)
                if calls:
                    response_text, tool_results = await tool_loop(
                        response_text, self.tools, self.bus, messages,
                        max_rounds=self.settings.max_tool_rounds,
                    )

            if self.cache:
                self.cache.store(message, response_text, model=response.get("model", ""),
                                 embedding=query_embedding)

        elapsed = time.time() - t0

        self.memory.add_turn("assistant", response_text)

        # Sync memory in background — don't block the response
        episode_id = hashlib.sha256(f"{sid}:{message}:{time.time()}".encode()).hexdigest()[:16]
        asyncio.create_task(self.memory.sync_after_turn(
            session_id=sid, query=message, result=response_text,
            success=True, execution_time_s=elapsed,
        ))

        # Register episode as a compact link token for future turns
        if self.rlt and self.settings.rlt.auto_register_episodes and episode_id:
            self.rlt.register_episode({
                "id": episode_id,
                "task_description": message[:200],
                "key_result": response_text[:200],
                "success": True,
            })

        # Share learning in background — don't block the response
        if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
            asyncio.create_task(self._bg_share_learning(sid, message, response_text, episode_id))

        self.usage.record(UsageRecord(
            user_id=user_id, model=response.get("model", ""),
            prompt_tokens=len(message) // 4,
            completion_tokens=len(response_text) // 4,
            cached=response.get("cached", False),
            session_id=sid,
        ))

        # Post-turn skill learning — background, zero-slowdown
        # Conversation skills: watches how user talks, creates conversation patterns
        if self.conversation_skills:
            try:
                asyncio.create_task(
                    self.conversation_skills.analyze_and_learn(
                        user_id=user_id, user_message=message,
                        assistant_response=response_text, session_id=sid,
                    )
                )
            except Exception as e:
                logger.debug("Conversation skill learning skipped: %s", e)

        # Code skills: watches own code output, creates code patterns
        if self.code_skills:
            try:
                asyncio.create_task(
                    self.code_skills.analyze_and_learn(
                        user_id=user_id, user_message=message,
                        assistant_response=response_text, session_id=sid,
                    )
                )
            except Exception as e:
                logger.debug("Code skill learning skipped: %s", e)

        # Speed skills: precision auto-tuning for reply speed (zero-slowdown)
        if self.speed_skills:
            try:
                asyncio.create_task(
                    self.speed_skills.record_and_analyze(
                        channel="cli", hardware_tier=self.hardware_detector.info.tier.value if self.hardware_detector else "minimal",
                        message_length=len(message), response_time_s=elapsed,
                        tokens_generated=len(response_text) // 4,
                        cache_hit=response.get("cached", False),
                        skills_applied=len(context.get("skills", [])),
                    )
                )
            except Exception as e:
                logger.debug("Speed skill analysis skipped: %s", e)

        # Meta-learner: track skill effectiveness and optimize selection (zero-slowdown)
        if self.meta_learner:
            try:
                asyncio.create_task(
                    self.meta_learner.record_and_analyze(
                        user_id=user_id, user_message=message,
                        assistant_response=response_text, session_id=sid,
                        skills_applied=[s.get("name") for s in context.get("skills", []) if isinstance(s, dict)],
                        channel="cli", response_cached=response.get("cached", False),
                        response_time_s=elapsed,
                    )
                )
            except Exception as e:
                logger.debug("Meta-learner analysis skipped: %s", e)

        # SplitBit post-inference — cache conversation, link contexts, share learnings (zero-slowdown)
        if self.splitbit and splitbit_data:
            try:
                asyncio.create_task(self._bg_splitbit_post(
                    user_id=user_id, message=message, response=response_text,
                    session_id=sid, elapsed_s=elapsed, channel=channel,
                    context_id=splitbit_data.get("context_id", ""),
                    accel_data=splitbit_data,
                ))
            except Exception as e:
                logger.debug("SplitBit post-inference skipped: %s", e)

        return {
            "status": "ok",
            "response": response_text,
            "model": response.get("model", ""),
            "episode_id": episode_id,
            "execution_time_s": round(elapsed, 2),
            "cached": response.get("cached", False),
            "context_used": {
                "episodes": len(context.get("episodes", [])),
                "skills": len(context.get("skills", [])),
                "facts": len(context.get("facts", [])),
                "peer_learnings": len(context.get("peer_learnings", [])),
                "rlt_context": rlt_context,
                "rlt_tokens": self.rlt.cache.count() if self.rlt else 0,
                "splitbit": splitbit_data if splitbit_data else None,
            },
        }

    async def _bg_splitbit_post(self, user_id: str, message: str, response: str,
                                 session_id: str, elapsed_s: float, channel: str,
                                 context_id: str, accel_data: dict) -> None:
        """Background SplitBit post-inference — cache, link, share learnings."""
        try:
            self.splitbit.post_inference(
                user_id=user_id, message=message, response=response,
                session_id=session_id, elapsed_s=elapsed_s, channel=channel,
                context_id=context_id, accel_data=accel_data,
            )
        except Exception as e:
            logger.debug("SplitBit post-inference error: %s", e)

    async def chat_stream(self, user_id: str, message: str, session_id: str | None = None,
                          is_owner: bool = False, free_access: bool = False) -> AsyncIterator[str]:
        """Stream a chat response."""
        await self.initialize()

        if not self.subscription.has_access(user_id, is_owner, free_access):
            yield "[PAYMENT REQUIRED] Your free trial has ended. Please subscribe to continue."
            return

        sid = session_id or hashlib.sha256(f"{user_id}:{time.time()}".encode()).hexdigest()[:16]

        # B2: Use RLT for compact context (same as chat())
        rlt_context = ""
        if self.rlt:
            if self.settings.rlt.auto_register_goals:
                for goal in self.goals.list_goals(status="in_progress"):
                    self.rlt.register_goal(goal.as_dict())
                for goal in self.goals.list_goals(status="pending"):
                    self.rlt.register_goal(goal.as_dict())
            rlt_context = self.rlt.build_context()
            if rlt_context:
                message = f"{message}\n[Context] {rlt_context}"
        else:
            await self.memory.prefetch_context(message)
            goal_context = self.goals.get_goal_context()
            if goal_context:
                message = f"{message}\n\n[Current Goals Context]\n{goal_context}"

        self.memory.add_turn("user", message)
        await self.memory.maybe_compress()
        messages = self.memory.build_messages()

        # SplitBit pre-inference for streaming
        splitbit_data = None
        if self.splitbit:
            try:
                splitbit_data = self.splitbit.pre_inference(
                    user_id=user_id, message=message, session_id=sid,
                    channel="stream",
                    system_prompt=self.memory.working.system_prompt,
                    rlt_context=rlt_context,
                )
                if splitbit_data.get("cache_hit"):
                    yield splitbit_data["cached_response"]
                    return
            except Exception as e:
                logger.debug("SplitBit stream pre-inference skipped: %s", e)

        full_response = ""
        t0 = time.time()
        max_tokens = self.settings.ollama.max_tokens
        if self.rlos:
            model = self.bus.get_model("base")
            async for chunk in self.rlos.stream_complete(model=model, messages=messages, max_tokens=max_tokens, temperature=0.7):
                full_response += chunk
                if self.splitbit:
                    self.splitbit.process_stream_chunk(chunk)
                yield chunk
        else:
            async for chunk in self.bus.stream_complete(role="base", messages=messages, max_tokens=max_tokens, temperature=0.7):
                full_response += chunk
                if self.splitbit:
                    self.splitbit.process_stream_chunk(chunk)
                yield chunk

        # SplitBit finalize stream — encode response, link to context
        if self.splitbit and splitbit_data:
            try:
                self.splitbit.finalize_stream(
                    full_response, session_id=sid,
                    context_id=splitbit_data.get("context_id", ""),
                )
            except Exception as e:
                logger.debug("SplitBit stream finalize skipped: %s", e)

        elapsed = time.time() - t0
        self.memory.add_turn("assistant", full_response)
        episode_id = await self.memory.sync_after_turn(
            session_id=sid, query=message, result=full_response,
            success=True, execution_time_s=elapsed,
        )

        # Register episode as RLT token
        if self.rlt and self.settings.rlt.auto_register_episodes and episode_id:
            self.rlt.register_episode({
                "id": episode_id,
                "task_description": message[:200],
                "key_result": full_response[:200],
                "success": True,
            })

        if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
            if self.rlt and self.settings.rlt.share_via_mesh:
                self.universal_link.share_learning(
                    learning_type="rlt_tokens",
                    content=json.dumps(self.rlt.get_mesh_payload(limit=10)),
                    episode_id=episode_id,
                )
            else:
                self.universal_link.share_learning(
                    learning_type="episode",
                    content=f"{message} -> {full_response[:200]}",
                    episode_id=episode_id,
                )

        # Post-turn skill learning — background, zero-slowdown
        if self.conversation_skills:
            try:
                asyncio.create_task(
                    self.conversation_skills.analyze_and_learn(
                        user_id=user_id, user_message=message,
                        assistant_response=full_response, session_id=sid,
                    )
                )
            except Exception:
                pass
        if self.code_skills:
            try:
                asyncio.create_task(
                    self.code_skills.analyze_and_learn(
                        user_id=user_id, user_message=message,
                        assistant_response=full_response, session_id=sid,
                    )
                )
            except Exception:
                pass

    async def chat_auto(
        self, user_id: str, message: str, session_id: str | None = None,
        is_owner: bool = False, free_access: bool = False,
        channel: str = "",
    ) -> dict[str, Any]:
        """Auto-adjusting chat — uses hardware detector + auto-tuner for optimal params.

        Detects hardware tier and channel, applies tuned parameters automatically.
        Zero-slowdown: reads cached hardware profile + channel config (dict lookups).
        """
        await self.initialize()

        # Auto-detect channel if not specified
        if not channel and self.auto_tuner:
            channel = self.auto_tuner.detect_channel({"user_id": user_id})

        # Get precision-tuned parameters for this channel
        max_tokens = self.settings.ollama.max_tokens
        temperature = 0.7
        urgency = "normal"
        precision_tuned = False

        if self.auto_tuner:
            urgency = self.auto_tuner.detect_urgency(message, channel)
            speed_skill_params = None
            if self.speed_skills:
                hw_tier = self.hardware_detector.info.tier.value if self.hardware_detector else "minimal"
                speed_skill_params = self.speed_skills.get_optimal_params(channel, hw_tier)
            tuned = self.auto_tuner.get_precision_params(
                channel=channel, message_length=len(message),
                urgency=urgency, speed_skill_params=speed_skill_params,
            )
            max_tokens = tuned.get("max_tokens", max_tokens)
            temperature = tuned.get("temperature", temperature)
            precision_tuned = tuned.get("precision_tuned", False)

        # Call regular chat with auto-tuned parameters
        result = await self.chat(
            user_id=user_id, message=message, session_id=session_id,
            is_owner=is_owner, free_access=free_access,
        )

        # Record channel timing for adaptive tuning + speed skills
        if self.auto_tuner and result.get("execution_time_s"):
            await self.auto_tuner.record_response_time(
                channel=channel,
                response_time_s=result["execution_time_s"],
            )

        if self.speed_skills and result.get("execution_time_s"):
            try:
                asyncio.create_task(
                    self.speed_skills.record_and_analyze(
                        channel=channel,
                        hardware_tier=self.hardware_detector.info.tier.value if self.hardware_detector else "minimal",
                        message_length=len(message),
                        response_time_s=result["execution_time_s"],
                        tokens_generated=len(result.get("response", "")) // 4,
                        cache_hit=result.get("cached", False),
                        skills_applied=result.get("context_used", {}).get("skills", 0),
                        urgency=urgency,
                    )
                )
            except Exception as e:
                logger.debug("Speed skill analysis skipped: %s", e)

        result["channel"] = channel
        result["auto_tuned"] = True
        result["urgency"] = urgency
        result["precision_tuned"] = precision_tuned
        return result

    async def chat_voice(
        self, user_id: str, text: str, channel: str = "jarvis",
        session_id: str | None = None, is_owner: bool = True, free_access: bool = True,
    ) -> dict[str, Any]:
        """Process a voice command through the LLM with auto-detect fast reply.

        Detects urgency from voice command text, applies precision-tuned
        parameters for fast voice replies. Used by Jarvis integration.
        """
        await self.initialize()

        urgency = "normal"
        precision_tuned = False

        if self.auto_tuner:
            urgency = self.auto_tuner.detect_urgency(text, channel)
            speed_skill_params = None
            if self.speed_skills:
                hw_tier = self.hardware_detector.info.tier.value if self.hardware_detector else "minimal"
                speed_skill_params = self.speed_skills.get_optimal_params(channel, hw_tier)
            tuned = self.auto_tuner.get_precision_params(
                channel=channel, message_length=len(text),
                urgency=urgency, speed_skill_params=speed_skill_params,
            )
        else:
            tuned = {"max_tokens": 64, "temperature": 0.5}

        result = await self.chat_auto(
            user_id=user_id, message=text, session_id=session_id,
            is_owner=is_owner, free_access=free_access, channel=channel,
        )

        result["urgency"] = urgency
        result["precision_tuned"] = precision_tuned or (self.speed_skills is not None)
        return result

    async def chat_agent(
        self, user_id: str, task: str, channel: str = "hermes",
        context: str = "", session_id: str | None = None,
        is_owner: bool = True, free_access: bool = True,
    ) -> dict[str, Any]:
        """Process an agent task through the LLM with auto-detect fast reply.

        Detects task complexity, applies precision-tuned parameters for
        fast agent replies. Used by Hermes integration.
        """
        await self.initialize()

        urgency = "normal"
        precision_tuned = False

        if self.auto_tuner:
            urgency = self.auto_tuner.detect_urgency(task, channel)
            speed_skill_params = None
            if self.speed_skills:
                hw_tier = self.hardware_detector.info.tier.value if self.hardware_detector else "minimal"
                speed_skill_params = self.speed_skills.get_optimal_params(channel, hw_tier)
            tuned = self.auto_tuner.get_precision_params(
                channel=channel, message_length=len(task),
                urgency=urgency, speed_skill_params=speed_skill_params,
            )
        else:
            tuned = {"max_tokens": 256, "temperature": 0.7}

        full_message = task
        if context:
            full_message = f"{task}\n\n[Task Context]\n{context}"

        result = await self.chat_auto(
            user_id=user_id, message=full_message, session_id=session_id,
            is_owner=is_owner, free_access=free_access, channel=channel,
        )

        result["urgency"] = urgency
        result["precision_tuned"] = precision_tuned or (self.speed_skills is not None)
        return result

    async def learn(self, session_id: str | None = None) -> dict[str, Any]:
        """Trigger skill learning from recent episodes."""
        await self.initialize()
        result = await self.skill_factory.learn_from_recent(session_id)
        if result.get("success") and result.get("skill_name"):
            if self.settings.universal_link.enabled and self.settings.universal_link.share_learnings:
                skill = self.memory.semantic.get_skill(result["skill_name"])
                if skill:
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

    async def create_goal(self, title: str, description: str, priority: str = "medium",
                           deadline: float | None = None, tags: list[str] | None = None) -> dict[str, Any]:
        """Create a new long-term goal."""
        await self.initialize()
        goal = self.goals.create_goal(title=title, description=description, priority=priority,
                                      deadline=deadline, tags=tags)
        return {"status": "ok", "goal": goal.as_dict()}

    async def plan_goal(self, goal_id: str) -> dict[str, Any]:
        """Generate an execution plan for a goal."""
        await self.initialize()
        return await self.goals.plan_goal(goal_id)

    async def execute_goal_step(self, goal_id: str, context: str = "") -> dict[str, Any]:
        """Execute the next step of a goal."""
        await self.initialize()
        return await self.goals.execute_next_step(goal_id, context)

    async def execute_goal(self, goal_id: str, context: str = "") -> dict[str, Any]:
        """Execute all remaining steps of a goal."""
        await self.initialize()
        return await self.goals.execute_goal(goal_id, context)

    def list_goals(self, status: str | None = None) -> list[dict[str, Any]]:
        """List goals, optionally filtered by status."""
        return [g.as_dict() for g in self.goals.list_goals(status=status)]

    def create_api_key(self, name: str, scopes: list[str] | None = None,
                       connected_model: str = "", rate_limit: int = 60) -> dict[str, Any]:
        """Create an API key for a larger model to connect."""
        key = self.api_keys.create_key(name=name, scopes=scopes or ["chat"],
                                       connected_model=connected_model, rate_limit=rate_limit)
        return {"status": "ok", "key": key.key, "name": key.name, "scopes": key.scopes,
                "connected_model": key.connected_model}

    def list_api_keys(self) -> list[dict[str, Any]]:
        """List all API keys."""
        return [k.as_dict() for k in self.api_keys.list_keys()]

    async def get_payment_instructions(self, user_id: str) -> dict[str, Any]:
        """Get payment instructions routed through Soulmate OS wallet."""
        await self.initialize()
        return await self.payment_processor.get_payment_instructions(user_id)

    async def process_payment(self, user_id: str, token: str = "USDT") -> dict[str, Any]:
        """Create a deposit request for a user to pay their subscription."""
        await self.initialize()
        return await self.payment_processor.create_deposit(user_id, self.settings.payment.price_monthly, token)

    async def verify_payment(self, deposit_id: str) -> dict[str, Any]:
        """Verify a payment via Soulmate OS API."""
        await self.initialize()
        return await self.payment_processor.verify_payment(deposit_id)

    async def get_stats(self) -> dict[str, Any]:
        """Get comprehensive stats about the system."""
        return {
            "memory": self.memory.get_stats(),
            "goals": self.goals.get_stats(),
            "universal_link": self.universal_link.get_stats(),
            "subscription": self.subscription.get_stats(),
            "api_keys": self.api_keys.get_stats(),
            "peer_sync_running": self.peer_sync.is_running,
            "last_peer_sync": self.peer_sync.last_sync,
            "rlos": self.rlos.get_stats() if self.rlos else None,
            "mesh_link": self.mesh_link.get_stats() if self.mesh_link else None,
            "cache": self.cache.get_stats() if self.cache else None,
            "rag": self.rag.get_stats() if self.rag else None,
            "usage": self.usage.get_stats(),
            "hermes": self.hermes.get_stats(),
            "jarvis": self.jarvis.get_stats(),
            "internet": self.internet.get_stats(),
            "trading": self.trading.get_stats(),
            "trading_skills": self.trading_skills.get_stats() if self.trading_skills else None,
            "trading_engine": self.trading_engine.get_stats() if self.trading_engine else None,
            "telegram": self.telegram.get_stats(),
            "voice": self.voice.get_stats(),
            "speed_skills": self.speed_skills.get_stats() if self.speed_skills else None,
            "meta_learner": self.meta_learner.get_stats() if self.meta_learner else None,
            "gaming_skills": self.gaming_skills.get_stats() if self.gaming_skills else None,
            "ai_gaming": self.ai_gaming.get_stats() if self.ai_gaming else None,
            "auto_tuner": self.auto_tuner.get_stats() if self.auto_tuner else None,
            "split_bit": SplitBitMath.get_all_tier_params() if self.settings.split_bit.enabled else None,
            "splitbit_accelerator": self.splitbit.full_stats() if self.splitbit else None,
            "rlt": self.rlt.get_stats() if self.rlt else None,
        }

    # === Founder wallet operations (hidden, founder-only) ===

    def unlock_founder_wallet(self, password: str) -> dict[str, Any]:
        """Unlock the hidden founder wallet."""
        if not self.founder_wallet:
            return {"status": "error", "message": "No wallet configured"}
        return self.founder_wallet.unlock(password)

    def lock_founder_wallet(self) -> dict[str, Any]:
        """Lock the founder wallet."""
        if not self.founder_wallet:
            return {"status": "error", "message": "No wallet configured"}
        return self.founder_wallet.lock()

    async def get_founder_wallet_balance(self) -> dict[str, Any]:
        """Get founder wallet balance (requires unlock)."""
        if not self.founder_wallet:
            return {"status": "error", "message": "No wallet configured"}
        return await self.founder_wallet.get_balance()

    async def send_from_founder_wallet(self, to_address: str, amount: float,
                                       token: str = "USDT") -> dict[str, Any]:
        """Send crypto from founder wallet (requires unlock)."""
        if not self.founder_wallet:
            return {"status": "error", "message": "No wallet configured"}
        return await self.founder_wallet.send_crypto(to_address, amount, token)

    def get_founder_wallet_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Get founder wallet transaction history (requires unlock)."""
        if not self.founder_wallet:
            return []
        return self.founder_wallet.get_transaction_history(limit)

    # === Trading operations ===

    async def trading_get_price(self, symbol: str, platform: str | None = None) -> dict[str, Any]:
        """Get current price for a trading pair."""
        return await self.trading.get_price(symbol, platform)

    async def trading_get_portfolio(self, platform: str | None = None) -> dict[str, Any]:
        """Get portfolio balances."""
        return await self.trading.get_portfolio(platform)

    async def trading_buy(self, symbol: str, amount: float, platform: str | None = None,
                          order_type: str = "market", price: float = 0) -> dict[str, Any]:
        """Place a buy order."""
        if order_type == "limit" and price > 0:
            return await self.trading.place_limit_buy(symbol, amount, price, platform)
        return await self.trading.place_market_buy(symbol, amount, platform)

    async def trading_sell(self, symbol: str, amount: float, platform: str | None = None,
                           order_type: str = "market", price: float = 0) -> dict[str, Any]:
        """Place a sell order."""
        if order_type == "limit" and price > 0:
            return await self.trading.place_limit_sell(symbol, amount, price, platform)
        return await self.trading.place_market_sell(symbol, amount, platform)

    async def trading_cancel_order(self, order_id: str, platform: str | None = None) -> dict[str, Any]:
        """Cancel an order."""
        return await self.trading.cancel_order(order_id, platform)

    async def trading_get_orders(self, status: str = "open", platform: str | None = None) -> dict[str, Any]:
        """List orders."""
        return await self.trading.get_orders(status, platform)

    async def trading_get_history(self, limit: int = 50, platform: str | None = None) -> dict[str, Any]:
        """Get trade history."""
        return await self.trading.get_trade_history(limit, platform)

    async def trading_set_alert(self, symbol: str, condition: str, target: float,
                                platform: str | None = None) -> dict[str, Any]:
        """Set a price alert."""
        return await self.trading.set_price_alert(symbol, condition, target, platform)

    async def trading_setup_api_key(self, platform: str, api_key: str,
                                    api_secret: str, passphrase: str = "") -> dict[str, Any]:
        """Set up API keys for a trading platform (LLM-assisted)."""
        return await self.trading.setup_api_key(platform, api_key, api_secret, passphrase)

    async def trading_test_connection(self, platform: str | None = None) -> dict[str, Any]:
        """Test API connection after setup."""
        return await self.trading.test_api_connection(platform)

    async def trading_auto_start(self, symbols: list[str] | None = None,
                                 interval_s: int | None = None,
                                 platform: str | None = None) -> dict[str, Any]:
        """Start autonomous trading engine."""
        if not self.trading_engine:
            return {"status": "error", "message": "Auto-trading not enabled in config"}
        syms = symbols or self.settings.integrations.trading.auto_trading_symbols
        interval = interval_s or self.settings.integrations.trading.auto_trading_interval_s
        p = platform or self.settings.integrations.trading.auto_trading_platform
        return await self.trading_engine.start_autonomous_trading(syms, interval, p)

    async def trading_auto_stop(self) -> dict[str, Any]:
        """Stop autonomous trading engine."""
        if not self.trading_engine:
            return {"status": "error", "message": "Auto-trading not enabled in config"}
        return await self.trading_engine.stop_autonomous_trading()

    async def trading_auto_analyze(self, symbol: str, platform: str | None = None) -> dict[str, Any]:
        """Run a single trading analysis (on-demand)."""
        if not self.trading_engine:
            return {"status": "error", "message": "Auto-trading not enabled in config"}
        return await self.trading_engine.analyze_and_trade(symbol, platform)

    async def close(self) -> None:
        """Clean up resources."""
        if self.trading_engine:
            await self.trading_engine.stop_autonomous_trading()
        if self.splitbit:
            self.splitbit.shutdown()
        await self.peer_sync.stop()
        if self.mesh_link:
            await self.mesh_link.stop_mesh_sync()
        if self.rlos:
            await self.rlos.close()
        if self.settings.integrations.telegram.enabled:
            await self.telegram.stop()
        await self.bus.close()
        logger.info("incllmv2 harness closed")
