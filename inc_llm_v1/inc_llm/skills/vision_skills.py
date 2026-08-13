"""Vision skill creator — self-improving image understanding.

Tracks vision analysis patterns with Bayesian effectiveness scoring. Creates
vision meta-skills after 10+ analyses. Learns which prompt types work best
for which image categories.

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
class VisionAnalysisRecord:
    """A single vision analysis record."""
    prompt_type: str
    model: str
    image_category: str
    success: bool
    description_length: int
    timestamp: float = field(default_factory=time.time)


@dataclass
class VisionPromptProfile:
    """Bayesian effectiveness profile for a vision prompt type."""
    prompt_type: str
    total_uses: int = 0
    successful_uses: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    avg_description_length: float = 0.0
    image_categories: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    combined_score: float = 0.5
    confidence: float = 0.0


class VisionSkillCreator:
    """Self-improving vision analysis skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_analyses_before_meta_skill: int = 10,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_analyses_before_meta_skill = min_analyses_before_meta_skill
        self.share_via_universal_link = share_via_universal_link

        self._profiles: dict[str, VisionPromptProfile] = {}
        self._all_records: deque[VisionAnalysisRecord] = deque(maxlen=200)
        self._meta_skill_created: bool = False
        self._stats = {
            "total_analyses": 0,
            "successful_analyses": 0,
            "meta_skills_created": 0,
        }

    async def record_analysis(
        self,
        prompt_type: str,
        model: str,
        image_category: str = "general",
        success: bool = True,
        description_length: int = 0,
    ) -> None:
        """Record a vision analysis outcome."""
        record = VisionAnalysisRecord(
            prompt_type=prompt_type,
            model=model,
            image_category=image_category,
            success=success,
            description_length=description_length,
        )
        self._all_records.append(record)
        self._stats["total_analyses"] += 1
        if success:
            self._stats["successful_analyses"] += 1

        profile = self._profiles.get(prompt_type)
        if profile is None:
            profile = VisionPromptProfile(prompt_type=prompt_type)
            self._profiles[prompt_type] = profile

        profile.total_uses += 1
        if success:
            profile.successful_uses += 1
        profile.recent_results.append(1.0 if success else 0.0)
        profile.image_categories[image_category] += 1

        n = profile.total_uses
        profile.avg_description_length = ((profile.avg_description_length * (n - 1)) + description_length) / n

        self._update_profile_scores(profile)
        await self._maybe_create_vision_meta_skill()

    def get_best_prompt_for_category(self, image_category: str) -> str:
        """Get the best prompt type for a given image category."""
        scored: list[tuple[float, str]] = []
        for prompt_type, profile in self._profiles.items():
            cat_count = profile.image_categories.get(image_category, 0)
            if cat_count > 0:
                score = 0.5 * profile.combined_score + 0.5 * (cat_count / max(1, profile.total_uses))
                scored.append((score, prompt_type))
        scored.sort(reverse=True)
        return scored[0][1] if scored else "describe"

    def _update_profile_scores(self, profile: VisionPromptProfile) -> None:
        """Update Bayesian scores."""
        if profile.total_uses < 2:
            return

        success_rate = profile.successful_uses / profile.total_uses
        reuse = min(1.0, profile.total_uses / 10.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = 0.6 * bayesian_success + 0.4 * reuse
        profile.confidence = min(1.0, profile.total_uses / 5.0)

    async def _maybe_create_vision_meta_skill(self) -> None:
        """Create a vision meta-skill after min analyses."""
        if self._meta_skill_created:
            return
        if len(self._all_records) < self.min_analyses_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "vision-analysis-meta"
        existing = self.skill_manager.read(skill_name)
        if existing.success:
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for vision analysis — learned patterns across all image analyses",
            content=content,
            category="vision_meta",
            trigger_conditions=["image analysis", "vision", "image understanding", "ocr"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created vision meta-skill: %s", skill_name)

    def _build_meta_skill_content(self) -> str:
        total = len(self._all_records)
        profiles_summary = "\n".join(
            f"  - {p.prompt_type}: {p.total_uses} uses, "
            f"success={p.successful_uses}/{p.total_uses}, "
            f"score={p.combined_score:.2f}, "
            f"avg_desc_len={p.avg_description_length:.0f}"
            for p in sorted(self._profiles.values(), key=lambda x: x.total_uses, reverse=True)[:10]
        )
        return (
            f"Vision Analysis Meta-Skill\n"
            f"Total analyses: {total}\n"
            f"Prompt types tracked: {len(self._profiles)}\n\n"
            f"Prompt profiles:\n{profiles_summary}\n\n"
            f"Best practices:\n"
            f"- Use moondream2 for CPU-only environments\n"
            f"- Use llava as fallback for complex images\n"
            f"- Select prompt type based on image category\n"
            f"- Track description length to evaluate quality\n"
        )

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "prompt_types_tracked": len(self._profiles),
            "profiles": {
                pt: {
                    "total": p.total_uses,
                    "success_rate": p.successful_uses / max(1, p.total_uses),
                    "score": round(p.combined_score, 3),
                    "confidence": round(p.confidence, 3),
                }
                for pt, p in self._profiles.items()
            },
        }
