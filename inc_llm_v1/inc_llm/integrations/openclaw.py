"""OpenClaw integration for incllmv2.

OpenClaw is an automation/task execution platform. This integration
allows incllmv2 to delegate automation tasks to OpenClaw and receive
structured results.

Channel profile: openclaw — concise, structured output (128 tokens,
stream=True, temperature=0.5).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class OpenClawIntegration:
    """OpenClaw automation platform integration."""

    def __init__(self, api_url: str = "", api_token: str = "", enabled: bool = True) -> None:
        self.api_url = api_url
        self.api_token = api_token
        self.enabled = enabled

    async def delegate_task(self, task: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        """Delegate an automation task to OpenClaw.

        Returns a task ID and status. Results are fetched asynchronously.
        """
        if not self.enabled or not self.api_url:
            return {"status": "error", "message": "OpenClaw not configured"}

        try:
            import httpx
        except ImportError:
            return {"status": "error", "message": "httpx not installed"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.api_url.rstrip('/')}/api/tasks",
                    json={"task": task, "context": context or {}},
                    headers={"Authorization": f"Bearer {self.api_token}"} if self.api_token else {},
                )
                resp.raise_for_status()
                data = resp.json()
                logger.info("OpenClaw task delegated: %s", data.get("task_id", ""))
                return {"status": "ok", "task_id": data.get("task_id", ""), "data": data}
        except Exception as e:
            logger.warning("OpenClaw delegation failed: %s", e)
            return {"status": "error", "message": str(e)}

    async def check_status(self, task_id: str) -> dict[str, Any]:
        """Check the status of a delegated OpenClaw task."""
        if not self.enabled or not self.api_url:
            return {"status": "error", "message": "OpenClaw not configured"}

        try:
            import httpx
        except ImportError:
            return {"status": "error", "message": "httpx not installed"}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{self.api_url.rstrip('/')}/api/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {self.api_token}"} if self.api_token else {},
                )
                resp.raise_for_status()
                return {"status": "ok", "data": resp.json()}
        except Exception as e:
            logger.warning("OpenClaw status check failed: %s", e)
            return {"status": "error", "message": str(e)}

    async def get_result(self, task_id: str) -> dict[str, Any]:
        """Get the result of a completed OpenClaw task."""
        status = await self.check_status(task_id)
        if status.get("status") != "ok":
            return status
        data = status.get("data", {})
        if data.get("status") == "completed":
            return {"status": "ok", "result": data.get("result", "")}
        return {"status": "pending", "message": f"Task status: {data.get('status', 'unknown')}"}
