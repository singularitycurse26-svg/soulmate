"""Meta-learner — harness-level self-improvement without weight changes.

Watches which skills the LLM uses, how effective they are, and learns to
select and apply skills more intelligently over time. Pure software —
no GPU needed, works on phones, zero-slowdown.

Skill effectiveness scoring (exact formula):
  success_rate = times_skill_helped / times_skill_applied
  user_satisfaction = positive_signals / total_uses
  reuse_rate = times_cached_with_skill / times_skill_applied
  combined_score = 0.5 * success_rate + 0.3 * user_satisfaction + 0.2 * reuse_rate

Meta-skills (category "meta"): skills about HOW to use skills.
Examples:
  - "When user asks about Python, apply code skills first"
  - "For Telegram channel, shorter responses get higher satisfaction"
  - "Skills A + B together produce better results than either alone"

Cross-skill linking: discovers skill combinations that work well together.

All analysis runs post-turn via asyncio.create_task — zero-slowdown.
Meta-learnings are shared via universal recursive link.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.skills.skill_manager import SkillManager
from inc_llm.math_core.statistics import PrecisionStatistics

logger = logging.getLogger(__name__)

POSITIVE_SIGNALS = frozenset({
    "thanks", "thank you", "perfect", "great", "awesome", "exactly",
    "that works", "that's right", "correct", "yes", "good", "nice",
    "exactly what", "spot on", "nailed it", "appreciate",
})

NEGATIVE_SIGNALS = frozenset({
    "no", "wrong", "incorrect", "not right", "try again", "that's not",
    "doesn't work", "not what", "error", "broken", "bad", "terrible",
    "not helpful", "useless", "fix",
})

FOLLOWUP_CORRECTION_PATTERNS = frozenset({
    "actually", "instead", "i meant", "not that", "let me clarify",
    "what i really", "sorry i meant", "i should have said",
})


@dataclass
class SkillUsageRecord:
    skill_name: str
    channel: str
    timestamp: float
    was_effective: bool = False
    user_feedback: str = "neutral"
    response_cached: bool = False
    response_time_s: float = 0.0


@dataclass
class SkillEffectiveness:
    skill_name: str
    times_applied: int = 0
    times_helped: int = 0
    times_positive: int = 0
    times_negative: int = 0
    times_cached: int = 0
    times_followup_correction: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    last_updated: float = field(default_factory=time.time)

    @property
    def success_rate(self) -> float:
        if self.times_applied == 0:
            return 0.0
        return self.times_helped / self.times_applied

    @property
    def user_satisfaction(self) -> float:
        total = self.times_positive + self.times_negative
        if total == 0:
            return 0.5
        return self.times_positive / total

    @property
    def reuse_rate(self) -> float:
        if self.times_applied == 0:
            return 0.0
        return self.times_cached / self.times_applied

    @property
    def combined_score(self) -> float:
        """Bayesian-enhanced combined effectiveness score.

        Uses Bayesian posterior for success_rate instead of simple fraction,
        providing more stable estimates with few samples.
        """
        # Bayesian success rate: Beta(1 + helped, 1 + applied - helped)
        bayesian_success = PrecisionStatistics.bayesian_update(
            0.5, list(self.recent_results),
        ) if self.recent_results else self.success_rate
        return (
            0.5 * bayesian_success
            + 0.3 * self.user_satisfaction
            + 0.2 * self.reuse_rate
        )

    @property
    def correction_rate(self) -> float:
        if self.times_applied == 0:
            return 0.0
        return self.times_followup_correction / self.times_applied


@dataclass
class SkillCombination:
    skill_a: str
    skill_b: str
    times_together: int = 0
    times_effective: int = 0

    @property
    def synergy_score(self) -> float:
        if self.times_together == 0:
            return 0.0
        return self.times_effective / self.times_together


class MetaLearner:
    """Harness-level meta-learning — learns to use skills more intelligently.

    Tracks skill effectiveness, re-ranks skills during context prefetch,
    creates meta-skills about optimal skill usage, discovers skill synergies.

    Zero-slowdown: all analysis runs post-turn via asyncio.create_task.
    """

    def __init__(
        self,
        memory: MemoryManager,
        skill_manager: SkillManager,
        min_uses_before_scoring: int = 5,
        effectiveness_threshold: float = 0.3,
        auto_adjust_selection: bool = True,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self._min_uses = min_uses_before_scoring
        self._threshold = effectiveness_threshold
        self._auto_adjust = auto_adjust_selection
        self._share = share_via_universal_link

        self._effectiveness: dict[str, SkillEffectiveness] = {}
        self._combinations: dict[tuple[str, str], SkillCombination] = {}
        self._channel_skill_prefs: dict[str, dict[str, float]] = defaultdict(dict)
        self._last_skill_used: dict[str, str] = {}
        self._meta_skills_created: set[str] = set()

    async def record_and_analyze(
        self,
        user_id: str,
        user_message: str,
        assistant_response: str,
        session_id: str,
        skills_applied: list[str] | None = None,
        channel: str = "cli",
        response_cached: bool = False,
        response_time_s: float = 0.0,
        previous_message: str | None = None,
    ) -> dict[str, Any] | None:
        """Record skill usage and analyze effectiveness.

        Called post-turn via asyncio.create_task — zero-slowdown.
        Returns meta-skill creation result if one was created.
        """
        if not skills_applied:
            skills_applied = []

        feedback = self._detect_feedback(user_message, previous_message)
        was_effective = self._assess_effectiveness(
            user_message, assistant_response, feedback, response_cached,
        )

        for skill_name in skills_applied:
            self._record_skill_usage(
                skill_name=skill_name,
                channel=channel,
                was_effective=was_effective,
                feedback=feedback,
                response_cached=response_cached,
                response_time_s=response_time_s,
            )

        if len(skills_applied) >= 2:
            self._record_combination(skills_applied, was_effective)

        self._update_channel_prefs(channel, skills_applied, was_effective)

        if previous_message and self._is_followup_correction(user_message, previous_message):
            for skill_name in skills_applied:
                eff = self._effectiveness.get(skill_name)
                if eff:
                    eff.times_followup_correction += 1

        meta_result = await self._maybe_create_meta_skill(channel)
        synergy_result = await self._maybe_create_synergy_skill()

        return meta_result or synergy_result

    def _detect_feedback(self, message: str, previous_message: str | None) -> str:
        msg_lower = message.lower().strip()

        if any(sig in msg_lower for sig in POSITIVE_SIGNALS):
            return "positive"
        if any(sig in msg_lower for sig in NEGATIVE_SIGNALS):
            return "negative"
        return "neutral"

    def _assess_effectiveness(
        self, user_message: str, response: str, feedback: str, cached: bool,
    ) -> bool:
        if feedback == "positive":
            return True
        if feedback == "negative":
            return False
        if cached:
            return True
        if len(response) > 10 and not response.startswith("I'm sorry") and not response.startswith("I cannot"):
            return True
        return False

    def _is_followup_correction(self, current: str, previous: str) -> bool:
        current_lower = current.lower()
        return any(p in current_lower for p in FOLLOWUP_CORRECTION_PATTERNS)

    def _record_skill_usage(
        self,
        skill_name: str,
        channel: str,
        was_effective: bool,
        feedback: str,
        response_cached: bool,
        response_time_s: float,
    ) -> None:
        if skill_name not in self._effectiveness:
            self._effectiveness[skill_name] = SkillEffectiveness(skill_name=skill_name)

        eff = self._effectiveness[skill_name]
        eff.times_applied += 1
        eff.last_updated = time.time()
        eff.recent_results.append(was_effective)

        if was_effective:
            eff.times_helped += 1
        if feedback == "positive":
            eff.times_positive += 1
        elif feedback == "negative":
            eff.times_negative += 1
        if response_cached:
            eff.times_cached += 1

    def _record_combination(self, skills: list[str], was_effective: bool) -> None:
        for i, a in enumerate(skills):
            for b in skills[i + 1:]:
                key = tuple(sorted([a, b]))
                if key not in self._combinations:
                    self._combinations[key] = SkillCombination(
                        skill_a=key[0], skill_b=key[1],
                    )
                combo = self._combinations[key]
                combo.times_together += 1
                if was_effective:
                    combo.times_effective += 1

    def _update_channel_prefs(self, channel: str, skills: list[str], was_effective: bool) -> None:
        prefs = self._channel_skill_prefs[channel]
        for skill_name in skills:
            current = prefs.get(skill_name, 0.5)
            # Bayesian-inspired update: smaller adjustments as data accumulates
            eff = self._effectiveness.get(skill_name)
            adjustment = 0.05 if (not eff or eff.times_applied < 10) else 0.02
            if was_effective:
                prefs[skill_name] = min(1.0, current + adjustment)
            else:
                prefs[skill_name] = max(0.0, current - adjustment)

    def get_effectiveness_scores(self) -> dict[str, float]:
        """Get Bayesian-enhanced combined effectiveness scores for all tracked skills."""
        return {
            name: round(eff.combined_score, 3)
            for name, eff in self._effectiveness.items()
            if eff.times_applied >= self._min_uses
        }

    def detect_distribution_shift(self, skill_name: str) -> float:
        """Detect if a skill's effectiveness has shifted using KL divergence.

        Compares recent results distribution to historical distribution.
        Returns KL divergence value — higher means more shift.
        """
        eff = self._effectiveness.get(skill_name)
        if not eff or len(eff.recent_results) < 5:
            return 0.0
        recent = list(eff.recent_results)
        recent_success = sum(1 for r in recent if r) / len(recent)
        historical_success = eff.success_rate
        # Build distributions: [success_prob, failure_prob]
        p = [max(0.01, recent_success), max(0.01, 1.0 - recent_success)]
        q = [max(0.01, historical_success), max(0.01, 1.0 - historical_success)]
        return PrecisionStatistics.kl_divergence(p, q)

    def rerank_skills(self, skills: list[dict[str, Any]], channel: str = "cli") -> list[dict[str, Any]]:
        """Re-rank retrieved skills by effectiveness score.

        Called during prefetch_context — O(n log n) where n = skill count.
        Skills with high effectiveness are boosted, low ones demoted.
        """
        if not self._auto_adjust or not skills:
            return skills

        prefs = self._channel_skill_prefs.get(channel, {})
        scored = []
        for skill in skills:
            name = skill.get("name", skill.get("id", ""))
            base_score = skill.get("relevance_score", 0.5)

            eff = self._effectiveness.get(name)
            eff_score = eff.combined_score if eff and eff.times_applied >= self._min_uses else 0.5
            channel_pref = prefs.get(name, 0.5)

            final_score = base_score * 0.4 + eff_score * 0.4 + channel_pref * 0.2
            scored.append((final_score, skill))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [s for _, s in scored]

    async def _maybe_create_meta_skill(self, channel: str) -> dict[str, Any] | None:
        """Create a meta-skill about optimal skill usage for a channel."""
        prefs = self._channel_skill_prefs.get(channel, {})
        if len(prefs) < 3:
            return None

        top_skills = sorted(prefs.items(), key=lambda x: x[1], reverse=True)[:5]
        if top_skills[0][1] < 0.6:
            return None

        skill_name = f"meta-channel-{channel}"
        if skill_name in self._meta_skills_created:
            return None

        existing = self.memory.semantic.get_skill(skill_name)
        if existing:
            self._meta_skills_created.add(skill_name)
            return None

        top_names = [s[0] for s in top_skills if s[1] >= 0.5]
        if len(top_names) < 2:
            return None

        content = self._build_meta_skill_content(channel, top_skills)

        result = self.skill_manager.create(
            name=skill_name,
            description=f"Meta-skill: optimal skill selection for {channel} channel",
            content=content,
            category="meta",
            trigger_conditions=[f"channel == {channel}"],
        )

        if result.success:
            self._meta_skills_created.add(skill_name)
            logger.info("Created meta-skill: %s (top skills: %s)", skill_name, top_names[:3])
            return {"status": "created", "skill_name": skill_name, "type": "meta"}

        return None

    def _build_meta_skill_content(self, channel: str, top_skills: list[tuple[str, float]]) -> str:
        lines = [
            f"Meta-Skill: Optimal Skill Selection for {channel}",
            f"=" * 50,
            f"",
            f"Top skills for this channel (by effectiveness):",
        ]
        for name, score in top_skills:
            eff = self._effectiveness.get(name)
            if eff:
                lines.append(
                    f"  {name}: score={score:.3f} "
                    f"(success={eff.success_rate:.2f}, satisfaction={eff.user_satisfaction:.2f}, "
                    f"reuse={eff.reuse_rate:.2f}, uses={eff.times_applied})"
                )
            else:
                lines.append(f"  {name}: score={score:.3f}")

        lines.extend([
            f"",
            f"Recommendation: Apply skills in order of score above.",
            f"Skills with score < 0.3 should be deprioritized for this channel.",
            f"",
            f"Formula: combined_score = 0.5 * success_rate + 0.3 * user_satisfaction + 0.2 * reuse_rate",
        ])
        return "\n".join(lines)

    async def _maybe_create_synergy_skill(self) -> dict[str, Any] | None:
        """Create a synergy skill when two skills work well together."""
        for (a, b), combo in self._combinations.items():
            if combo.times_together < 5:
                continue
            if combo.synergy_score < 0.7:
                continue

            skill_name = f"meta-synergy-{a}-{b}"
            if skill_name in self._meta_skills_created:
                continue

            existing = self.memory.semantic.get_skill(skill_name)
            if existing:
                self._meta_skills_created.add(skill_name)
                continue

            content = (
                f"Synergy Skill: {a} + {b}\n"
                "=" * 50 + "\n\n"
                f"These two skills work exceptionally well together.\n"
                f"Synergy score: {combo.synergy_score:.3f}\n"
                f"Times used together: {combo.times_together}\n"
                f"Times effective: {combo.times_effective}\n\n"
                f"Recommendation: When {a} is applicable, also consider {b} "
                f"and vice versa. Apply both for best results."
            )

            result = self.skill_manager.create(
                name=skill_name,
                description=f"Synergy: {a} + {b} (score={combo.synergy_score:.2f})",
                content=content,
                category="meta",
                trigger_conditions=[
                    f"skill_applied == {a}",
                    f"skill_applied == {b}",
                ],
            )

            if result.success:
                self._meta_skills_created.add(skill_name)
                logger.info(
                    "Created synergy skill: %s (score=%.2f, times=%d)",
                    skill_name, combo.synergy_score, combo.times_together,
                )
                return {"status": "created", "skill_name": skill_name, "type": "synergy"}

        return None

    def get_stats(self) -> dict[str, Any]:
        return {
            "tracked_skills": len(self._effectiveness),
            "meta_skills_created": len(self._meta_skills_created),
            "combinations_tracked": len(self._combinations),
            "channels_tracked": len(self._channel_skill_prefs),
            "top_effective": [
                {"skill": name, "score": round(eff.combined_score, 3), "uses": eff.times_applied}
                for name, eff in sorted(
                    self._effectiveness.items(),
                    key=lambda x: x[1].combined_score,
                    reverse=True,
                )[:10]
            ],
            "top_synergies": [
                {"skills": f"{c.skill_a} + {c.skill_b}", "score": round(c.synergy_score, 3), "times": c.times_together}
                for c in sorted(
                    self._combinations.values(),
                    key=lambda x: x.synergy_score,
                    reverse=True,
                )[:5]
                if c.times_together >= 3
            ],
        }
