"""Interactive REPL terminal — chat with the Fable-Mythos agent.

Uses prompt_toolkit for line editing and Rich for formatted output.
Falls back to simple input() if prompt_toolkit is not installed.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any

from fable_mythos.cli.slash_commands import SlashCommandHandler
from fable_mythos.config import Settings, load_settings
from fable_mythos.core.orchestrator import Orchestrator
from fable_mythos.hooks.fail_streak import FailStreakHook
from fable_mythos.hooks.session_end import SessionEndHook
from fable_mythos.hooks.session_start import SessionStartHook
from fable_mythos.memory.durable_facts import DurableFactsLoader
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.soul import SoulLoader
from fable_mythos.memory.profiles import ProfileManager
from fable_mythos.providers.bus import create_bus
from fable_mythos.rml.engine import RMLEngine
from fable_mythos.skills.skill_factory import SkillFactory
from fable_mythos.skills.skill_manager import SkillManager

logger = logging.getLogger(__name__)


class TerminalUI:
    """Interactive terminal UI for the Fable-Mythos agent.

    Provides a chat interface with slash commands, streaming responses,
    and rich formatting.
    """

    BANNER = """
╔══════════════════════════════════════════════════════════╗
║          Fable-Mythos Agent Harness v0.1.0               ║
║          100% Local • 3-Layer Memory • RML               ║
╚══════════════════════════════════════════════════════════╝

Type /help for commands, or just start chatting.
"""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()
        self._setup_components()
        self._running = False

    def _setup_components(self) -> None:
        """Initialize all components."""
        # Model bus
        self.bus = create_bus(self.settings)

        # Orchestrator
        self.orchestrator = Orchestrator(settings=self.settings, bus=self.bus)

        # Memory
        self.memory = MemoryManager(settings=self.settings, bus=self.bus)

        # Skills
        self.skill_manager = SkillManager(self.memory)
        self.skill_factory = SkillFactory(self.bus, self.memory, self.skill_manager)

        # RML
        self.rml = RMLEngine(self.settings.rml)

        # Profiles
        self.profiles = ProfileManager(
            profiles_dir=self.settings.memory.resolve_path(self.settings.memory.profiles_dir),
            active_profile=self.settings.memory.active_profile,
        )

        # Loaders
        self.soul_loader = SoulLoader(self.settings.memory.resolve_path(self.settings.memory.soul_path))
        self.facts_loader = DurableFactsLoader(self.settings.memory.resolve_path(self.settings.memory.memory_path))

        # Hooks
        self.session_start_hook = SessionStartHook()
        self.session_end_hook = SessionEndHook()
        self.fail_streak_hook = FailStreakHook()

        # Load SOUL and MEMORY into working memory
        self.memory.load_soul(self.soul_loader.load())
        self.memory.load_memory(self.facts_loader.load())

        # Slash command handler
        self.commands = SlashCommandHandler(
            orchestrator=self.orchestrator,
            memory_manager=self.memory,
            skill_manager=self.skill_manager,
            skill_factory=self.skill_factory,
            rml_engine=self.rml,
            profile_manager=self.profiles,
            soul_loader=self.soul_loader,
            facts_loader=self.facts_loader,
            session_start_hook=self.session_start_hook,
            session_end_hook=self.session_end_hook,
            fail_streak_hook=self.fail_streak_hook,
        )

    async def run(self) -> None:
        """Run the interactive REPL."""
        self._running = True

        # Print banner
        self._print(self.BANNER)

        # Session start hook
        session_ctx = self.session_start_hook.execute(session_model=self.settings.models.base)
        self._print(f"[dim]Profile: {session_ctx.profile.value} | Routing: {session_ctx.routing.value}[/dim]\n")

        # Try to use prompt_toolkit, fall back to input()
        try:
            from prompt_toolkit import PromptSession
            from prompt_toolkit.history import InMemoryHistory

            session = PromptSession(history=InMemoryHistory())
            prompt_func = lambda: asyncio.to_thread(session.prompt, "you> ")
        except ImportError:
            prompt_func = lambda: asyncio.to_thread(input, "you> ")

        while self._running:
            try:
                user_input = await prompt_func()
                if not user_input.strip():
                    continue

                if user_input.startswith("/"):
                    result = await self.commands.handle(user_input)
                    self._print(result.output)
                    if result.should_exit:
                        self._running = False
                        break
                    if result.should_clear:
                        self.memory.clear_session()
                    continue

                # Regular chat — stream the response
                await self._handle_chat(user_input)

            except (KeyboardInterrupt, EOFError):
                self._print("\n[dim]Goodbye![/dim]")
                break
            except Exception as e:
                logger.error("REPL error: %s", e)
                self._print(f"[red]Error: {e}[/red]")

        # Session end
        self.session_end_hook.execute(self._build_session_summary())

    async def _handle_chat(self, user_input: str) -> None:
        """Handle a regular chat message with streaming."""
        self._print("[dim]assistant>[/dim] ", end="")

        try:
            async for event_type, payload in self.orchestrator.complete_stream(
                query=user_input,
                thread_id="terminal",
            ):
                if event_type == "status":
                    stage = payload.get("stage", "")
                    if stage:
                        self._print(f"[dim]({stage})[/dim] ", end="")
                elif event_type == "chunk":
                    self._print(payload.get("text", ""), end="")
                elif event_type == "final":
                    self._print()  # newline
                    confidence = payload.get("confidence", 0)
                    if confidence:
                        self._print(f"[dim](confidence: {confidence:.0%})[/dim]")
        except Exception as e:
            self._print(f"\n[red]Error: {e}[/red]")

        self._print()  # blank line

    def _build_session_summary(self):
        """Build a session summary for the SessionEnd hook."""
        from fable_mythos.hooks.session_end import SessionSummary
        import time

        return SessionSummary(
            session_id="terminal",
            start_time=time.time() - 60,  # approximate
            end_time=time.time(),
            success=True,
        )

    def _print(self, text: str = "", end: str = "\n") -> None:
        """Print text, using Rich if available, plain text otherwise."""
        try:
            from rich.console import Console
            from rich.panel import Panel

            console = Console()
            if end == "\n":
                console.print(text)
            else:
                console.print(text, end=end)
        except ImportError:
            # Strip Rich markup for plain output
            import re
            clean = re.sub(r"\[/?\w+\]", "", text)
            print(clean, end=end)
            if end == "\n":
                print()  # ensure newline


def main() -> None:
    """Entry point for the fable-mythos CLI."""
    settings = load_settings()
    ui = TerminalUI(settings=settings)
    asyncio.run(ui.run())


if __name__ == "__main__":
    main()
