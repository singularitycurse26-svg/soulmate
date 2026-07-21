"""FastAPI application entrypoint.

Creates the app, wires up middleware, routes, and the orchestrator.
Run with: uvicorn fable_mythos.main:app --reload
Or: fable-mythos-server
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from fable_mythos.api.middleware import AccessLogMiddleware, RequestIDMiddleware, RateLimitMiddleware
from fable_mythos.api.routes import router, set_orchestrator, set_skill_manager
from fable_mythos.config import Settings, load_settings

logger = logging.getLogger(__name__)

# Global orchestrator — initialized at startup
_orchestrator: Any = None
_settings: Settings | None = None


def get_settings() -> Settings:
    """Get the global settings instance."""
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def get_orchestrator() -> Any:
    """Get the global orchestrator instance."""
    return _orchestrator


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — startup and shutdown."""
    settings = get_settings()
    settings.ensure_directories()

    logging.basicConfig(
        level=getattr(logging, settings.server.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    logger.info("Starting Fable-Mythos (tier=%s, provider=%s)", settings.hardware_tier.value, settings.provider_backend.value)

    # Create the model bus
    from fable_mythos.providers.bus import create_bus

    bus = create_bus(settings)

    # Health check the provider
    health = await bus.healthcheck()
    if health.get("ok"):
        logger.info("Provider healthy: %s", health.get("detail"))
    else:
        logger.warning("Provider not ready: %s", health.get("detail"))

    # Create the orchestrator (Phase 3 — for now, a placeholder that will be replaced)
    from fable_mythos.core.orchestrator import Orchestrator

    global _orchestrator
    _orchestrator = Orchestrator(settings=settings, bus=bus)
    set_orchestrator(_orchestrator)

    # Create memory manager, skill manager, RML, profiles, hooks for console
    from fable_mythos.memory.manager import MemoryManager
    from fable_mythos.memory.profiles import ProfileManager
    from fable_mythos.memory.soul import SoulLoader
    from fable_mythos.memory.durable_facts import DurableFactsLoader
    from fable_mythos.skills.skill_manager import SkillManager
    from fable_mythos.rml.engine import RMLEngine
    from fable_mythos.hooks.session_end import SessionEndHook
    from fable_mythos.hooks.fail_streak import FailStreakHook

    memory = MemoryManager(settings=settings, bus=bus)
    skill_manager = SkillManager(memory)
    rml = RMLEngine(settings.rml)
    profiles = ProfileManager(
        profiles_dir=settings.memory.resolve_path(settings.memory.profiles_dir),
        active_profile=settings.memory.active_profile,
    )
    session_end_hook = SessionEndHook()
    fail_streak_hook = FailStreakHook()

    # Load SOUL and MEMORY into working memory
    soul = SoulLoader(settings.memory.resolve_path(settings.memory.soul_path))
    facts = DurableFactsLoader(settings.memory.resolve_path(settings.memory.memory_path))
    memory.load_soul(soul.load())
    memory.load_memory(facts.load())

    set_skill_manager(skill_manager)

    # Console routes
    from fable_mythos.api.console_routes import create_console_router
    console_router = create_console_router(
        memory_manager=memory,
        skill_manager=skill_manager,
        rml_engine=rml,
        profile_manager=profiles,
        session_end_hook=session_end_hook,
        fail_streak_hook=fail_streak_hook,
    )
    app.include_router(console_router)

    logger.info("Fable-Mythos ready on %s:%d", settings.server.host, settings.server.port)

    yield

    # Shutdown
    logger.info("Shutting down Fable-Mythos")
    if hasattr(bus, "close"):
        await bus.close()


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the FastAPI application.

    Args:
        settings: Optional settings override. If None, loads from config.

    Returns:
        Configured FastAPI app.
    """
    global _settings
    if settings is not None:
        _settings = settings

    s = get_settings()

    app = FastAPI(
        title="Fable-Mythos",
        description="Unified local-first AI agent harness — Fable 5 + Mythos 5 + Hermes",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Middleware (order matters — outermost first)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.server.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(AccessLogMiddleware)

    if s.server.rate_limit_enabled:
        app.add_middleware(
            RateLimitMiddleware,
            max_requests=s.server.rate_limit_requests,
            window_s=s.server.rate_limit_window_s,
        )

    # Routes
    app.include_router(router)

    # Static files for web console (if directory exists)
    from pathlib import Path

    web_dir = Path(__file__).parent / "web" / "static"
    if web_dir.exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/app", StaticFiles(directory=str(web_dir), html=True), name="web")

    return app


# Module-level app instance for uvicorn
app = create_app()


def run_server() -> None:
    """Run the server with uvicorn."""
    import uvicorn

    s = get_settings()
    uvicorn.run(
        "fable_mythos.main:app",
        host=s.server.host,
        port=s.server.port,
        log_level=s.server.log_level.lower(),
        reload=False,
    )


if __name__ == "__main__":
    run_server()
