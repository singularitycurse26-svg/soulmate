"""Skill Factory — generates new skills from episode data.

Implements the /learn command: captures successful patterns from completed
reasoning sessions and creates reusable skills. Uses the model bus to
abstract the pattern from a specific episode into a general skill.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from fable_mythos.memory.episodic import Episode
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.semantic import Skill
from fable_mythos.providers.bus import ModelBus
from fable_mythos.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class SkillFactory:
    """Generates new skills from successful episodes.

    The /learn command works as follows:
    1. Take a successful episode (or the most recent one)
    2. Use the model to abstract the pattern into a general skill
    3. Generate a name, description, and full SKILL.md content
    4. Register the skill in semantic memory + knowledge graph
    5. Link the episode to the skill via the graph (created_skill edge)
    """

    SKILL_GENERATION_PROMPT = """You are a skill creation system. Given a successful task episode,
create a reusable skill that captures the general pattern.

Return JSON:
{
  "name": "<kebab-case-name>",
  "description": "<one sentence description>",
  "category": "<coding|devops|research|data|business|general>",
  "trigger_conditions": ["<condition 1>", "<condition 2>"],
  "content": "<full SKILL.md content with steps, tips, and examples>"
}

The skill should be general enough to apply to similar tasks, not just this specific one.
The content should follow the SKILL.md format with clear steps."""

    def __init__(self, bus: ModelBus, memory: MemoryManager, skill_manager: SkillManager) -> None:
        self.bus = bus
        self.memory = memory
        self.skill_manager = skill_manager

    async def learn_from_episode(self, episode: Episode) -> dict[str, Any]:
        """Learn a new skill from a successful episode.

        Args:
            episode: A successful episode to learn from.

        Returns:
            Dict with 'success', 'skill_name', and 'message'.
        """
        if not episode.success:
            return {
                "success": False,
                "skill_name": None,
                "message": "Cannot learn from a failed episode.",
            }

        # Build the prompt with episode details
        episode_text = self._format_episode(episode)

        try:
            response = await self.bus.complete(
                role="base",
                messages=[{
                    "role": "user",
                    "content": f"{self.SKILL_GENERATION_PROMPT}\n\nEPISODE:\n{episode_text}",
                }],
                max_tokens=800,
                temperature=0.3,
            )

            import json

            # Parse the generated skill
            from fable_mythos.core.triage import Triage
            skill_data = Triage._safe_json_parse(response["content"], {
                "name": f"learned-{hashlib.sha256(episode.id.encode()).hexdigest()[:8]}",
                "description": f"Skill learned from episode: {episode.task_description[:100]}",
                "category": "general",
                "trigger_conditions": [],
                "content": response["content"],
            })

            # Generate embedding for the skill
            embedding: list[float] = []
            try:
                embedding = await self.bus.embed(input=f"{skill_data['name']} {skill_data['description']}")
            except Exception as e:
                logger.warning("Failed to generate skill embedding: %s", e)

            # Create the skill
            result = self.skill_manager.create(
                name=skill_data["name"],
                description=skill_data["description"],
                content=skill_data.get("content", ""),
                category=skill_data.get("category", "general"),
                trigger_conditions=skill_data.get("trigger_conditions", []),
                embedding=embedding,
            )

            if result.success:
                # Link episode to skill in knowledge graph
                self.memory.graph.auto_link_skill_created(
                    f"episode:{episode.id}",
                    f"skill:{skill_data['name']}",
                )

                # Update episode with new skill
                episode.new_skill_created = skill_data["name"]

                logger.info("Learned skill '%s' from episode %s", skill_data["name"], episode.id)
                return {
                    "success": True,
                    "skill_name": skill_data["name"],
                    "message": f"Skill '{skill_data['name']}' created from episode.",
                }
            else:
                return {
                    "success": False,
                    "skill_name": skill_data.get("name"),
                    "message": result.message,
                }

        except Exception as e:
            logger.error("Skill generation failed: %s", e)
            return {
                "success": False,
                "skill_name": None,
                "message": f"Skill generation failed: {e}",
            }

    async def learn_from_recent(self, session_id: str | None = None) -> dict[str, Any]:
        """Learn from the most recent successful episode.

        Args:
            session_id: Optional session ID to filter by.

        Returns:
            Dict with learning result.
        """
        recent = self.memory.episodic.get_recent(limit=10)

        # Find the most recent successful episode
        target: Episode | None = None
        for ep in recent:
            if ep.success and (session_id is None or ep.session_id == session_id):
                target = ep
                break

        if target is None:
            return {
                "success": False,
                "skill_name": None,
                "message": "No successful episodes found to learn from.",
            }

        return await self.learn_from_episode(target)

    def _format_episode(self, episode: Episode) -> str:
        """Format an episode for the skill generation prompt."""
        lines = [
            f"Task: {episode.task_description}",
            f"Category: {episode.task_category}",
            f"Steps taken: {', '.join(episode.steps_taken)}",
            f"Tools used: {', '.join(episode.tools_used)}",
            f"Key result: {episode.key_result}",
            f"Skills applied: {', '.join(episode.skills_applied)}",
            f"Confidence: {episode.confidence_achieved:.2f}",
        ]

        if episode.error_encountered:
            lines.append(f"Error encountered: {episode.error_encountered}")
            lines.append(f"Error resolution: {episode.error_resolution or 'N/A'}")

        return "\n".join(lines)
