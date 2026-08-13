"""Tool skill creator — self-improving tool calling based on usage patterns.

Tracks tool usage with Bayesian effectiveness scoring. Creates tool
meta-skills after 20+ tool calls. Learns which tools are most effective
for which task types.

Zero-slowdown: all analysis runs post-turn via asyncio.create_task.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.math_core.statistics import PrecisionStatistics

logger = logging.getLogger(__name__)


@dataclass
class ToolCallRecord:
    """A single tool call record."""
    tool_name: str
    task_type: str
    success: bool
    error: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class ToolProfile:
    """Bayesian effectiveness profile for a tool."""
    tool_name: str
    total_calls: int = 0
    successful_calls: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=30))
    task_types: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    common_errors: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    combined_score: float = 0.5
    confidence: float = 0.0


class ToolSkillCreator:
    """Self-improving tool calling skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_calls_before_meta_skill: int = 20,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_calls_before_meta_skill = min_calls_before_meta_skill
        self.share_via_universal_link = share_via_universal_link

        self._profiles: dict[str, ToolProfile] = {}
        self._all_records: deque[ToolCallRecord] = deque(maxlen=500)
        self._meta_skill_created: bool = False
        self._stats = {
            "total_calls": 0,
            "successful_calls": 0,
            "failed_calls": 0,
            "meta_skills_created": 0,
        }

    async def record_tool_call(
        self,
        tool_name: str,
        task_type: str = "general",
        success: bool = True,
        error: str = "",
    ) -> None:
        """Record a tool call outcome."""
        record = ToolCallRecord(
            tool_name=tool_name,
            task_type=task_type,
            success=success,
            error=error,
        )
        self._all_records.append(record)
        self._stats["total_calls"] += 1
        if success:
            self._stats["successful_calls"] += 1
        else:
            self._stats["failed_calls"] += 1

        profile = self._profiles.get(tool_name)
        if profile is None:
            profile = ToolProfile(tool_name=tool_name)
            self._profiles[tool_name] = profile

        profile.total_calls += 1
        if success:
            profile.successful_calls += 1
        profile.recent_results.append(1.0 if success else 0.0)
        profile.task_types[task_type] += 1
        if error:
            short_error = error[:100]
            profile.common_errors[short_error] += 1

        self._update_profile_scores(profile)
        await self._maybe_create_tool_meta_skill()

    def get_tool_insights(self, tool_name: str = "") -> str:
        """Get learned insights for a tool or all tools."""
        if not tool_name:
            top_tools = sorted(
                self._profiles.values(),
                key=lambda p: p.combined_score,
                reverse=True,
            )[:5]
            return "; ".join(
                f"{p.tool_name}: {p.successful_calls}/{p.total_calls} success"
                for p in top_tools if p.confidence > 0.2
            )

        profile = self._profiles.get(tool_name)
        if not profile or profile.confidence < 0.2:
            return ""

        insights = f"{tool_name}: {profile.successful_calls}/{profile.total_calls} success"
        if profile.common_errors:
            top_error = max(profile.common_errors, key=profile.common_errors.get)
            insights += f", common error: {top_error[:50]}"
        return insights

    def get_best_tools_for_task(self, task_type: str, top_k: int = 3) -> list[str]:
        """Get the best tools for a given task type based on learned patterns."""
        scored: list[tuple[float, str]] = []
        for name, profile in self._profiles.items():
            task_count = profile.task_types.get(task_type, 0)
            if task_count > 0:
                task_success_rate = task_count / max(1, profile.total_calls)
                score = 0.5 * profile.combined_score + 0.5 * task_success_rate
                scored.append((score, name))
        scored.sort(reverse=True)
        return [name for _, name in scored[:top_k]]

    def _update_profile_scores(self, profile: ToolProfile) -> None:
        """Update Bayesian scores for a tool profile."""
        if profile.total_calls < 2:
            return

        success_rate = profile.successful_calls / profile.total_calls
        reuse = min(1.0, profile.total_calls / 20.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = 0.6 * bayesian_success + 0.4 * reuse
        profile.confidence = min(1.0, profile.total_calls / 15.0)

    async def _maybe_create_tool_meta_skill(self) -> None:
        """Create a tool meta-skill after min calls."""
        if self._meta_skill_created:
            return
        if len(self._all_records) < self.min_calls_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "tool-calling-meta"
        existing = self.skill_manager.read(skill_name)
        if existing.success:
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for tool calling — learned patterns across all tool calls",
            content=content,
            category="tool_meta",
            trigger_conditions=["tool calling", "function calling", "tool selection"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created tool-calling meta-skill: %s", skill_name)

    def _build_meta_skill_content(self) -> str:
        total = len(self._all_records)
        profiles_summary = "\n".join(
            f"  - {p.tool_name}: {p.total_calls} calls, "
            f"success={p.successful_calls}/{p.total_calls}, "
            f"score={p.combined_score:.2f}"
            for p in sorted(self._profiles.values(), key=lambda x: x.total_calls, reverse=True)[:15]
        )
        return (
            f"Tool Calling Meta-Skill\n"
            f"Total tool calls: {total}\n"
            f"Tools tracked: {len(self._profiles)}\n\n"
            f"Tool profiles:\n{profiles_summary}\n\n"
            f"Best practices:\n"
            f"- Validate arguments before execution\n"
            f"- Use parallel execution for independent tool calls\n"
            f"- Track errors to identify problematic tools\n"
            f"- Select tools based on task type effectiveness\n"
        )

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "tools_tracked": len(self._profiles),
            "profiles": {
                name: {
                    "total": p.total_calls,
                    "success_rate": p.successful_calls / max(1, p.total_calls),
                    "score": round(p.combined_score, 3),
                    "confidence": round(p.confidence, 3),
                }
                for name, p in self._profiles.items()
            },
        }
