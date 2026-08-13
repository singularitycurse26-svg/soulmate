"""Code executor — sandboxed execution of LLM-generated code.

Runs Python code in a subprocess with timeout, resource limits, and
output capture. Used by the tool execution loop when the LLM generates
code that needs to be executed to answer a question.
"""

from __future__ import annotations

import asyncio
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ExecutionResult:
    success: bool
    output: str
    error: str
    exit_code: int
    execution_time_s: float


class CodeExecutor:
    """Sandboxed code execution for LLM-generated code."""

    def __init__(self, timeout_s: int = 10, max_output_chars: int = 5000) -> None:
        self.timeout_s = timeout_s
        self.max_output_chars = max_output_chars
        self._temp_dir = tempfile.mkdtemp(prefix="rlos_exec_")

    async def execute_python(self, code: str, timeout_s: int | None = None) -> ExecutionResult:
        """Execute Python code in a subprocess."""
        timeout = timeout_s or self.timeout_s

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", dir=self._temp_dir, delete=False
        ) as f:
            f.write(code)
            script_path = f.name

        t0 = time.time()
        try:
            proc = await asyncio.create_subprocess_exec(
                "python", script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self._temp_dir,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return ExecutionResult(
                    success=False, output="", error=f"Execution timed out after {timeout}s",
                    exit_code=-1, execution_time_s=time.time() - t0,
                )

            output = stdout.decode("utf-8", errors="replace")[:self.max_output_chars]
            error = stderr.decode("utf-8", errors="replace")[:self.max_output_chars]
            elapsed = time.time() - t0

            result = ExecutionResult(
                success=proc.returncode == 0,
                output=output,
                error=error,
                exit_code=proc.returncode or 0,
                execution_time_s=round(elapsed, 3),
            )
            logger.debug("Code executed in %.3fs (exit: %d)", elapsed, result.exit_code)
            return result

        except Exception as e:
            return ExecutionResult(
                success=False, output="", error=str(e),
                exit_code=-1, execution_time_s=time.time() - t0,
            )
        finally:
            try:
                os.unlink(script_path)
            except Exception:
                pass

    async def execute_shell(self, command: str, timeout_s: int | None = None) -> ExecutionResult:
        """Execute a shell command in a subprocess."""
        timeout = timeout_s or self.timeout_s
        t0 = time.time()
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                return ExecutionResult(
                    success=False, output="", error=f"Command timed out after {timeout}s",
                    exit_code=-1, execution_time_s=time.time() - t0,
                )

            output = stdout.decode("utf-8", errors="replace")[:self.max_output_chars]
            error = stderr.decode("utf-8", errors="replace")[:self.max_output_chars]
            elapsed = time.time() - t0
            return ExecutionResult(
                success=proc.returncode == 0,
                output=output, error=error,
                exit_code=proc.returncode or 0,
                execution_time_s=round(elapsed, 3),
            )
        except Exception as e:
            return ExecutionResult(
                success=False, output="", error=str(e),
                exit_code=-1, execution_time_s=time.time() - t0,
            )

    def cleanup(self) -> None:
        """Clean up temporary files."""
        try:
            import shutil
            shutil.rmtree(self._temp_dir, ignore_errors=True)
        except Exception:
            pass
