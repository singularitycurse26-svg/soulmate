"""Channel auto-tuner for incllmv2.

Detects which integration channel is calling (Jarvis, Hermes, Telegram,
OpenClaw, API, CLI, Web, App) and adjusts inference parameters per channel.

Adaptive tuning: tracks average response time per channel and auto-adjusts
token limits if a channel is consistently slow or fast.

Zero-slowdown: profile lookup is a dict read (~0.01ms). Adaptive
re-evaluation runs every 60s in a background task, not per-request.
Response time recording is a single append + rolling average — O(1).
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from inc_llm.hardware_detector import HardwareTier
from inc_llm.math_core.precision import SplitBitMath
from inc_llm.math_core.statistics import PrecisionStatistics

logger = logging.getLogger(__name__)


@dataclass
class ChannelProfile:
    base_max_tokens: int = 256
    base_num_ctx: int = 2048
    stream: bool = True
    temperature: float = 0.7
    description: str = ""


CHANNEL_PROFILES: dict[str, ChannelProfile] = {
    "jarvis": ChannelProfile(
        base_max_tokens=64, base_num_ctx=1024, stream=True,
        temperature=0.5, description="Voice commands — short, fast responses",
    ),
    "hermes": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=True,
        temperature=0.7, description="Agent delegation — structured task output",
    ),
    "telegram": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=False,
        temperature=0.7, description="Text chat — medium responses, no streaming",
    ),
    "openclaw": ChannelProfile(
        base_max_tokens=128, base_num_ctx=1024, stream=True,
        temperature=0.5, description="Automation — concise, structured output",
    ),
    "api": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=True,
        temperature=0.7, description="OpenAI-compatible API — flexible",
    ),
    "cli": ChannelProfile(
        base_max_tokens=512, base_num_ctx=4096, stream=True,
        temperature=0.7, description="Terminal — detailed, long-form output",
    ),
    "web": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=True,
        temperature=0.7, description="Website chat — SSE streaming, medium responses",
    ),
    "app": ChannelProfile(
        base_max_tokens=128, base_num_ctx=1024, stream=True,
        temperature=0.6, description="Mobile app — short, battery-aware",
    ),
    "ai_gaming": ChannelProfile(
        base_max_tokens=128, base_num_ctx=1024, stream=True,
        temperature=0.6, description="AI Gaming MPC — companion dialogue, game AI",
    ),
    "soulmate": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=True,
        temperature=0.7, description="Soulmate OS app — optimized for speed",
    ),
    "soulmovies": ChannelProfile(
        base_max_tokens=512, base_num_ctx=4096, stream=True,
        temperature=0.8, description="SoulMovies — storyboard generation, creative output",
    ),
    "soultube": ChannelProfile(
        base_max_tokens=256, base_num_ctx=2048, stream=True,
        temperature=0.7, description="SoulTube — recommendations, search, metadata",
    ),
}

HARDWARE_MULTIPLIERS: dict[HardwareTier, float] = {
    HardwareTier.MOBILE: 0.25,
    HardwareTier.MINIMAL: 0.5,
    HardwareTier.LIGHT: 0.75,
    HardwareTier.STANDARD: 1.0,
    HardwareTier.FULL: 1.5,
    HardwareTier.MAXIMUM: 2.0,
    HardwareTier.DATACENTER: 3.0,
    HardwareTier.SUPERCOMPUTER: 5.0,
}


@dataclass
class ChannelStats:
    response_times: deque = field(default_factory=lambda: deque(maxlen=50))
    total_requests: int = 0
    avg_response_time_s: float = 0.0
    last_adjustment: float = 0.0
    current_max_tokens: int = 0
    current_num_ctx: int = 0


class AutoTuner:
    """Channel auto-tuner with adaptive parameter adjustment.

    Zero-slowdown: profile lookup is O(1) dict read. Stats tracking
    is O(1) append. Adaptive re-evaluation runs in background.
    """

    def __init__(self, adaptive: bool = True, mobile_aggressive: bool = True) -> None:
        self._adaptive = adaptive
        self._mobile_aggressive = mobile_aggressive
        self._stats: dict[str, ChannelStats] = defaultdict(ChannelStats)
        self._lock = asyncio.Lock()
        self._current_tier: HardwareTier = HardwareTier.MINIMAL

    def set_tier(self, tier: HardwareTier) -> None:
        """Update the current hardware tier (called by HardwareDetector)."""
        self._current_tier = tier

    def detect_channel(self, metadata: dict[str, Any] | None = None) -> str:
        """Detect which channel is calling from metadata.

        Detection priority:
        1. Explicit 'channel' field in metadata
        2. Voice command / wake word → jarvis
        3. Hermes / Soulmate source → hermes
        4. Telegram chat ID → telegram
        5. OpenClaw / automation task → openclaw
        6. Browser user-agent → web
        7. App metadata / inc-llm-app user-agent → app
        8. Bearer token auth → api
        9. Default → cli
        """
        if not metadata:
            return "cli"

        explicit = metadata.get("channel", "").lower()
        if explicit in CHANNEL_PROFILES:
            return explicit

        source = metadata.get("source", "").lower()
        user_agent = metadata.get("user_agent", "").lower()
        is_voice = metadata.get("is_voice", False)
        chat_id = metadata.get("chat_id", "")
        has_bearer = bool(metadata.get("authorization", "") or metadata.get("bearer", ""))
        app_name = metadata.get("app_name", "").lower()

        if is_voice or "wake_word" in metadata:
            return "jarvis"
        if "soulmovies" in source or "soul_movies" in source:
            return "soulmovies"
        if "soultube" in source or "soul_tube" in source:
            return "soultube"
        if "soulmate" in source:
            return "soulmate"
        if "hermes" in source:
            return "hermes"
        if chat_id or "telegram" in source:
            return "telegram"
        if "openclaw" in source or "automation" in source:
            return "openclaw"
        if app_name or "inc-llm-app" in user_agent:
            return "app"
        if any(browser in user_agent for browser in ("mozilla", "chrome", "safari", "firefox", "edge")):
            return "web"
        if has_bearer:
            return "api"
        return "cli"

    def get_params(self, channel: str, tier: HardwareTier | None = None) -> dict[str, Any]:
        """Get tuned parameters for a channel + hardware tier.

        O(1) dict lookup — zero-slowdown.
        """
        profile = CHANNEL_PROFILES.get(channel, CHANNEL_PROFILES["cli"])
        hw_tier = tier or self._current_tier
        multiplier = HARDWARE_MULTIPLIERS.get(hw_tier, 1.0)

        max_tokens = max(16, int(profile.base_max_tokens * multiplier))
        num_ctx = max(256, int(profile.base_num_ctx * multiplier))

        # Apply adaptive adjustments if available
        if self._adaptive:
            stats = self._stats.get(channel)
            if stats and stats.current_max_tokens > 0:
                max_tokens = stats.current_max_tokens
                num_ctx = stats.current_num_ctx

        return {
            "channel": channel,
            "max_tokens": max_tokens,
            "num_ctx": num_ctx,
            "stream": profile.stream,
            "temperature": profile.temperature,
        }

    def get_params_for_metadata(
        self, metadata: dict[str, Any] | None = None, tier: HardwareTier | None = None
    ) -> dict[str, Any]:
        """Detect channel from metadata and return tuned params."""
        channel = self.detect_channel(metadata)
        return self.get_params(channel, tier)

    async def record_response_time(self, channel: str, response_time_s: float) -> None:
        """Record a response time for a channel — O(1) append.

        Uses EWMA for adaptive average instead of simple rolling average.
        """
        async with self._lock:
            stats = self._stats[channel]
            stats.response_times.append(response_time_s)
            stats.total_requests += 1
            if stats.response_times:
                times_list = list(stats.response_times)
                ewma_values = PrecisionStatistics.exponential_weighted_moving_average(
                    times_list, alpha=PrecisionStatistics.adaptive_alpha(len(times_list)),
                )
                stats.avg_response_time_s = ewma_values[-1] if ewma_values else sum(times_list) / len(times_list)

    async def maybe_adjust(self, channel: str, timeout_s: float = 30.0) -> None:
        """Check if a channel needs parameter adjustment.

        Runs in background — not on the request path.
        """
        if not self._adaptive:
            return

        async with self._lock:
            stats = self._stats[channel]
            if len(stats.response_times) < 5:
                return
            if time.time() - stats.last_adjustment < 60:
                return

            profile = CHANNEL_PROFILES.get(channel, CHANNEL_PROFILES["cli"])
            multiplier = HARDWARE_MULTIPLIERS.get(self._current_tier, 1.0)
            base_tokens = max(16, int(profile.base_max_tokens * multiplier))
            base_ctx = max(256, int(profile.base_num_ctx * multiplier))

            if stats.current_max_tokens == 0:
                stats.current_max_tokens = base_tokens
                stats.current_num_ctx = base_ctx

            avg = stats.avg_response_time_s
            check_interval = 30 if self._mobile_aggressive and self._current_tier == HardwareTier.MOBILE else 60
            if time.time() - stats.last_adjustment < check_interval:
                return

            if avg > timeout_s * 0.5:
                new_tokens = max(16, stats.current_max_tokens - 16)
                new_ctx = max(256, stats.current_num_ctx - 256)
                if new_tokens != stats.current_max_tokens:
                    logger.info(
                        "Auto-tuner: reducing %s tokens %d→%d (avg %.1fs > %.1fs)",
                        channel, stats.current_max_tokens, new_tokens, avg, timeout_s * 0.5,
                    )
                    stats.current_max_tokens = new_tokens
                    stats.current_num_ctx = new_ctx
                    stats.last_adjustment = time.time()
            elif avg < timeout_s * 0.3:
                max_possible = base_tokens * 2
                new_tokens = min(max_possible, stats.current_max_tokens + 16)
                if new_tokens != stats.current_max_tokens:
                    logger.info(
                        "Auto-tuner: increasing %s tokens %d→%d (avg %.1fs < %.1fs)",
                        channel, stats.current_max_tokens, new_tokens, avg, timeout_s * 0.3,
                    )
                    stats.current_max_tokens = new_tokens
                    stats.current_num_ctx = min(base_ctx * 2, stats.current_num_ctx + 256)
                    stats.last_adjustment = time.time()

    def detect_urgency(self, text: str, channel: str = "") -> str:
        """Detect urgency level from text content and channel.

        Voice channels (jarvis): short text = high urgency, long = low.
        Agent channels (hermes): keywords determine urgency.
        Default: normal.
        """
        text_lower = text.lower().strip()
        word_count = len(text_lower.split())

        if channel == "jarvis":
            if word_count <= 5:
                return "high"
            if word_count >= 15:
                return "low"
            return "normal"

        if channel == "hermes":
            if any(kw in text_lower for kw in ("status", "check", "quick", "balance", "price", "now")):
                return "high"
            if any(kw in text_lower for kw in ("explain", "analyze", "write", "create", "design", "strategy")):
                return "low"
            return "normal"

        if any(kw in text_lower for kw in ("time", "weather", "date", "status", "quick", "now", "brief", "summary")):
            return "high"
        if any(kw in text_lower for kw in ("explain", "analyze", "write", "create", "design", "implement", "detailed")):
            return "low"
        if word_count <= 3:
            return "high"
        if word_count >= 20:
            return "low"
        return "normal"

    def get_precision_params(
        self, channel: str, tier: HardwareTier | None = None,
        message_length: int = 0, urgency: str = "normal",
        speed_skill_params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Get precision-tuned parameters using exact mathematics.

        Uses speed skill params if available (computed from measured performance),
        then applies urgency multipliers on top.

        O(1) — zero-slowdown.
        """
        profile = CHANNEL_PROFILES.get(channel, CHANNEL_PROFILES["cli"])
        hw_tier = tier or self._current_tier
        multiplier = HARDWARE_MULTIPLIERS.get(hw_tier, 1.0)

        if speed_skill_params:
            max_tokens = speed_skill_params.get("max_tokens", profile.base_max_tokens)
            num_ctx = speed_skill_params.get("num_ctx", profile.base_num_ctx)
            temperature = speed_skill_params.get("temperature", profile.temperature)
        else:
            max_tokens = max(16, int(profile.base_max_tokens * multiplier))
            num_ctx = max(256, int(profile.base_num_ctx * multiplier))
            temperature = profile.temperature

            if self._adaptive:
                stats = self._stats.get(channel)
                if stats and stats.current_max_tokens > 0:
                    max_tokens = stats.current_max_tokens
                    num_ctx = stats.current_num_ctx

        if urgency == "high":
            max_tokens = max(16, int(max_tokens * 0.75))
            temperature = max(0.1, temperature * 0.9)
        elif urgency == "low":
            max_tokens = int(max_tokens * 1.5)
            temperature = min(1.0, temperature * 1.1)

        # Split-bit precision: include quantization info for this tier
        tier_str = hw_tier.value if hasattr(hw_tier, "value") else str(hw_tier)
        quant_params = SplitBitMath.compute_quant_params(tier_str)

        return {
            "channel": channel,
            "max_tokens": max_tokens,
            "num_ctx": num_ctx,
            "stream": profile.stream,
            "temperature": round(temperature, 3),
            "urgency": urgency,
            "precision_tuned": speed_skill_params is not None,
            "quant_format": quant_params["quant_format"],
            "bpw": quant_params["bpw"],
            "compression_ratio": quant_params["compression_ratio"],
            "quality_loss": quant_params["quality_loss"],
            "memory_footprint_gb": quant_params["memory_footprint_gb"],
            "throughput_estimate_tps": quant_params["throughput_estimate_tps"],
        }

    @staticmethod
    def compute_optimal_tokens(target_time_s: float, measured_tps: float, hardware_max: int) -> int:
        """Compute optimal max_tokens to hit a target response time.

        Formula: optimal = clamp(target_time * measured_tps, 16, hardware_max)
        """
        if measured_tps <= 0:
            return 16
        return max(16, min(hardware_max, int(target_time_s * measured_tps)))

    @staticmethod
    def compute_speed_multiplier(current_tps: float, baseline_tps: float) -> float:
        """Compute speed multiplier relative to baseline.

        Formula: multiplier = current_tps / baseline_tps
        """
        if baseline_tps <= 0:
            return 1.0
        return current_tps / baseline_tps

    @staticmethod
    def compute_error_adjusted_temperature(base_temp: float, error_rate: float) -> float:
        """Compute temperature adjusted by error rate.

        Formula: temp = base_temp * (1 - error_rate * 0.5)
        Lower temperature when errors are high (more deterministic = safer).
        """
        adjusted = base_temp * (1.0 - error_rate * 0.5)
        return max(0.1, min(1.0, round(adjusted, 3)))

    def get_stats(self) -> dict[str, Any]:
        """Get stats for all channels (for /v1/auto-tuner/stats endpoint)."""
        result = {}
        for channel, stats in self._stats.items():
            result[channel] = {
                "total_requests": stats.total_requests,
                "avg_response_time_s": round(stats.avg_response_time_s, 3),
                "current_max_tokens": stats.current_max_tokens,
                "current_num_ctx": stats.current_num_ctx,
                "samples": len(stats.response_times),
            }
        return result

    def get_channel_info(self) -> dict[str, dict[str, Any]]:
        """Get all channel profiles (for display)."""
        return {
            name: {
                "base_max_tokens": p.base_max_tokens,
                "base_num_ctx": p.base_num_ctx,
                "stream": p.stream,
                "temperature": p.temperature,
                "description": p.description,
            }
            for name, p in CHANNEL_PROFILES.items()
        }
