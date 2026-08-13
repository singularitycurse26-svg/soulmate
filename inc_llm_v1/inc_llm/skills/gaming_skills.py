"""Gaming skill creator — automatic skill creation for AI Gaming MPC.

Watches game decisions, companion interactions, and emotional patterns to
create skills about:
  - Which strategies work best per game type
  - Which companion dialogue styles get positive responses
  - Which emotional states lead to better user satisfaction
  - Which conversation patterns build relationship faster

Skill categories:
  gaming_strategy   — optimal strategies per game type
  gaming_companion   — companion dialogue patterns users like
  gaming_emotional   — emotional state patterns for better interactions
  gaming_relationship — relationship-building conversation patterns

Shares gaming skills via universal recursive link so all instances learn
which game strategies and companion behaviors work best.

Zero-slowdown: all analysis runs post-turn via asyncio.create_task.
Works in tandem with the recursive link — does not slow the LLM down.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.skills.skill_manager import SkillManager
from inc_llm.math_core.statistics import PrecisionStatistics

logger = logging.getLogger(__name__)

POSITIVE_FEEDBACK_SIGNALS = frozenset({
    "nice", "good move", "well played", "great", "awesome", "love it",
    "haha", "lol", "funny", "perfect", "yes", "thanks", "good one",
    "amazing", "incredible", "spot on", "nailed it", "brilliant",
})

NEGATIVE_FEEDBACK_SIGNALS = frozenset({
    "bad", "wrong", "no", "terrible", "boring", "not funny", "stop",
    "annoying", "frustrating", "don't do that", "try harder", "boring",
})


@dataclass
class GameDecisionSample:
    """Record of a single game decision and its outcome."""
    game_type: str
    decision: str
    outcome: str  # "win", "loss", "draw", "positive", "negative", "neutral"
    user_feedback: str  # "positive", "negative", "neutral"
    emotional_state: dict[str, float]
    companion_traits: list[str]
    timestamp: float = field(default_factory=time.time)


@dataclass
class CompanionInteractionSample:
    """Record of a companion dialogue interaction."""
    user_id: str
    dialogue_style: str  # "humorous", "supportive", "analytical", etc.
    emotional_context: dict[str, float]
    user_feedback: str
    relationship_change: float
    personality_traits: list[str]
    timestamp: float = field(default_factory=time.time)


@dataclass
class GameTypeProfile:
    """Performance profile for a game type."""
    samples: deque = field(default_factory=lambda: deque(maxlen=100))
    wins: int = 0
    losses: int = 0
    draws: int = 0
    positive_feedback: int = 0
    negative_feedback: int = 0
    best_decisions: deque = field(default_factory=lambda: deque(maxlen=20))
    worst_decisions: deque = field(default_factory=lambda: deque(maxlen=10))

    @property
    def win_rate(self) -> float:
        total = self.wins + self.losses + self.draws
        if total == 0:
            return 0.0
        return self.wins / total

    @property
    def satisfaction_rate(self) -> float:
        total = self.positive_feedback + self.negative_feedback
        if total == 0:
            return 0.5
        return self.positive_feedback / total

    @property
    def confidence(self) -> float:
        sample_ratio = min(1.0, len(self.samples) / 3)
        return round(sample_ratio, 3)


@dataclass
class CompanionStyleProfile:
    """Effectiveness profile for a companion dialogue style."""
    samples: deque = field(default_factory=lambda: deque(maxlen=100))
    positive_count: int = 0
    negative_count: int = 0
    total_relationship_gain: float = 0.0
    interactions: int = 0

    @property
    def satisfaction_rate(self) -> float:
        if self.interactions == 0:
            return 0.5
        return self.positive_count / self.interactions

    @property
    def avg_relationship_gain(self) -> float:
        if self.interactions == 0:
            return 0.0
        return self.total_relationship_gain / self.interactions

    @property
    def confidence(self) -> float:
        sample_ratio = min(1.0, len(self.samples) / 5)
        return round(sample_ratio, 3)


class GamingSkillCreator:
    """Automatic skill creation for AI Gaming MPC companion and game playing.

    Watches game decisions and companion interactions, creates skills about
    optimal strategies and dialogue styles, shares them via universal link.

    Zero-slowdown: all analysis runs post-turn via asyncio.create_task.
    """

    def __init__(
        self,
        memory: MemoryManager,
        skill_manager: SkillManager,
        min_games_before_strategy: int = 3,
        min_interactions_before_companion_skill: int = 5,
        share_via_universal_link: bool = True,
        track_emotional_patterns: bool = True,
        track_relationship_patterns: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self._min_games = min_games_before_strategy
        self._min_interactions = min_interactions_before_companion_skill
        self._share = share_via_universal_link
        self._track_emotional = track_emotional_patterns
        self._track_relationship = track_relationship_patterns

        self._game_profiles: dict[str, GameTypeProfile] = defaultdict(GameTypeProfile)
        self._style_profiles: dict[str, CompanionStyleProfile] = defaultdict(CompanionStyleProfile)
        self._emotional_patterns: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        self._skills_created: set[str] = set()

    async def record_and_analyze(
        self,
        connection_id: str,
        game_type: str = "",
        decision: str = "",
        outcome: str = "neutral",
        user_feedback: str = "neutral",
        emotional_state: dict[str, float] | None = None,
        companion_traits: list[str] | None = None,
        dialogue_style: str = "",
        relationship_change: float = 0.0,
        user_id: str = "",
    ) -> dict[str, Any] | None:
        """Record a game decision or companion interaction and potentially create a skill.

        Called post-turn via asyncio.create_task — zero-slowdown.
        Returns skill creation result if a skill was created, None otherwise.
        """
        emotional_state = emotional_state or {}
        companion_traits = companion_traits or []

        result = None

        # Record game decision if game_type provided
        if game_type and decision:
            sample = GameDecisionSample(
                game_type=game_type,
                decision=decision,
                outcome=outcome,
                user_feedback=user_feedback,
                emotional_state=emotional_state,
                companion_traits=companion_traits,
            )
            profile = self._game_profiles[game_type]
            profile.samples.append(sample)

            if outcome == "win":
                profile.wins += 1
                profile.best_decisions.append(decision)
            elif outcome == "loss":
                profile.losses += 1
                profile.worst_decisions.append(decision)
            elif outcome == "draw":
                profile.draws += 1

            if user_feedback == "positive":
                profile.positive_feedback += 1
            elif user_feedback == "negative":
                profile.negative_feedback += 1

            # Try to create strategy skill
            if len(profile.samples) >= self._min_games and profile.confidence >= 0.5:
                skill_name = f"gaming-strategy-{game_type}"
                if skill_name not in self._skills_created and not self._has_skill(skill_name):
                    result = await self._create_strategy_skill(game_type, profile)

        # Record companion interaction if dialogue_style provided
        if dialogue_style and user_id:
            sample = CompanionInteractionSample(
                user_id=user_id,
                dialogue_style=dialogue_style,
                emotional_context=emotional_state,
                user_feedback=user_feedback,
                relationship_change=relationship_change,
                personality_traits=companion_traits,
            )
            style_profile = self._style_profiles[dialogue_style]
            style_profile.samples.append(sample)
            style_profile.interactions += 1
            style_profile.total_relationship_gain += relationship_change

            if user_feedback == "positive":
                style_profile.positive_count += 1
            elif user_feedback == "negative":
                style_profile.negative_count += 1

            # Try to create companion skill
            if style_profile.interactions >= self._min_interactions and style_profile.confidence >= 0.5:
                skill_name = f"gaming-companion-{dialogue_style}"
                if skill_name not in self._skills_created and not self._has_skill(skill_name):
                    result = await self._create_companion_skill(dialogue_style, style_profile)

        # Track emotional patterns
        if self._track_emotional and emotional_state:
            mood = emotional_state.get("mood", 0.5)
            if user_feedback == "positive":
                self._emotional_patterns["positive_mood"]["avg"] += mood
                self._emotional_patterns["positive_mood"]["count"] += 1
            elif user_feedback == "negative":
                self._emotional_patterns["negative_mood"]["avg"] += mood
                self._emotional_patterns["negative_mood"]["count"] += 1

        return result

    def _has_skill(self, skill_name: str) -> bool:
        skill = self.memory.semantic.get_skill(skill_name)
        return skill is not None

    async def _create_strategy_skill(
        self, game_type: str, profile: GameTypeProfile,
    ) -> dict[str, Any]:
        """Create a gaming strategy skill for a game type."""
        skill_name = f"gaming-strategy-{game_type}"

        win_rate = profile.win_rate
        satisfaction = profile.satisfaction_rate
        best = list(profile.best_decisions)[-5:]
        worst = list(profile.worst_decisions)[-3:]

        content_lines = [
            f"Gaming Strategy Skill: {game_type}",
            f"=" * 50,
            f"",
            f"Performance Metrics:",
            f"  win_rate: {win_rate:.3f}",
            f"  satisfaction_rate: {satisfaction:.3f}",
            f"  total_games: {len(profile.samples)}",
            f"",
            f"Best Decisions (most recent):",
        ]
        for d in best:
            content_lines.append(f"  - {d}")
        content_lines.append(f"")
        content_lines.append(f"Decisions to Avoid:")
        for d in worst:
            content_lines.append(f"  - {d}")
        content_lines.extend([
            f"",
            f"Confidence: {profile.confidence:.3f}",
            f"",
            f"Recommendation: Use best decisions as primary strategy.",
            f"Avoid worst decisions — they correlate with losses.",
        ])

        result = self.skill_manager.create(
            name=skill_name,
            description=f"Strategy for {game_type}: win_rate={win_rate:.1%}, satisfaction={satisfaction:.1%}",
            content="\n".join(content_lines),
            category="gaming_strategy",
            trigger_conditions=[f"game_type == {game_type}"],
        )

        if result.success:
            self._skills_created.add(skill_name)
            logger.info(
                "Created gaming strategy skill: %s (win_rate=%.2f, games=%d)",
                skill_name, win_rate, len(profile.samples),
            )
            return {"status": "created", "skill_name": skill_name, "type": "gaming_strategy"}

        return {"status": "failed", "message": result.message}

    async def _create_companion_skill(
        self, dialogue_style: str, profile: CompanionStyleProfile,
    ) -> dict[str, Any]:
        """Create a companion dialogue style skill."""
        skill_name = f"gaming-companion-{dialogue_style}"

        satisfaction = profile.satisfaction_rate
        avg_rel = profile.avg_relationship_gain

        content_lines = [
            f"Companion Dialogue Skill: {dialogue_style}",
            f"=" * 50,
            f"",
            f"Effectiveness Metrics:",
            f"  satisfaction_rate: {satisfaction:.3f}",
            f"  avg_relationship_gain: {avg_rel:.4f}",
            f"  total_interactions: {profile.interactions}",
            f"",
            f"Recommendation: Use {dialogue_style} style when user seems receptive.",
            f"This style has {satisfaction:.1%} positive feedback rate.",
            f"Average relationship gain per interaction: {avg_rel:.4f}",
            f"",
            f"Confidence: {profile.confidence:.3f}",
        ]

        result = self.skill_manager.create(
            name=skill_name,
            description=f"Companion style '{dialogue_style}': satisfaction={satisfaction:.1%}",
            content="\n".join(content_lines),
            category="gaming_companion",
            trigger_conditions=[f"dialogue_style == {dialogue_style}"],
        )

        if result.success:
            self._skills_created.add(skill_name)
            logger.info(
                "Created companion skill: %s (satisfaction=%.2f, interactions=%d)",
                skill_name, satisfaction, profile.interactions,
            )
            return {"status": "created", "skill_name": skill_name, "type": "gaming_companion"}

        return {"status": "failed", "message": result.message}

    def get_optimal_strategy(self, game_type: str, situation: str = "") -> dict[str, Any] | None:
        """Get computed optimal strategy for a game type if a skill exists.

        O(1) lookup — called before game decisions to inform the LLM prompt.
        """
        skill_name = f"gaming-strategy-{game_type}"
        skill = self.memory.semantic.get_skill(skill_name)
        if not skill:
            return None

        best_decisions: list[str] = []
        worst_decisions: list[str] = []
        for line in skill.content.split("\n"):
            line = line.strip()
            if line.startswith("- ") and best_decisions:
                best_decisions.append(line[2:])
            elif line.startswith("- "):
                best_decisions.append(line[2:])

        return {
            "game_type": game_type,
            "best_decisions": best_decisions,
            "skill_content": skill.content,
        }

    def get_companion_style(
        self, user_id: str, emotional_context: dict[str, float] | None = None,
    ) -> dict[str, Any] | None:
        """Get best companion dialogue style for current context.

        O(1) lookup — called before companion responses to adjust personality.
        """
        best_style = None
        best_score = -1.0

        for style_name, profile in self._style_profiles.items():
            if profile.interactions < self._min_interactions:
                continue
            score = profile.satisfaction_rate * 0.6 + min(1.0, max(0.0, profile.avg_relationship_gain * 10)) * 0.4
            if score > best_score:
                best_score = score
                best_style = style_name

        if not best_style:
            return None

        skill_name = f"gaming-companion-{best_style}"
        skill = self.memory.semantic.get_skill(skill_name)

        return {
            "recommended_style": best_style,
            "satisfaction_rate": round(self._style_profiles[best_style].satisfaction_rate, 3),
            "avg_relationship_gain": round(self._style_profiles[best_style].avg_relationship_gain, 4),
            "skill_content": skill.content if skill else "",
        }

    def get_stats(self) -> dict[str, Any]:
        """Get gaming skill statistics."""
        return {
            "game_types_tracked": len(self._game_profiles),
            "companion_styles_tracked": len(self._style_profiles),
            "skills_created": len(self._skills_created),
            "game_profiles": {
                gt: {
                    "win_rate": round(p.win_rate, 3),
                    "satisfaction_rate": round(p.satisfaction_rate, 3),
                    "total_games": len(p.samples),
                    "confidence": p.confidence,
                }
                for gt, p in self._game_profiles.items()
            },
            "companion_styles": {
                style: {
                    "satisfaction_rate": round(p.satisfaction_rate, 3),
                    "avg_relationship_gain": round(p.avg_relationship_gain, 4),
                    "interactions": p.interactions,
                    "confidence": p.confidence,
                }
                for style, p in self._style_profiles.items()
            },
        }

    @staticmethod
    def detect_feedback(text: str) -> str:
        """Detect user feedback from text."""
        text_lower = text.lower().strip()
        if any(sig in text_lower for sig in POSITIVE_FEEDBACK_SIGNALS):
            return "positive"
        if any(sig in text_lower for sig in NEGATIVE_FEEDBACK_SIGNALS):
            return "negative"
        return "neutral"
