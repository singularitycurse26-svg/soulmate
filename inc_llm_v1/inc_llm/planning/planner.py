"""Deep planner — generates structured JSON plans with phases, steps, dependencies, and risk assessment.

Uses the LLM to break down complex requests into executable plans. Plans include:
- Phases with ordered steps
- Dependencies between steps
- Risk assessment and mitigation strategies
- Estimated time per step

Self-improving: PlanSkillCreator tracks plan outcomes and adjusts planning prompts.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

PLAN_PROMPT = """You are a deep planning system. Given a request, create a detailed execution plan.

Request: {request}
{context_section}
{insights_section}

Return ONLY valid JSON with this structure:
{{
  "title": "<plan title>",
  "description": "<1-2 sentence plan summary>",
  "phases": [
    {{
      "name": "<phase name>",
      "description": "<what this phase accomplishes>",
      "steps": [
        {{
          "title": "<step title>",
          "description": "<detailed description of what to do>",
          "tool": "<tool to use if any: create_file, run_command, execute_code, etc.>",
          "estimated_time_s": 30,
          "dependencies": ["<title of step this depends on, or empty>"]
        }}
      ]
    }}
  ],
  "risks": [
    {{
      "description": "<what could go wrong>",
      "mitigation": "<how to handle it>",
      "severity": "low|medium|high"
    }}
  ],
  "success_criteria": ["<how to know the plan succeeded>", ...]
}}

Break the request into 2-5 phases with 2-6 steps each. Be concrete and actionable.
Each step should be independently executable by an autonomous agent."""


class DeepPlanner:
    """Generates structured execution plans using LLM reasoning."""

    def __init__(self, harness: Any = None, skill_creator: Any = None) -> None:
        self.harness = harness
        self.skill_creator = skill_creator
        self._plans: dict[str, dict[str, Any]] = {}

    def set_harness(self, harness: Any) -> None:
        self.harness = harness

    def set_skill_creator(self, skill_creator: Any) -> None:
        self.skill_creator = skill_creator

    async def plan(self, request: str, user_id: str = "planner", context: str = "") -> dict[str, Any]:
        """Generate a structured plan for the given request."""
        insights = ""
        if self.skill_creator:
            try:
                learned = self.skill_creator.get_planning_insights()
                if learned:
                    insights = f"Learned insights: {learned}"
            except Exception:
                pass

        context_section = f"Context: {context}" if context else ""
        insights_section = insights if insights else ""

        prompt = PLAN_PROMPT.format(
            request=request,
            context_section=context_section,
            insights_section=insights_section,
        )

        if not self.harness:
            return {"status": "error", "error": "No harness available"}

        try:
            result = await self.harness.chat_agent(
                user_id=user_id,
                task=prompt,
                channel="planning",
            )
            response_text = result.get("response", result.get("message", ""))
            parsed = self._parse_json_response(response_text)
            if not parsed:
                return {"status": "error", "error": "Failed to parse plan from LLM response", "raw": response_text[:500]}

            plan_id = hashlib.sha256(f"{request}:{time.time()}".encode()).hexdigest()[:16]
            plan = {
                "id": plan_id,
                "request": request,
                "context": context,
                "title": parsed.get("title", "Untitled Plan"),
                "description": parsed.get("description", ""),
                "phases": parsed.get("phases", []),
                "risks": parsed.get("risks", []),
                "success_criteria": parsed.get("success_criteria", []),
                "status": "created",
                "created_at": time.time(),
                "updated_at": time.time(),
            }
            self._plans[plan_id] = plan
            return {"status": "ok", "plan_id": plan_id, "plan": plan}

        except Exception as e:
            logger.warning("Planning failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def revise_plan(self, plan_id: str, feedback: str) -> dict[str, Any]:
        """Revise an existing plan based on feedback."""
        plan = self._plans.get(plan_id)
        if not plan:
            return {"status": "error", "error": f"Plan {plan_id} not found"}

        original_json = json.dumps({
            "title": plan["title"],
            "phases": plan["phases"],
            "risks": plan["risks"],
        }, indent=2)

        revise_prompt = (
            f"Original plan:\n{original_json}\n\n"
            f"Feedback for revision: {feedback}\n\n"
            "Return the revised plan in the same JSON format."
        )

        try:
            result = await self.harness.chat_agent(
                user_id="planner",
                task=revise_prompt,
                channel="planning",
            )
            response_text = result.get("response", result.get("message", ""))
            parsed = self._parse_json_response(response_text)
            if not parsed:
                return {"status": "error", "error": "Failed to parse revised plan"}

            plan["title"] = parsed.get("title", plan["title"])
            plan["phases"] = parsed.get("phases", plan["phases"])
            plan["risks"] = parsed.get("risks", plan["risks"])
            plan["updated_at"] = time.time()
            return {"status": "ok", "plan_id": plan_id, "plan": plan}

        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_plan(self, plan_id: str) -> dict[str, Any] | None:
        return self._plans.get(plan_id)

    def list_plans(self, status: str | None = None) -> list[dict[str, Any]]:
        plans = list(self._plans.values())
        if status:
            plans = [p for p in plans if p.get("status") == status]
        return plans

    def update_plan_status(self, plan_id: str, status: str) -> None:
        if plan_id in self._plans:
            self._plans[plan_id]["status"] = status
            self._plans[plan_id]["updated_at"] = time.time()

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_plans": len(self._plans),
            "by_status": {
                s: sum(1 for p in self._plans.values() if p.get("status") == s)
                for s in ("created", "executing", "completed", "failed", "paused")
            },
        }

    @staticmethod
    def _parse_json_response(text: str) -> dict[str, Any] | None:
        if not text:
            return None
        json_start = text.find("{")
        json_end = text.rfind("}")
        if json_start >= 0 and json_end > json_start:
            try:
                return json.loads(text[json_start : json_end + 1])
            except json.JSONDecodeError:
                pass
        return None
