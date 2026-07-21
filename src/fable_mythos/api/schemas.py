"""Request and response schemas for the Fable-Mythos API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CompleteRequest(BaseModel):
    """Request for /v1/complete (blocking completion)."""

    query: str = Field(..., description="The user's question or task")
    thread_id: str = Field(default="default", description="Session thread ID for memory continuity")
    constraints: dict[str, Any] = Field(default_factory=dict, description="Optional constraints (depth, risk, budget, domain)")


class CompleteResponse(BaseModel):
    """Response from /v1/complete."""

    thread_id: str
    final_answer: str
    confidence_summary: dict[str, float] = Field(default_factory=dict)
    citations: list[str] = Field(default_factory=list)
    loops: int = 0
    halt_reason: str = ""
    trajectory_id: str | None = None
    triage: dict[str, Any] = Field(default_factory=dict)


class StreamRequest(BaseModel):
    """Request for /v1/stream (SSE streaming completion)."""

    query: str = Field(..., description="The user's question or task")
    thread_id: str = Field(default="default", description="Session thread ID")
    constraints: dict[str, Any] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    """Health check response."""

    ok: bool
    checks: dict[str, dict[str, Any]] = Field(default_factory=dict)


class SkillListResponse(BaseModel):
    """List of available skills."""

    skills: list[dict[str, Any]] = Field(default_factory=list)


class SkillCreateRequest(BaseModel):
    """Create a new skill."""

    name: str = Field(..., description="Skill name (kebab-case)")
    description: str = Field(default="", description="Short description for progressive disclosure")
    content: str = Field(..., description="Full SKILL.md content")
    category: str = Field(default="general", description="Skill category")


class SkillResponse(BaseModel):
    """Skill operation response."""

    status: str
    skill_name: str
    path: str | None = None
