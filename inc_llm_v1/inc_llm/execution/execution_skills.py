"""Execution skill creator — self-improving execution based on step outcomes.

Tracks execution patterns with Bayesian effectiveness scoring. Creates
execution meta-skills after 10+ executions. Provides insights for improving
execution prompts.

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
class ExecutionRecord:
    """A single execution record."""
    plan_id: str
    project_type: str
    steps_total: int
    steps_succeeded: int
    steps_failed: int
    success: bool
    execution_time_s: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class ExecutionProfile:
    """Bayesian effectiveness profile for execution patterns."""
    action: str
    total_executions: int = 0
    successful_executions: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    avg_steps_succeeded: float = 0.0
    avg_execution_time: float = 0.0
    combined_score: float = 0.5
    confidence: float = 0.0
    best_practices: list[str] = field(default_factory=list)


class ExecutionSkillCreator:
    """Self-improving execution skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_executions_before_meta_skill: int = 10,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_executions_before_meta_skill = min_executions_before_meta_skill
        self.share_via_universal_link = share_via_universal_link

        self._profiles: dict[str, ExecutionProfile] = {}
        self._all_records: deque[ExecutionRecord] = deque(maxlen=200)
        self._meta_skill_created: bool = False
        self._stats = {
            "total_executions": 0,
            "successful_executions": 0,
            "failed_executions": 0,
            "meta_skills_created": 0,
        }

    async def record_execution(
        self,
        plan_id: str,
        project_type: str,
        steps_total: int,
        steps_succeeded: int,
        steps_failed: int,
        success: bool,
        execution_time_s: float = 0.0,
    ) -> None:
        """Record an execution outcome."""
        record = ExecutionRecord(
            plan_id=plan_id,
            project_type=project_type or "general",
            steps_total=steps_total,
            steps_succeeded=steps_succeeded,
            steps_failed=steps_failed,
            success=success,
            execution_time_s=execution_time_s,
        )
        self._all_records.append(record)
        self._stats["total_executions"] += 1
        if success:
            self._stats["successful_executions"] += 1
        else:
            self._stats["failed_executions"] += 1

        pt = record.project_type
        profile = self._profiles.get(pt)
        if profile is None:
            profile = ExecutionProfile(action=pt)
            self._profiles[pt] = profile

        profile.total_executions += 1
        if success:
            profile.successful_executions += 1
        profile.recent_results.append(1.0 if success else 0.0)

        n = profile.total_executions
        profile.avg_steps_succeeded = ((profile.avg_steps_succeeded * (n - 1)) + record.steps_succeeded) / n
        profile.avg_execution_time = ((profile.avg_execution_time * (n - 1)) + record.execution_time_s) / n

        self._update_profile_scores(profile)
        await self._maybe_create_execution_meta_skill()

    def get_execution_insights(self, action: str = "") -> str:
        """Get learned execution insights."""
        if not action:
            return ""

        profile = self._profiles.get(action.lower())
        if not profile or profile.confidence < 0.2:
            return ""

        return (
            f"For {action}: {profile.successful_executions}/{profile.total_executions} success, "
            f"avg {profile.avg_steps_succeeded:.1f} steps succeeded."
        )

    def _update_profile_scores(self, profile: ExecutionProfile) -> None:
        """Update Bayesian scores."""
        if profile.total_executions < 2:
            return

        success_rate = profile.successful_executions / profile.total_executions
        reuse = min(1.0, profile.total_executions / 10.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = 0.7 * bayesian_success + 0.3 * reuse
        profile.confidence = min(1.0, profile.total_executions / 10.0)

    async def _maybe_create_execution_meta_skill(self) -> None:
        """Create an execution meta-skill after min executions."""
        if self._meta_skill_created:
            return
        if len(self._all_records) < self.min_executions_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "execution-meta"
        existing = self.skill_manager.read(skill_name)
        if existing.success:
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for execution — learned patterns across all executions",
            content=content,
            category="execution_meta",
            trigger_conditions=["execution", "autonomous execution", "step execution"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created execution meta-skill: %s", skill_name)

    def _build_meta_skill_content(self) -> str:
        total = len(self._all_records)
        profiles_summary = "\n".join(
            f"  - {p.action}: {p.total_executions} executions, "
            f"success={p.successful_executions}/{p.total_executions}, "
            f"score={p.combined_score:.2f}"
            for p in sorted(self._profiles.values(), key=lambda x: x.total_executions, reverse=True)[:10]
        )
        return (
            f"Execution Meta-Skill\n"
            f"Total executions: {total}\n"
            f"Project types tracked: {len(self._profiles)}\n\n"
            f"Profiles:\n{profiles_summary}\n\n"
            f"Best practices:\n"
            f"- Break steps into small, verifiable units\n"
            f"- Self-review output after each step\n"
            f"- Retry with failure context on errors\n"
            f"- Replan after consecutive failures\n"
        )

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "profiles_tracked": len(self._profiles),
            "profiles": {
                pt: {
                    "total": p.total_executions,
                    "success_rate": p.successful_executions / max(1, p.total_executions),
                    "score": round(p.combined_score, 3),
                    "confidence": round(p.confidence, 3),
                }
                for pt, p in self._profiles.items()
            },
        }
