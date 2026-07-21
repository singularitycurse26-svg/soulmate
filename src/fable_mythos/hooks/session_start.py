"""SessionStart hook — injects discipline and context at session start.

From fable5-mode/fable_profile_inject.py: dynamically injects discipline and context
into the agent's session based on the project's ledger state. Determines a "profile"
(throughput/conservative) and "routing" (quality/frugal/balanced) for the session.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class SessionProfile(str, Enum):
    """Session profile — determines delegation and model usage strategy."""

    THROUGHPUT = "throughput"  # maximize output, use subagents freely
    CONSERVATIVE = "conservative"  # minimize cost, do everything inline


class RoutingMode(str, Enum):
    """Routing mode — determines model selection strategy."""

    QUALITY = "quality"  # use best model for each task
    FRUGAL = "frugal"  # use cheapest model that can do the job
    BALANCED = "balanced"  # trade off quality vs cost


@dataclass
class SessionContext:
    """Context injected at session start."""

    profile: SessionProfile = SessionProfile.CONSERVATIVE
    routing: RoutingMode = RoutingMode.BALANCED
    session_model: str = ""
    ledger_path: str = ""
    ledger_has_open_cards: bool = False
    discipline_text: str = ""
    injected_facts: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class SessionStartHook:
    """SessionStart hook — injects discipline and context at session start.

    Reads the project ledger (.fable/LEDGER.md) to determine:
    - Profile: throughput (open cards exist) or conservative (no open cards)
    - Routing: quality (complex tasks), frugal (simple tasks), balanced (default)
    - Session model: cached for the spawn_guard to enforce model ceiling
    """

    DISCIPLINE_TEXT = """## Fable-Mythos Discipline

You are operating under Fable-Mythos discipline. Follow these rules:

1. **Classify before acting**: Classify the ask (trivial/question/task/plan_first) before doing anything.
2. **Define done**: State what 'done' looks like and how it will be verified.
3. **Gather evidence**: Enumerate what exists. Use primary sources. Don't guess.
4. **One recommendation**: Synthesize evidence into ONE recommendation. Name alternatives and why they lost.
5. **Act surgically**: Make the smallest correct change. State INTENT before editing.
6. **Verify by observation**: Run the check. Don't infer success.
7. **Report outcome-first**: Lead with the result. Then the reasoning. Then caveats.

If you fail a check 3 times, use the attribution ladder:
harness → deployment → product. Don't grind.
"""

    def __init__(self, project_dir: str | Path | None = None) -> None:
        self.project_dir = Path(project_dir) if project_dir else Path.cwd()

    def execute(self, session_model: str = "") -> SessionContext:
        """Execute the SessionStart hook.

        Args:
            session_model: The model being used for this session.

        Returns:
            SessionContext with profile, routing, and discipline text.
        """
        # Check for ledger
        ledger_path = self.project_dir / ".fable" / "LEDGER.md"
        ledger_has_open_cards = self._check_ledger_for_open_cards(ledger_path)

        # Determine profile
        if ledger_has_open_cards:
            profile = SessionProfile.THROUGHPUT
            routing = RoutingMode.QUALITY
        else:
            profile = SessionProfile.CONSERVATIVE
            routing = RoutingMode.BALANCED

        # Build injected facts from MEMORY.md if available
        injected_facts: list[str] = []
        memory_path = self.project_dir / ".fable" / "MEMORY.md"
        if memory_path.exists():
            content = memory_path.read_text(encoding="utf-8").strip()
            if content:
                injected_facts.append(content)

        context = SessionContext(
            profile=profile,
            routing=routing,
            session_model=session_model,
            ledger_path=str(ledger_path),
            ledger_has_open_cards=ledger_has_open_cards,
            discipline_text=self.DISCIPLINE_TEXT,
            injected_facts=injected_facts,
        )

        logger.info(
            "SessionStart: profile=%s routing=%s model=%s open_cards=%s",
            profile.value, routing.value, session_model, ledger_has_open_cards,
        )

        return context

    def _check_ledger_for_open_cards(self, ledger_path: Path) -> bool:
        """Check if the ledger has any open task cards.

        Args:
            ledger_path: Path to LEDGER.md.

        Returns:
            True if open cards exist.
        """
        if not ledger_path.exists():
            return False

        content = ledger_path.read_text(encoding="utf-8")

        # Look for open card markers (checkboxes that are unchecked)
        lines = content.split("\n")
        for line in lines:
            stripped = line.strip()
            # Open cards: "- [ ]" or "OPEN:" or "TODO:"
            if stripped.startswith("- [ ]") or stripped.startswith("OPEN:") or stripped.startswith("TODO:"):
                return True

        return False

    def build_system_prefix(self, context: SessionContext) -> str:
        """Build the system prompt prefix from the session context.

        Args:
            context: The session context from execute().

        Returns:
            System prompt prefix string to prepend to the model's system prompt.
        """
        parts: list[str] = [context.discipline_text]

        if context.profile == SessionProfile.THROUGHPUT:
            parts.append("## Session Profile: Throughput\nYou may delegate to subagents for parallel work.")
        else:
            parts.append("## Session Profile: Conservative\nDo everything inline. No subagent delegation.")

        parts.append(f"## Routing: {context.routing.value}")
        parts.append(f"## Session Model: {context.session_model}")

        if context.injected_facts:
            facts_text = "\n".join(f"- {f}" for f in context.injected_facts)
            parts.append(f"## Project Facts\n{facts_text}")

        return "\n\n".join(parts)
