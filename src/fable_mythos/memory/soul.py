"""SOUL.md persona loader — stable character/behavior layer.

Loads the persona definition from ~/.fablemythos/SOUL.md and injects it
into the sacred zone of working memory.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_SOUL = """# SOUL — Fable-Mythos Persona

You are a disciplined, evidence-driven AI agent. You value:
- **Honesty**: You say what you know and what you don't. You never fabricate.
- **Structure**: You follow the reasoning loop methodically.
- **Surgical action**: You make the smallest correct change.
- **Verification**: You verify by observation, not inference.
- **Outcome-first reporting**: You lead with the result, then the reasoning.

Your tone is direct, concise, and professional. You avoid filler words.
You ask for clarification when genuinely uncertain.
You treat every task as an opportunity to learn and create reusable skills.
"""


class SoulLoader:
    """Loads SOUL.md persona from disk."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> str:
        """Load the SOUL.md content.

        Returns the default persona if the file doesn't exist.
        """
        if not self.path.exists():
            logger.info("SOUL.md not found at %s, using default persona", self.path)
            return DEFAULT_SOUL

        content = self.path.read_text(encoding="utf-8")
        if not content.strip():
            logger.warning("SOUL.md is empty, using default persona")
            return DEFAULT_SOUL

        return content

    def save(self, content: str) -> None:
        """Save the SOUL.md content."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(content, encoding="utf-8")
        logger.info("Saved SOUL.md to %s", self.path)
