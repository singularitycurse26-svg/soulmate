"""Sub-harness manager — creates and manages isolated sub-harnesses.

Each sub-harness handles a specific workload type:
- youtube: YouTube video analysis
- planning: Plan generation
- execution: Autonomous execution
- evolution: Self-evaluation and improvement
- vision: Image understanding
- image_gen: Image generation
- tools: Enhanced tool calling

This provides workload isolation so heavy tasks don't block the main chat.
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.sub_harness.base import SubHarness, SubHarnessConfig

logger = logging.getLogger(__name__)

DEFAULT_HARNESS_CONFIGS = {
    "youtube": SubHarnessConfig(
        name="youtube",
        channel="youtube",
        max_concurrent_tasks=2,
        max_memory_items=50,
        timeout_s=300,
    ),
    "planning": SubHarnessConfig(
        name="planning",
        channel="planning",
        max_concurrent_tasks=2,
        max_memory_items=50,
        timeout_s=120,
    ),
    "execution": SubHarnessConfig(
        name="execution",
        channel="execution",
        max_concurrent_tasks=3,
        max_memory_items=100,
        timeout_s=600,
    ),
    "evolution": SubHarnessConfig(
        name="evolution",
        channel="evolution",
        max_concurrent_tasks=1,
        max_memory_items=50,
        timeout_s=300,
    ),
    "vision": SubHarnessConfig(
        name="vision",
        channel="vision",
        max_concurrent_tasks=2,
        max_memory_items=50,
        timeout_s=120,
    ),
    "image_gen": SubHarnessConfig(
        name="image_gen",
        channel="image_gen",
        max_concurrent_tasks=3,
        max_memory_items=20,
        timeout_s=120,
    ),
    "tools": SubHarnessConfig(
        name="tools",
        channel="tools",
        max_concurrent_tasks=3,
        max_memory_items=50,
        timeout_s=60,
    ),
}


class SubHarnessManager:
    """Manages isolated sub-harnesses for different workload types."""

    def __init__(self, parent_harness: Any = None) -> None:
        self.parent_harness = parent_harness
        self._harnesses: dict[str, SubHarness] = {}
        self._init_default_harnesses()

    def _init_default_harnesses(self) -> None:
        """Initialize all default sub-harnesses."""
        for name, config in DEFAULT_HARNESS_CONFIGS.items():
            self._harnesses[name] = SubHarness(
                config=config,
                parent_harness=self.parent_harness,
            )

    def set_parent_harness(self, harness: Any) -> None:
        """Set the parent harness for all sub-harnesses."""
        self.parent_harness = harness
        for sub in self._harnesses.values():
            sub.parent_harness = harness

    def get_harness(self, name: str) -> SubHarness | None:
        """Get a sub-harness by name."""
        return self._harnesses.get(name)

    def register_harness(self, name: str, config: SubHarnessConfig) -> SubHarness:
        """Register a custom sub-harness."""
        config.name = name
        sub = SubHarness(
            config=config,
            parent_harness=self.parent_harness,
        )
        self._harnesses[name] = sub
        logger.info("Registered sub-harness: %s", name)
        return sub

    def list_harnesses(self) -> list[str]:
        """List all sub-harness names."""
        return list(self._harnesses.keys())

    async def chat(self, harness_name: str, user_id: str, text: str, **kwargs: Any) -> dict[str, Any]:
        """Route a chat request to a specific sub-harness."""
        sub = self._harnesses.get(harness_name)
        if not sub:
            return {"status": "error", "error": f"Unknown sub-harness: {harness_name}"}
        return await sub.chat(user_id, text, **kwargs)

    def get_all_stats(self) -> dict[str, Any]:
        """Get stats from all sub-harnesses."""
        return {
            name: sub.get_stats()
            for name, sub in self._harnesses.items()
        }

    def get_stats(self) -> dict[str, Any]:
        """Get summary stats."""
        all_stats = self.get_all_stats()
        return {
            "total_harnesses": len(self._harnesses),
            "harness_names": list(self._harnesses.keys()),
            "total_requests": sum(s.get("total_requests", 0) for s in all_stats.values()),
            "total_errors": sum(s.get("total_errors", 0) for s in all_stats.values()),
            "active_tasks": sum(s.get("active_tasks", 0) for s in all_stats.values()),
            "details": all_stats,
        }
