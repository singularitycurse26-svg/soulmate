"""Skill manager — CRUD operations on the skill library.

Implements the skill_manage tool: create, read, update, delete, list, search.
Integrates with semantic memory and the knowledge graph for recursive linking.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.semantic import Skill

logger = logging.getLogger(__name__)


@dataclass
class SkillManageResult:
    """Result of a skill_manage operation."""

    success: bool
    message: str
    skill: Skill | None = None
    skills: list[Skill] | None = None


class SkillManager:
    """Manages the skill library — CRUD operations.

    Provides the skill_manage tool interface for the agent to:
    - create: Register a new skill
    - read: Get a skill by name
    - update: Update an existing skill
    - delete: Remove a skill
    - list: List all skills
    - search: Search for skills by query
    """

    def __init__(self, memory: MemoryManager) -> None:
        self.memory = memory

    def create(
        self,
        name: str,
        description: str,
        content: str = "",
        category: str = "general",
        trigger_conditions: list[str] | None = None,
        embedding: list[float] | None = None,
    ) -> SkillManageResult:
        """Create a new skill.

        Args:
            name: Unique skill name.
            description: Short description for progressive disclosure.
            content: Full SKILL.md content.
            category: Skill category (coding, devops, research, etc.)
            trigger_conditions: Conditions that should trigger this skill.
            embedding: Optional pre-computed embedding vector.

        Returns:
            SkillManageResult with the created skill.
        """
        # Check if skill already exists
        existing = self.memory.semantic.get_skill(name)
        if existing is not None:
            return SkillManageResult(
                success=False,
                message=f"Skill '{name}' already exists. Use update instead.",
            )

        skill = Skill(
            name=name,
            description=description,
            content=content,
            category=category,
            trigger_conditions=trigger_conditions or [],
        )

        self.memory.register_skill(skill, embedding=embedding)

        logger.info("Created skill '%s' (category: %s)", name, category)
        return SkillManageResult(success=True, message=f"Skill '{name}' created.", skill=skill)

    def read(self, name: str) -> SkillManageResult:
        """Read a skill by name.

        Args:
            name: Skill name.

        Returns:
            SkillManageResult with the skill.
        """
        skill = self.memory.semantic.get_skill(name)
        if skill is None:
            return SkillManageResult(success=False, message=f"Skill '{name}' not found.")
        return SkillManageResult(success=True, message=f"Skill '{name}' retrieved.", skill=skill)

    def update(
        self,
        name: str,
        description: str | None = None,
        content: str | None = None,
        category: str | None = None,
        trigger_conditions: list[str] | None = None,
    ) -> SkillManageResult:
        """Update an existing skill.

        Args:
            name: Skill name.
            description: New description (if provided).
            content: New content (if provided).
            category: New category (if provided).
            trigger_conditions: New trigger conditions (if provided).

        Returns:
            SkillManageResult with the updated skill.
        """
        skill = self.memory.semantic.get_skill(name)
        if skill is None:
            return SkillManageResult(success=False, message=f"Skill '{name}' not found.")

        if description is not None:
            skill.description = description
        if content is not None:
            skill.content = content
        if category is not None:
            skill.category = category
        if trigger_conditions is not None:
            skill.trigger_conditions = trigger_conditions

        # Re-register (updates semantic memory + graph)
        self.memory.register_skill(skill)

        logger.info("Updated skill '%s'", name)
        return SkillManageResult(success=True, message=f"Skill '{name}' updated.", skill=skill)

    def delete(self, name: str) -> SkillManageResult:
        """Delete a skill.

        Args:
            name: Skill name.

        Returns:
            SkillManageResult indicating success.
        """
        deleted = self.memory.semantic.delete_skill(name)
        if not deleted:
            return SkillManageResult(success=False, message=f"Skill '{name}' not found.")

        logger.info("Deleted skill '%s'", name)
        return SkillManageResult(success=True, message=f"Skill '{name}' deleted.")

    def list(self) -> SkillManageResult:
        """List all skills.

        Returns:
            SkillManageResult with all skills.
        """
        skills_data = self.memory.semantic.list_skills()
        skills = [
            Skill(
                name=s["name"],
                description=s["description"],
                content=s.get("content", ""),
                category=s.get("category", "general"),
                usage_count=s.get("usage_count", 0),
                success_count=s.get("success_count", 0),
            )
            for s in skills_data
        ]
        return SkillManageResult(
            success=True,
            message=f"{len(skills)} skills found.",
            skills=skills,
        )

    def search(
        self,
        query: str = "",
        query_embedding: list[float] | None = None,
        top_k: int = 5,
    ) -> SkillManageResult:
        """Search for skills.

        Args:
            query: Text query.
            query_embedding: Optional embedding vector.
            top_k: Maximum results.

        Returns:
            SkillManageResult with matching skills.
        """
        skills = self.memory.semantic.search(
            query_embedding=query_embedding,
            query_text=query,
            top_k=top_k,
        )
        return SkillManageResult(
            success=True,
            message=f"Found {len(skills)} matching skills.",
            skills=skills,
        )

    def execute(self, action: str, **kwargs: Any) -> SkillManageResult:
        """Execute a skill_manage action.

        Args:
            action: One of create, read, update, delete, list, search.
            **kwargs: Arguments for the specific action.

        Returns:
            SkillManageResult.
        """
        actions = {
            "create": self.create,
            "read": self.read,
            "update": self.update,
            "delete": self.delete,
            "list": self.list,
            "search": self.search,
        }

        handler = actions.get(action)
        if handler is None:
            return SkillManageResult(
                success=False,
                message=f"Unknown action: {action}. Valid: {list(actions.keys())}",
            )

        return handler(**kwargs)
