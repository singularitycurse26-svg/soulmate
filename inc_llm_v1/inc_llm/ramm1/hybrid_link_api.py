"""Hybrid Link API — FastAPI router for the Hybrid API for Universal Recursive Link.

Endpoints:
- POST /v1/ramm1/link/discover — probe candidate endpoints, return detected protocols
- POST /v1/ramm1/link/connect — request a link to a remote LLM (sends consent request)
- POST /v1/ramm1/link/approve — approve a pending incoming link request
- POST /v1/ramm1/link/reject — reject a pending link
- POST /v1/ramm1/link/remove — remove a link
- GET  /v1/ramm1/link/list — list all links with protocol + version + status
- POST /v1/ramm1/link/propagate — trigger propagation (encourage linked LLMs to find new LLMs)
- POST /v1/ramm1/link/learning/send — send an RLT token to a linked LLM
- POST /v1/ramm1/link/learning/receive — receive an RLT token from a linked LLM
- GET  /v1/ramm1/link/agent/{protocol} — get the Link Agent payload for a protocol
- GET  /v1/ramm1/link/status — hybrid link system status
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from inc_llm.ramm1.hybrid_link import HybridLinkAPI
from inc_llm.ramm1.link_agent import LinkAgentGenerator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/ramm1/link", tags=["ramm1-hybrid-link"])

_hybrid_link: HybridLinkAPI | None = None


def init_hybrid_link_api(hybrid_link: HybridLinkAPI) -> None:
    """Initialize the hybrid link API with a HybridLinkAPI instance."""
    global _hybrid_link
    _hybrid_link = hybrid_link


def _get_api() -> HybridLinkAPI:
    if _hybrid_link is None:
        raise RuntimeError("Hybrid Link API not initialized — call init_hybrid_link_api() first")
    return _hybrid_link


class DiscoverRequest(BaseModel):
    endpoints: list[str] = []


class ConnectRequest(BaseModel):
    endpoint: str
    auth: str = ""


class LinkIdRequest(BaseModel):
    link_id: str


class LearningSendRequest(BaseModel):
    link_id: str
    rlt_token: str
    content: str = ""


class LearningReceiveRequest(BaseModel):
    link_id: str
    rlt_token: str
    content: str = ""


@router.post("/discover")
async def discover(req: DiscoverRequest) -> dict[str, Any]:
    """Probe candidate endpoints, return detected protocols."""
    api = _get_api()
    results = api.discover(req.endpoints)
    return {"count": len(results), "results": results}


@router.post("/connect")
async def connect(req: ConnectRequest) -> dict[str, Any]:
    """Request a link to a remote LLM (sends consent request)."""
    api = _get_api()
    return api.request_link(req.endpoint, req.auth)


@router.post("/approve")
async def approve(req: LinkIdRequest) -> dict[str, Any]:
    """Approve a pending incoming link request."""
    return _get_api().approve_link(req.link_id)


@router.post("/reject")
async def reject(req: LinkIdRequest) -> dict[str, Any]:
    """Reject a pending link."""
    return _get_api().reject_link(req.link_id)


@router.post("/remove")
async def remove(req: LinkIdRequest) -> dict[str, Any]:
    """Remove a link."""
    return _get_api().remove_link(req.link_id)


@router.get("/list")
async def list_links() -> dict[str, Any]:
    """List all links (Ramm1 peers + hybrid LLM links) with protocol + version + status."""
    links = _get_api().list_links()
    return {"count": len(links), "links": links}


@router.post("/propagate")
async def propagate() -> dict[str, Any]:
    """Trigger propagation (encourage linked LLMs to find new LLMs)."""
    return await _get_api().propagate()


@router.post("/learning/send")
async def send_learning(req: LearningSendRequest) -> dict[str, Any]:
    """Send an RLT token to a linked LLM."""
    return _get_api().share_learning(req.link_id, req.rlt_token, req.content)


@router.post("/learning/receive")
async def receive_learning(req: LearningReceiveRequest) -> dict[str, Any]:
    """Receive an RLT token from a linked LLM."""
    return _get_api().receive_learning(req.link_id, req.rlt_token, req.content)


@router.get("/agent/{protocol}")
async def get_link_agent(protocol: str) -> dict[str, Any]:
    """Get the Link Agent payload for a protocol (so operators can copy-paste it)."""
    api = _get_api()
    gen = LinkAgentGenerator()
    agent = gen.for_protocol(protocol, api.discovery_endpoints)
    return {"protocol": protocol, "agent": agent}


@router.get("/status")
async def status() -> dict[str, Any]:
    """Get the hybrid link system status."""
    return _get_api().get_status()
