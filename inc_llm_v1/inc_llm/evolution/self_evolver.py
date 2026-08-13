"""Self-evolver — always-on autonomous improvement loop.

Continuously runs: evaluate → identify weak areas → web research → create
improvement plan → execute → re-evaluate. Uses the BenchmarkTracker for
scoring, the DeepPlanner for planning, the ExecutionEngine for execution,
and the EvolutionSkillCreator for learning which strategies work.

Runs as a background asyncio task. Interval between cycles is configurable
(default 3600s / 1 hour). Can be triggered manually via API.

Self-evaluation uses LLM to assess its own capabilities. Web research uses
the InternetIntegration to search for latest AI techniques. Improvement plans
are created and executed autonomously.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from inc_llm.evolution.benchmark_tracker import BenchmarkTracker

logger = logging.getLogger(__name__)

SELF_EVAL_PROMPT = """You are a self-evaluation system. Assess your capabilities in the following category.

Category: {category}
Current score: {current_score}
Target score: {target_score}

Recent interactions and outcomes:
{recent_context}

Rate your capability in this category on a scale of 0.0 to 1.0.
Consider: accuracy, speed, helpfulness, creativity, and reliability.

Return JSON: {{"score": 0.0-1.0, "reasoning": "...", "weaknesses": ["..."], "strengths": ["..."]}}"""

IMPROVEMENT_PLAN_PROMPT = """You are a self-improvement system. Create a plan to improve the following weak areas.

Weak areas:
{weak_areas}

Current capabilities:
{current_scores}

Recent web research findings:
{research_findings}

Create a concrete improvement plan with specific actions. Return JSON:
{{
  "improvements": [
    {{
      "category": "...",
      "action": "specific action to take",
      "expected_improvement": "what should improve",
      "priority": "high|medium|low"
    }}
  ]
}}"""


class SelfEvolver:
    """Always-on autonomous self-improvement loop."""

    def __init__(
        self,
        harness: Any = None,
        benchmark_tracker: BenchmarkTracker | None = None,
        planner: Any = None,
        execution_engine: Any = None,
        skill_creator: Any = None,
        interval_s: int = 3600,
        web_research: bool = True,
        auto_execute: bool = False,
    ) -> None:
        self.harness = harness
        self.benchmark_tracker = benchmark_tracker or BenchmarkTracker()
        self.planner = planner
        self.execution_engine = execution_engine
        self.skill_creator = skill_creator
        self.interval_s = interval_s
        self.web_research = web_research
        self.auto_execute = auto_execute

        self._running = False
        self._task: asyncio.Task | None = None
        self._cycle_count = 0
        self._last_cycle_at: float = 0.0
        self._last_improvement_plan: dict[str, Any] | None = None
        self._stats = {
            "total_cycles": 0,
            "evaluations_performed": 0,
            "improvement_plans_created": 0,
            "improvements_executed": 0,
            "web_research_performed": 0,
        }

    def set_harness(self, harness: Any) -> None:
        self.harness = harness

    def set_planner(self, planner: Any) -> None:
        self.planner = planner

    def set_execution_engine(self, engine: Any) -> None:
        self.execution_engine = engine

    def set_skill_creator(self, skill_creator: Any) -> None:
        self.skill_creator = skill_creator

    async def start(self) -> None:
        """Start the always-on self-improvement loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Self-evolver started (interval=%ds)", self.interval_s)

    async def stop(self) -> None:
        """Stop the self-improvement loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Self-evolver stopped")

    async def _run_loop(self) -> None:
        """Main loop: evaluate → research → plan → execute → repeat."""
        while self._running:
            try:
                await self.run_cycle()
            except Exception as e:
                logger.warning("Self-evolution cycle failed: %s", e)

            await asyncio.sleep(self.interval_s)

    async def run_cycle(self) -> dict[str, Any]:
        """Run a single self-evolution cycle."""
        self._cycle_count += 1
        self._stats["total_cycles"] += 1
        self._last_cycle_at = time.time()
        t0 = time.time()

        eval_results = await self._self_evaluate()
        weak_areas = self.benchmark_tracker.get_weakest_categories(3)

        research_findings = ""
        if self.web_research and weak_areas:
            research_findings = await self._web_research(weak_areas)

        improvement_plan = await self._create_improvement_plan(weak_areas, research_findings)
        if improvement_plan:
            self._last_improvement_plan = improvement_plan
            self._stats["improvement_plans_created"] += 1

            if self.auto_execute and self.execution_engine and self.planner:
                await self._execute_improvements(improvement_plan)

        if self.skill_creator and improvement_plan:
            try:
                asyncio.create_task(
                    self.skill_creator.record_evolution_cycle(
                        cycle_id=self._cycle_count,
                        weak_areas=[w["category"] for w in weak_areas],
                        improvements=improvement_plan.get("improvements", []),
                        evaluations=eval_results,
                    )
                )
            except Exception:
                pass

        elapsed = time.time() - t0
        return {
            "cycle": self._cycle_count,
            "elapsed_s": round(elapsed, 2),
            "evaluations": eval_results,
            "weak_areas": weak_areas,
            "improvement_plan": improvement_plan,
            "overall_score": self.benchmark_tracker.get_overall_score(),
        }

    async def _self_evaluate(self) -> dict[str, Any]:
        """Run self-evaluation across all categories."""
        if not self.harness:
            return {}

        results: dict[str, Any] = {}
        scores = self.benchmark_tracker.get_all_scores()

        for category, info in scores.items():
            try:
                prompt = SELF_EVAL_PROMPT.format(
                    category=category,
                    current_score=info["current"],
                    target_score=info["target"],
                    recent_context=f"Evaluated {info['evaluations']} times, trend: {info['trend']}",
                )

                result = await self.harness.chat_agent(
                    user_id="self_evolver",
                    task=prompt,
                    channel="evolution",
                )
                response = result.get("response", result.get("message", ""))

                parsed = self._parse_json(response)
                if parsed and "score" in parsed:
                    score_val = float(parsed["score"])
                    self.benchmark_tracker.update_score(
                        category, score_val,
                        method="self_eval",
                        notes=parsed.get("reasoning", "")[:200],
                    )
                    results[category] = {
                        "score": score_val,
                        "weaknesses": parsed.get("weaknesses", []),
                        "strengths": parsed.get("strengths", []),
                    }
                    self._stats["evaluations_performed"] += 1

            except Exception as e:
                logger.warning("Self-evaluation failed for %s: %s", category, e)

        return results

    async def _web_research(self, weak_areas: list[dict[str, Any]]) -> str:
        """Search the web for improvement techniques for weak areas."""
        if not self.harness or not hasattr(self.harness, "internet"):
            return ""

        findings: list[str] = []
        for area in weak_areas:
            category = area["category"]
            try:
                query = f"latest AI techniques for improving {category.replace('_', ' ')} capabilities 2024 2025"
                result = await self.harness.internet.search(query)
                if result:
                    summaries = result if isinstance(result, list) else [str(result)]
                    findings.append(f"{category}: {' | '.join(str(s)[:200] for s in summaries[:3])}")
                    self._stats["web_research_performed"] += 1
            except Exception as e:
                logger.warning("Web research failed for %s: %s", category, e)

        return "\n".join(findings)

    async def _create_improvement_plan(self, weak_areas: list[dict[str, Any]], research: str) -> dict[str, Any] | None:
        """Create an improvement plan for weak areas."""
        if not self.harness or not weak_areas:
            return None

        weak_str = "\n".join(
            f"- {w['category']}: current={w['current']:.2f}, target={w['target']:.2f}, gap={w['gap']:.2f}"
            for w in weak_areas
        )
        scores_str = json.dumps(self.benchmark_tracker.get_all_scores(), indent=2)

        prompt = IMPROVEMENT_PLAN_PROMPT.format(
            weak_areas=weak_str,
            current_scores=scores_str,
            research_findings=research or "(no web research available)",
        )

        try:
            result = await self.harness.chat_agent(
                user_id="self_evolver",
                task=prompt,
                channel="evolution",
            )
            response = result.get("response", result.get("message", ""))
            parsed = self._parse_json(response)
            if parsed:
                return parsed
        except Exception as e:
            logger.warning("Improvement plan creation failed: %s", e)

        return None

    async def _execute_improvements(self, plan: dict[str, Any]) -> None:
        """Execute improvement actions using the execution engine."""
        improvements = plan.get("improvements", [])
        for imp in improvements:
            if imp.get("priority") == "high":
                try:
                    if self.planner:
                        plan_result = await self.planner.plan(
                            request=imp.get("action", ""),
                            user_id="self_evolver",
                            context=f"Self-improvement for {imp.get('category', '')}",
                        )
                        if plan_result.get("status") == "ok" and self.execution_engine:
                            await self.execution_engine.execute_plan(
                                plan_id=plan_result["plan_id"],
                                plan=plan_result["plan"],
                                mode="background",
                                user_id="self_evolver",
                            )
                            self._stats["improvements_executed"] += 1
                except Exception as e:
                    logger.warning("Improvement execution failed: %s", e)

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any] | None:
        if not text:
            return None
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return None

    def get_status(self) -> dict[str, Any]:
        return {
            "running": self._running,
            "cycle_count": self._cycle_count,
            "last_cycle_at": self._last_cycle_at,
            "interval_s": self.interval_s,
            "stats": self._stats,
            "benchmark": self.benchmark_tracker.get_stats(),
            "last_improvement_plan": self._last_improvement_plan,
        }

    def get_stats(self) -> dict[str, Any]:
        return {**self._stats, "cycle_count": self._cycle_count, "running": self._running}
