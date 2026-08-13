"""Execution engine — autonomous, persistent execution of plans with checkpointing.

Features:
- Checkpointing: saves progress to disk so execution can resume after crashes
- Self-review: LLM reviews its own output after each step
- Auto-retry: failed steps are retried with failure context injected
- Auto-replan: if consecutive failures exceed threshold, the planner re-plans the phase
- Foreground and background execution modes
- Pause/resume/cancel support

Zero-slowdown: background execution runs via asyncio.create_task.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

STEP_PROMPT = """You are an autonomous execution agent. Execute the following step.

Step: {step_title}
Description: {step_description}
Tool: {tool}
{context_section}
{insights_section}
{failure_section}

Create the necessary files, run commands, or write code to complete this step.
If you need to create a file, output it in this format:
```file: <relative_path>
<file content>
```

If you need to run a command, output it in this format:
```command: <command>
```

Be thorough and produce production-quality output."""

SELF_REVIEW_PROMPT = """You are reviewing the output of an autonomous execution step.

Step: {step_title}
Description: {step_description}
Output:
{output}

Files created/modified:
{files}

Evaluate:
1. Does the output accomplish what the step requires?
2. Are there any errors or issues?
3. Is the quality acceptable?

Return JSON: {{"approved": true/false, "issues": ["..."], "suggestions": ["..."]}}"""


@dataclass
class ExecutionCheckpoint:
    """Checkpoint for resuming execution."""
    plan_id: str
    phase_index: int = 0
    step_index: int = 0
    status: str = "pending"
    completed_steps: list[str] = field(default_factory=list)
    failed_steps: list[dict[str, Any]] = field(default_factory=list)
    files_created: list[str] = field(default_factory=list)
    tokens_used: int = 0
    started_at: float = field(default_factory=time.time)
    last_updated: float = field(default_factory=time.time)
    mode: str = "foreground"
    error: str | None = None
    retry_count: int = 0
    consecutive_failures: int = 0


class ExecutionEngine:
    """Autonomous execution engine with checkpointing and self-review."""

    def __init__(
        self,
        harness: Any = None,
        workspace_root: str = "~/inc_llm_projects",
        max_retries: int = 3,
        checkpoint_interval_s: int = 30,
        max_consecutive_failures: int = 5,
        self_review: bool = True,
        auto_replan: bool = True,
        execution_skills: Any = None,
        planner: Any = None,
    ) -> None:
        self.harness = harness
        self.workspace_root = Path(os.path.expanduser(workspace_root))
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.max_retries = max_retries
        self.checkpoint_interval_s = checkpoint_interval_s
        self.max_consecutive_failures = max_consecutive_failures
        self.self_review = self_review
        self.auto_replan = auto_replan
        self.execution_skills = execution_skills
        self.planner = planner

        self._file_agent: Any = None
        self._checkpoints: dict[str, ExecutionCheckpoint] = {}
        self._checkpoint_dir = self.workspace_root / ".checkpoints"
        self._checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self._active_executions: dict[str, asyncio.Task] = {}
        self._stats = {
            "total_executions": 0,
            "completed_executions": 0,
            "failed_executions": 0,
            "total_steps_executed": 0,
            "total_retries": 0,
            "total_replans": 0,
        }

    def set_harness(self, harness: Any) -> None:
        self.harness = harness

    def set_file_agent(self, file_agent: Any) -> None:
        self._file_agent = file_agent

    def set_planner(self, planner: Any) -> None:
        self.planner = planner

    def set_execution_skills(self, skills: Any) -> None:
        self.execution_skills = skills

    async def execute_plan(
        self,
        plan_id: str,
        plan: dict[str, Any],
        mode: str = "foreground",
        user_id: str = "executor",
    ) -> dict[str, Any]:
        """Execute a plan — foreground blocks, background returns immediately."""
        checkpoint = ExecutionCheckpoint(plan_id=plan_id, mode=mode)
        self._checkpoints[plan_id] = checkpoint
        self._save_checkpoint(checkpoint)
        self._stats["total_executions"] += 1

        if mode == "background":
            task = asyncio.create_task(self._execute_plan_async(plan_id, plan, user_id))
            self._active_executions[plan_id] = task
            return {"status": "ok", "plan_id": plan_id, "mode": "background", "message": "Execution started in background"}

        return await self._execute_plan_async(plan_id, plan, user_id)

    async def _execute_plan_async(
        self, plan_id: str, plan: dict[str, Any], user_id: str
    ) -> dict[str, Any]:
        """Internal execution loop."""
        checkpoint = self._checkpoints[plan_id]
        phases = plan.get("phases", [])
        project_type = plan.get("title", "general").lower().replace(" ", "_")[:30]
        workspace = self.workspace_root / project_type
        workspace.mkdir(parents=True, exist_ok=True)

        for phase_idx, phase in enumerate(phases):
            if checkpoint.status == "cancelled":
                break
            if phase_idx < checkpoint.phase_index:
                continue

            phase_name = phase.get("name", f"Phase {phase_idx + 1}")
            steps = phase.get("steps", [])
            logger.info("Executing phase %d/%d: %s", phase_idx + 1, len(phases), phase_name)

            for step_idx, step in enumerate(steps):
                if checkpoint.status == "cancelled":
                    break
                if step_idx < checkpoint.step_index and phase_idx == checkpoint.phase_index:
                    continue

                step_title = step.get("title", f"Step {step_idx + 1}")
                success = False

                for retry in range(self.max_retries):
                    if checkpoint.status == "cancelled":
                        break

                    result = await self._execute_step(step, plan, checkpoint, workspace, user_id, retry)
                    success = result.get("success", False)

                    if success:
                        checkpoint.completed_steps.append(step_title)
                        checkpoint.consecutive_failures = 0
                        self._stats["total_steps_executed"] += 1
                        break
                    else:
                        checkpoint.retry_count += 1
                        self._stats["total_retries"] += 1
                        if retry < self.max_retries - 1:
                            logger.warning("Step '%s' failed (retry %d/%d): %s", step_title, retry + 1, self.max_retries, result.get("error", ""))
                            await asyncio.sleep(1)

                if not success:
                    checkpoint.failed_steps.append({"step": step_title, "error": result.get("error", "Unknown")})
                    checkpoint.consecutive_failures += 1

                    if checkpoint.consecutive_failures >= self.max_consecutive_failures and self.auto_replan and self.planner:
                        logger.warning("Max consecutive failures reached — triggering replan")
                        self._stats["total_replans"] += 1
                        replan_result = await self._replan_phase(plan, phase_idx, checkpoint.failed_steps)
                        if replan_result.get("status") == "ok":
                            new_phases = replan_result.get("plan", {}).get("phases", [])
                            if new_phases and phase_idx < len(new_phases):
                                phases[phase_idx] = new_phases[phase_idx]
                                checkpoint.consecutive_failures = 0
                                checkpoint.failed_steps = []
                                continue

                    checkpoint.status = "failed"
                    checkpoint.error = f"Step '{step_title}' failed after {self.max_retries} retries"
                    self._save_checkpoint(checkpoint)
                    self._stats["failed_executions"] += 1
                    return {"status": "failed", "plan_id": plan_id, "error": checkpoint.error, "checkpoint": self._checkpoint_dict(checkpoint)}

                checkpoint.step_index = step_idx + 1
                checkpoint.last_updated = time.time()
                self._save_checkpoint(checkpoint)

            checkpoint.phase_index = phase_idx + 1
            checkpoint.step_index = 0

        if checkpoint.status != "cancelled":
            checkpoint.status = "completed"
        self._save_checkpoint(checkpoint)

        if checkpoint.status == "completed":
            self._stats["completed_executions"] += 1

        if self.execution_skills:
            try:
                asyncio.create_task(
                    self.execution_skills.record_execution(
                        plan_id=plan_id,
                        project_type=project_type,
                        steps_total=len(checkpoint.completed_steps) + len(checkpoint.failed_steps),
                        steps_succeeded=len(checkpoint.completed_steps),
                        steps_failed=len(checkpoint.failed_steps),
                        success=checkpoint.status == "completed",
                        execution_time_s=time.time() - checkpoint.started_at,
                    )
                )
            except Exception:
                pass

        return {
            "status": checkpoint.status,
            "plan_id": plan_id,
            "completed_steps": checkpoint.completed_steps,
            "failed_steps": checkpoint.failed_steps,
            "files_created": checkpoint.files_created,
            "execution_time_s": round(time.time() - checkpoint.started_at, 2),
        }

    async def _execute_step(
        self,
        step: dict[str, Any],
        plan: dict[str, Any],
        checkpoint: ExecutionCheckpoint,
        workspace: Path,
        user_id: str,
        retry: int,
    ) -> dict[str, Any]:
        """Execute a single step."""
        step_title = step.get("title", "")
        step_desc = step.get("description", "")
        tool = step.get("tool", "")

        context = f"Plan: {plan.get('title', '')}\nPhase: {step_title}"
        insights = ""
        if self.execution_skills:
            try:
                insights = self.execution_skills.get_execution_insights(action=tool)
            except Exception:
                pass

        failure_section = ""
        if retry > 0 and checkpoint.failed_steps:
            last_failure = checkpoint.failed_steps[-1]
            failure_section = f"Previous attempt failed: {last_failure.get('error', '')}. Fix the issue and try again."

        prompt = STEP_PROMPT.format(
            step_title=step_title,
            step_description=step_desc,
            tool=tool,
            context_section=context,
            insights_section=f"Insights: {insights}" if insights else "",
            failure_section=failure_section,
        )

        if not self.harness:
            return {"success": False, "error": "No harness available"}

        try:
            result = await self.harness.chat_agent(
                user_id=user_id,
                task=prompt,
                channel="execution",
            )
            output = result.get("response", result.get("message", ""))
            files_created = await self._process_output(output, workspace)
            checkpoint.files_created.extend(files_created)
            checkpoint.tokens_used += result.get("usage", {}).get("total_tokens", 0)

            if self.self_review:
                review = await self._self_review_step(step, output, files_created, user_id)
                if not review.get("approved", True):
                    issues = review.get("issues", [])
                    if issues:
                        return {"success": False, "error": f"Self-review issues: {'; '.join(issues)}"}

            return {"success": True, "output": output[:2000], "files_created": files_created}

        except Exception as e:
            logger.warning("Step execution failed: %s", e)
            return {"success": False, "error": str(e)}

    async def _process_output(self, output: str, workspace: Path) -> list[str]:
        """Extract file blocks and command blocks from output and execute them."""
        import re
        files_created: list[str] = []

        file_pattern = re.compile(r"```file:\s*(.+?)\n(.*?)```", re.DOTALL)
        for match in file_pattern.finditer(output):
            filepath = match.group(1).strip()
            content = match.group(2)
            if self._file_agent:
                try:
                    result = await self._file_agent.create_file(filepath, content)
                    if result.get("status") == "ok":
                        files_created.append(filepath)
                except Exception as e:
                    logger.warning("File creation failed for %s: %s", filepath, e)

        cmd_pattern = re.compile(r"```command:\s*(.+?)```", re.DOTALL)
        for match in cmd_pattern.finditer(output):
            command = match.group(1).strip()
            if self._file_agent:
                try:
                    await self._file_agent.run_command(command)
                except Exception as e:
                    logger.warning("Command execution failed: %s", e)

        return files_created

    async def _self_review_step(
        self, step: dict, output: str, files: list[str], user_id: str
    ) -> dict[str, Any]:
        """LLM reviews its own output."""
        if not self.harness:
            return {"approved": True}

        prompt = SELF_REVIEW_PROMPT.format(
            step_title=step.get("title", ""),
            step_description=step.get("description", ""),
            output=output[:3000],
            files="\n".join(files) if files else "(none)",
        )

        try:
            result = await self.harness.chat_agent(
                user_id=user_id,
                task=prompt,
                channel="execution",
            )
            response = result.get("response", result.get("message", ""))
            json_start = response.find("{")
            json_end = response.rfind("}")
            if json_start >= 0 and json_end > json_start:
                return json.loads(response[json_start : json_end + 1])
        except Exception:
            pass
        return {"approved": True}

    async def _replan_phase(self, plan: dict, phase_idx: int, failures: list) -> dict[str, Any]:
        """Re-plan a failing phase using the planner."""
        if not self.planner:
            return {"status": "error", "error": "No planner available"}

        phase = plan.get("phases", [])[phase_idx]
        failure_reasons = "; ".join(f.get("error", "unknown") for f in failures)
        feedback = f"Phase '{phase.get('name', '')}' failed. Errors: {failure_reasons}. Create a revised approach."

        plan_id = plan.get("id", "")
        return await self.planner.revise_plan(plan_id, feedback)

    def _save_checkpoint(self, checkpoint: ExecutionCheckpoint) -> None:
        """Save checkpoint to disk."""
        path = self._checkpoint_dir / f"{checkpoint.plan_id}.json"
        data = self._checkpoint_dict(checkpoint)
        try:
            path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.warning("Checkpoint save failed: %s", e)

    def _load_checkpoint(self, plan_id: str) -> ExecutionCheckpoint | None:
        """Load a checkpoint from disk."""
        path = self._checkpoint_dir / f"{plan_id}.json"
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return ExecutionCheckpoint(
                plan_id=data["plan_id"],
                phase_index=data.get("phase_index", 0),
                step_index=data.get("step_index", 0),
                status=data.get("status", "pending"),
                completed_steps=data.get("completed_steps", []),
                failed_steps=data.get("failed_steps", []),
                files_created=data.get("files_created", []),
                tokens_used=data.get("tokens_used", 0),
                started_at=data.get("started_at", time.time()),
                last_updated=data.get("last_updated", time.time()),
                mode=data.get("mode", "foreground"),
                error=data.get("error"),
                retry_count=data.get("retry_count", 0),
                consecutive_failures=data.get("consecutive_failures", 0),
            )
        except Exception as e:
            logger.warning("Checkpoint load failed: %s", e)
            return None

    @staticmethod
    def _checkpoint_dict(cp: ExecutionCheckpoint) -> dict[str, Any]:
        return {
            "plan_id": cp.plan_id,
            "phase_index": cp.phase_index,
            "step_index": cp.step_index,
            "status": cp.status,
            "completed_steps": cp.completed_steps,
            "failed_steps": cp.failed_steps,
            "files_created": cp.files_created,
            "tokens_used": cp.tokens_used,
            "started_at": cp.started_at,
            "last_updated": cp.last_updated,
            "mode": cp.mode,
            "error": cp.error,
            "retry_count": cp.retry_count,
            "consecutive_failures": cp.consecutive_failures,
        }

    async def pause_execution(self, plan_id: str) -> dict[str, Any]:
        """Pause a running execution."""
        cp = self._checkpoints.get(plan_id)
        if cp:
            cp.status = "paused"
            self._save_checkpoint(cp)
            return {"status": "ok", "plan_id": plan_id, "message": "Execution paused"}
        return {"status": "error", "error": f"Execution {plan_id} not found"}

    async def resume_execution(self, plan_id: str, plan: dict, user_id: str = "executor") -> dict[str, Any]:
        """Resume a paused execution from checkpoint."""
        cp = self._load_checkpoint(plan_id)
        if cp and cp.status == "paused":
            cp.status = "in_progress"
            self._checkpoints[plan_id] = cp
            return await self._execute_plan_async(plan_id, plan, user_id)
        return {"status": "error", "error": f"No paused execution found for {plan_id}"}

    async def cancel_execution(self, plan_id: str) -> dict[str, Any]:
        """Cancel a running execution."""
        cp = self._checkpoints.get(plan_id)
        if cp:
            cp.status = "cancelled"
            self._save_checkpoint(cp)
            task = self._active_executions.pop(plan_id, None)
            if task:
                task.cancel()
            return {"status": "ok", "plan_id": plan_id, "message": "Execution cancelled"}
        return {"status": "error", "error": f"Execution {plan_id} not found"}

    def get_progress(self, plan_id: str) -> dict[str, Any]:
        """Get execution progress for a plan."""
        cp = self._checkpoints.get(plan_id)
        if not cp:
            return {"status": "error", "error": f"Execution {plan_id} not found"}
        return {
            "plan_id": plan_id,
            "status": cp.status,
            "phase_index": cp.phase_index,
            "step_index": cp.step_index,
            "completed_steps": cp.completed_steps,
            "failed_steps": cp.failed_steps,
            "files_created": cp.files_created,
            "consecutive_failures": cp.consecutive_failures,
            "execution_time_s": round(time.time() - cp.started_at, 2),
        }

    def get_stats(self) -> dict[str, Any]:
        return {**self._stats, "active_executions": len(self._active_executions)}
