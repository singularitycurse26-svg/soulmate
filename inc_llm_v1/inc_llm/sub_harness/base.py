"""Sub-harness base — isolated harness instance for a specific workload.

Each sub-harness wraps the main harness with its own:
- Memory/conversation context
- Tool registry
- Skill manager
- Channel profile
- Resource limits

This provides workload isolation so heavy tasks (execution, YouTube analysis,
vision) don't interfere with the main chat pipeline.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SubHarnessConfig:
    """Configuration for a sub-harness."""
    name: str
    channel: str = "base"
    max_concurrent_tasks: int = 3
    max_memory_items: int = 100
    timeout_s: int = 300
    isolated_memory: bool = True
    isolated_tools: bool = True


class SubHarness:
    """Isolated harness instance for a specific workload type."""

    def __init__(
        self,
        config: SubHarnessConfig,
        parent_harness: Any = None,
        tool_registry: Any = None,
        skill_manager: Any = None,
    ) -> None:
        self.config = config
        self.parent_harness = parent_harness
        self.tool_registry = tool_registry
        self.skill_manager = skill_manager
        self._memory: list[dict[str, str]] = []
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._stats = {
            "total_requests": 0,
            "total_errors": 0,
            "total_time_s": 0.0,
            "active_tasks": 0,
        }

    async def chat(self, user_id: str, text: str, **kwargs: Any) -> dict[str, Any]:
        """Process a chat request through this sub-harness."""
        t0 = time.time()
        self._stats["total_requests"] += 1

        if not self.parent_harness:
            return {"status": "error", "error": "No parent harness attached"}

        if self.config.isolated_memory:
            self._memory.append({"role": "user", "content": text})
            if len(self._memory) > self.config.max_memory_items:
                self._memory = self._memory[-self.config.max_memory_items:]

        try:
            result = await self.parent_harness.chat_agent(
                user_id=user_id,
                task=text,
                channel=self.config.channel,
                **kwargs,
            )

            response = result.get("response", result.get("message", ""))

            if self.config.isolated_memory:
                self._memory.append({"role": "assistant", "content": response})

            elapsed = time.time() - t0
            self._stats["total_time_s"] += elapsed

            return {
                "status": "ok",
                "response": response,
                "sub_harness": self.config.name,
                "channel": self.config.channel,
                "response_time_s": round(elapsed, 3),
            }

        except Exception as e:
            self._stats["total_errors"] += 1
            logger.warning("Sub-harness %s chat failed: %s", self.config.name, e)
            return {"status": "error", "error": str(e), "sub_harness": self.config.name}

    async def run_background(self, task_id: str, coro: Any) -> str:
        """Run a coroutine in the background with tracking."""
        if len(self._active_tasks) >= self.config.max_concurrent_tasks:
            logger.warning("Sub-harness %s at max concurrent tasks", self.config.name)
            return ""

        self._stats["active_tasks"] = len(self._active_tasks) + 1

        async def _wrapped():
            try:
                await coro
            except Exception as e:
                logger.warning("Background task %s failed: %s", task_id, e)
            finally:
                self._active_tasks.pop(task_id, None)
                self._stats["active_tasks"] = len(self._active_tasks)

        task = asyncio.create_task(_wrapped())
        self._active_tasks[task_id] = task
        return task_id

    def get_memory(self) -> list[dict[str, str]]:
        """Get the isolated memory for this sub-harness."""
        return list(self._memory)

    def clear_memory(self) -> None:
        """Clear the sub-harness memory."""
        self._memory = []

    def get_stats(self) -> dict[str, Any]:
        avg_time = (
            self._stats["total_time_s"] / self._stats["total_requests"]
            if self._stats["total_requests"] > 0
            else 0.0
        )
        return {
            "name": self.config.name,
            "channel": self.config.channel,
            **self._stats,
            "avg_response_time_s": round(avg_time, 3),
            "memory_items": len(self._memory),
        }
