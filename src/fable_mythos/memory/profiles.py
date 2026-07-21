"""Profile management — separate contexts for personal, work, bot, etc.

Each profile has its own MEMORY.md, skills, and session history,
so wrong facts don't leak across workflows.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class ProfileManager:
    """Manages separate memory profiles.

    Each profile gets its own subdirectory under the profiles directory,
    containing its own MEMORY.md, SOUL.md, and episodic database.
    """

    def __init__(self, profiles_dir: str | Path, active_profile: str = "default") -> None:
        self.profiles_dir = Path(profiles_dir)
        self.profiles_dir.mkdir(parents=True, exist_ok=True)
        self.active_profile = active_profile

    def get_profile_dir(self, profile: str | None = None) -> Path:
        """Get the directory for a profile.

        Args:
            profile: Profile name. If None, uses the active profile.

        Returns:
            Path to the profile directory.
        """
        name = profile or self.active_profile
        profile_dir = self.profiles_dir / name
        profile_dir.mkdir(parents=True, exist_ok=True)
        return profile_dir

    def list_profiles(self) -> list[str]:
        """List all available profiles."""
        if not self.profiles_dir.exists():
            return ["default"]
        return [d.name for d in self.profiles_dir.iterdir() if d.is_dir()]

    def switch_profile(self, name: str) -> None:
        """Switch to a different profile.

        Args:
            name: The profile name to switch to.
        """
        if name not in self.list_profiles():
            logger.info("Creating new profile: %s", name)
        self.active_profile = name
        # Ensure directory exists
        self.get_profile_dir(name)

    def get_profile_paths(self, profile: str | None = None) -> dict[str, Path]:
        """Get all paths for a profile.

        Returns:
            Dict with 'memory', 'soul', 'episodes', 'chroma' paths.
        """
        profile_dir = self.get_profile_dir(profile)
        return {
            "memory": profile_dir / "MEMORY.md",
            "soul": profile_dir / "SOUL.md",
            "episodes": profile_dir / "episodes.db",
            "chroma": profile_dir / "chroma",
        }

    def delete_profile(self, name: str) -> bool:
        """Delete a profile and all its data.

        Args:
            name: Profile name to delete.

        Returns:
            True if deleted, False if not found or is the active profile.
        """
        if name == self.active_profile:
            logger.warning("Cannot delete the active profile: %s", name)
            return False

        profile_dir = self.get_profile_dir(name)
        if not profile_dir.exists():
            return False

        import shutil

        shutil.rmtree(profile_dir)
        logger.info("Deleted profile: %s", name)
        return True
