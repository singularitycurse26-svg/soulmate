"""Memory manager — orchestrates all 3 memory layers + knowledge graph + universal links.

Provides a single integration point for:
- Working memory (context window management)
- Episodic memory (session history)
- Semantic memory (skill library)
- Knowledge graph (recursive bidirectional linking)
- Universal peer learnings (cross-instance knowledge sharing)
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

from inc_llm.config import Settings
from inc_llm.hardware_detector import HardwareTier
from inc_llm.memory.episodic import Episode, EpisodicMemory
from inc_llm.memory.knowledge_graph import KnowledgeGraph
from inc_llm.memory.semantic import SemanticMemory, Skill
from inc_llm.memory.vault import VaultMemory
from inc_llm.memory.working import WorkingMemory

logger = logging.getLogger(__name__)


class MemoryManager:
    """Central orchestrator for the 3-layer memory system + knowledge graph."""

    def __init__(self, settings: Settings, bus: Any = None, meta_learner: Any = None) -> None:
        self.settings = settings
        self.bus = bus
        self._meta_learner = meta_learner
        mem_cfg = settings.memory

        episodic_path = mem_cfg.resolve_path(mem_cfg.episodic_db_path)
        chroma_path = mem_cfg.resolve_path(mem_cfg.chroma_db_path)
        graph_path = episodic_path.parent / "memory_graph.db"

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
        self.vault = VaultMemory(settings.vault, tier=settings.hardware_tier) if settings.vault.enabled else None

    async def prefetch_context(self, query: str) -> dict[str, Any]:
        """Prefetch relevant context from all memory layers before a turn."""
        query_embedding = None
        if self.bus:
            try:
                query_embedding = await self.bus.embed(input=query)
            except Exception as e:
                logger.warning("Embedding failed: %s", e)

        episodes = self.episodic.search(query, query_embedding=query_embedding)
        skills = self.semantic.search(query_embedding=query_embedding, query_text=query)

        linked_skills: list[Skill] = []
        linked_facts: list[str] = []
        linked_episodes: list[Episode] = []
        peer_learnings: list[str] = []

        for episode in episodes:
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
                elif node.node_type == "learning":
                    peer_learnings.append(node.content)

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
                elif node.node_type == "learning":
                    if node.content not in peer_learnings:
                        peer_learnings.append(node.content)

        all_episodes = episodes + linked_episodes
        all_skills = skills + linked_skills

        # Meta-learner skill re-ranking — boost effective skills, demote ineffective
        if self._meta_learner:
            skill_dicts = [s.as_dict() for s in all_skills]
            reranked = self._meta_learner.rerank_skills(skill_dicts)
            reranked_names = [s.get("name", s.get("id", "")) for s in reranked]
            all_skills.sort(key=lambda s: reranked_names.index(s.name) if s.name in reranked_names else len(reranked_names))

        self.working.inject_episodes([ep.as_dict() for ep in all_episodes])
        self.working.inject_skills([s.as_dict() for s in all_skills])
        self.working.inject_facts(linked_facts)
        self.working.inject_peer_learnings(peer_learnings)

        logger.info(
            "Prefetched: %d episodes, %d skills, %d facts, %d peer learnings (depth=%d)",
            len(all_episodes), len(all_skills), len(linked_facts), len(peer_learnings), self._traversal_depth,
        )

        return {
            "episodes": [ep.as_dict() for ep in all_episodes],
            "skills": [s.as_dict() for s in all_skills],
            "facts": linked_facts,
            "peer_learnings": peer_learnings,
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
        """Synchronize memory after a completed turn."""
        embedding: list[float] = []
        if self.bus:
            try:
                embedding = await self.bus.embed(input=f"{query} {result}")
            except Exception as e:
                logger.warning("Episode embedding failed: %s", e)

        episode_id = hashlib.sha256(f"{session_id}:{query}:{time.time()}".encode()).hexdigest()[:16]
        episode = Episode(
            id=episode_id, session_id=session_id, timestamp=time.time(),
            task_description=query, task_category="general",
            execution_time_s=execution_time_s, success=success,
            key_result=result[:500], skills_applied=skills_used or [],
            new_skill_created=new_skill, embedding=embedding,
            confidence_achieved=confidence,
        )

        self.episodic.store(episode)
        self.graph.add_node(
            f"episode:{episode_id}", "episode", episode_id,
            metadata={"task": query[:200], "success": success},
        )

        for skill_name in skills_used or []:
            skill_node = f"skill:{skill_name}"
            if self.graph.get_node(skill_node):
                self.graph.auto_link_skill_used(f"episode:{episode_id}", skill_node)
                self.semantic.update_usage(skill_name, success)

        if new_skill:
            skill_node = f"skill:{new_skill}"
            if self.graph.get_node(skill_node):
                self.graph.auto_link_skill_created(f"episode:{episode_id}", skill_node)

        if success and skills_used:
            for skill_name in skills_used:
                skill_node = f"skill:{skill_name}"
                if self.graph.get_node(skill_node):
                    self.graph.auto_link_skill_verified(skill_node, f"episode:{episode_id}")

        if self.vault:
            self.vault.store(
                f"episode:{episode_id}", "episode",
                json.dumps(episode.as_dict(), default=str),
                metadata={"session_id": session_id, "success": success},
            )
        logger.info("Synced episode %s (success=%s)", episode_id, success)
        return episode_id

    def register_skill(self, skill: Skill, embedding: list[float] | None = None) -> None:
        self.semantic.add_skill(skill, embedding=embedding)
        self.graph.add_node(
            f"skill:{skill.name}", "skill", skill.name,
            metadata={"description": skill.description, "category": skill.category},
        )
        if self.vault:
            self.vault.store(
                f"skill:{skill.name}", "skill",
                json.dumps(skill.as_dict(), default=str),
                metadata={"category": skill.category},
            )

    def register_fact(self, fact_id: str, content: str, metadata: dict[str, Any] | None = None) -> None:
        self.graph.add_node(f"fact:{fact_id}", "fact", content, metadata=metadata)

    def register_peer_learning(self, learning_id: str, content: str, peer_id: str, metadata: dict[str, Any] | None = None) -> None:
        """Register a learning from a peer instance."""
        meta = metadata or {}
        meta["peer_id"] = peer_id
        self.graph.add_node(f"learning:{learning_id}", "learning", content, metadata=meta)
        peer_node = f"peer:{peer_id}"
        if self.graph.get_node(peer_node):
            self.graph.auto_link_learned_from_peer(f"learning:{learning_id}", peer_node)

    def register_peer(self, peer_id: str, peer_name: str, metadata: dict[str, Any] | None = None) -> None:
        """Register a peer instance in the graph."""
        self.graph.add_node(f"peer:{peer_id}", "peer", peer_name, metadata=metadata)

    def link_fact_to_skill(self, fact_id: str, skill_name: str) -> None:
        self.graph.add_edge(f"fact:{fact_id}", f"skill:{skill_name}", "applies_skill", weight=0.8)

    def link_skill_dependency(self, skill_name: str, dependency_name: str) -> None:
        self.graph.add_edge(f"skill:{skill_name}", f"skill:{dependency_name}", "depends_on", weight=0.8)

    def link_skill_supersedes(self, new_skill: str, old_skill: str) -> None:
        self.graph.add_edge(f"skill:{new_skill}", f"skill:{old_skill}", "supersedes", weight=0.9)

    def load_soul(self, content: str) -> None:
        self.working.set_soul(content)

    def load_memory(self, content: str) -> None:
        self.working.set_memory(content)

    def add_turn(self, role: str, content: str) -> None:
        self.working.add_turn(role, content)

    async def maybe_compress(self) -> bool:
        return await self.working.maybe_compress()

    def build_messages(self) -> list[dict[str, str]]:
        return self.working.build_messages()

    def clear_session(self) -> None:
        self.working.clear()

    def get_stats(self) -> dict[str, int]:
        stats = {
            "episodes": self.episodic.count(),
            "skills": self.semantic.count(),
            "graph_nodes": self.graph.count_nodes(),
            "graph_edges": self.graph.count_edges(),
            "peer_count": len(self.graph.get_peer_nodes()),
            "learning_count": len(self.graph.get_learning_nodes()),
        }
        if self.vault:
            stats.update({f"vault_{k}": v for k, v in self.vault.get_tier_stats().items()})
        return stats
