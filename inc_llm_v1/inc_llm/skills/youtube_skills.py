"""YouTube skill creator — self-improving YouTube video analysis.

Tracks video topics with Bayesian effectiveness scoring (same formula as
MetaLearner). Dynamically adjusts analysis prompts based on past feedback.
Creates pattern skills (3+ videos on same topic) and meta-skills (5+ total
videos).

Skill categories:
- youtube_knowledge: per-video knowledge skills
- youtube_pattern: cross-video pattern skills (shared topic patterns)
- youtube_meta: global YouTube analysis meta-skills

Zero-slowdown: all analysis runs post-turn via asyncio.create_task.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.math_core.statistics import PrecisionStatistics

logger = logging.getLogger(__name__)

POSITIVE_SIGNALS = frozenset({
    "great", "perfect", "exactly", "thanks", "thank you", "awesome",
    "correct", "right", "good", "nice", "helpful", "spot on", "love it",
    "amazing", "excellent", "brilliant", "fantastic", "wow",
})

NEGATIVE_SIGNALS = frozenset({
    "wrong", "incorrect", "bad", "terrible", "no", "not right",
    "doesn't work", "failed", "error", "broken", "useless", "horrible",
    "not helpful", "too long", "too short", "missing",
})

FOLLOWUP_CORRECTION_PATTERNS = frozenset({
    "actually", "instead", "should be", "i meant", "not that",
    "let me clarify", "what i really", "correction", "oops",
})

EMPHASIS_STYLES = ("general", "code_examples", "step_by_step", "pros_cons", "key_concepts")
DETAIL_LEVELS = ("concise", "moderate", "detailed")

DEFAULT_TOPIC_PARAMS: dict[str, dict[str, str]] = {
    "coding": {"emphasis": "code_examples", "detail_level": "detailed"},
    "programming": {"emphasis": "code_examples", "detail_level": "detailed"},
    "software": {"emphasis": "code_examples", "detail_level": "detailed"},
    "tutorial": {"emphasis": "step_by_step", "detail_level": "detailed"},
    "how to": {"emphasis": "step_by_step", "detail_level": "detailed"},
    "review": {"emphasis": "pros_cons", "detail_level": "moderate"},
    "comparison": {"emphasis": "pros_cons", "detail_level": "moderate"},
    "theory": {"emphasis": "key_concepts", "detail_level": "detailed"},
    "science": {"emphasis": "key_concepts", "detail_level": "detailed"},
    "math": {"emphasis": "key_concepts", "detail_level": "detailed"},
}


@dataclass
class VideoAnalysisSample:
    """A single video analysis record."""
    video_id: str
    topics: list[str]
    emphasis: str
    detail_level: str
    skill_name: str
    title: str
    channel: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class TopicProfile:
    """Bayesian effectiveness profile for a topic."""
    topic: str
    total_videos: int = 0
    emphasis_success: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    emphasis_attempts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    detail_success: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    detail_attempts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    positive_feedback: int = 0
    negative_feedback: int = 0
    corrections: int = 0
    recent_results: deque = field(default_factory=lambda: deque(maxlen=20))
    best_emphasis: str = "general"
    best_detail_level: str = "moderate"
    combined_score: float = 0.5
    confidence: float = 0.0


@dataclass
class AnalysisPromptAdjustment:
    """A prompt adjustment for a topic."""
    topic: str
    emphasis: str
    detail_level: str
    extra_instructions: str
    applied_at: float = field(default_factory=time.time)


class YouTubeSkillCreator:
    """Self-improving YouTube video analysis skill creator."""

    def __init__(
        self,
        memory: Any = None,
        skill_manager: Any = None,
        min_videos_before_pattern_skill: int = 3,
        min_videos_before_meta_skill: int = 5,
        share_via_universal_link: bool = True,
        auto_adjust_prompt: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self.min_videos_before_pattern_skill = min_videos_before_pattern_skill
        self.min_videos_before_meta_skill = min_videos_before_meta_skill
        self.share_via_universal_link = share_via_universal_link
        self.auto_adjust_prompt = auto_adjust_prompt

        self._topic_profiles: dict[str, TopicProfile] = {}
        self._all_samples: deque[VideoAnalysisSample] = deque(maxlen=500)
        self._prompt_adjustments: list[AnalysisPromptAdjustment] = []
        self._pattern_skills_created: set[str] = set()
        self._meta_skill_created: bool = False
        self._stats = {
            "total_videos_analyzed": 0,
            "pattern_skills_created": 0,
            "meta_skills_created": 0,
            "prompt_adjustments": 0,
            "feedback_positive": 0,
            "feedback_negative": 0,
            "feedback_corrections": 0,
        }

    async def record_analysis(
        self,
        video_id: str,
        topics: list[str],
        emphasis: str,
        detail_level: str,
        skill_name: str,
        title: str = "",
        channel: str = "",
    ) -> None:
        """Record a video analysis sample and update profiles."""
        sample = VideoAnalysisSample(
            video_id=video_id,
            topics=topics or ["general"],
            emphasis=emphasis,
            detail_level=detail_level,
            skill_name=skill_name,
            title=title,
            channel=channel,
        )
        self._all_samples.append(sample)
        self._stats["total_videos_analyzed"] += 1

        for topic in sample.topics:
            topic_lower = topic.lower().strip()
            if not topic_lower:
                continue

            profile = self._topic_profiles.get(topic_lower)
            if profile is None:
                profile = TopicProfile(topic=topic_lower)
                defaults = self._default_params_for_topics([topic_lower])
                if defaults:
                    profile.best_emphasis = defaults.get("emphasis", "general")
                    profile.best_detail_level = defaults.get("detail_level", "moderate")
                self._topic_profiles[topic_lower] = profile

            profile.total_videos += 1
            profile.emphasis_attempts[emphasis] += 1
            profile.detail_attempts[detail_level] += 1

        await self._maybe_create_pattern_skill()
        await self._maybe_create_meta_skill()

        if self.auto_adjust_prompt:
            self._adjust_prompt_for_topics(sample.topics)

    async def record_feedback(
        self,
        skill_name: str,
        user_message: str,
        previous_message: str = "",
        response_cached: bool = False,
    ) -> None:
        """Record user feedback for a YouTube skill."""
        if not user_message:
            return

        msg_lower = user_message.lower()
        is_positive = any(sig in msg_lower for sig in POSITIVE_SIGNALS)
        is_negative = any(sig in msg_lower for sig in NEGATIVE_SIGNALS)
        is_correction = self._is_followup_correction(user_message, previous_message)

        if not any([is_positive, is_negative, is_correction]):
            return

        sample = None
        for s in reversed(self._all_samples):
            if s.skill_name == skill_name:
                sample = s
                break

        if not sample:
            return

        for topic in sample.topics:
            topic_lower = topic.lower().strip()
            profile = self._topic_profiles.get(topic_lower)
            if not profile:
                continue

            profile.recent_results.append(
                1.0 if is_positive else (0.0 if is_negative else 0.3)
            )

            if is_positive:
                profile.positive_feedback += 1
                profile.emphasis_success[sample.emphasis] += 1
                profile.detail_success[sample.detail_level] += 1
                self._stats["feedback_positive"] += 1
            elif is_negative:
                profile.negative_feedback += 1
                self._stats["feedback_negative"] += 1
            elif is_correction:
                profile.corrections += 1
                self._stats["feedback_corrections"] += 1

            self._update_profile_scores(profile)

            if self.auto_adjust_prompt and profile.confidence > 0.3:
                if profile.combined_score < 0.4 and profile.corrections > 2:
                    self._try_different_emphasis(profile)

    def get_optimal_analysis_params(self, topics: list[str]) -> dict[str, Any]:
        """Get learned optimal analysis parameters for topics."""
        if not topics:
            return {"emphasis": "general", "detail_level": "moderate", "extra_instructions": ""}

        best_emphasis = "general"
        best_detail = "moderate"
        best_score = -1.0
        extra_instructions = ""

        for topic in topics:
            topic_lower = topic.lower().strip()
            profile = self._topic_profiles.get(topic_lower)
            if profile and profile.confidence > 0.2:
                if profile.combined_score > best_score:
                    best_score = profile.combined_score
                    best_emphasis = profile.best_emphasis
                    best_detail = profile.best_detail_level

        defaults = self._default_params_for_topics([t.lower() for t in topics])
        if best_score < 0 and defaults:
            best_emphasis = defaults.get("emphasis", "general")
            best_detail = defaults.get("detail_level", "moderate")

        for adj in reversed(self._prompt_adjustments):
            if adj.topic in [t.lower() for t in topics]:
                extra_instructions = adj.extra_instructions
                break

        return {
            "emphasis": best_emphasis,
            "detail_level": best_detail,
            "extra_instructions": extra_instructions,
        }

    def _default_params_for_topics(self, topics: list[str]) -> dict[str, str]:
        """Provide default parameters based on topic keywords."""
        for topic in topics:
            topic_lower = topic.lower()
            for keyword, params in DEFAULT_TOPIC_PARAMS.items():
                if keyword in topic_lower:
                    return params
        return {}

    def _update_profile_scores(self, profile: TopicProfile) -> None:
        """Update Bayesian scores for a topic profile."""
        if profile.total_videos < 2:
            return

        total_attempts = sum(profile.emphasis_attempts.values())
        total_success = sum(profile.emphasis_success.values())

        if total_attempts > 0:
            best_emphasis = max(
                profile.emphasis_attempts.keys(),
                key=lambda e: (
                    profile.emphasis_success[e] / max(1, profile.emphasis_attempts[e])
                    if profile.emphasis_attempts[e] > 0
                    else 0.0
                ),
            )
            profile.best_emphasis = best_emphasis

        total_detail_attempts = sum(profile.detail_attempts.values())
        total_detail_success = sum(profile.detail_success.values())
        if total_detail_attempts > 0:
            best_detail = max(
                profile.detail_attempts.keys(),
                key=lambda d: (
                    profile.detail_success[d] / max(1, profile.detail_attempts[d])
                    if profile.detail_attempts[d] > 0
                    else 0.0
                ),
            )
            profile.best_detail_level = best_detail

        success_rate = total_success / max(1, total_attempts)
        satisfaction = profile.positive_feedback / max(
            1, profile.positive_feedback + profile.negative_feedback
        )
        reuse = min(1.0, profile.total_videos / 10.0)

        bayesian_success = PrecisionStatistics.bayesian_update(0.5, list(profile.recent_results))
        profile.combined_score = (
            0.5 * bayesian_success + 0.3 * satisfaction + 0.2 * reuse
        )
        profile.confidence = min(1.0, total_attempts / 10.0)

    def _adjust_prompt_for_topics(self, topics: list[str]) -> None:
        """Adjust the analysis prompt based on topic feedback."""
        for topic in topics:
            topic_lower = topic.lower().strip()
            profile = self._topic_profiles.get(topic_lower)
            if not profile or profile.confidence < 0.3:
                continue

            if profile.corrections > 2 and profile.combined_score < 0.4:
                instruction = f"For '{topic_lower}' videos, focus more on accuracy and completeness."
                adjustment = AnalysisPromptAdjustment(
                    topic=topic_lower,
                    emphasis=profile.best_emphasis,
                    detail_level=profile.best_detail_level,
                    extra_instructions=instruction,
                )
                self._prompt_adjustments.append(adjustment)
                self._stats["prompt_adjustments"] += 1
                if len(self._prompt_adjustments) > 50:
                    self._prompt_adjustments = self._prompt_adjustments[-50:]

    def _try_different_emphasis(self, profile: TopicProfile) -> None:
        """Try a different emphasis style if current one isn't working."""
        current = profile.best_emphasis
        for style in EMPHASIS_STYLES:
            if style != current and profile.emphasis_attempts.get(style, 0) < 2:
                profile.best_emphasis = style
                logger.info(
                    "Switching emphasis for '%s' from '%s' to '%s'",
                    profile.topic, current, style,
                )
                return

    async def _maybe_create_pattern_skill(self) -> None:
        """Create a pattern skill after 3+ videos on the same topic."""
        for topic, profile in self._topic_profiles.items():
            if (
                profile.total_videos >= self.min_videos_before_pattern_skill
                and topic not in self._pattern_skills_created
            ):
                await self._create_pattern_skill(topic, profile)

    async def _create_pattern_skill(self, topic: str, profile: TopicProfile) -> None:
        """Create a cross-video pattern skill for a topic."""
        if not self.skill_manager:
            self._pattern_skills_created.add(topic)
            return

        skill_name = f"youtube-pattern-{topic.replace(' ', '-')[:30]}"
        if self._has_skill(skill_name):
            self._pattern_skills_created.add(topic)
            return

        content = self._build_pattern_skill_content(topic, profile)
        result = self.skill_manager.create(
            name=skill_name,
            description=f"YouTube analysis pattern for topic: {topic} ({profile.total_videos} videos analyzed)",
            content=content,
            category="youtube_pattern",
            trigger_conditions=[f"youtube video about {topic}", f"video about {topic}"],
        )

        if result.success:
            self._pattern_skills_created.add(topic)
            self._stats["pattern_skills_created"] += 1
            logger.info("Created YouTube pattern skill: %s", skill_name)
            if self.share_via_universal_link and self.memory:
                await self._share_pattern_skill(skill_name, content, topic)

    def _build_pattern_skill_content(self, topic: str, profile: TopicProfile) -> str:
        """Build content for a pattern skill."""
        samples = [s for s in self._all_samples if topic.lower() in [t.lower() for t in s.topics]]
        titles = [s.title for s in samples if s.title][:10]

        return (
            f"Topic: {topic}\n"
            f"Videos analyzed: {profile.total_videos}\n"
            f"Best analysis emphasis: {profile.best_emphasis}\n"
            f"Best detail level: {profile.best_detail_level}\n"
            f"Positive feedback: {profile.positive_feedback}\n"
            f"Negative feedback: {profile.negative_feedback}\n"
            f"Corrections: {profile.corrections}\n"
            f"Effectiveness score: {profile.combined_score:.2f}\n"
            f"Confidence: {profile.confidence:.2f}\n"
            f"Videos: {', '.join(titles)}\n"
            f"When analyzing {topic} videos, use '{profile.best_emphasis}' emphasis "
            f"with '{profile.best_detail_level}' detail level for best results."
        )

    async def _maybe_create_meta_skill(self) -> None:
        """Create a global YouTube analysis meta-skill after 5+ total videos."""
        if self._meta_skill_created:
            return
        if len(self._all_samples) < self.min_videos_before_meta_skill:
            return
        if not self.skill_manager:
            self._meta_skill_created = True
            return

        skill_name = "youtube-analysis-meta"
        if self._has_skill(skill_name):
            self._meta_skill_created = True
            return

        content = self._build_meta_skill_content()
        result = self.skill_manager.create(
            name=skill_name,
            description="Meta-skill for YouTube video analysis — learned patterns across all videos",
            content=content,
            category="youtube_meta",
            trigger_conditions=["youtube video", "video analysis", "transcript analysis"],
        )

        if result.success:
            self._meta_skill_created = True
            self._stats["meta_skills_created"] += 1
            logger.info("Created YouTube meta-skill: %s", skill_name)
            if self.share_via_universal_link and self.memory:
                await self._share_meta_skill(skill_name, content)

    def _build_meta_skill_content(self) -> str:
        """Build content for the YouTube analysis meta-skill."""
        total = len(self._all_samples)
        topics_summary = "\n".join(
            f"  - {p.topic}: {p.total_videos} videos, score={p.combined_score:.2f}, "
            f"emphasis={p.best_emphasis}, detail={p.best_detail_level}"
            for p in sorted(
                self._topic_profiles.values(),
                key=lambda x: x.total_videos,
                reverse=True,
            )[:10]
        )
        return (
            f"YouTube Video Analysis Meta-Skill\n"
            f"Total videos analyzed: {total}\n"
            f"Topics tracked: {len(self._topic_profiles)}\n"
            f"Pattern skills created: {len(self._pattern_skills_created)}\n"
            f"Prompt adjustments: {len(self._prompt_adjustments)}\n\n"
            f"Top topics:\n{topics_summary}\n\n"
            f"Best practices learned:\n"
            f"- Use topic-specific emphasis styles for better analysis\n"
            f"- Adjust detail level based on topic complexity\n"
            f"- Track corrections to identify weak analysis areas\n"
            f"- Create pattern skills after 3+ videos on same topic\n"
        )

    def _has_skill(self, name: str) -> bool:
        """Check if a skill already exists."""
        if not self.skill_manager:
            return False
        result = self.skill_manager.read(name)
        return result.success

    async def _share_pattern_skill(self, name: str, content: str, topic: str) -> None:
        """Share a pattern skill via universal link."""
        if not self.memory:
            return
        try:
            self.memory.register_fact(
                f"youtube_pattern_skill:{name}",
                content,
                metadata={"source": "youtube", "topic": topic, "type": "pattern_skill"},
            )
        except Exception:
            pass

    async def _share_meta_skill(self, name: str, content: str) -> None:
        """Share a meta-skill via universal link."""
        if not self.memory:
            return
        try:
            self.memory.register_fact(
                f"youtube_meta_skill:{name}",
                content,
                metadata={"source": "youtube", "type": "meta_skill"},
            )
        except Exception:
            pass

    @staticmethod
    def _detect_feedback(message: str) -> str:
        """Detect feedback type from a message."""
        msg_lower = message.lower()
        if any(sig in msg_lower for sig in POSITIVE_SIGNALS):
            return "positive"
        if any(sig in msg_lower for sig in NEGATIVE_SIGNALS):
            return "negative"
        return "neutral"

    @staticmethod
    def _is_followup_correction(message: str, previous: str = "") -> bool:
        """Check if a message is a correction of a previous response."""
        if not previous:
            return False
        msg_lower = message.lower()
        return any(pat in msg_lower for pat in FOLLOWUP_CORRECTION_PATTERNS)

    def get_stats(self) -> dict[str, Any]:
        return {
            **self._stats,
            "topics_tracked": len(self._topic_profiles),
            "prompt_adjustments_active": len(self._prompt_adjustments),
            "topic_scores": {
                topic: {
                    "score": round(p.combined_score, 3),
                    "confidence": round(p.confidence, 3),
                    "videos": p.total_videos,
                    "best_emphasis": p.best_emphasis,
                    "best_detail": p.best_detail_level,
                }
                for topic, p in self._topic_profiles.items()
            },
        }
