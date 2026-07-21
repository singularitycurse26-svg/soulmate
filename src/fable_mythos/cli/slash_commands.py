"""Slash command handler — processes /commands in the terminal UI.

Supported commands:
- /help: Show available commands
- /skills: List, search, create, delete skills
- /learn: Learn a skill from the last successful episode
- /memory: Show memory state (working, episodic, semantic)
- /graph: Show knowledge graph stats and traverse
- /profile: Switch, list, create profiles
- /soul: View or edit SOUL.md
- /facts: View or add durable facts to MEMORY.md
- /rml: Show RML stats or reset
- /hooks: Show hook stats
- /health: Check system health
- /clear: Clear conversation history
- /quit: Exit the session
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Awaitable

logger = logging.getLogger(__name__)


@dataclass
class CommandResult:
    """Result of a slash command execution."""

    output: str
    should_exit: bool = False
    should_clear: bool = False


class SlashCommandHandler:
    """Handles slash commands in the terminal UI.

    Each command is registered with a handler function that takes
    the command arguments and returns a CommandResult.
    """

    def __init__(
        self,
        orchestrator: Any = None,
        memory_manager: Any = None,
        skill_manager: Any = None,
        skill_factory: Any = None,
        rml_engine: Any = None,
        profile_manager: Any = None,
        soul_loader: Any = None,
        facts_loader: Any = None,
        session_start_hook: Any = None,
        session_end_hook: Any = None,
        fail_streak_hook: Any = None,
    ) -> None:
        self.orchestrator = orchestrator
        self.memory = memory_manager
        self.skill_manager = skill_manager
        self.skill_factory = skill_factory
        self.rml = rml_engine
        self.profiles = profile_manager
        self.soul = soul_loader
        self.facts = facts_loader
        self.session_start = session_start_hook
        self.session_end = session_end_hook
        self.fail_streak = fail_streak_hook

        self._commands: dict[str, tuple[str, Callable[[list[str]], Awaitable[CommandResult]]]] = {
            "help": ("Show available commands", self._cmd_help),
            "skills": ("List, search, create, delete skills", self._cmd_skills),
            "learn": ("Learn a skill from the last successful episode", self._cmd_learn),
            "memory": ("Show memory state", self._cmd_memory),
            "graph": ("Show knowledge graph stats", self._cmd_graph),
            "profile": ("Switch, list, create profiles", self._cmd_profile),
            "soul": ("View or edit SOUL.md", self._cmd_soul),
            "facts": ("View or add durable facts", self._cmd_facts),
            "rml": ("Show RML stats or reset", self._cmd_rml),
            "hooks": ("Show hook stats", self._cmd_hooks),
            "health": ("Check system health", self._cmd_health),
            "clear": ("Clear conversation history", self._cmd_clear),
            "quit": ("Exit the session", self._cmd_quit),
        }

    async def handle(self, input: str) -> CommandResult:
        """Handle a slash command.

        Args:
            input: The full input string starting with /.

        Returns:
            CommandResult with output and control flags.
        """
        parts = input.strip().split()
        if not parts:
            return CommandResult(output="Empty command.")

        cmd = parts[0].lstrip("/")
        args = parts[1:]

        if not cmd:
            return CommandResult(output="Empty command.")

        handler_entry = self._commands.get(cmd)
        if handler_entry is None:
            available = ", ".join(sorted(self._commands.keys()))
            return CommandResult(output=f"Unknown command: /{cmd}\nAvailable: {available}")

        _, handler = handler_entry
        try:
            return await handler(args)
        except Exception as e:
            logger.error("Command /%s failed: %s", cmd, e)
            return CommandResult(output=f"Command failed: {e}")

    def list_commands(self) -> dict[str, str]:
        """List all available commands with descriptions."""
        return {cmd: desc for cmd, (desc, _) in self._commands.items()}

    async def _cmd_help(self, args: list[str]) -> CommandResult:
        lines = ["Available commands:"]
        for cmd, (desc, _) in sorted(self._commands.items()):
            lines.append(f"  /{cmd:12s} {desc}")
        return CommandResult(output="\n".join(lines))

    async def _cmd_skills(self, args: list[str]) -> CommandResult:
        if not self.skill_manager:
            return CommandResult(output="Skill manager not available.")

        if not args or args[0] == "list":
            result = self.skill_manager.list()
            if not result.success or not result.skills:
                return CommandResult(output="No skills found.")
            lines = [f"Skills ({len(result.skills)}):"]
            for s in result.skills:
                usage = f" (used {s.usage_count}x, {s.success_count} success)" if s.usage_count > 0 else ""
                lines.append(f"  {s.name:30s} [{s.category}] {s.description}{usage}")
            return CommandResult(output="\n".join(lines))

        elif args[0] == "search":
            query = " ".join(args[1:]) if len(args) > 1 else ""
            result = self.skill_manager.search(query=query)
            if not result.success or not result.skills:
                return CommandResult(output=f"No skills matching '{query}'.")
            lines = [f"Search results ({len(result.skills)}):"]
            for s in result.skills:
                lines.append(f"  {s.name:30s} {s.description}")
            return CommandResult(output="\n".join(lines))

        elif args[0] == "delete" and len(args) > 1:
            result = self.skill_manager.delete(args[1])
            return CommandResult(output=result.message)

        elif args[0] == "read" and len(args) > 1:
            result = self.skill_manager.read(args[1])
            if result.success and result.skill:
                return CommandResult(output=f"Skill: {result.skill.name}\n{result.skill.content}")
            return CommandResult(output=result.message)

        return CommandResult(output="Usage: /skills [list|search <query>|read <name>|delete <name>]")

    async def _cmd_learn(self, args: list[str]) -> CommandResult:
        if not self.skill_factory:
            return CommandResult(output="Skill factory not available.")

        result = await self.skill_factory.learn_from_recent()
        if result["success"]:
            return CommandResult(output=f"Learned skill '{result['skill_name']}'!\n{result['message']}")
        return CommandResult(output=result["message"])

    async def _cmd_memory(self, args: list[str]) -> CommandResult:
        if not self.memory:
            return CommandResult(output="Memory manager not available.")

        lines = ["Memory State:"]
        usage = self.memory.working.get_token_usage()
        lines.append(f"  Working: {usage['total']}/{usage['max']} tokens (sacred: {usage['sacred']}, compressible: {usage['compressible']})")
        lines.append(f"  Episodic: {self.memory.episodic.count()} episodes")
        lines.append(f"  Semantic: {self.memory.semantic.count()} skills")
        lines.append(f"  Graph: {self.memory.graph.count_nodes()} nodes, {self.memory.graph.count_edges()} edges")
        return CommandResult(output="\n".join(lines))

    async def _cmd_graph(self, args: list[str]) -> CommandResult:
        if not self.memory:
            return CommandResult(output="Memory manager not available.")

        lines = ["Knowledge Graph:"]
        lines.append(f"  Nodes: {self.memory.graph.count_nodes()}")
        lines.append(f"  Edges: {self.memory.graph.count_edges()}")

        for node_type in ("fact", "episode", "skill", "decision"):
            nodes = self.memory.graph.get_nodes_by_type(node_type)
            if nodes:
                lines.append(f"  {node_type}s: {len(nodes)}")

        if args and args[0] == "traverse" and len(args) > 1:
            node_id = args[1]
            result = self.memory.graph.traverse(node_id, max_depth=2)
            lines.append(f"\nTraversal from {node_id}:")
            for connected_id, edges in result.items():
                edge_types = [e.edge_type for e in edges]
                lines.append(f"  {connected_id}: {edge_types}")

        return CommandResult(output="\n".join(lines))

    async def _cmd_profile(self, args: list[str]) -> CommandResult:
        if not self.profiles:
            return CommandResult(output="Profile manager not available.")

        if not args or args[0] == "list":
            profiles = self.profiles.list_profiles()
            active = self.profiles.active_profile
            lines = [f"Profiles (active: {active}):"]
            for p in profiles:
                marker = " *" if p == active else ""
                lines.append(f"  {p}{marker}")
            return CommandResult(output="\n".join(lines))

        elif args[0] == "switch" and len(args) > 1:
            self.profiles.switch_profile(args[1])
            return CommandResult(output=f"Switched to profile '{args[1]}'.")

        elif args[0] == "delete" and len(args) > 1:
            deleted = self.profiles.delete_profile(args[1])
            if deleted:
                return CommandResult(output=f"Deleted profile '{args[1]}'.")
            return CommandResult(output=f"Could not delete profile '{args[1]}'.")

        return CommandResult(output="Usage: /profile [list|switch <name>|delete <name>]")

    async def _cmd_soul(self, args: list[str]) -> CommandResult:
        if not self.soul:
            return CommandResult(output="Soul loader not available.")

        content = self.soul.load()
        if args and args[0] == "edit":
            return CommandResult(output=f"SOUL.md content:\n{content}\n\n(Edit the file at {self.soul.path} directly.)")
        return CommandResult(output=f"SOUL.md ({self.soul.path}):\n{content[:500]}...")

    async def _cmd_facts(self, args: list[str]) -> CommandResult:
        if not self.facts:
            return CommandResult(output="Facts loader not available.")

        if args and args[0] == "add":
            fact = " ".join(args[1:])
            if fact:
                self.facts.add_fact(fact)
                return CommandResult(output=f"Added fact: {fact}")
            return CommandResult(output="Usage: /facts add <fact text>")

        content = self.facts.load()
        return CommandResult(output=f"MEMORY.md ({self.facts.path}):\n{content[:500]}...")

    async def _cmd_rml(self, args: list[str]) -> CommandResult:
        if not self.rml:
            return CommandResult(output="RML engine not available.")

        if args and args[0] == "reset":
            self.rml.reset()
            return CommandResult(output="RML preferences reset.")

        stats = self.rml.get_stats()
        lines = ["RML Stats:"]
        lines.append(f"  Enabled: {stats['enabled']}")
        lines.append(f"  Sessions: {stats['total_sessions']} (success rate: {stats['success_rate']:.1%})")
        lines.append(f"  Active hints: {stats['active_hints']}")
        lines.append(f"  Active adjustments: {stats['active_adjustments']}")
        for h in stats.get("hints", []):
            lines.append(f"    Hint [{h['phase']}]: weight={h['weight']:.2f}, applied={h['times_applied']}x")
        for a in stats.get("adjustments", []):
            lines.append(f"    Adj  [{a['role']}]: temp_offset={a['temp_offset']:.3f}, max_tokens_offset={a['max_tokens_offset']}")
        return CommandResult(output="\n".join(lines))

    async def _cmd_hooks(self, args: list[str]) -> CommandResult:
        lines = ["Hook Stats:"]

        if self.fail_streak:
            stats = self.fail_streak.get_stats()
            lines.append(f"  Fail streak: {stats['consecutive_failures']} consecutive, {stats['total_failures']} total, {stats['total_successes']} successes")

        if self.session_end:
            stats = self.session_end.get_stats()
            lines.append(f"  Sessions: {stats['total_sessions']} total, {stats.get('success_rate', 0):.1%} success rate")

        return CommandResult(output="\n".join(lines))

    async def _cmd_health(self, args: list[str]) -> CommandResult:
        if not self.orchestrator:
            return CommandResult(output="Orchestrator not available.")

        readiness = await self.orchestrator.readiness()
        lines = ["System Health:"]
        lines.append(f"  OK: {readiness.get('ok', False)}")
        for check_name, check_result in readiness.get("checks", {}).items():
            status = "✓" if check_result.get("ok") else "✗"
            lines.append(f"  {status} {check_name}: {check_result.get('detail', '')}")
        return CommandResult(output="\n".join(lines))

    async def _cmd_clear(self, args: list[str]) -> CommandResult:
        if self.memory:
            self.memory.clear_session()
        return CommandResult(output="Conversation cleared.", should_clear=True)

    async def _cmd_quit(self, args: list[str]) -> CommandResult:
        return CommandResult(output="Goodbye!", should_exit=True)
