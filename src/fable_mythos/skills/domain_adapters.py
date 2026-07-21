"""Domain adapters — specialized instructions for specific task types.

From fable-method: domain adapters provide specialized instructions for
math, coding, literature, planning, and other task types. These are
injected during the triage phase based on the classified task type.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class DomainAdapter:
    """Base domain adapter — provides specialized instructions for a task type."""

    name: str = "base"
    task_type: str = "default"

    def get_instructions(self) -> str:
        """Return specialized instructions for this domain."""
        raise NotImplementedError

    def get_gates(self) -> list[str]:
        """Return domain-specific gates to check."""
        return []

    def get_verification_method(self) -> str:
        """Return the preferred verification method for this domain."""
        return "Run the relevant tests or checks."


class CodingAdapter(DomainAdapter):
    """Coding domain adapter — specialized for code tasks."""

    name = "coding"
    task_type = "code"

    def get_instructions(self) -> str:
        return """## Coding Domain

- State INTENT before editing: what will this change do, why is it correct?
- Make the smallest correct change. Don't refactor unrelated code.
- After editing, run the test or build command to verify.
- If tests fail, read the actual error before changing anything.
- Prefer fixing the root cause over adding a workaround.
- Don't delete tests. If a test is wrong, explain why and fix the test.
- Don't add comments unless asked. Code should be self-documenting."""

    def get_gates(self) -> list[str]:
        return [
            "Intent stated before edit",
            "Smallest correct change",
            "Tests or build run after change",
            "No unrelated refactoring",
        ]

    def get_verification_method(self) -> str:
        return "Run the project's test suite or build command."


class MathAdapter(DomainAdapter):
    """Math domain adapter — specialized for mathematical tasks."""

    name = "math"
    task_type = "math"

    def get_instructions(self) -> str:
        return """## Math Domain

- Show your work step by step.
- State the formula or theorem you're using before applying it.
- Check units and dimensions.
- Verify the answer makes sense (order of magnitude, sign, etc.).
- If using a numerical method, state the precision and error bounds."""

    def get_gates(self) -> list[str]:
        return [
            "Formula/theorem stated before application",
            "Units checked",
            "Answer sanity-checked",
        ]

    def get_verification_method(self) -> str:
        return "Re-derive the result using a different method."


class PlanningAdapter(DomainAdapter):
    """Planning domain adapter — specialized for planning and architecture tasks."""

    name = "planning"
    task_type = "planning"

    def get_instructions(self) -> str:
        return """## Planning Domain

- Start with constraints (time, budget, team, tech stack).
- List 2-3 options with trade-offs. Don't present only one option.
- Name the alternative you rejected and why.
- Identify the highest-risk component and how to de-risk it.
- Define milestones with concrete deliverables.
- State what 'done' looks like for each milestone."""

    def get_gates(self) -> list[str]:
        return [
            "Constraints stated",
            "Multiple options with trade-offs",
            "Highest risk identified",
            "Milestones with deliverables",
        ]

    def get_verification_method(self) -> str:
        return "Review the plan against the stated constraints and milestones."


class AnalysisAdapter(DomainAdapter):
    """Analysis domain adapter — specialized for analysis and assessment tasks."""

    name = "analysis"
    task_type = "analysis"

    def get_instructions(self) -> str:
        return """## Analysis Domain

- State the question being analyzed explicitly.
- List the evidence sources used.
- Distinguish facts from inferences from opinions.
- If data is missing, state what's missing and how it affects the analysis.
- Provide a confidence level for key conclusions.
- Note any biases or limitations in the analysis."""

    def get_gates(self) -> list[str]:
        return [
            "Question stated explicitly",
            "Evidence sources listed",
            "Facts distinguished from inferences",
            "Confidence levels provided",
        ]

    def get_verification_method(self) -> str:
        return "Cross-check key conclusions against independent sources."


class LiteratureAdapter(DomainAdapter):
    """Literature domain adapter — specialized for literature review tasks."""

    name = "literature"
    task_type = "literature"

    def get_instructions(self) -> str:
        return """## Literature Domain

- Search broadly first, then narrow.
- Note publication dates — prefer recent sources for fast-moving fields.
- Track which sources agree and which disagree.
- Summarize the consensus view and notable dissenting views.
- Cite sources properly."""

    def get_gates(self) -> list[str]:
        return [
            "Broad search before narrowing",
            "Publication dates noted",
            "Consensus and dissent identified",
            "Sources cited",
        ]

    def get_verification_method(self) -> str:
        return "Verify key claims against the cited primary sources."


class FactualAdapter(DomainAdapter):
    """Factual domain adapter — specialized for factual lookup tasks."""

    name = "factual"
    task_type = "factual"

    def get_instructions(self) -> str:
        return """## Factual Domain

- State the fact being looked up.
- Cite the primary source, not a secondary reference.
- If the fact is disputed, note the dispute.
- If the fact is time-sensitive, note the as-of date."""

    def get_gates(self) -> list[str]:
        return [
            "Primary source cited",
            "Disputes noted",
            "As-of date for time-sensitive facts",
        ]

    def get_verification_method(self) -> str:
        return "Verify against the primary source."


# Registry of domain adapters
ADAPTERS: dict[str, DomainAdapter] = {
    "code": CodingAdapter(),
    "math": MathAdapter(),
    "planning": PlanningAdapter(),
    "analysis": AnalysisAdapter(),
    "literature": LiteratureAdapter(),
    "factual": FactualAdapter(),
}


def get_adapter(task_type: str) -> DomainAdapter:
    """Get the domain adapter for a task type.

    Args:
        task_type: The task type from triage classification.

    Returns:
        DomainAdapter for the task type, or a base adapter if no match.
    """
    adapter = ADAPTERS.get(task_type)
    if adapter is not None:
        return adapter

    # Default adapter
    class DefaultAdapter(DomainAdapter):
        name = "default"
        task_type = "default"

        def get_instructions(self) -> str:
            return "Follow the standard Fable-Mythos reasoning loop."

    return DefaultAdapter()


def list_adapters() -> list[dict[str, Any]]:
    """List all available domain adapters."""
    return [
        {
            "name": adapter.name,
            "task_type": adapter.task_type,
            "gates": adapter.get_gates(),
        }
        for adapter in ADAPTERS.values()
    ]
