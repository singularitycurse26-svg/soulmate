"""Semantic memory — skill library with ANN search and progressive disclosure.

Uses ChromaDB for local vector storage of skills. Falls back to in-memory
text search when ChromaDB is not available.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class Skill:
    """A skill in the semantic memory library."""

    name: str
    description: str
    version: str = "1.0.0"
    content: str = ""
    category: str = "general"
    trigger_conditions: list[str] = field(default_factory=list)
    usage_count: int = 0
    success_count: int = 0
    embedding: list[float] | None = None
    created_by_peer: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name, "description": self.description,
            "version": self.version, "content": self.content,
            "category": self.category, "trigger_conditions": self.trigger_conditions,
            "usage_count": self.usage_count, "success_count": self.success_count,
            "created_by_peer": self.created_by_peer,
        }

    def summary(self) -> dict[str, str]:
        return {"name": self.name, "description": self.description}


class SemanticMemory:
    """Semantic memory — skill library backed by ChromaDB."""

    def __init__(
        self,
        db_path: str | Path,
        top_k: int = 5,
        threshold: float = 0.70,
        embedding_model: str = "nomic-embed-text",
    ) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.top_k = top_k
        self.threshold = threshold
        self.embedding_model = embedding_model
        self._client: Any = None
        self._collection: Any = None
        self._skills_cache: dict[str, Skill] = {}

    def _ensure_collection(self) -> None:
        if self._collection is not None:
            return
        try:
            import chromadb
            self._client = chromadb.PersistentClient(path=str(self.db_path))
            self._collection = self._client.get_or_create_collection(
                name="inc_llm_skills", metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            logger.warning("ChromaDB init failed: %s, using in-memory fallback", e)
            self._collection = None

    def add_skill(self, skill: Skill, embedding: list[float] | None = None) -> None:
        self._ensure_collection()
        self._skills_cache[skill.name] = skill
        if self._collection is not None and embedding:
            self._collection.upsert(
                ids=[skill.name], embeddings=[embedding],
                documents=[f"{skill.name}: {skill.description}"],
                metadatas=[{
                    "name": skill.name, "description": skill.description,
                    "version": skill.version, "category": skill.category,
                    "usage_count": skill.usage_count, "success_count": skill.success_count,
                }],
            )

    def search(self, query_embedding: list[float] | None = None, query_text: str = "", top_k: int | None = None) -> list[Skill]:
        k = top_k or self.top_k
        self._ensure_collection()
        if self._collection is not None and query_embedding:
            return self._ann_search(query_embedding, k)
        return self._text_search(query_text, k)

    def _ann_search(self, query_embedding: list[float], k: int) -> list[Skill]:
        results = self._collection.query(query_embeddings=[query_embedding], n_results=k)
        skills: list[Skill] = []
        ids = results.get("ids", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        for skill_id, meta, dist in zip(ids, metadatas, distances):
            similarity = 1.0 - dist if dist is not None else 0.5
            if similarity < self.threshold:
                continue
            skill = self._skills_cache.get(skill_id)
            if skill is None:
                skill = Skill(name=meta.get("name", skill_id), description=meta.get("description", ""))
            skills.append(skill)
        return skills

    def _text_search(self, query_text: str, k: int) -> list[Skill]:
        if not query_text:
            return list(self._skills_cache.values())[:k]
        query_lower = query_text.lower()
        scored: list[tuple[float, Skill]] = []
        for skill in self._skills_cache.values():
            score = sum(1.0 for w in query_lower.split() if w in f"{skill.name} {skill.description} {skill.category}".lower())
            if score > 0:
                scored.append((score, skill))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored[:k]]

    def get_skill(self, name: str) -> Skill | None:
        return self._skills_cache.get(name)

    def list_skills(self) -> list[dict[str, Any]]:
        return [s.as_dict() for s in self._skills_cache.values()]

    def update_usage(self, name: str, success: bool) -> None:
        skill = self._skills_cache.get(name)
        if skill is None:
            return
        skill.usage_count += 1
        if success:
            skill.success_count += 1
        if self._collection is not None:
            try:
                self._collection.update(ids=[name], metadatas=[{
                    "name": skill.name, "description": skill.description,
                    "version": skill.version, "category": skill.category,
                    "usage_count": skill.usage_count, "success_count": skill.success_count,
                }])
            except Exception:
                pass

    def delete_skill(self, name: str) -> bool:
        if name not in self._skills_cache:
            return False
        del self._skills_cache[name]
        if self._collection is not None:
            try:
                self._collection.delete(ids=[name])
            except Exception:
                pass
        return True

    def count(self) -> int:
        return len(self._skills_cache)

    def get_peer_skills(self) -> list[Skill]:
        """Get skills created by peer instances."""
        return [s for s in self._skills_cache.values() if s.created_by_peer is not None]
