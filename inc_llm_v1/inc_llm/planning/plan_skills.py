"""Plan skill creator — self-improving planning based on plan outcomes and user feedback.

Tracks project types with Bayesian effectiveness scoring. Creates planning
meta-skills after 3+ plans. Dynamically adjusts planning prompts based on
past plan outcomes.

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

POSITIVE_SIGNALS = frozenset({
    "great plan", "perfect", "exactly right", "good plan", "nice plan",
    "worked well", "succeeded", "awesome", "correct", "helpful",
})

NEGATIVE_SIGNALS = frozenset({
    "bad plan", "wrong", "failed", "didn't work", "missing steps",
    "too complex", "too simple", "incorrect", "not helpful", "useless",
})


@dataclass
class PlanRecord:
    """A single plan execution record."""
    plan_id: str
    request: str
    project_type: str
    phases_count: int
    steps_count: int
    success: bool
    execution_time_s: float
    timestamp: float = field(default_factory=time.time)


@dataclass
class ProjectTypeProfile:
    """Bayesian effectiveness profile for a project type."""
    project_type: str
    total_plans: int = 0
    successful_plans: int = 0
    avg_phases: float = 0.0
    avg_steps: float = 0.0
    avg_execution_time: float = 0.0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    positive_feedback: int = 0
    negative_feedback: int = 0
    combined_score: float = 0.5
    confidence: float = 0.0
    best_practices: list[str] = field(default_factory=list)


class PlanSkillCreator:
    """Self-improving planning skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_plans_before_meta_skill: int = 3,
        share_via_universal_link: bool = True,
        auto_adjust_prompt: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_plans_before_meta_skill = min_plans_before_meta_skill
        self.share_via_universal_link = share_via_universal_link
        self.auto_adjust_prompt = auto_adjust_prompt

        self._profiles: dict[str, ProjectTypeProfile] = {}
        self._all_records: deque[PlanRecord] = deque(maxlen=200)
        self._meta_skill_created: bool = False
        self._prompt_insights: str = ""
        self._stats = {
            "total_plans": 0,
            "successful_plans": 0,
            "failed_plans": 0,
            "meta_skills_created": 0,
        }

    async def record_plan_outcome(
        self,
        plan_id: str,
        request: str,
        project_type: str,
        phases_count: int,
        steps_count: int,
        success: bool,
        execution_time_s: float = 0.0,
    ) -> None:
        """Record a plan execution outcome."""
        record = PlanRecord(
            plan_id=plan_id,
            request=request,
            project_type=project_type or "general",
            phases_count=phases_count,
            steps_count=steps_count,
            success=success,
            execution_time_s=execution_time_s,
        )
        self._all_records.append(record)
        self._stats["total_plans"] += 1
        if success:
            self._stats["successful_plans"] += 1
        else:
            self._stats["failed_plans"] += 1

        pt = record.project_type
        profile = self._profiles.get(pt)
        if profile is None:
            profile = ProjectTypeProfile(project_type=pt)
            self._profiles[pt] = profile

        profile.total_plans += 1
        if success:
            profile.successful_plans += 1
        profile.recent_results.append(1.0 if success else 0.0)

        n = profile.total_plans
        profile.avg_phases = ((profile.avg_phases * (n - 1)) + record.phases_count) / n
        profile.avg_steps = ((profile.avg_steps * (n - 1)) + record.steps_count) / n
        profile.avg_execution_time = ((profile.avg_execution_time * (n - 1)) + record.execution_time_s) / n

        self._update_profile_scores(profile)

        if self.auto_adjust_prompt and profile.confidence > 0.3:
            self._update_insights()

        await self._maybe_create_planning_meta_skill()

    def get_planning_insights(self, project_type: str = "") -> str:
        """Get learned planning insights."""
        if not project_type:
            return self._prompt_insights

        profile = self._profiles.get(project_type.lower())
        if not profile or profile.confidence < 0.2:
            return self._prompt_insights

        insights = (
            f"For {project_type}: avg {profile.avg_phases:.0f} phases, "
            f"{profile.avg_steps:.0f} steps, success rate {profile.successful_plans}/{profile.total_plans}."
        )
        if profile.best_practices:
            insights += f" Best practices: {'; '.join(profile.best_practices[:3])}."
        return insights

    def _update_profile_scores(self, profile: ProjectTypeProfile) -> None:
        """Update Bayesian scores for a profile."""
        if profile.total_plans < 2:
            return

        success_rate = profile.successful_plans / profile.total_plans
        satisfaction = profile.positive_feedback / max(
            1, profile.positive_feedback + profile.negative_feedback
        )
        reuse = min(1.0, profile.total_plans / 10.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = (
            0.5 * bayesian_success + 0.3 * satisfaction + 0.2 * reuse
        )
        profile.confidence = min(1.0, profile.total_plans / 5.0)

    def _update_insights(self) -> None:
        """Update global planning insights from all profiles."""
        parts = []
        for pt, profile in self._profiles.items():
            if profile.confidence > 0.3:
                parts.append(
                    f"{pt}: {profile.successful_plans}/{profile.total_plans} success, "
                    f"avg {profile.avg_phases:.0f} phases"
                )
        self._prompt_insights = "; ".join(parts) if parts else ""

    async def _maybe_create_planning_meta_skill(self) -> None:
        """Create a planning meta-skill after min_plans plans."""
        if self._meta_skill_created:
            return
        if len(self._all_records) < self.min_plans_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "planning-meta"
        existing = self.skill_manager.read(skill_name)
        if existing.success:
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for planning — learned patterns across all plans",
            content=content,
            category="planning_meta",
            trigger_conditions=["planning", "create plan", "execution plan"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created planning meta-skill: %s", skill_name)

    def _build_meta_skill_content(self) -> str:
        total = len(self._all_records)
        profiles_summary = "\n".join(
            f"  - {p.project_type}: {p.total_plans} plans, "
            f"success={p.successful_plans}/{p.total_plans}, "
            f"score={p.combined_score:.2f}"
            for p in sorted(self._profiles.values(), key=lambda x: x.total_plans, reverse=True)[:10]
        )
        return (
            f"Planning Meta-Skill\n"
            f"Total plans: {total}\n"
            f"Project types tracked: {len(self._profiles)}\n\n"
            f"Project type profiles:\n{profiles_summary}\n\n"
            f"Best practices:\n"
            f"- Break complex requests into 2-5 phases\n"
            f"- Each phase should have 2-6 concrete steps\n"
            f"- Include risk assessment and mitigation\n"
            f"- Define clear success criteria\n"
        )

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "project_types_tracked": len(self._profiles),
            "profiles": {
                pt: {
                    "total": p.total_plans,
                    "success_rate": p.successful_plans / max(1, p.total_plans),
                    "score": round(p.combined_score, 3),
                    "confidence": round(p.confidence, 3),
                }
                for pt, p in self._profiles.items()
            },
        }
