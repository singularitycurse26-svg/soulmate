"""FastAPI route definitions for the Fable-Mythos API."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from fable_mythos.api.schemas import (
    CompleteRequest,
    CompleteResponse,
    HealthResponse,
    SkillCreateRequest,
    SkillListResponse,
    SkillResponse,
    StreamRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# The orchestrator is set by main.py at startup
_orchestrator: Any = None
_skill_manager: Any = None


def set_orchestrator(orch: Any) -> None:
    """Set the orchestrator instance (called by main.py at startup)."""
    global _orchestrator
    _orchestrator = orch


def set_skill_manager(manager: Any) -> None:
    """Set the skill manager instance."""
    global _skill_manager
    _skill_manager = manager


def _ensure_orchestrator() -> Any:
    if _orchestrator is None:
        raise HTTPException(status_code=503, detail="Orchestrator not initialized")
    return _orchestrator


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    """Liveness probe — returns ok if the process is running."""
    return HealthResponse(ok=True)


@router.get("/readyz", response_model=HealthResponse)
async def readyz() -> HealthResponse:
    """Readiness probe — checks if all subsystems are ready."""
    orch = _ensure_orchestrator()
    checks = await orch.readiness()
    return HealthResponse(ok=checks.get("ok", False), checks=checks.get("checks", {}))


@router.post("/v1/complete", response_model=CompleteResponse)
async def complete(request: CompleteRequest) -> CompleteResponse:
    """Blocking completion — runs the full reasoning loop and returns the result."""
    orch = _ensure_orchestrator()
    try:
        state = await orch.complete(
            query=request.query,
            thread_id=request.thread_id,
            constraints=request.constraints,
        )
        return CompleteResponse(
            thread_id=state.thread_id,
            final_answer=state.final_answer,
            confidence_summary=state.confidence_summary,
            citations=state.citations,
            loops=state.loop_index,
            halt_reason=state.halt_reason,
            trajectory_id=state.trajectory_id,
            triage=state.triage,
        )
    except Exception as e:
        logger.exception("Complete endpoint error")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/v1/stream")
async def stream(request: StreamRequest) -> EventSourceResponse:
    """SSE streaming completion — streams reasoning phases and final answer."""
    orch = _ensure_orchestrator()

    async def event_generator():
        try:
            async for event_type, payload in orch.complete_stream(
                query=request.query,
                thread_id=request.thread_id,
                constraints=request.constraints,
            ):
                yield {"event": event_type, "data": json.dumps(payload, default=str)}
        except Exception as e:
            logger.exception("Stream endpoint error")
            yield {"event": "error", "data": json.dumps({"detail": str(e)})}

    return EventSourceResponse(event_generator())


@router.get("/v1/skills", response_model=SkillListResponse)
async def list_skills() -> SkillListResponse:
    """List all available skills."""
    if _skill_manager is None:
        return SkillListResponse(skills=[])
    skills = await _skill_manager.list_skills()
    return SkillListResponse(skills=skills)


@router.post("/v1/skills", response_model=SkillResponse)
async def create_skill(request: SkillCreateRequest) -> SkillResponse:
    """Create a new skill."""
    if _skill_manager is None:
        raise HTTPException(status_code=503, detail="Skill manager not initialized")
    try:
        result = await _skill_manager.create_skill(
            name=request.name,
            content=request.content,
            category=request.category,
        )
        return SkillResponse(
            status=result.get("status", "created"),
            skill_name=result.get("skill_name", request.name),
            path=result.get("path"),
        )
    except Exception as e:
        logger.exception("Create skill error")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/v1/models")
async def list_models() -> dict[str, Any]:
    """List available models from the provider."""
    orch = _ensure_orchestrator()
    models = await orch.bus.list_models()
    return {"models": models, "roles": orch.bus.models.as_dict()}
