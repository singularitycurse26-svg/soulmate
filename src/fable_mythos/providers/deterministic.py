"""Deterministic local provider for testing and offline development.

Returns canned responses based on prompt content analysis — no model required.
Useful for unit tests, CI/CD, and development without Ollama running.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import AsyncIterator

import numpy as np

from fable_mythos.providers.base import ModelProvider


class DeterministicProvider:
    """Deterministic provider — returns predictable responses for testing.

    Implements the ModelProvider protocol without any external dependencies.
    Analyzes prompt content to return contextually appropriate canned responses.
    """

    async def complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> dict[str, str]:
        """Return a deterministic response based on prompt analysis."""
        prompt = messages[-1]["content"] if messages else ""
        prompt_lower = prompt.lower()

        # Triage classification
        if "classify this request for triage" in prompt_lower:
            return {"content": json.dumps(self._triage_response(prompt_lower))}

        # Hypothesis generation
        if "generate an alternative hypothesis" in prompt_lower:
            return {
                "content": (
                    "Alternative hypothesis: a phased approach with explicit "
                    "metrics guardrails and rollback checkpoints provides "
                    "better risk-adjusted outcomes than a single-pass solution."
                )
            }

        # Judge / verification
        if "judge this hypothesis" in prompt_lower or ("verify" in prompt_lower and "consistency" in prompt_lower) or ("judge" in prompt_lower and "consistency" in prompt_lower and "correctness" in prompt_lower):
            return {"content": "PASS: reasoning is internally consistent and actionable."}

        # Adversarial judge (fresh-eyes review)
        if "adversarial reviewer" in prompt_lower or ("adversarial" in prompt_lower and "review" in prompt_lower):
            return {"content": "CLEAN"}

        # Repair
        if "repair this answer" in prompt_lower or ("repair" in prompt_lower and "contradictions" in prompt_lower):
            return {"content": "Revised answer: The approach is sound and addresses all identified contradictions. The recommendation remains valid with minor adjustments for edge cases."}

        # Safety revision
        if "safety revise" in prompt_lower:
            return {"content": "Response revised for policy compliance while preserving key information."}

        # Style harmonization
        if "style harmonize" in prompt_lower or "style" in prompt_lower and "harmonize" in prompt_lower:
            # Return the input text as-is (style pass is identity for deterministic)
            # Extract the text after the instruction
            parts = prompt.split("\n\n", 1)
            return {"content": parts[-1].strip() if len(parts) > 1 else prompt}

        # Fable method classify
        if "classify the ask" in prompt_lower or "trivial" in prompt_lower and "task" in prompt_lower:
            return {"content": json.dumps({"shape": "task", "trivial": False, "domain": "coding"})}

        # Evidence gathering
        if "gather evidence" in prompt_lower or "enumerate" in prompt_lower and "exists" in prompt_lower:
            return {"content": "Found 3 relevant files: main.py, config.py, test_main.py. Key evidence: configuration uses dataclasses."}

        # Decision
        if "decide" in prompt_lower and "recommendation" in prompt_lower:
            return {"content": "Recommendation: proceed with the direct fix approach. Alternative (refactor) rejected: higher risk, no clear benefit."}

        # Act / code generation
        if "act" in prompt_lower and ("edit" in prompt_lower or "code" in prompt_lower or "fix" in prompt_lower):
            return {"content": "Applied surgical edit to the target function. Changed 3 lines, preserved existing style."}

        # Verify
        if "verify" in prompt_lower and ("done" in prompt_lower or "check" in prompt_lower or "pass" in prompt_lower):
            return {"content": json.dumps({"verified": True, "checks_passed": ["build", "lint", "tests"], "checks_failed": []})}

        # Report
        if "report" in prompt_lower and ("outcome" in prompt_lower or "summary" in prompt_lower):
            return {"content": "Task completed successfully. The fix addresses the root cause. All checks pass."}

        # Skill creation
        if "create skill" in prompt_lower or "skill_manage" in prompt_lower:
            return {"content": json.dumps({"status": "created", "skill_name": "auto-generated-skill", "path": "~/.fablemythos/skills/auto-generated-skill/SKILL.md"})}

        # Context compression
        if "compress" in prompt_lower or "summarize" in prompt_lower:
            return {"content": f"[Summary of {len(prompt)} chars: key points extracted and preserved.]"}

        # Default: hash-based deterministic response
        seed = hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]
        return {"content": f"Deterministic response [{seed}]: processed input of {len(prompt)} characters."}

    async def stream_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a deterministic response in chunks."""
        response = await self.complete(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop,
        )
        text = response["content"]
        chunk_size = 20
        for i in range(0, len(text), chunk_size):
            yield text[i : i + chunk_size]

    async def embed(
        self,
        *,
        model: str,
        input: str,
    ) -> list[float]:
        """Generate a deterministic embedding vector.

        Uses a hash-based approach to produce a consistent vector for the same input.
        """
        # Produce a 768-dimensional embedding (matching nomic-embed-text default)
        dim = 768
        # Use multiple hash windows to fill the vector
        result = np.zeros(dim, dtype=np.float32)
        for i in range(dim):
            # Create a unique hash for each dimension
            h = hashlib.sha256(f"{input}:{i}".encode("utf-8")).digest()
            # Convert 4 bytes to a float in [-1, 1]
            val = int.from_bytes(h[:4], "little") / 2147483647.0 - 1.0
            result[i] = val

        # Normalize to unit length
        norm = np.linalg.norm(result)
        if norm > 0:
            result = result / norm

        return result.tolist()

    @staticmethod
    def _triage_response(prompt_lower: str) -> dict:
        """Generate a deterministic triage classification based on prompt content."""
        # Extract just the QUERY portion to avoid matching field names in the prompt template
        query_part = prompt_lower
        if "query:" in prompt_lower:
            query_part = prompt_lower.split("query:", 1)[-1].strip()

        task_type = "default"
        # Check planning first — the prompt template contains "code" as a field name
        if any(w in query_part for w in ("plan", "design", "architect")):
            task_type = "planning"
        elif any(w in query_part for w in ("code", "debug", "fix", "build", "implement")):
            task_type = "code"
        elif any(w in query_part for w in ("analyze", "assess", "evaluate")):
            task_type = "analysis"
        elif any(w in query_part for w in ("calculate", "compute", "solve")):
            task_type = "math"

        difficulty = 0.5
        ambiguity = 0.4
        execution_mode = "normal"
        if any(w in prompt_lower for w in ("complex", "comprehensive", "full", "complete", "entire")):
            difficulty = 0.75
            ambiguity = 0.55
            execution_mode = "deep"

        ask_shape = "task"
        if any(w in query_part for w in ("why", "what do you think", "assess", "diagnose")):
            ask_shape = "question"
        elif any(w in query_part for w in ("plan", "propose", "recommend", "should we")):
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

    async def list_models(self) -> list[str]:
        """Return fake model list for testing."""
        return ["deterministic-fast", "deterministic-base", "deterministic-judge"]

    async def healthcheck(self) -> tuple[bool, str]:
        """Always healthy — it's deterministic."""
        return True, "Deterministic provider always available"


# Module-level singleton for convenience
_deterministic_provider: DeterministicProvider | None = None


def get_deterministic_provider() -> DeterministicProvider:
    """Get or create the singleton deterministic provider."""
    global _deterministic_provider
    if _deterministic_provider is None:
        _deterministic_provider = DeterministicProvider()
    return _deterministic_provider
