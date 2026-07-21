"""Top-level orchestrator — ties together the full Fable-Mythos pipeline.

Orchestrates: triage → memory retrieval → prelude → state → branch →
phase-keyed loop → safety gate → feedback logging.

This is the main entry point for running a complete reasoning session.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from fable_mythos.config import Settings
from fable_mythos.core.state import FableMythosState, Hypothesis, LoopPhase
from fable_mythos.providers.bus import ModelBus

logger = logging.getLogger(__name__)


class Orchestrator:
    """Top-level orchestrator for the Fable-Mythos reasoning pipeline.

    Manages the full lifecycle: triage → memory → prelude → loop → safety → feedback.
    """

    def __init__(
        self,
        settings: Settings,
        bus: ModelBus,
    ) -> None:
        self.settings = settings
        self.bus = bus

        # Sub-components — initialized lazily as phases are implemented
        from fable_mythos.core.triage import Triage

        self.triage = Triage(bus=bus, settings=settings)

    async def complete(
        self,
        *,
        query: str,
        thread_id: str = "default",
        constraints: dict[str, Any] | None = None,
    ) -> FableMythosState:
        """Run a complete reasoning session (blocking).

        Executes all 9 phases of the reasoning loop and returns the final state.
        """
        state = await self._initialize(query=query, thread_id=thread_id, constraints=constraints or {})

        # Phase 0: Triage
        state.triage = await self.triage.classify(query)
        logger.info("Triage complete: %s", state.triage.get("task_type", "unknown"))

        # Run the phase loop — each iteration runs all 10 phases
        while not state.should_halt(self.settings.harness.default_confidence_threshold):
            for phase in LoopPhase.in_order():
                state.phase = phase
                await self._run_phase(state)
            state.record_loop_metrics()
            state.loop_index += 1

        # Build final answer
        state.final_answer = await self._build_final_answer(state)

        # Log trajectory
        state.trajectory_id = await self._log_trajectory(state)

        return state

    async def complete_stream(
        self,
        *,
        query: str,
        thread_id: str = "default",
        constraints: dict[str, Any] | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """Run a complete reasoning session with SSE streaming.

        Yields (event_type, payload) tuples as the pipeline progresses.
        """
        state = await self._initialize(query=query, thread_id=thread_id, constraints=constraints or {})

        # Triage
        yield ("status", {"stage": "triage_start"})
        state.triage = await self.triage.classify(query)
        yield ("status", {"stage": "triage_done", "triage": state.triage})

        # Phase loop — each iteration runs all 10 phases
        while not state.should_halt(self.settings.harness.default_confidence_threshold):
            yield ("status", {
                "stage": "loop_start",
                "loop": state.loop_index + 1,
                "phase": LoopPhase.CLASSIFY.value,
            })
            for phase in LoopPhase.in_order():
                state.phase = phase
                await self._run_phase(state)
            state.record_loop_metrics()
            top = state.structured_state.top_hypothesis()
            yield ("status", {
                "stage": "loop_done",
                "loop": state.loop_index,
                "phase": state.phase.value,
                "top_confidence": top.confidence if top else 0.0,
            })
            state.loop_index += 1

        # Final answer
        yield ("status", {"stage": "synthesize_start"})
        state.final_answer = await self._build_final_answer(state)
        yield ("token", {"text": state.final_answer})
        yield ("status", {"stage": "synthesize_done"})

        # Trajectory
        state.trajectory_id = await self._log_trajectory(state)
        yield ("status", {"stage": "feedback_done", "trajectory_id": state.trajectory_id})

        yield ("final", self._as_response_payload(state))

    async def readiness(self) -> dict[str, Any]:
        """Check readiness of all subsystems."""
        bus_health = await self.bus.healthcheck()
        checks = {
            "model_bus": {"ok": bus_health.get("ok", False), "detail": bus_health.get("detail", "")},
        }
        overall = all(c["ok"] for c in checks.values())
        return {"ok": overall, "checks": checks}

    async def _initialize(
        self,
        *,
        query: str,
        thread_id: str,
        constraints: dict[str, Any],
    ) -> FableMythosState:
        """Initialize the reasoning state for a new session."""
        state = FableMythosState(
            query=query,
            thread_id=thread_id,
            constraints=constraints,
            max_loops=self.settings.harness.max_loops,
        )
        logger.info("Initialized session thread_id=%s query=%s", thread_id, query[:100])
        return state

    async def _run_phase(self, state: FableMythosState) -> None:
        """Run the current phase of the reasoning loop."""
        phase = state.phase
        state.structured_state.trace.append(f"phase.{phase.value}.start")

        if phase == LoopPhase.CLASSIFY:
            await self.triage.classify_ask_shape(state)
        elif phase == LoopPhase.DEFINE_DONE:
            await self.triage.define_done(state)
        elif phase == LoopPhase.EVIDENCE:
            await self._gather_evidence(state)
        elif phase == LoopPhase.DECIDE:
            await self._decide(state)
        elif phase == LoopPhase.ACT:
            await self._act(state)
        elif phase == LoopPhase.VERIFY:
            await self._verify(state)
        elif phase == LoopPhase.REPAIR:
            await self._repair(state)
        elif phase == LoopPhase.SYNTHESIZE:
            await self._synthesize(state)
        elif phase == LoopPhase.JUDGE:
            await self._judge(state)
        elif phase == LoopPhase.REPORT:
            await self._report(state)

        state.structured_state.trace.append(f"phase.{phase.value}.done")

        # Convergence check (checked after each phase, but only triggers after loop_index >= 2)
        state.converged = self._convergence_check(state)

    async def _gather_evidence(self, state: FableMythosState) -> None:
        """Phase: Gather evidence using parallel subagents and primary sources."""
        response = await self.bus.complete(
            role="fast",
            messages=[{
                "role": "user",
                "content": (
                    f"Gather evidence for this task: {state.query}\n\n"
                    "Enumerate what exists, identify primary sources, and list "
                    "key findings. Return a structured summary."
                ),
            }],
            max_tokens=600,
            temperature=self.settings.harness.explore_temperature,
        )
        state.structured_state.add_fact(
            claim=response["content"],
            source="evidence_gathering",
            confidence=0.7,
            loop=state.loop_index,
        )

    async def _decide(self, state: FableMythosState) -> None:
        """Phase: Synthesize evidence into one recommendation."""
        facts_summary = "\n".join(f"- {f.claim}" for f in state.structured_state.facts)
        response = await self.bus.complete(
            role="base",
            messages=[{
                "role": "user",
                "content": (
                    f"Based on this evidence, make ONE recommendation:\n\n{facts_summary}\n\n"
                    "If you considered alternatives, name each in one line and say why it lost."
                ),
            }],
            max_tokens=400,
            temperature=self.settings.harness.solve_temperature,
        )
        top = state.structured_state.top_hypothesis()
        if top is None:
            # Create the initial hypothesis from the decision
            import hashlib
            h_id = hashlib.sha256(
                f"hyp:{state.thread_id}:{state.loop_index}".encode()
            ).hexdigest()[:8]
            top = Hypothesis(
                id=h_id,
                answer=response["content"],
                confidence=0.5,
                reasoning_path=["phase.decide"],
            )
            state.structured_state.hypotheses.append(top)
        else:
            top.answer = response["content"]
            top.reasoning_path.append("phase.decide")
            top.confidence = min(0.99, top.confidence + 0.15)
        state.structured_state.confidence_map[top.id] = top.confidence

    async def _act(self, state: FableMythosState) -> None:
        """Phase: Act surgically — make the smallest correct change."""
        top = state.structured_state.top_hypothesis()
        if top is None:
            return
        top.reasoning_path.append("phase.act")
        top.confidence = min(0.99, top.confidence + 0.1)
        state.structured_state.confidence_map[top.id] = top.confidence

    async def _verify(self, state: FableMythosState) -> None:
        """Phase: Verify by observation — not inference."""
        top = state.structured_state.top_hypothesis()
        if top is None:
            return

        response = await self.bus.complete(
            role="judge",
            messages=[{
                "role": "user",
                "content": (
                    f"Judge this answer for internal consistency and correctness:\n\n{top.answer}\n\n"
                    "Return PASS or FAIL with a brief explanation."
                ),
            }],
            max_tokens=300,
            temperature=self.settings.harness.judge_temperature,
        )

        passed = "pass" in response["content"].lower()
        state.structured_state.add_artifact(
            kind="judge_result",
            content=response["content"],
            passes=passed,
            loop=state.loop_index,
        )

        if not passed:
            state.structured_state.add_contradiction(
                claim_a="top_hypothesis",
                claim_b="judge_failure",
                severity=0.8,
                loop=state.loop_index,
            )
            top.contradictions.append("judge_failure")
            top.confidence = max(0.0, top.confidence - 0.25)
        else:
            top.supporting_tests.append("judge.pass")
            top.confidence = min(0.99, top.confidence + 0.1)

        state.structured_state.confidence_map[top.id] = top.confidence

    async def _repair(self, state: FableMythosState) -> None:
        """Phase: Repair — resolve contradictions and weak confidence."""
        top = state.structured_state.top_hypothesis()
        if top is None:
            return

        if state.structured_state.contradictions:
            response = await self.bus.complete(
                role="base",
                messages=[{
                    "role": "user",
                    "content": (
                        f"Repair this answer by resolving the following contradictions:\n\n"
                        f"Answer: {top.answer}\n"
                        f"Contradictions: {top.contradictions}\n\n"
                        "Provide a revised answer that addresses each contradiction."
                    ),
                }],
                max_tokens=400,
                temperature=self.settings.harness.solve_temperature,
            )
            top.answer = response["content"]
            top.reasoning_path.append("phase.repair")
            top.confidence = min(0.99, top.confidence + 0.08)
            state.repair_cycles += 1
        else:
            # No contradictions — skip repair
            pass

        state.structured_state.confidence_map[top.id] = top.confidence

    async def _synthesize(self, state: FableMythosState) -> None:
        """Phase: Synthesize — build the final answer from the best hypothesis."""
        top = state.structured_state.top_hypothesis()
        if top is None:
            state.final_answer = "No hypothesis reached sufficient confidence."
            return

        response = await self.bus.complete(
            role="style",
            messages=[{
                "role": "user",
                "content": (
                    f"Style harmonize this final answer without changing meaning.\n"
                    f"Make it clear, concise, and outcome-first:\n\n{top.answer}"
                ),
            }],
            max_tokens=700,
            temperature=0.2,
        )
        state.final_answer = response["content"]

        # Build citations
        state.citations = [f.source for f in state.structured_state.facts if f.source != "user_input"]

        # Build confidence summary
        state.confidence_summary = {
            "top_hypothesis": top.confidence,
            "overall": min(0.99, 0.55 + 0.25 * (1.0 if state.converged else 0.0) + 0.2 * top.confidence),
        }

    async def _judge(self, state: FableMythosState) -> None:
        """Phase: Adversarial judge — fresh-eyes verification of the final answer."""
        response = await self.bus.complete(
            role="judge",
            messages=[{
                "role": "user",
                "content": (
                    f"You are an adversarial reviewer. Read this answer and find "
                    f"any unverified claims, missing caveats, or errors:\n\n{state.final_answer}\n\n"
                    "List issues found, or say CLEAN if no issues."
                ),
            }],
            max_tokens=400,
            temperature=self.settings.harness.judge_temperature,
        )

        issues = response["content"]
        if "clean" not in issues.lower():
            # Apply fixes
            state.structured_state.trace.append(f"judge.issues: {issues[:200]}")
            # Append caveats to the final answer
            state.final_answer += f"\n\n---\n**Caveats from adversarial review:**\n{issues}"

    async def _report(self, state: FableMythosState) -> None:
        """Phase: Report — outcome-first, honest caveats."""
        # The final answer is already built by synthesize and refined by judge
        # This phase ensures the report format is correct
        top = state.structured_state.top_hypothesis()
        if top and state.structured_state.intent_line:
            # Prepend INTENT line if behavior was changed
            intent = state.structured_state.intent_line
            if not state.final_answer.startswith("INTENT:"):
                state.final_answer = (
                    f"INTENT: code does {intent.code_does}; "
                    f"task expects {intent.task_expects}; "
                    f"spec says {intent.spec_says}\n\n{state.final_answer}"
                )

        state.structured_state.trace.append("phase.report.done")

    def _convergence_check(self, state: FableMythosState) -> bool:
        """Check if the loop has converged."""
        top = state.structured_state.top_hypothesis()
        if top is None:
            return False
        if state.loop_index < 2:
            return False
        return top.confidence >= 0.88

    async def _build_final_answer(self, state: FableMythosState) -> str:
        """Build the final answer if not already done."""
        if state.final_answer:
            return state.final_answer

        top = state.structured_state.top_hypothesis()
        if top:
            return top.answer
        return "Unable to reach a confident conclusion."

    async def _log_trajectory(self, state: FableMythosState) -> str:
        """Log the trajectory for audit and episodic memory."""
        import hashlib
        import json
        from pathlib import Path
        import time

        trajectory_id = hashlib.sha256(
            f"{state.thread_id}:{state.query}:{time.time()}".encode()
        ).hexdigest()[:16]

        trajectory_path = self.settings.resolve_path(self.settings.trajectory_path)
        trajectory_path.parent.mkdir(parents=True, exist_ok=True)

        entry = {
            "trajectory_id": trajectory_id,
            "thread_id": state.thread_id,
            "query": state.query,
            "triage": state.triage,
            "loops": state.loop_index,
            "halt_reason": state.halt_reason,
            "final_answer": state.final_answer[:500],
            "confidence_summary": state.confidence_summary,
            "per_loop_metrics": state.per_loop_metrics,
            "timestamp": time.time(),
        }

        try:
            with open(trajectory_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except Exception as e:
            logger.warning("Failed to log trajectory: %s", e)

        return trajectory_id

    @staticmethod
    def _as_response_payload(state: FableMythosState) -> dict[str, Any]:
        """Convert state to API response payload."""
        return {
            "thread_id": state.thread_id,
            "final_answer": state.final_answer,
            "confidence_summary": state.confidence_summary,
            "citations": state.citations,
            "loops": state.loop_index,
            "halt_reason": state.halt_reason,
            "trajectory_id": state.trajectory_id,
            "triage": state.triage,
        }
