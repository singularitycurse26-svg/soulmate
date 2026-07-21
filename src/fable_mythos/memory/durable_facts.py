"""MEMORY.md durable facts loader.

Loads durable facts from ~/.fablemythos/MEMORY.md and injects them
into the sacred zone of working memory. Durable facts are compact facts
that stay useful: preferred communication style, project paths, deployment
conventions, environment quirks, user corrections.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

DEFAULT_MEMORY = """# MEMORY — Durable Facts

## Environment
- OS: Windows
- Python: 3.11 (via uv/Astral)
- Run Python: py -V:Astral/CPython3.11.15

## Preferences
- Communication style: terse and direct
- Code style: minimal, focused edits
"""


class DurableFactsLoader:
    """Loads MEMORY.md durable facts from disk."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> str:
        """Load the MEMORY.md content.

        Returns default facts if the file doesn't exist.
        """
        if not self.path.exists():
            logger.info("MEMORY.md not found at %s, using defaults", self.path)
            return DEFAULT_MEMORY

        content = self.path.read_text(encoding="utf-8")
        if not content.strip():
            logger.warning("MEMORY.md is empty, using defaults")
            return DEFAULT_MEMORY

        return content

    def save(self, content: str) -> None:
        """Save the MEMORY.md content."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(content, encoding="utf-8")
        logger.info("Saved MEMORY.md to %s", self.path)

    def add_fact(self, fact: str) -> None:
        """Add a single durable fact to MEMORY.md.

        Appends to the file without rewriting it.
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)

        existing = ""
        if self.path.exists():
            existing = self.path.read_text(encoding="utf-8")

        # Append under a "## Learned" section
        if "## Learned" not in existing:
            content = existing.rstrip() + f"\n\n## Learned\n- {fact}\n"
        else:
            content = existing.rstrip() + f"\n- {fact}\n"

        self.path.write_text(content, encoding="utf-8")
        logger.info("Added durable fact to MEMORY.md: %s", fact[:80])
