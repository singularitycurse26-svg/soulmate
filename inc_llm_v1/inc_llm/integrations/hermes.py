"""Hermes Agent integration — connects to Soulmate OS Hermes agent API.

Provides access to Hermes agent capabilities including task delegation,
agent orchestration, and Soulmate OS wallet integration.

When a harness is attached, Hermes routes tasks through the LLM with
auto-detect fast reply tuning. Falls back to external Hermes API when
no harness is available.

Auto-detection:
  - Simple tasks ("check status", "get balance") → high urgency → fast short reply
  - Complex tasks ("analyze portfolio", "create strategy") → low urgency → fuller reply

Zero-slowdown: complexity detection is O(n) string scan, parameter lookup
is O(1) dict read. Response time tracking is O(1) append.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
from collections import defaultdict, deque
from typing import Any

from inc_llm.config import HermesConfig

logger = logging.getLogger(__name__)


class HermesIntegration:
    """Hermes Agent integration via Soulmate OS API with LLM routing.

    Routes tasks through the LLM harness when available for intelligent
    analysis. Falls back to external Hermes API delegation.
    """

    def __init__(self, config: HermesConfig) -> None:
        self.config = config
        self._available = False
        self._harness = None
        self._task_times: dict[str, deque] = defaultdict(lambda: deque(maxlen=20))
        self._total_tasks = 0
        self._total_response_time = 0.0

    def set_harness(self, harness: Any) -> None:
        """Set the LLM harness reference for routing tasks through the model."""
        self._harness = harness

    async def check_availability(self) -> bool:
        """Check if Hermes API is reachable."""
        if not self.config.enabled:
            return False
        try:
            def _check():
                req = urllib.request.Request(
                    f"{self.config.api_url}/health",
                    headers={"Authorization": f"Bearer {self.config.api_token}"},
                )
                resp = urllib.request.urlopen(req, timeout=5)
                return resp.status == 200
            self._available = await asyncio.to_thread(_check)
        except Exception:
            self._available = False
        return self._available

    async def delegate_task(
        self, task: str, context: str = "", user_id: str = "hermes_user",
    ) -> dict[str, Any]:
        """Delegate a task to the Hermes agent.

        When a harness is attached, routes through the LLM with auto-detect
        fast reply tuning for intelligent task analysis. Falls back to
        external Hermes API delegation when no harness is available.
        """
        if not self.config.enabled:
            return {"status": "disabled"}

        if self._harness:
            return await self._delegate_via_llm(task, context, user_id)
        return await self._delegate_via_api(task, context)

    async def _delegate_via_llm(
        self, task: str, context: str, user_id: str,
    ) -> dict[str, Any]:
        """Route task through the LLM harness with auto-detect fast reply."""
        t0 = time.time()

        try:
            full_task = task
            if context:
                full_task = f"{task}\n\n[Context]\n{context}"

            result = await self._harness.chat_agent(
                user_id=user_id, task=full_task, channel="hermes",
            )
            response_time = time.time() - t0

            self._total_tasks += 1
            self._total_response_time += response_time

            task_type = self._classify_task(task)
            self._task_times[task_type].append(response_time)

            response_text = result.get("response", result.get("message", ""))

            return {
                "status": "ok",
                "task": task,
                "response": response_text,
                "analysis": response_text,
                "response_time_s": round(response_time, 3),
                "urgency": result.get("urgency", "normal"),
                "precision_tuned": result.get("precision_tuned", False),
                "task_type": task_type,
                "routed_through": "llm",
            }
        except Exception as e:
            logger.warning("Hermes LLM delegation failed, falling back to API: %s", e)
            return await self._delegate_via_api(task, context)

    async def _delegate_via_api(self, task: str, context: str) -> dict[str, Any]:
        """Delegate task to external Hermes API (fallback)."""
        try:
            payload = json.dumps({"task": task, "context": context}).encode()

            def _delegate():
                req = urllib.request.Request(
                    f"{self.config.api_url}/api/hermes/delegate",
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.config.api_token}",
                    },
                    method="POST",
                )
                resp = urllib.request.urlopen(req, timeout=30)
                return json.loads(resp.read().decode())

            result = await asyncio.to_thread(_delegate)
            result["routed_through"] = "api"
            return result
        except Exception as e:
            logger.warning("Hermes API delegation failed: %s", e)
            return {"status": "error", "error": str(e), "routed_through": "api"}

    @staticmethod
    def _classify_task(task: str) -> str:
        """Classify task type for response time tracking."""
        task_lower = task.lower()
        if any(w in task_lower for w in ("status", "check", "health")):
            return "status"
        if any(w in task_lower for w in ("balance", "wallet", "price", "token")):
            return "financial"
        if any(w in task_lower for w in ("analyze", "analysis", "report")):
            return "analysis"
        if any(w in task_lower for w in ("create", "build", "deploy", "setup")):
            return "create"
        if any(w in task_lower for w in ("send", "transfer", "swap", "trade")):
            return "transaction"
        if any(w in task_lower for w in ("search", "find", "lookup")):
            return "search"
        return "general"

    async def get_agent_status(self) -> dict[str, Any]:
        """Get Hermes agent status."""
        if not self.config.enabled:
            return {"status": "disabled"}
        try:
            def _status():
                req = urllib.request.Request(
                    f"{self.config.api_url}/api/hermes/status",
                    headers={"Authorization": f"Bearer {self.config.api_token}"},
                )
                resp = urllib.request.urlopen(req, timeout=10)
                return json.loads(resp.read().decode())

            return await asyncio.to_thread(_status)
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_stats(self) -> dict[str, Any]:
        avg_time = self._total_response_time / self._total_tasks if self._total_tasks > 0 else 0.0
        return {
            "enabled": self.config.enabled,
            "available": self._available,
            "has_harness": self._harness is not None,
            "total_tasks": self._total_tasks,
            "avg_response_time_s": round(avg_time, 3),
            "task_types": {
                task_type: {
                    "count": len(times),
                    "avg_time": round(sum(times) / len(times), 3) if times else 0.0,
                }
                for task_type, times in self._task_times.items()
            },
        }
