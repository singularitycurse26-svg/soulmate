"""Cascade/Windsurf IDE integration installer.

Wires Fable-Mythos into the Cascade IDE by:
1. Installing hooks into ~/.windsurf/hooks/ (SessionStart, PreToolUse, PostToolUse, SessionEnd)
2. Exporting skills as .windsurf/skills/ markdown files
3. Bridging MEMORY.md and SOUL.md into the active workspace
4. Creating a .windsurf/workflows/fable-mythos.md workflow file

Run: python -m fable_mythos.integration.cascade_installer install
"""

from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Hook scripts that Cascade will call
SESSION_START_HOOK = """#!/usr/bin/env python
\"\"\"Fable-Mythos SessionStart hook for Cascade IDE.\"\"\"
import json, sys, os

def main():
    # Read the hook event from stdin
    event = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}

    # Load Fable-Mythos session context
    from fable_mythos.hooks.session_start import SessionStartHook
    project_dir = event.get("project_dir", os.getcwd())
    hook = SessionStartHook(project_dir=project_dir)
    ctx = hook.execute(session_model=event.get("model", ""))

    # Build system prefix to inject
    prefix = hook.build_system_prefix(ctx)

    # Return the result for Cascade to inject
    result = {
        "inject_system_prefix": prefix,
        "profile": ctx.profile.value,
        "routing": ctx.routing.value,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
"""

PRE_TOOL_USE_HOOK = """#!/usr/bin/env python
\"\"\"Fable-Mythos PreToolUse hook for Cascade IDE — spawn guard.\"\"\"
import json, sys

def main():
    event = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})

    from fable_mythos.hooks.spawn_guard import SpawnGuard
    session_model = event.get("session_model", "")
    has_open_cards = event.get("ledger_has_open_cards", False)

    guard = SpawnGuard(session_model=session_model, ledger_has_open_cards=has_open_cards)
    decision = guard.check(tool_name, tool_input)

    result = {
        "allow": decision.allowed,
        "reason": decision.reason,
        "blocked_by": decision.blocked_by,
    }
    print(json.dumps(result))

if __name__ == "__main__":
    main()
"""

POST_TOOL_USE_HOOK = """#!/usr/bin/env python
\"\"\"Fable-Mythos PostToolUse hook for Cascade IDE — fail streak detector.\"\"\"
import json, sys

def main():
    event = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}
    tool_name = event.get("tool_name", "")
    tool_input = event.get("tool_input", {})
    tool_output = event.get("tool_output", {})

    from fable_mythos.hooks.fail_streak import FailStreakHook
    hook = FailStreakHook()

    # Persist state across calls (simple file-based)
    state_file = os.path.expanduser("~/.fablemythos/fail_streak_state.json")
    if os.path.exists(state_file):
        import json as j
        with open(state_file) as f:
            state = j.load(f)
        hook.state.consecutive_failures = state.get("consecutive_failures", 0)
        hook.state.total_failures = state.get("total_failures", 0)
        hook.state.total_successes = state.get("total_successes", 0)
        hook.state.ladder_injected = state.get("ladder_injected", False)

    result = hook.execute(tool_name, tool_input, tool_output)

    # Save state
    import json as j, os
    os.makedirs(os.path.dirname(state_file), exist_ok=True)
    with open(state_file, "w") as f:
        j.dump({
            "consecutive_failures": hook.state.consecutive_failures,
            "total_failures": hook.state.total_failures,
            "total_successes": hook.state.total_successes,
            "ladder_injected": hook.state.ladder_injected,
        }, f)

    output = {"inject_context": result["inject_context"], "should_pause": result["should_pause"]}
    print(json.dumps(output))

import os
if __name__ == "__main__":
    main()
"""

SESSION_END_HOOK = """#!/usr/bin/env python
\"\"\"Fable-Mythos SessionEnd hook for Cascade IDE.\"\"\"
import json, sys, time

def main():
    event = json.loads(sys.stdin.read()) if not sys.stdin.isatty() else {}

    from fable_mythos.hooks.session_end import SessionEndHook, SessionSummary
    hook = SessionEndHook()

    summary = SessionSummary(
        session_id=event.get("session_id", "cascade"),
        start_time=event.get("start_time", time.time() - 60),
        end_time=time.time(),
        queries=event.get("queries", []),
        tools_used=event.get("tools_used", []),
        skills_used=event.get("skills_used", []),
        new_skills_created=event.get("new_skills_created", []),
        success=event.get("success", True),
        confidence_achieved=event.get("confidence", 0.0),
    )

    result = hook.execute(summary)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
"""

# Workflow file for Cascade
WORKFLOW_FILE = """---
description: Run a task through the Fable-Mythos reasoning harness for structured 9-phase reasoning
---
# Fable-Mythos Workflow

This workflow routes the task through the Fable-Mythos agent harness for structured reasoning.

## Steps

1. Check if Fable-Mythos server is running on localhost:8080
   - If not running, start it: `fable-mythos-server` in background

2. Send the task to Fable-Mythos via the API:
   ```bash
   curl -X POST http://localhost:8080/v1/complete \\
     -H "Content-Type: application/json" \\
     -d '{"query": "<USER_TASK>", "thread_id": "cascade"}'
   ```

3. Parse the response and apply the result

4. If the task created new skills, sync them:
   ```bash
   curl http://localhost:8080/v1/skills
   ```

5. Log the session outcome to Fable-Mythos memory
"""

# Cascade hook configuration
HOOK_CONFIG = {
    "hooks": {
        "SessionStart": [
            {"type": "command", "command": "python ~/.windsurf/hooks/fable_mythos_session_start.py"}
        ],
        "PreToolUse": [
            {"type": "command", "command": "python ~/.windsurf/hooks/fable_mythos_pre_tool_use.py"}
        ],
        "PostToolUse": [
            {"type": "command", "command": "python ~/.windsurf/hooks/fable_mythos_post_tool_use.py"}
        ],
        "SessionEnd": [
            {"type": "command", "command": "python ~/.windsurf/hooks/fable_mythos_session_end.py"}
        ],
    }
}


class CascadeInstaller:
    """Installs Fable-Mythos integration into the Cascade/Windsurf IDE."""

    def __init__(self, windsurf_dir: str | Path | None = None) -> None:
        if windsurf_dir is None:
            windsurf_dir = Path.home() / ".windsurf"
        self.windsurf_dir = Path(windsurf_dir)
        self.hooks_dir = self.windsurf_dir / "hooks"
        self.skills_dir = self.windsurf_dir / "skills"
        self.workflows_dir = self.windsurf_dir / "workflows"

    def install(self, project_dir: str | Path | None = None) -> dict[str, Any]:
        """Install all Fable-Mythos integration components.

        Args:
            project_dir: Optional project directory for memory bridge.

        Returns:
            Dict with installation results for each component.
        """
        results: dict[str, Any] = {}

        results["hooks"] = self._install_hooks()
        results["skills"] = self._install_skills_export()
        results["workflow"] = self._install_workflow()
        results["config"] = self._install_hook_config()

        if project_dir:
            results["memory_bridge"] = self._install_memory_bridge(project_dir)

        logger.info("Cascade integration installed: %s", list(results.keys()))
        return results

    def uninstall(self) -> dict[str, Any]:
        """Remove Fable-Mythos integration from Cascade.

        Returns:
            Dict with uninstall results.
        """
        results: dict[str, Any] = {}

        # Remove hook scripts
        removed_hooks: list[str] = []
        for hook_file in self.hooks_dir.glob("fable_mythos_*.py"):
            hook_file.unlink()
            removed_hooks.append(str(hook_file))
        results["removed_hooks"] = removed_hooks

        # Remove workflow
        workflow = self.workflows_dir / "fable-mythos.md"
        if workflow.exists():
            workflow.unlink()
            results["removed_workflow"] = str(workflow)

        # Remove skills
        removed_skills: list[str] = []
        if self.skills_dir.exists():
            for skill_file in self.skills_dir.glob("fable-mythos-*.md"):
                skill_file.unlink()
                removed_skills.append(str(skill_file))
        results["removed_skills"] = removed_skills

        logger.info("Cascade integration uninstalled")
        return results

    def _install_hooks(self) -> dict[str, str]:
        """Install hook scripts into ~/.windsurf/hooks/."""
        self.hooks_dir.mkdir(parents=True, exist_ok=True)

        hooks = {
            "fable_mythos_session_start.py": SESSION_START_HOOK,
            "fable_mythos_pre_tool_use.py": PRE_TOOL_USE_HOOK,
            "fable_mythos_post_tool_use.py": POST_TOOL_USE_HOOK,
            "fable_mythos_session_end.py": SESSION_END_HOOK,
        }

        installed: dict[str, str] = {}
        for filename, content in hooks.items():
            path = self.hooks_dir / filename
            path.write_text(content, encoding="utf-8")
            installed[filename] = str(path)
            logger.debug("Installed hook: %s", path)

        return installed

    def _install_skills_export(self) -> dict[str, Any]:
        """Export Fable-Mythos skills as .windsurf/skills/ markdown files."""
        self.skills_dir.mkdir(parents=True, exist_ok=True)

        # Try to load skills from the semantic memory
        skills_installed: list[str] = []
        try:
            from fable_mythos.config import load_settings
            from fable_mythos.memory.manager import MemoryManager
            from fable_mythos.providers.bus import create_bus

            settings = load_settings()
            bus = create_bus(settings)
            memory = MemoryManager(settings=settings, bus=bus)

            for skill_data in memory.semantic.list_skills():
                name = skill_data.get("name", "unknown")
                filename = f"fable-mythos-{name}.md"
                content = skill_data.get("content", skill_data.get("description", ""))
                path = self.skills_dir / filename
                path.write_text(f"# {name}\n\n{content}\n", encoding="utf-8")
                skills_installed.append(filename)

        except Exception as e:
            logger.warning("Could not export skills from memory: %s", e)

        # Always install a default skill
        default_skill = self.skills_dir / "fable-mythos-reasoning.md"
        default_skill.write_text(
            "# Fable-Mythos Reasoning\n\n"
            "Use the 9-phase reasoning loop for complex tasks:\n"
            "1. Classify the ask\n"
            "2. Define done\n"
            "3. Gather evidence\n"
            "4. Decide on one approach\n"
            "5. Act surgically\n"
            "6. Verify by observation\n"
            "7. Repair if needed\n"
            "8. Synthesize findings\n"
            "9. Judge confidence\n",
            encoding="utf-8",
        )
        skills_installed.append("fable-mythos-reasoning.md")

        return {"installed": skills_installed, "dir": str(self.skills_dir)}

    def _install_workflow(self) -> str:
        """Install the Fable-Mythos workflow file."""
        self.workflows_dir.mkdir(parents=True, exist_ok=True)
        path = self.workflows_dir / "fable-mythos.md"
        path.write_text(WORKFLOW_FILE, encoding="utf-8")
        logger.debug("Installed workflow: %s", path)
        return str(path)

    def _install_hook_config(self) -> str:
        """Install or merge hook configuration into windsurf settings."""
        config_path = self.windsurf_dir / "settings.json"

        existing: dict[str, Any] = {}
        if config_path.exists():
            try:
                existing = json.loads(config_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                existing = {}

        # Merge hook config
        if "hooks" not in existing:
            existing["hooks"] = {}
        existing["hooks"].update(HOOK_CONFIG["hooks"])

        # Add Fable-Mythos marker
        existing["fable_mythos_installed"] = True

        config_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        logger.debug("Updated config: %s", config_path)
        return str(config_path)

    def _install_memory_bridge(self, project_dir: str | Path) -> dict[str, str]:
        """Bridge MEMORY.md and SOUL.md into the project workspace.

        Creates .fable/ directory in the project with symlinks or copies
        of the Fable-Mythos memory files.
        """
        project = Path(project_dir)
        fable_dir = project / ".fable"
        fable_dir.mkdir(parents=True, exist_ok=True)

        results: dict[str, str] = {}

        # Bridge MEMORY.md
        memory_src = Path.home() / ".fablemythos" / "MEMORY.md"
        memory_dst = fable_dir / "MEMORY.md"
        if memory_src.exists():
            if memory_dst.exists():
                memory_dst.unlink()
            shutil.copy2(memory_src, memory_dst)
            results["memory"] = str(memory_dst)

        # Bridge SOUL.md
        soul_src = Path.home() / ".fablemythos" / "SOUL.md"
        soul_dst = fable_dir / "SOUL.md"
        if soul_src.exists():
            if soul_dst.exists():
                soul_dst.unlink()
            shutil.copy2(soul_src, soul_dst)
            results["soul"] = str(soul_dst)

        # Create LEDGER.md if it doesn't exist
        ledger = fable_dir / "LEDGER.md"
        if not ledger.exists():
            ledger.write_text("# Task Ledger\n\n## Open\n\n## Done\n", encoding="utf-8")
            results["ledger"] = str(ledger)

        return results

    def status(self) -> dict[str, Any]:
        """Check installation status.

        Returns:
            Dict with status of each component.
        """
        status: dict[str, Any] = {
            "hooks_dir": str(self.hooks_dir),
            "hooks_dir_exists": self.hooks_dir.exists(),
            "hooks_installed": [],
            "workflow_installed": False,
            "skills_installed": [],
            "config_has_fable_mythos": False,
        }

        if self.hooks_dir.exists():
            status["hooks_installed"] = [
                f.name for f in self.hooks_dir.glob("fable_mythos_*.py")
            ]

        workflow = self.workflows_dir / "fable-mythos.md"
        status["workflow_installed"] = workflow.exists()

        if self.skills_dir.exists():
            status["skills_installed"] = [
                f.name for f in self.skills_dir.glob("fable-mythos-*.md")
            ]

        config_path = self.windsurf_dir / "settings.json"
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
                status["config_has_fable_mythos"] = config.get("fable_mythos_installed", False)
            except (json.JSONDecodeError, OSError):
                pass

        return status


def main() -> None:
    """CLI entry point for the installer."""
    import argparse

    parser = argparse.ArgumentParser(description="Fable-Mythos Cascade integration")
    parser.add_argument("action", choices=["install", "uninstall", "status"], help="Action to perform")
    parser.add_argument("--project-dir", default=None, help="Project directory for memory bridge")
    parser.add_argument("--windsurf-dir", default=None, help="Windsurf config directory")
    args = parser.parse_args()

    installer = CascadeInstaller(windsurf_dir=args.windsurf_dir)

    if args.action == "install":
        results = installer.install(project_dir=args.project_dir)
        print("Fable-Mythos Cascade integration installed:")
        for component, details in results.items():
            print(f"  {component}: {details}")
    elif args.action == "uninstall":
        results = installer.uninstall()
        print("Fable-Mythos Cascade integration removed:")
        for component, details in results.items():
            print(f"  {component}: {details}")
    elif args.action == "status":
        status = installer.status()
        print("Fable-Mythos Cascade integration status:")
        for key, value in status.items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
