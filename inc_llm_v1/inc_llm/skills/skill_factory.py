"""Skill Factory — generates new skills from episode data using recursive links.

Captures successful patterns from completed reasoning sessions and creates
reusable skills. Uses the model bus to abstract the pattern from a specific
episode into a general skill. Links the skill to the episode and any related
nodes via the knowledge graph.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from inc_llm.memory.episodic import Episode
from inc_llm.memory.manager import MemoryManager
from inc_llm.memory.semantic import Skill
from inc_llm.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class SkillFactory:
    """Generates new skills from successful episodes."""

    SKILL_GENERATION_PROMPT = """You are a skill creation system. Given a successful task episode,
create a reusable skill that captures the general pattern.

Return JSON:
{
  "name": "<kebab-case-name>",
  "description": "<one sentence description>",
  "category": "<coding|devops|research|data|business|general>",
  "trigger_conditions": ["<condition 1>", "<condition 2>"],
  "content": "<full skill content with steps, tips, and examples>"
}

The skill should be general enough to apply to similar tasks, not just this specific one."""

    def __init__(self, bus: Any, memory: MemoryManager, skill_manager: SkillManager) -> None:
        self.bus = bus
        self.memory = memory
        self.skill_manager = skill_manager

    async def learn_from_episode(self, episode: Episode) -> dict[str, Any]:
        if not episode.success:
            return {"success": False, "skill_name": None, "message": "Cannot learn from a failed episode."}

        episode_text = self._format_episode(episode)
        try:
            response = await self.bus.complete(
                role="base",
                messages=[{"role": "user", "content": f"{self.SKILL_GENERATION_PROMPT}\n\nEPISODE:\n{episode_text}"}],
                max_tokens=400,
                temperature=0.3,
            )
            skill_data = self._safe_json_parse(response["content"], {
                "name": f"learned-{hashlib.sha256(episode.id.encode()).hexdigest()[:8]}",
                "description": f"Skill from: {episode.task_description[:100]}",
                "category": "general", "trigger_conditions": [], "content": response["content"],
            })

            embedding: list[float] = []
            try:
                embedding = await self.bus.embed(input=f"{skill_data['name']} {skill_data['description']}")
            except Exception as e:
                logger.warning("Skill embedding failed: %s", e)

            result = self.skill_manager.create(
                name=skill_data["name"], description=skill_data["description"],
                content=skill_data.get("content", ""), category=skill_data.get("category", "general"),
                trigger_conditions=skill_data.get("trigger_conditions", []), embedding=embedding,
            )

            if result.success:
                self.memory.graph.auto_link_skill_created(f"episode:{episode.id}", f"skill:{skill_data['name']}")
                episode.new_skill_created = skill_data["name"]
                logger.info("Learned skill '%s' from episode %s", skill_data["name"], episode.id)
                return {"success": True, "skill_name": skill_data["name"], "message": f"Skill '{skill_data['name']}' created."}
            return {"success": False, "skill_name": skill_data.get("name"), "message": result.message}
        except Exception as e:
            logger.error("Skill generation failed: %s", e)
            return {"success": False, "skill_name": None, "message": f"Skill generation failed: {e}"}

    async def learn_from_recent(self, session_id: str | None = None) -> dict[str, Any]:
        recent = self.memory.episodic.get_recent(limit=10)
        for ep in recent:
            if ep.success and (session_id is None or ep.session_id == session_id):
                return await self.learn_from_episode(ep)
        return {"success": False, "skill_name": None, "message": "No successful episodes found."}

    async def learn_from_peer_episode(self, episode: Episode) -> dict[str, Any]:
        """Learn a skill from an episode that occurred on a peer instance."""
        result = await self.learn_from_episode(episode)
        if result["success"] and result["skill_name"]:
            skill = self.memory.semantic.get_skill(result["skill_name"])
            if skill:
                skill.created_by_peer = episode.peer_instance_id
                peer_node = f"peer:{episode.peer_instance_id}"
                if self.memory.graph.get_node(peer_node):
                    self.memory.graph.auto_link_learned_from_peer(f"skill:{result['skill_name']}", peer_node)
        return result

    def _format_episode(self, episode: Episode) -> str:
        lines = [
            f"Task: {episode.task_description}",
            f"Category: {episode.task_category}",
            f"Steps: {', '.join(episode.steps_taken)}",
            f"Tools: {', '.join(episode.tools_used)}",
            f"Result: {episode.key_result}",
            f"Skills: {', '.join(episode.skills_applied)}",
            f"Confidence: {episode.confidence_achieved:.2f}",
        ]
        if episode.error_encountered:
            lines.append(f"Error: {episode.error_encountered}")
            lines.append(f"Resolution: {episode.error_resolution or 'N/A'}")
        return "\n".join(lines)

    @staticmethod
    def _safe_json_parse(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(text[start:end])
        except Exception:
            pass
        return fallback
