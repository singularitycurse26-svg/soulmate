"""Messaging API — REST endpoints for the messaging frontend.

Exposes UMA (Universal Messaging Adapter) through REST endpoints
that the frontend MessagingPage can call.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/messaging", tags=["messaging"])

_uma = None
_hybrid_bus = None


def init_messaging_api(uma=None, hybrid_bus=None) -> None:
    """Initialize the messaging API with UMA and hybrid bus."""
    global _uma, _hybrid_bus
    _uma = uma
    _hybrid_bus = hybrid_bus


# ── Request Models ──────────────────────────────────────────────────────

class SendMessageRequest(BaseModel):
    app: str = "auto"
    recipient: str
    content: str
    conversation_id: str = ""


class ConnectAppRequest(BaseModel):
    app: str
    credentials: dict = {}


class ReceiveRequest(BaseModel):
    app: str = "all"
    conversation_id: str = ""
    limit: int = 50


# ── Endpoints ───────────────────────────────────────────────────────────

@router.get("/apps")
async def list_apps():
    """List all messaging apps and their status."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return {"apps": _uma.list_apps()}


@router.post("/connect")
async def connect_app(req: ConnectAppRequest):
    """Connect to a messaging app."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return await _uma.connect(req.app, req.credentials)


@router.post("/disconnect")
async def disconnect_app(req: ConnectAppRequest):
    """Disconnect from a messaging app."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return await _uma.disconnect(req.app)


@router.post("/send")
async def send_message(req: SendMessageRequest):
    """Send a message to a recipient on any messaging app."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return await _uma.send(req.app, req.recipient, req.content, req.conversation_id)


@router.post("/receive")
async def receive_messages(req: ReceiveRequest):
    """Receive messages from one or all apps."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return await _uma.receive(req.app, req.conversation_id, req.limit)


@router.get("/chats")
async def list_chats(app: str = "all"):
    """List active chats from one or all apps."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    return await _uma.list_chats(app)


@router.get("/stats")
async def get_stats():
    """Get messaging statistics."""
    if not _uma:
        raise HTTPException(503, "UMA not initialized")
    stats = _uma.get_stats()
    if _hybrid_bus:
        stats["hybrid_bus"] = _hybrid_bus.get_stats()
    return stats
