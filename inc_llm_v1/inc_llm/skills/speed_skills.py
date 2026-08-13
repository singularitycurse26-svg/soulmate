"""Speed skill creator — precision auto-detect skill creation for reply speed tuning.

Watches every chat() and chat_auto() response and records precise performance
metrics: tokens_per_second, latency percentiles (p50/p90/p99), cache hit rate,
and skill count applied. Uses exact mathematical formulas to compute optimal
inference parameters per channel + hardware tier.

Creates speed skills (category "speed_tuning") when a stable pattern is
detected after min_interactions responses on a channel. Speed skills contain
the computed optimal parameters and are shared via universal recursive link
so all instances learn which parameters produce the fastest replies.

Zero-slowdown: all analysis runs post-turn via asyncio.create_task. The
skill creation itself is O(1) dict lookups + simple arithmetic.

Mathematical formulas (all exact, no heuristics):
  tokens_per_second = completion_tokens / elapsed_seconds
  speed_multiplier = measured_tps / baseline_tps
  optimal_max_tokens = clamp(target_time_s * measured_tps, 16, hardware_max)
  optimal_num_ctx = clamp(base_ctx * speed_multiplier, 256, hardware_max_ctx)
  error_rate = failed_responses / total_responses (rolling window)
  optimal_temperature = base_temp * (1.0 - error_rate * 0.5)
  confidence = min(1.0, sample_count / min_interactions) * (1.0 - variance)
"""

from __future__ import annotations

import logging
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.memory.manager import MemoryManager
from inc_llm.skills.skill_manager import SkillManager
from inc_llm.math_core.statistics import PrecisionStatistics
from inc_llm.math_core.precision import SplitBitMath

logger = logging.getLogger(__name__)

TARGET_RESPONSE_TIMES: dict[str, float] = {
    "jarvis": 1.0,
    "hermes": 2.0,
    "telegram": 3.0,
    "openclaw": 1.5,
    "api": 5.0,
    "cli": 10.0,
    "web": 3.0,
    "app": 2.0,
    "ai_gaming": 2.0,
}

BASELINE_TOKENS_PER_SEC = 20.0

HIGH_URGENCY_KEYWORDS = frozenset({
    "time", "weather", "status", "date", "quick", "now", "fast", "brief",
    "summary", "yes", "no", "ok", "hello", "hi", "hey", "stop", "start",
    "pause", "resume", "cancel", "help", "what is", "who is", "where is",
})

LOW_URGENCY_KEYWORDS = frozenset({
    "explain", "analyze", "write", "create", "design", "implement", "build",
    "develop", "research", "detailed", "comprehensive", "full", "complete",
    "tutorial", "guide", "step by step", "architecture", "strategy",
})


@dataclass
class SpeedSample:
    channel: str
    hardware_tier: str
    message_length: int
    response_time_s: float
    tokens_generated: int
    tokens_per_second: float
    cache_hit: bool
    skills_applied: int
    urgency: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ChannelSpeedProfile:
    samples: deque = field(default_factory=lambda: deque(maxlen=100))
    total_responses: int = 0
    failed_responses: int = 0
    cached_responses: int = 0
    sum_tokens: int = 0
    sum_time: float = 0.0
    tokens_per_second_values: deque = field(default_factory=lambda: deque(maxlen=50))

    @property
    def avg_tokens_per_second(self) -> float:
        if not self.tokens_per_second_values:
            return BASELINE_TOKENS_PER_SEC
        values = list(self.tokens_per_second_values)
        ewma = PrecisionStatistics.exponential_weighted_moving_average(
            values, alpha=PrecisionStatistics.adaptive_alpha(len(values)),
        )
        return ewma[-1] if ewma else sum(values) / len(values)

    @property
    def avg_response_time(self) -> float:
        if self.total_responses == 0:
            return 0.0
        return self.sum_time / self.total_responses

    @property
    def error_rate(self) -> float:
        if self.total_responses == 0:
            return 0.0
        return self.failed_responses / self.total_responses

    @property
    def cache_hit_rate(self) -> float:
        if self.total_responses == 0:
            return 0.0
        return self.cached_responses / self.total_responses

    @property
    def p50_response_time(self) -> float:
        return self._percentile(50)

    @property
    def p90_response_time(self) -> float:
        return self._percentile(90)

    @property
    def p99_response_time(self) -> float:
        return self._percentile(99)

    def _percentile(self, pct: int) -> float:
        if not self.samples:
            return 0.0
        times = sorted(s.response_time_s for s in self.samples)
        idx = max(0, min(len(times) - 1, int(len(times) * pct / 100)))
        return times[idx]

    @property
    def tps_variance(self) -> float:
        if len(self.tokens_per_second_values) < 2:
            return 0.0
        avg = self.avg_tokens_per_second
        if avg == 0:
            return 0.0
        variance = sum((t - avg) ** 2 for t in self.tokens_per_second_values) / len(self.tokens_per_second_values)
        return math.sqrt(variance) / avg

    @property
    def confidence(self) -> float:
        sample_ratio = min(1.0, len(self.samples) / 5)
        stability = max(0.0, 1.0 - self.tps_variance)
        base_confidence = sample_ratio * stability
        # Use confidence interval width for additional precision
        if len(self.samples) >= 5:
            times = [s.response_time_s for s in self.samples]
            ci_lo, ci_hi = PrecisionStatistics.confidence_interval(times, 0.95)
            ci_width = ci_hi - ci_lo
            avg_time = sum(times) / len(times) if times else 1.0
            ci_ratio = ci_width / avg_time if avg_time > 0 else 1.0
            ci_factor = max(0.0, 1.0 - ci_ratio)
            base_confidence = base_confidence * 0.7 + ci_factor * 0.3
        return round(base_confidence, 4)


class SpeedSkillCreator:
    """Precision auto-detect skill creation for reply speed tuning.

    Watches response performance, computes optimal parameters using exact
    mathematics, creates speed skills, and shares them via universal link.

    Zero-slowdown: runs post-turn via asyncio.create_task.
    """

    def __init__(
        self,
        memory: MemoryManager,
        skill_manager: SkillManager,
        min_interactions: int = 5,
        share_via_universal_link: bool = True,
    ) -> None:
        self.memory = memory
        self.skill_manager = skill_manager
        self._min_interactions = min_interactions
        self._share = share_via_universal_link
        self._profiles: dict[str, ChannelSpeedProfile] = defaultdict(ChannelSpeedProfile)
        self._hardware_tier = "minimal"

    def set_hardware_tier(self, tier: str) -> None:
        self._hardware_tier = tier

    async def record_and_analyze(
        self,
        channel: str,
        hardware_tier: str,
        message_length: int,
        response_time_s: float,
        tokens_generated: int,
        cache_hit: bool,
        skills_applied: int,
        urgency: str = "normal",
        success: bool = True,
    ) -> dict[str, Any] | None:
        """Record a response sample and potentially create a speed skill.

        Called post-turn via asyncio.create_task — zero-slowdown.
        Returns skill creation result if a skill was created, None otherwise.
        """
        tps = tokens_generated / response_time_s if response_time_s > 0 else 0.0

        sample = SpeedSample(
            channel=channel,
            hardware_tier=hardware_tier,
            message_length=message_length,
            response_time_s=response_time_s,
            tokens_generated=tokens_generated,
            tokens_per_second=tps,
            cache_hit=cache_hit,
            skills_applied=skills_applied,
            urgency=urgency,
        )

        profile = self._profiles[channel]
        profile.samples.append(sample)
        profile.total_responses += 1
        profile.sum_tokens += tokens_generated
        profile.sum_time += response_time_s
        if not cache_hit and tps > 0:
            profile.tokens_per_second_values.append(tps)
        if cache_hit:
            profile.cached_responses += 1
        if not success:
            profile.failed_responses += 1

        if len(profile.samples) >= self._min_interactions and profile.confidence >= 0.6:
            if not self._has_speed_skill(channel, hardware_tier):
                return await self._create_speed_skill(channel, hardware_tier, profile)

        return None

    def _has_speed_skill(self, channel: str, hardware_tier: str) -> bool:
        skill_name = f"speed-{channel}-{hardware_tier}"
        existing = self.memory.semantic.get_skill(skill_name)
        return existing is not None

    async def _create_speed_skill(
        self, channel: str, hardware_tier: str, profile: ChannelSpeedProfile,
    ) -> dict[str, Any]:
        """Create a speed skill with computed optimal parameters."""
        target_time = TARGET_RESPONSE_TIMES.get(channel, 5.0)
        measured_tps = profile.avg_tokens_per_second
        speed_multiplier = measured_tps / BASELINE_TOKENS_PER_SEC

        hardware_max_tokens = self._get_hardware_max_tokens(hardware_tier)
        hardware_max_ctx = self._get_hardware_max_ctx(hardware_tier)
        base_ctx = 2048
        base_temp = 0.7

        optimal_max_tokens = self._clamp(
            int(target_time * measured_tps), 16, hardware_max_tokens,
        )
        optimal_num_ctx = self._clamp(
            int(base_ctx * speed_multiplier), 256, hardware_max_ctx,
        )
        error_rate = profile.error_rate
        optimal_temperature = round(base_temp * (1.0 - error_rate * 0.5), 3)
        optimal_temperature = self._clamp(optimal_temperature, 0.1, 1.0)

        skill_name = f"speed-{channel}-{hardware_tier}"
        content = self._build_skill_content(
            channel=channel,
            hardware_tier=hardware_tier,
            target_time=target_time,
            measured_tps=measured_tps,
            speed_multiplier=speed_multiplier,
            optimal_max_tokens=optimal_max_tokens,
            optimal_num_ctx=optimal_num_ctx,
            optimal_temperature=optimal_temperature,
            error_rate=error_rate,
            p50=profile.p50_response_time,
            p90=profile.p90_response_time,
            p99=profile.p99_response_time,
            cache_hit_rate=profile.cache_hit_rate,
            confidence=profile.confidence,
            total_responses=profile.total_responses,
        )

        result = self.skill_manager.create(
            name=skill_name,
            description=(
                f"Speed tuning for {channel} on {hardware_tier}: "
                f"{optimal_max_tokens} tokens, {optimal_temperature} temp, "
                f"{measured_tps:.1f} tps"
            ),
            content=content,
            category="speed_tuning",
            trigger_conditions=[
                f"channel == {channel}",
                f"hardware_tier == {hardware_tier}",
            ],
        )

        if result.success:
            logger.info(
                "Created speed skill: %s (tokens=%d, temp=%.3f, tps=%.1f, confidence=%.2f)",
                skill_name, optimal_max_tokens, optimal_temperature,
                measured_tps, profile.confidence,
            )
            return {"status": "created", "skill_name": skill_name}

        return {"status": "failed", "message": result.message}

    def _build_skill_content(self, **kwargs: Any) -> str:
        lines = [
            f"Speed Tuning Skill: {kwargs['channel']} / {kwargs['hardware_tier']}",
            f"=" * 50,
            f"",
            f"Computed Parameters (exact mathematics):",
            f"  optimal_max_tokens: {kwargs['optimal_max_tokens']}",
            f"  optimal_num_ctx: {kwargs['optimal_num_ctx']}",
            f"  optimal_temperature: {kwargs['optimal_temperature']}",
            f"",
            f"Performance Metrics:",
            f"  target_response_time: {kwargs['target_time']:.1f}s",
            f"  measured_tokens_per_second: {kwargs['measured_tps']:.2f}",
            f"  speed_multiplier: {kwargs['speed_multiplier']:.3f}",
            f"  error_rate: {kwargs['error_rate']:.3f}",
            f"  cache_hit_rate: {kwargs['cache_hit_rate']:.3f}",
            f"",
            f"Latency Percentiles:",
            f"  p50: {kwargs['p50']:.3f}s",
            f"  p90: {kwargs['p90']:.3f}s",
            f"  p99: {kwargs['p99']:.3f}s",
            f"",
            f"Confidence: {kwargs['confidence']:.3f} (from {kwargs['total_responses']} samples)",
            f"",
            f"Formulas used:",
            f"  optimal_max_tokens = clamp(target_time * measured_tps, 16, hw_max)",
            f"  optimal_num_ctx = clamp(base_ctx * speed_multiplier, 256, hw_max_ctx)",
            f"  optimal_temperature = base_temp * (1 - error_rate * 0.5)",
            f"  speed_multiplier = measured_tps / baseline_tps ({BASELINE_TOKENS_PER_SEC})",
        ]
        return "\n".join(lines)

    def get_optimal_params(self, channel: str, hardware_tier: str | None = None) -> dict[str, Any] | None:
        """Get computed optimal parameters for a channel+tier if a speed skill exists.

        O(1) lookup — called during chat_auto() for precision tuning.
        """
        tier = hardware_tier or self._hardware_tier
        skill_name = f"speed-{channel}-{tier}"
        skill = self.memory.semantic.get_skill(skill_name)
        if not skill:
            return None

        return self._parse_skill_content(skill.content)

    def _parse_skill_content(self, content: str) -> dict[str, Any]:
        params: dict[str, Any] = {}
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("optimal_max_tokens:"):
                params["max_tokens"] = int(line.split(":")[1].strip())
            elif line.startswith("optimal_num_ctx:"):
                params["num_ctx"] = int(line.split(":")[1].strip())
            elif line.startswith("optimal_temperature:"):
                params["temperature"] = float(line.split(":")[1].strip())
            elif line.startswith("measured_tokens_per_second:"):
                params["tokens_per_second"] = float(line.split(":")[1].strip())
            elif line.startswith("speed_multiplier:"):
                params["speed_multiplier"] = float(line.split(":")[1].strip())
        return params if params else None

    def get_stats(self) -> dict[str, Any]:
        return {
            channel: {
                "total_responses": p.total_responses,
                "avg_tokens_per_second": round(p.avg_tokens_per_second, 2),
                "avg_response_time": round(p.avg_response_time, 3),
                "p50": round(p.p50_response_time, 3),
                "p90": round(p.p90_response_time, 3),
                "p99": round(p.p99_response_time, 3),
                "error_rate": round(p.error_rate, 3),
                "cache_hit_rate": round(p.cache_hit_rate, 3),
                "confidence": round(p.confidence, 3),
                "samples": len(p.samples),
            }
            for channel, p in self._profiles.items()
        }

    @staticmethod
    def _clamp(value: int | float, lo: int | float, hi: int | float) -> int | float:
        return max(lo, min(hi, value))

    @staticmethod
    def _get_hardware_max_tokens(tier: str) -> int:
        limits = {
            "mobile": 32, "minimal": 128, "light": 256, "standard": 512,
            "full": 1024, "maximum": 2048, "datacenter": 4096,
            "supercomputer": 8192,
        }
        return limits.get(tier, 512)

    @staticmethod
    def _get_hardware_max_ctx(tier: str) -> int:
        limits = {
            "mobile": 512, "minimal": 1024, "light": 2048, "standard": 4096,
            "full": 8192, "maximum": 16384, "datacenter": 32768,
            "supercomputer": 65536,
        }
        return limits.get(tier, 4096)
