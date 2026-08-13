"""Evolution skill creator — self-improving the self-improvement system.

Tracks which improvement strategies work best for which weak areas using
Bayesian effectiveness scoring. Creates evolution meta-skills after 5+
cycles. Learns which web research queries produce useful findings.

Zero-slowdown: all analysis runs post-cycle via asyncio.create_task.
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
class EvolutionCycleRecord:
    """A single evolution cycle record."""
    cycle_id: int
    weak_areas: list[str]
    improvements: list[dict[str, Any]]
    evaluations: dict[str, Any]
    timestamp: float = field(default_factory=time.time)


@dataclass
class ImprovementStrategyProfile:
    """Bayesian effectiveness profile for an improvement strategy."""
    strategy: str
    total_attempts: int = 0
    successful_attempts: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    categories_targeted: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    combined_score: float = 0.5
    confidence: float = 0.0


class EvolutionSkillCreator:
    """Self-improving evolution skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_cycles_before_meta_skill: int = 5,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_cycles_before_meta_skill = min_cycles_before_meta_skill
        self.share_via_universal_link = share_via_universal_link

        self._strategy_profiles: dict[str, ImprovementStrategyProfile] = {}
        self._all_records: deque[EvolutionCycleRecord] = deque(maxlen=100)
        self._meta_skill_created: bool = False
        self._stats = {
            "total_cycles": 0,
            "total_improvements": 0,
            "meta_skills_created": 0,
        }

    async def record_evolution_cycle(
        self,
        cycle_id: int,
        weak_areas: list[str],
        improvements: list[dict[str, Any]],
        evaluations: dict[str, Any],
    ) -> None:
        """Record an evolution cycle and update strategy profiles."""
        record = EvolutionCycleRecord(
            cycle_id=cycle_id,
            weak_areas=weak_areas,
            improvements=improvements,
            evaluations=evaluations,
        )
        self._all_records.append(record)
        self._stats["total_cycles"] += 1
        self._stats["total_improvements"] += len(improvements)

        for imp in improvements:
            strategy = imp.get("action", "unknown")[:100]
            category = imp.get("category", "general")

            profile = self._strategy_profiles.get(strategy)
            if profile is None:
                profile = ImprovementStrategyProfile(strategy=strategy)
                self._strategy_profiles[strategy] = profile

            profile.total_attempts += 1
            profile.categories_targeted[category] += 1

            eval_data = evaluations.get(category, {})
            if eval_data and eval_data.get("score", 0) > 0.6:
                profile.successful_attempts += 1
                profile.recent_results.append(1.0)
            else:
                profile.recent_results.append(0.0)

            self._update_profile_scores(profile)

        await self._maybe_create_evolution_meta_skill()

    def get_best_strategies_for_category(self, category: str, top_k: int = 3) -> list[str]:
        """Get the best improvement strategies for a given category."""
        scored: list[tuple[float, str]] = []
        for strategy, profile in self._strategy_profiles.items():
            cat_count = profile.categories_targeted.get(category, 0)
            if cat_count > 0:
                score = 0.5 * profile.combined_score + 0.5 * (cat_count / max(1, profile.total_attempts))
                scored.append((score, strategy))
        scored.sort(reverse=True)
        return [s for _, s in scored[:top_k]]

    def _update_profile_scores(self, profile: ImprovementStrategyProfile) -> None:
        """Update Bayesian scores for a strategy profile."""
        if profile.total_attempts < 2:
            return

        success_rate = profile.successful_attempts / profile.total_attempts
        reuse = min(1.0, profile.total_attempts / 10.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = 0.6 * bayesian_success + 0.4 * reuse
        profile.confidence = min(1.0, profile.total_attempts / 5.0)

    async def _maybe_create_evolution_meta_skill(self) -> None:
        """Create an evolution meta-skill after min cycles."""
        if self._meta_skill_created:
            return
        if len(self._all_records) < self.min_cycles_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "evolution-meta"
        existing = self.skill_manager.read(skill_name)
        if existing.success:
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for self-evolution — learned improvement strategies",
            content=content,
            category="evolution_meta",
            trigger_conditions=["self-improvement", "evolution", "benchmark", "capability assessment"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created evolution meta-skill: %s", skill_name)

    def _build_meta_skill_content(self) -> str:
        total = len(self._all_records)
        strategies_summary = "\n".join(
            f"  - {p.strategy[:60]}: {p.total_attempts} attempts, "
            f"success={p.successful_attempts}/{p.total_attempts}, "
            f"score={p.combined_score:.2f}"
            for p in sorted(self._strategy_profiles.values(), key=lambda x: x.total_attempts, reverse=True)[:10]
        )
        return (
            f"Evolution Meta-Skill\n"
            f"Total cycles: {total}\n"
            f"Strategies tracked: {len(self._strategy_profiles)}\n\n"
            f"Top strategies:\n{strategies_summary}\n\n"
            f"Best practices:\n"
            f"- Focus on weakest categories first\n"
            f"- Use web research to find latest techniques\n"
            f"- Track which strategies produce score improvements\n"
            f"- Re-evaluate after applying improvements\n"
        )

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "strategies_tracked": len(self._strategy_profiles),
            "top_strategies": [
                {
                    "strategy": p.strategy[:80],
                    "score": round(p.combined_score, 3),
                    "attempts": p.total_attempts,
                    "success_rate": p.successful_attempts / max(1, p.total_attempts),
                }
                for p in sorted(self._strategy_profiles.values(), key=lambda x: x.combined_score, reverse=True)[:5]
            ],
        }
