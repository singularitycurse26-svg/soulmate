"""Semantic memory — skill library with ANN search and progressive disclosure.

Uses ChromaDB for local vector storage of skills. Supports:
- ANN (approximate nearest neighbor) search for skill retrieval
- Progressive disclosure: only skill names + descriptions in context, full skill on demand
- Compatible with agentskills.io open standard
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
    content: str = ""  # Full SKILL.md content
    category: str = "general"
    trigger_conditions: list[str] = field(default_factory=list)
    usage_count: int = 0
    success_count: int = 0
    embedding: list[float] | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "content": self.content,
            "category": self.category,
            "trigger_conditions": self.trigger_conditions,
            "usage_count": self.usage_count,
            "success_count": self.success_count,
        }

    def summary(self) -> dict[str, str]:
        """Return a compact summary for progressive disclosure."""
        return {"name": self.name, "description": self.description}


class SemanticMemory:
    """Semantic memory — skill library backed by ChromaDB.

    Stores skills as vectors for ANN search. Progressive disclosure means
    only skill names and descriptions are injected into context; full skill
    content is loaded on demand.
    """

    def __init__(
        self,
        db_path: str | Path,
        top_k: int = 5,
        threshold: float = 0.75,
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
        """Lazy-init ChromaDB client and collection."""
        if self._collection is not None:
            return

        try:
            import chromadb

            self._client = chromadb.PersistentClient(path=str(self.db_path))
            self._collection = self._client.get_or_create_collection(
                name="skills",
                metadata={"hnsw:space": "cosine"},
            )
            logger.debug("ChromaDB collection 'skills' initialized at %s", self.db_path)
        except ImportError:
            logger.warning("ChromaDB not installed, semantic memory will use in-memory fallback")
            self._collection = None
        except Exception as e:
            logger.warning("ChromaDB initialization failed: %s, using in-memory fallback", e)
            self._collection = None

    def add_skill(self, skill: Skill, embedding: list[float] | None = None) -> None:
        """Add or update a skill in the library.

        Args:
            skill: The skill to add.
            embedding: Optional pre-computed embedding. If None, skill is stored without vector.
        """
        self._ensure_collection()
        self._skills_cache[skill.name] = skill

        if self._collection is not None and embedding:
            self._collection.upsert(
                ids=[skill.name],
                embeddings=[embedding],
                documents=[f"{skill.name}: {skill.description}"],
                metadatas=[{
                    "name": skill.name,
                    "description": skill.description,
                    "version": skill.version,
                    "category": skill.category,
                    "usage_count": skill.usage_count,
                    "success_count": skill.success_count,
                }],
            )

        logger.debug("Added skill '%s' to semantic memory", skill.name)

    def search(
        self,
        query_embedding: list[float] | None = None,
        query_text: str = "",
        top_k: int | None = None,
    ) -> list[Skill]:
        """Search for relevant skills using ANN or text matching.

        Args:
            query_embedding: Query vector for ANN search.
            query_text: Text query for fallback text matching.
            top_k: Max results (default: self.top_k).

        Returns:
            List of matching skills.
        """
        k = top_k or self.top_k
        self._ensure_collection()

        if self._collection is not None and query_embedding:
            return self._ann_search(query_embedding, k)
        else:
            return self._text_search(query_text, k)

    def _ann_search(self, query_embedding: list[float], k: int) -> list[Skill]:
        """ANN search using ChromaDB."""
        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=k,
        )

        skills: list[Skill] = []
        ids = results.get("ids", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for i, (skill_id, meta, dist) in enumerate(zip(ids, metadatas, distances)):
            # Convert distance to similarity (cosine distance → similarity)
            similarity = 1.0 - dist if dist is not None else 0.5

            if similarity < self.threshold:
                continue

            skill = self._skills_cache.get(skill_id)
            if skill is None:
                skill = Skill(
                    name=meta.get("name", skill_id),
                    description=meta.get("description", ""),
                    version=meta.get("version", "1.0.0"),
                    category=meta.get("category", "general"),
                    usage_count=meta.get("usage_count", 0),
                    success_count=meta.get("success_count", 0),
                )
            skills.append(skill)

        return skills

    def _text_search(self, query_text: str, k: int) -> list[Skill]:
        """Fallback text-based search when ChromaDB or embeddings unavailable."""
        if not query_text:
            return list(self._skills_cache.values())[:k]

        query_lower = query_text.lower()
        scored: list[tuple[float, Skill]] = []

        for skill in self._skills_cache.values():
            score = 0.0
            text = f"{skill.name} {skill.description} {skill.category}".lower()
            for word in query_lower.split():
                if word in text:
                    score += 1.0
            if score > 0:
                scored.append((score, skill))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored[:k]]

    def get_skill(self, name: str) -> Skill | None:
        """Get a skill by name (full content loaded on demand)."""
        return self._skills_cache.get(name)

    def list_skills(self) -> list[dict[str, Any]]:
        """List all skills (summaries only for progressive disclosure)."""
        return [s.as_dict() for s in self._skills_cache.values()]

    def update_usage(self, name: str, success: bool) -> None:
        """Update skill usage statistics.

        Args:
            name: Skill name.
            success: Whether the skill usage was successful.
        """
        skill = self._skills_cache.get(name)
        if skill is None:
            return

        skill.usage_count += 1
        if success:
            skill.success_count += 1

        # Update in ChromaDB if available
        if self._collection is not None:
            self._ensure_collection()
            try:
                self._collection.update(
                    ids=[name],
                    metadatas=[{
                        "name": skill.name,
                        "description": skill.description,
                        "version": skill.version,
                        "category": skill.category,
                        "usage_count": skill.usage_count,
                        "success_count": skill.success_count,
                    }],
                )
            except Exception:
                pass  # Skill may not exist in ChromaDB yet

    def delete_skill(self, name: str) -> bool:
        """Delete a skill from the library.

        Returns:
            True if deleted, False if not found.
        """
        if name not in self._skills_cache:
            return False

        del self._skills_cache[name]

        if self._collection is not None:
            try:
                self._collection.delete(ids=[name])
            except Exception:
                pass

        logger.debug("Deleted skill '%s'", name)
        return True

    def count(self) -> int:
        """Count total skills."""
        return len(self._skills_cache)
