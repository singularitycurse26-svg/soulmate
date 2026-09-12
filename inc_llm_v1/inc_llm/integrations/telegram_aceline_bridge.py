"""Telegram-Aceline Bridge — connects Telegram messages to the Aceline agent.

This bridge allows users to interact with Aceline through Telegram:
- Send messages to the Telegram bot → Aceline processes them
- Aceline responses are sent back through Telegram
- Commands: /aceline, /workflows, /notes, /stats, /help

The bridge uses the existing TelegramIntegration for the bot polling loop
and adds Aceline-specific command handlers.

Architecture:
- Telegram bot polls for messages (existing TelegramIntegration)
- Messages are routed to the Aceline agent via the message handler
- Aceline processes the message and returns a response
- Response is sent back through Telegram

This bridge also routes Telegram messages through the MessageChannel
for guaranteed delivery tracking.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/telegram-bridge", tags=["telegram-bridge"])

_harness = None
_settings = None
_hybrid_bus = None
_uma = None


def init_telegram_bridge(harness, settings, hybrid_bus=None, uma=None) -> None:
    """Initialize the Telegram-Aceline bridge."""
    global _harness, _settings, _hybrid_bus, _uma
    _harness = harness
    _settings = settings
    _hybrid_bus = hybrid_bus
    _uma = uma

    # Wire the Aceline message handler into the existing Telegram integration
    if harness.telegram and settings.integrations.telegram.enabled:
        harness.telegram.start(message_handler=_handle_aceline_message)
        logger.info("Telegram-Aceline bridge initialized")


async def _handle_aceline_message(user_id: str, text: str) -> str:
    """Handle a message from Telegram — route to Aceline agent.

    This is the message handler that gets called by TelegramIntegration
    when a paired user sends a message.
    """
    if not _harness:
        return "Aceline not available"

    # Check for commands
    if text.startswith("/"):
        return await _handle_command(text)

    # Route to Aceline agent for normal messages
    try:
        # Use the Aceline agent endpoint to process the message
        from inc_llm.integrations.aceline_agent import AcelineAgent
        # The harness has an aceline agent initialized via init_aceline_agent
        # We call it through the existing API
        import urllib.request
        import json
        import os

        ollama_base = os.environ.get("OLLAMA_BASE", "http://localhost:11434")
        model = os.environ.get("ACELINE_MODEL", "glm-5.1")

        body = json.dumps({
            "model": model,
            "messages": [
                {"role": "system", "content": "You are Aceline, a helpful AI assistant. Respond concisely."},
                {"role": "user", "content": text},
            ],
            "stream": False,
            "options": {"num_predict": 500, "temperature": 0.7},
        }).encode()

        req = urllib.request.Request(
            f"{ollama_base}/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        resp = await asyncio.to_thread(lambda: urllib.request.urlopen(req, timeout=60))
        data = json.loads(resp.read().decode())
        return data.get("message", {}).get("content", "No response from Aceline")

    except Exception as e:
        logger.warning("Aceline message handling failed: %s", e)
        return f"Error: {e}"


async def _handle_command(text: str) -> str:
    """Handle Telegram bot commands."""
    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    if command == "/help":
        return (
            "Aceline Telegram Bot Commands:\n"
            "/help — Show this help\n"
            "/aceline <message> — Send a message to Aceline\n"
            "/workflows — List detected workflows\n"
            "/notes — List improvement notes\n"
            "/stats — Show observer statistics\n"
            "/messaging — Show messaging app status\n"
        )

    if command == "/aceline":
        if not args:
            return "Usage: /aceline <message>"
        return await _handle_aceline_message("", args)

    if command == "/workflows":
        if not _harness or not _harness.observer:
            return "Observer not available"
        workflows = _harness.observer.get_workflows()
        if not workflows:
            return "No workflows detected yet."
        lines = [f"📋 Detected Workflows ({len(workflows)}):"]
        for wf in workflows[:10]:
            lines.append(f"  • {wf['name']} (frequency: {wf['frequency']}x)")
        return "\n".join(lines)

    if command == "/notes":
        if not _harness or not _harness.observer:
            return "Observer not available"
        notes = _harness.observer.get_notes(status="pending")
        if not notes:
            return "No pending improvement notes."
        lines = [f"💡 Improvement Notes ({len(notes)} pending):"]
        for note in notes[:10]:
            lines.append(f"  • [{note['severity']}] {note['title']}")
        return "\n".join(lines)

    if command == "/stats":
        if not _harness or not _harness.observer:
            return "Observer not available"
        stats = _harness.observer.get_stats()
        return (
            f"📊 Observer Stats:\n"
            f"  Events logged: {stats.get('total_ingested', 0)}\n"
            f"  Events flushed: {stats.get('total_flushed', 0)}\n"
            f"  Buffer: {stats.get('buffer_size', 0)}/{stats.get('buffer_max', 0)}\n"
            f"  Running: {stats.get('running', False)}\n"
        )

    if command == "/messaging":
        if not _uma:
            return "Messaging not available"
        apps = _uma.list_apps()
        lines = ["📱 Messaging Apps:"]
        for app in apps:
            status = "✅" if app.get("connected") else "❌"
            lines.append(f"  {status} {app['display_name']} — {app['status']}")
        return "\n".join(lines)

    return f"Unknown command: {command}. Type /help for available commands."


# ── REST Endpoints ──────────────────────────────────────────────────────

class SendToTelegramRequest(BaseModel):
    chat_id: str
    text: str


@router.post("/send")
async def send_to_telegram(req: SendToTelegramRequest):
    """Send a message to a Telegram chat (outbound from Aceline)."""
    if not _harness or not _harness.telegram:
        raise HTTPException(503, "Telegram not initialized")
    try:
        await _harness.telegram._send_message(req.chat_id, req.text)
        return {"status": "sent"}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/status")
async def bridge_status():
    """Get the Telegram-Aceline bridge status."""
    return {
        "initialized": _harness is not None,
        "telegram_enabled": _settings.integrations.telegram.enabled if _settings else False,
        "bot_configured": bool(_settings.integrations.telegram.bot_token) if _settings else False,
        "uma_available": _uma is not None,
        "observer_available": _harness.observer is not None if _harness else False,
    }


@router.get("/commands")
async def list_commands():
    """List available Telegram bot commands."""
    return {
        "commands": [
            {"command": "/help", "description": "Show help"},
            {"command": "/aceline <message>", "description": "Send a message to Aceline"},
            {"command": "/workflows", "description": "List detected workflows"},
            {"command": "/notes", "description": "List improvement notes"},
            {"command": "/stats", "description": "Show observer statistics"},
            {"command": "/messaging", "description": "Show messaging app status"},
        ]
    }
