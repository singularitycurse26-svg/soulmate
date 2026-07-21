"""Memory manager — orchestrates all 3 memory layers + knowledge graph.

Provides a single integration point for:
- Working memory (context window management)
- Episodic memory (session history)
- Semantic memory (skill library)
- Knowledge graph (recursive bidirectional linking)

Implements recursive retrieval: when pulling an episode, also pulls linked
skills and facts via graph traversal. When pulling a skill, also pulls
episodes that verified/created it.
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Any

from fable_mythos.config import MemoryConfig, Settings
from fable_mythos.memory.episodic import Episode, EpisodicMemory
from fable_mythos.memory.knowledge_graph import KnowledgeGraph
from fable_mythos.memory.semantic import SemanticMemory, Skill
from fable_mythos.memory.working import WorkingMemory
from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


class MemoryManager:
    """Central orchestrator for the 3-layer memory system + knowledge graph.

    Delegates to specific memory providers and manages recursive linking.
    """

    def __init__(
        self,
        settings: Settings,
        bus: ModelBus | None = None,
    ) -> None:
        self.settings = settings
        self.bus = bus
        mem_cfg = settings.memory

        # Resolve paths
        episodic_path = mem_cfg.resolve_path(mem_cfg.episodic_db_path)
        chroma_path = mem_cfg.resolve_path(mem_cfg.chroma_db_path)
        graph_path = episodic_path.parent / "memory_graph.db"

        # Initialize layers
        self.working = WorkingMemory(
            max_tokens=mem_cfg.context_window_tokens,
            sacred_zone_ratio=mem_cfg.sacred_zone_ratio,
            compression_threshold=mem_cfg.compression_threshold,
            bus=bus,
        )
        self.episodic = EpisodicMemory(
            db_path=episodic_path,
            retention_days=mem_cfg.episodic_retention_days,
            top_k=mem_cfg.episodic_top_k,
        )
        self.semantic = SemanticMemory(
            db_path=chroma_path,
            top_k=mem_cfg.semantic_top_k,
            threshold=mem_cfg.semantic_threshold,
            embedding_model=mem_cfg.embedding_model,
        )
        self.graph = KnowledgeGraph(
            db_path=graph_path,
            decay_halflife_days=mem_cfg.graph_link_decay_halflife_days,
        )

        self._traversal_depth = mem_cfg.graph_traversal_depth

    async def prefetch_context(self, query: str) -> dict[str, Any]:
        """Prefetch relevant context from all memory layers before a turn.

        Performs recursive retrieval: pulls episodes, then traverses the
        knowledge graph to find linked skills and facts.

        Args:
            query: The user's query for this turn.

        Returns:
            Dict with 'episodes', 'skills', and 'facts' keys.
        """
        # Generate embedding for the query if bus is available
        query_embedding = None
        if self.bus:
            try:
                query_embedding = await self.bus.embed(input=query)
            except Exception as e:
                logger.warning("Failed to generate query embedding: %s", e)

        # Layer 2: Episodic search
        episodes = self.episodic.search(query, query_embedding=query_embedding)

        # Layer 3: Semantic search
        skills = self.semantic.search(
            query_embedding=query_embedding,
            query_text=query,
        )

        # Recursive retrieval via knowledge graph
        linked_skills: list[Skill] = []
        linked_facts: list[str] = []
        linked_episodes: list[Episode] = []

        for episode in episodes:
            # Traverse graph from this episode node
            node_id = f"episode:{episode.id}"
            traversal = self.graph.traverse(node_id, max_depth=self._traversal_depth)

            for connected_id, edges in traversal.items():
                node = self.graph.get_node(connected_id)
                if node is None:
                    continue

                if node.node_type == "skill":
                    skill = self.semantic.get_skill(node.content)
                    if skill and skill not in linked_skills and skill not in skills:
                        linked_skills.append(skill)

                elif node.node_type == "fact":
                    linked_facts.append(node.content)

                elif node.node_type == "episode":
                    ep = self.episodic.get_by_id(node.content)
                    if ep and ep not in linked_episodes and ep not in episodes:
                        linked_episodes.append(ep)

        # Also traverse from found skills
        for skill in skills:
            node_id = f"skill:{skill.name}"
            traversal = self.graph.traverse(node_id, max_depth=self._traversal_depth)

            for connected_id, edges in traversal.items():
                node = self.graph.get_node(connected_id)
                if node is None:
                    continue

                if node.node_type == "episode":
                    ep = self.episodic.get_by_id(node.content)
                    if ep and ep not in linked_episodes and ep not in episodes:
                        linked_episodes.append(ep)

                elif node.node_type == "fact":
                    if node.content not in linked_facts:
                        linked_facts.append(node.content)

        # Combine results
        all_episodes = episodes + linked_episodes
        all_skills = skills + linked_skills

        # Inject into working memory
        self.working.inject_episodes([ep.as_dict() for ep in all_episodes])
        self.working.inject_skills([s.as_dict() for s in all_skills])
        self.working.inject_facts(linked_facts)

        logger.info(
            "Prefetched context: %d episodes, %d skills, %d facts (recursive depth=%d)",
            len(all_episodes), len(all_skills), len(linked_facts), self._traversal_depth,
        )

        return {
            "episodes": [ep.as_dict() for ep in all_episodes],
            "skills": [s.as_dict() for s in all_skills],
            "facts": linked_facts,
        }

    async def sync_after_turn(
        self,
        session_id: str,
        query: str,
        result: str,
        success: bool,
        skills_used: list[str] | None = None,
        new_skill: str | None = None,
        confidence: float = 0.0,
        execution_time_s: float = 0.0,
    ) -> str:
        """Synchronize memory after a completed turn.

        Stores the episode in episodic memory, updates the knowledge graph
        with auto-links, and updates skill usage statistics.

        Args:
            session_id: Session identifier.
            query: The user's query.
            result: The agent's result.
            success: Whether the turn was successful.
            skills_used: List of skill names used.
            new_skill: Name of a new skill created (if any).
            confidence: Confidence achieved.
            execution_time_s: Execution time in seconds.

        Returns:
            The episode ID.
        """
        # Generate embedding for the episode
        embedding: list[float] = []
        if self.bus:
            try:
                embedding = await self.bus.embed(input=f"{query} {result}")
            except Exception as e:
                logger.warning("Failed to generate episode embedding: %s", e)

        # Create episode
        episode_id = hashlib.sha256(
            f"{session_id}:{query}:{time.time()}".encode()
        ).hexdigest()[:16]

        episode = Episode(
            id=episode_id,
            session_id=session_id,
            timestamp=time.time(),
            task_description=query,
            task_category="general",
            execution_time_s=execution_time_s,
            success=success,
            key_result=result[:500],
            skills_applied=skills_used or [],
            new_skill_created=new_skill,
            embedding=embedding,
            confidence_achieved=confidence,
        )

        # Store in episodic memory
        self.episodic.store(episode)

        # Add to knowledge graph
        self.graph.add_node(
            node_id=f"episode:{episode_id}",
            node_type="episode",
            content=episode_id,
            metadata={"task": query[:200], "success": success},
        )

        # Auto-link: episode → skills used
        for skill_name in skills_used or []:
            skill_node = f"skill:{skill_name}"
            node = self.graph.get_node(skill_node)
            if node:
                self.graph.auto_link_skill_used(f"episode:{episode_id}", skill_node)
                self.semantic.update_usage(skill_name, success)

        # Auto-link: episode → new skill created
        if new_skill:
            skill_node = f"skill:{new_skill}"
            node = self.graph.get_node(skill_node)
            if node:
                self.graph.auto_link_skill_created(f"episode:{episode_id}", skill_node)

        # Auto-link: if successful, mark as verifying used skills
        if success and skills_used:
            for skill_name in skills_used:
                skill_node = f"skill:{skill_name}"
                node = self.graph.get_node(skill_node)
                if node:
                    self.graph.auto_link_skill_verified(skill_node, f"episode:{episode_id}")

        logger.info("Synced episode %s to memory (success=%s)", episode_id, success)
        return episode_id

    def register_skill(self, skill: Skill, embedding: list[float] | None = None) -> None:
        """Register a skill in semantic memory and the knowledge graph.

        Args:
            skill: The skill to register.
            embedding: Optional pre-computed embedding vector.
        """
        # Add to semantic memory
        self.semantic.add_skill(skill, embedding=embedding)

        # Add to knowledge graph
        self.graph.add_node(
            node_id=f"skill:{skill.name}",
            node_type="skill",
            content=skill.name,
            metadata={"description": skill.description, "category": skill.category},
        )

        logger.debug("Registered skill '%s' in memory + graph", skill.name)

    def register_fact(self, fact_id: str, content: str, metadata: dict[str, Any] | None = None) -> None:
        """Register a durable fact in the knowledge graph.

        Args:
            fact_id: Unique fact identifier.
            content: The fact content/description.
            metadata: Optional metadata.
        """
        self.graph.add_node(
            node_id=f"fact:{fact_id}",
            node_type="fact",
            content=content,
            metadata=metadata,
        )

    def link_fact_to_skill(self, fact_id: str, skill_name: str) -> None:
        """Link a fact to a skill (applies_skill edge)."""
        self.graph.add_edge(
            f"fact:{fact_id}",
            f"skill:{skill_name}",
            "applies_skill",
            weight=0.8,
        )

    def link_skill_dependency(self, skill_name: str, dependency_name: str) -> None:
        """Link a skill to its dependency."""
        self.graph.auto_link_depends_on(
            f"skill:{skill_name}",
            f"skill:{dependency_name}",
        )

    def link_skill_supersedes(self, new_skill: str, old_skill: str) -> None:
        """Mark a skill as superseding another."""
        self.graph.auto_link_supersedes(
            f"skill:{new_skill}",
            f"skill:{old_skill}",
        )

    def load_soul(self, content: str) -> None:
        """Load SOUL.md persona into working memory."""
        self.working.set_soul(content)

    def load_memory(self, content: str) -> None:
        """Load MEMORY.md durable facts into working memory."""
        self.working.set_memory(content)

    def add_turn(self, role: str, content: str) -> None:
        """Add a conversation turn to working memory."""
        self.working.add_turn(role, content)

    async def maybe_compress(self) -> bool:
        """Compress working memory if needed."""
        return await self.working.maybe_compress()

    def build_messages(self) -> list[dict[str, str]]:
        """Build the full message list for the model."""
        return self.working.build_messages()

    def clear_session(self) -> None:
        """Clear working memory for a new session (keep sacred zone)."""
        self.working.clear()
