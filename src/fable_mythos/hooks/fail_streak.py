"""Fail streak detector — PostToolUse hook detecting consecutive failures.

From fable5-mode/fable_fail_streak.py: detects consecutive command failures and,
after every third failure, injects an "attribution ladder" as additional context.
This guides the agent to systematically diagnose root causes rather than blindly retrying.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


ATTRIBUTION_LADDER = """## Attribution Ladder

You've failed 3 times in a row. Stop grinding. Diagnose the root cause:

1. **Harness**: Is the tool itself broken? Is the command malformed? Is the environment wrong?
   - Check: tool version, config, environment variables, permissions
   - Fix: correct the invocation, not the target

2. **Deployment**: Is the system running? Is the service reachable? Is the config loaded?
   - Check: server status, port availability, log files, process list
   - Fix: restart, reconfigure, or repair the deployment

3. **Product**: Is the code itself wrong? Is the logic incorrect? Is the assumption bad?
   - Check: read the actual code, trace the execution path, verify assumptions
   - Fix: change the code, not the environment

Start at 1. Only move to the next rung if the current one is verified clean.
Do not skip rungs. Do not retry without a new hypothesis.
"""


@dataclass
class FailStreakState:
    """State tracked by the fail streak detector."""

    consecutive_failures: int = 0
    total_failures: int = 0
    total_successes: int = 0
    last_failure_command: str = ""
    last_failure_output: str = ""
    ladder_injected: bool = False
    failure_history: list[dict[str, Any]] = field(default_factory=list)


class FailStreakHook:
    """PostToolUse hook — detects consecutive failures and injects attribution ladder.

    Tracks consecutive command failures and, after every 3rd consecutive failure,
    injects the attribution ladder to guide systematic debugging.
    """

    def __init__(self, threshold: int = 3) -> None:
        self.threshold = threshold
        self.state = FailStreakState()

    def execute(self, tool_name: str, tool_input: dict[str, Any], tool_output: dict[str, Any]) -> dict[str, Any]:
        """Execute the PostToolUse hook.

        Args:
            tool_name: Name of the tool that was called.
            tool_input: Input parameters for the tool.
            tool_output: Output from the tool.

        Returns:
            Dict with 'inject_context' (str or None) and 'should_pause' (bool).
        """
        success = self._is_success(tool_output)
        command = str(tool_input.get("command", tool_input.get("cmd", tool_name)))

        if success:
            self.state.consecutive_failures = 0
            self.state.total_successes += 1
            self.state.ladder_injected = False
            return {"inject_context": None, "should_pause": False}

        # Failure
        self.state.consecutive_failures += 1
        self.state.total_failures += 1
        self.state.last_failure_command = command
        self.state.last_failure_output = str(tool_output.get("output", tool_output.get("error", "")))[:500]

        self.state.failure_history.append({
            "command": command,
            "consecutive": self.state.consecutive_failures,
            "output_preview": self.state.last_failure_output[:200],
        })

        # Keep history bounded
        if len(self.state.failure_history) > 20:
            self.state.failure_history = self.state.failure_history[-20:]

        logger.warning(
            "Fail streak: %d consecutive failures (command: %s)",
            self.state.consecutive_failures, command[:80],
        )

        # Inject attribution ladder every threshold failures
        if self.state.consecutive_failures >= self.threshold and not self.state.ladder_injected:
            self.state.ladder_injected = True
            logger.info("Injecting attribution ladder after %d consecutive failures", self.state.consecutive_failures)
            return {
                "inject_context": ATTRIBUTION_LADDER,
                "should_pause": True,
            }

        return {"inject_context": None, "should_pause": False}

    def _is_success(self, tool_output: dict[str, Any]) -> bool:
        """Determine if a tool execution was successful.

        Args:
            tool_output: Output from the tool.

        Returns:
            True if successful, False otherwise.
        """
        # Check explicit success flag
        if "success" in tool_output:
            return bool(tool_output["success"])

        # Check exit code
        exit_code = tool_output.get("exit_code", tool_output.get("returncode"))
        if exit_code is not None:
            return exit_code == 0

        # Check for error indicators
        if "error" in tool_output and tool_output["error"]:
            return False
        if "stderr" in tool_output and tool_output["stderr"]:
            stderr = str(tool_output["stderr"]).lower()
            # Only count as failure if stderr has actual error messages
            if any(w in stderr for w in ("error", "traceback", "failed", "exception")):
                return False

        # Check output for error patterns
        output = str(tool_output.get("output", ""))
        if output:
            output_lower = output.lower()
            if any(w in output_lower for w in ("traceback", "error:", "failed:", "exception")):
                return False

        return True

    def reset(self) -> None:
        """Reset the fail streak counter (e.g., after a successful action)."""
        self.state = FailStreakState()

    def get_stats(self) -> dict[str, Any]:
        """Get failure statistics."""
        return {
            "consecutive_failures": self.state.consecutive_failures,
            "total_failures": self.state.total_failures,
            "total_successes": self.state.total_successes,
            "failure_rate": (
                self.state.total_failures / (self.state.total_failures + self.state.total_successes)
                if (self.state.total_failures + self.state.total_successes) > 0
                else 0.0
            ),
            "ladder_injected": self.state.ladder_injected,
        }
