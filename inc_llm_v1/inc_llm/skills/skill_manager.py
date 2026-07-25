"""Skill manager — CRUD operations on the skill library.

Integrates with semantic memory and the knowledge graph for recursive linking.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.memory.semantic import Skill

logger = logging.getLogger(__name__)


@dataclass
class SkillManageResult:
    success: bool
    message: str
    skill: Skill | None = None
    skills: list[Skill] | None = None


class SkillManager:
    """Manages the skill library — CRUD operations."""

    def __init__(self, memory: MemoryManager) -> None:
        self.memory = memory

    def create(self, name: str, description: str, content: str = "", category: str = "general",
               trigger_conditions: list[str] | None = None, embedding: list[float] | None = None,
               created_by_peer: str | None = None) -> SkillManageResult:
        existing = self.memory.semantic.get_skill(name)
        if existing is not None:
            return SkillManageResult(False, f"Skill '{name}' already exists. Use update instead.")
        skill = Skill(name=name, description=description, content=content, category=category,
                      trigger_conditions=trigger_conditions or [], created_by_peer=created_by_peer)
        self.memory.register_skill(skill, embedding=embedding)
        logger.info("Created skill '%s' (category: %s, peer: %s)", name, category, created_by_peer)
        return SkillManageResult(True, f"Skill '{name}' created.", skill=skill)

    def read(self, name: str) -> SkillManageResult:
        skill = self.memory.semantic.get_skill(name)
        if skill is None:
            return SkillManageResult(False, f"Skill '{name}' not found.")
        return SkillManageResult(True, f"Skill '{name}' retrieved.", skill=skill)

    def update(self, name: str, description: str | None = None, content: str | None = None,
               category: str | None = None, trigger_conditions: list[str] | None = None) -> SkillManageResult:
        skill = self.memory.semantic.get_skill(name)
        if skill is None:
            return SkillManageResult(False, f"Skill '{name}' not found.")
        if description is not None:
            skill.description = description
        if content is not None:
            skill.content = content
        if category is not None:
            skill.category = category
        if trigger_conditions is not None:
            skill.trigger_conditions = trigger_conditions
        self.memory.register_skill(skill)
        return SkillManageResult(True, f"Skill '{name}' updated.", skill=skill)

    def delete(self, name: str) -> SkillManageResult:
        if not self.memory.semantic.delete_skill(name):
            return SkillManageResult(False, f"Skill '{name}' not found.")
        return SkillManageResult(True, f"Skill '{name}' deleted.")

    def list(self) -> SkillManageResult:
        skills_data = self.memory.semantic.list_skills()
        skills = [Skill(name=s["name"], description=s["description"], content=s.get("content", ""),
                        category=s.get("category", "general"), usage_count=s.get("usage_count", 0),
                        success_count=s.get("success_count", 0), created_by_peer=s.get("created_by_peer"))
                  for s in skills_data]
        return SkillManageResult(True, f"{len(skills)} skills found.", skills=skills)

    def search(self, query: str = "", query_embedding: list[float] | None = None, top_k: int = 5) -> SkillManageResult:
        skills = self.memory.semantic.search(query_embedding=query_embedding, query_text=query, top_k=top_k)
        return SkillManageResult(True, f"Found {len(skills)} matching skills.", skills=skills)

    def execute(self, action: str, **kwargs: Any) -> SkillManageResult:
        actions = {"create": self.create, "read": self.read, "update": self.update,
                   "delete": self.delete, "list": self.list, "search": self.search}
        handler = actions.get(action)
        if handler is None:
            return SkillManageResult(False, f"Unknown action: {action}. Valid: {list(actions.keys())}")
        return handler(**kwargs)
