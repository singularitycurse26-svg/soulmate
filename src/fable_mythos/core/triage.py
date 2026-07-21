"""Triage — front-door classification of incoming requests.

Merges Mythos's FrontDoorTriage (task type, difficulty, risk, execution mode)
with Fable's Step 0 (classify the ask: trivial, question, task, plan-first).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fable_mythos.config import Settings
from fable_mythos.core.state import AskShape, FableMythosState
from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


class Triage:
    """Front-door triage — classifies requests before entering the reasoning loop."""

    TRIAGE_PROMPT = """Classify this request for triage. Return JSON only:
{
  "task_type": "default|math|code|literature|analysis|planning|factual",
  "difficulty": 0.0-1.0,
  "ambiguity": 0.0-1.0,
  "risk_domain": "null|legal|medical|financial|safety|cyber",
  "execution_mode": "fast|normal|deep|exhaustive",
  "estimated_cost_tokens": <int>,
  "needs_tools": <bool>,
  "needs_retrieval": <bool>,
  "ask_shape": "trivial|question|task|plan_first",
  "domain": "coding|marketing|research|data|business|finance|legal|design|devops"
}"""

    CLASSIFY_PROMPT = """Classify this ask into one of these shapes:
- trivial: one file, under 10 changed lines, no new behavior, you already know exactly what to change
- question: "why is...", "what do you think...", assessment/diagnosis — change nothing
- task: "fix", "build", "change", "make" — deliver the completed change
- plan_first: ambiguous scope, irreversible or outward-facing actions, or the user asks for a plan

Tie-breaks: plan_first beats task if any plan-first signal is present.
A mixed ask ("why is this failing, and can you fix it?") is a task whose report must also answer the question.
If unsure between task and plan_first, choose plan_first.

Return JSON: {"shape": "trivial|question|task|plan_first", "trivial": <bool>, "domain": "<domain>"}"""

    DEFINE_DONE_PROMPT = """Define what 'done' looks like for this task and how it will be verified.
Return JSON: {"done_criteria": "<one or two sentences>", "verification_method": "<concrete observation>"}"""

    def __init__(self, bus: ModelBus, settings: Settings) -> None:
        self.bus = bus
        self.settings = settings

    async def classify(self, query: str) -> dict[str, Any]:
        """Run triage classification on a query.

        Returns a dict with task_type, difficulty, ambiguity, risk_domain,
        execution_mode, estimated_cost_tokens, needs_tools, needs_retrieval,
        ask_shape, and domain.
        """
        try:
            response = await self.bus.complete(
                role="fast",
                messages=[{
                    "role": "user",
                    "content": f"{self.TRIAGE_PROMPT}\n\nQUERY: {query}",
                }],
                max_tokens=400,
                temperature=self.settings.harness.triage_temperature,
            )
            parsed = self._safe_json_parse(response["content"], self._default_triage(query))
            logger.debug("Triage result: %s", parsed)
            return parsed
        except Exception as e:
            logger.warning("Triage failed, using defaults: %s", e)
            return self._default_triage(query)

    async def classify_ask_shape(self, state: FableMythosState) -> None:
        """Fable Step 0: Classify the ask shape (trivial/question/task/plan_first).

        Updates state.ask_shape and state.domain.
        """
        # Use triage results if already available
        triage_shape = state.triage.get("ask_shape", "")
        triage_domain = state.triage.get("domain", "coding")

        # Map triage ask_shape to AskShape enum
        shape_map = {
            "trivial": AskShape.TRIVIAL,
            "question": AskShape.QUESTION,
            "task": AskShape.TASK,
            "plan_first": AskShape.PLAN_FIRST,
        }
        state.ask_shape = shape_map.get(triage_shape, AskShape.TASK)
        state.domain = triage_domain

        # If triage didn't classify the shape, do a dedicated classification
        if not triage_shape:
            try:
                response = await self.bus.complete(
                    role="fast",
                    messages=[{
                        "role": "user",
                        "content": f"{self.CLASSIFY_PROMPT}\n\nQUERY: {state.query}",
                    }],
                    max_tokens=200,
                    temperature=self.settings.harness.triage_temperature,
                )
                result = self._safe_json_parse(response["content"], {"shape": "task", "trivial": False, "domain": "coding"})
                shape_str = result.get("shape", "task")
                state.ask_shape = shape_map.get(shape_str, AskShape.TASK)
                state.domain = result.get("domain", "coding")
            except Exception as e:
                logger.warning("Ask shape classification failed: %s", e)
                state.ask_shape = AskShape.TASK
                state.domain = "coding"

        # Handle trivial tasks — short-circuit
        if state.ask_shape == AskShape.TRIVIAL:
            state.structured_state.trace.append("triage.trivial_short_circuit")
            state.converged = True
            state.halt_reason = "trivial_task"

        state.structured_state.add_fact(
            claim=f"Ask classified as {state.ask_shape.value} in domain {state.domain}",
            source="triage",
            confidence=0.9,
            loop=0,
        )

        # Adjust max_loops based on execution mode
        exec_mode = state.triage.get("execution_mode", "normal")
        if exec_mode == "exhaustive":
            state.max_loops = max(state.max_loops, self.settings.harness.max_loops + 2)
        elif exec_mode == "fast":
            state.max_loops = min(state.max_loops, 3)

    async def define_done(self, state: FableMythosState) -> None:
        """Fable Step 1: Define what 'done' looks like and how it will be verified.

        Adds the done criteria as a fact and records assumptions.
        """
        try:
            response = await self.bus.complete(
                role="fast",
                messages=[{
                    "role": "user",
                    "content": f"{self.DEFINE_DONE_PROMPT}\n\nTASK: {state.query}",
                }],
                max_tokens=300,
                temperature=self.settings.harness.triage_temperature,
            )
            result = self._safe_json_parse(response["content"], {
                "done_criteria": "Task is complete when the requested change works as specified.",
                "verification_method": "Run the relevant tests or checks.",
            })
            state.structured_state.add_fact(
                claim=f"Done criteria: {result.get('done_criteria', '')}",
                source="triage.define_done",
                confidence=0.85,
                loop=0,
            )
            state.structured_state.add_fact(
                claim=f"Verification: {result.get('verification_method', '')}",
                source="triage.define_done",
                confidence=0.85,
                loop=0,
            )
        except Exception as e:
            logger.warning("Define-done failed: %s", e)
            state.structured_state.add_fact(
                claim="Done criteria: task is complete when the change is verified.",
                source="triage.define_done.fallback",
                confidence=0.5,
                loop=0,
            )

    @staticmethod
    def _safe_json_parse(raw: str, fallback: dict[str, Any]) -> dict[str, Any]:
        """Parse JSON safely, returning fallback on failure.

        Handles common LLM JSON issues: markdown code fences, extra text, etc.
        """
        if not raw:
            return fallback

        text = raw.strip()

        # Strip markdown code fences
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first and last line (fences)
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()

        # Try direct parse
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from the text (find first { and last })
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(text[start : end + 1])
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                pass

        logger.debug("JSON parse failed, using fallback. Raw: %s", raw[:200])
        return fallback

    @staticmethod
    def _default_triage(query: str) -> dict[str, Any]:
        """Generate a default triage response based on simple heuristics."""
        query_lower = query.lower()

        task_type = "default"
        if any(w in query_lower for w in ("code", "debug", "fix", "build", "implement")):
            task_type = "code"
        elif any(w in query_lower for w in ("plan", "design", "architect")):
            task_type = "planning"
        elif any(w in query_lower for w in ("analyze", "assess", "evaluate")):
            task_type = "analysis"
        elif any(w in query_lower for w in ("calculate", "compute", "solve")):
            task_type = "math"

        difficulty = 0.5
        ambiguity = 0.4
        execution_mode = "normal"
        if any(w in query_lower for w in ("complex", "comprehensive", "full", "complete", "entire")):
            difficulty = 0.75
            ambiguity = 0.55
            execution_mode = "deep"

        ask_shape = "task"
        if any(w in query_lower for w in ("why", "what do you think", "assess", "diagnose")):
            ask_shape = "question"
        elif any(w in query_lower for w in ("plan", "propose", "recommend", "should we")):
            ask_shape = "plan_first"

        return {
            "task_type": task_type,
            "difficulty": difficulty,
            "ambiguity": ambiguity,
            "risk_domain": None,
            "execution_mode": execution_mode,
            "estimated_cost_tokens": 2800,
            "needs_tools": True,
            "needs_retrieval": True,
            "ask_shape": ask_shape,
            "domain": "coding",
        }
