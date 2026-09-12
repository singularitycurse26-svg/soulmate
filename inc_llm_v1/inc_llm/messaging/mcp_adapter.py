"""MCP Adapter — exposes Aceline messaging through standard MCP JSON-RPC.

Implements the Model Context Protocol (MCP) interface so any MCP-compatible
AI tool can interact with Aceline's messaging system without knowing the
underlying transport or app-specific APIs.

Standard MCP methods:
- tools/list — list available tools
- tools/call — invoke a tool
- resources/list — list available resources
- resources/read — read a resource
- prompts/list — list available prompts
- prompts/get — get a specific prompt

Messaging-specific tools:
- messaging_send — send a message to any app
- messaging_receive — receive messages from any app
- messaging_chats — list active conversations
- messaging_apps — list connected messaging apps
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/mcp", tags=["mcp"])

_hybrid_bus = None
_uma = None  # Universal Messaging Adapter (set in Phase 5)


def init_mcp_adapter(hybrid_bus=None, uma=None) -> None:
    """Initialize the MCP adapter with the hybrid bus and UMA."""
    global _hybrid_bus, _uma
    _hybrid_bus = hybrid_bus
    _uma = uma


# ── MCP Tool Definitions ────────────────────────────────────────────────

MCP_TOOLS = [
    {
        "name": "messaging_send",
        "description": "Send a message to a recipient on any connected messaging app (Telegram, WhatsApp, WeChat, Signal). The adapter routes to the correct app automatically.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "app": {"type": "string", "description": "Messaging app: telegram, whatsapp, wechat, signal, or auto (pick best available)"},
                "recipient": {"type": "string", "description": "Phone number, username, or chat ID"},
                "content": {"type": "string", "description": "Message content"},
                "conversation_id": {"type": "string", "description": "Optional conversation ID for threading"},
            },
            "required": ["recipient", "content"],
        },
    },
    {
        "name": "messaging_receive",
        "description": "Receive messages from a connected messaging app. Returns unread messages.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "app": {"type": "string", "description": "Messaging app: telegram, whatsapp, wechat, signal, or all"},
                "conversation_id": {"type": "string", "description": "Optional conversation ID filter"},
                "limit": {"type": "integer", "description": "Max messages to return", "default": 50},
            },
        },
    },
    {
        "name": "messaging_chats",
        "description": "List active conversations across all connected messaging apps.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "app": {"type": "string", "description": "Filter by app: telegram, whatsapp, wechat, signal, or all"},
            },
        },
    },
    {
        "name": "messaging_apps",
        "description": "List all connected messaging apps and their status.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "messaging_connect",
        "description": "Connect to a messaging app (may require QR code or phone pairing).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "app": {"type": "string", "description": "App to connect: telegram, whatsapp, wechat, signal"},
                "credentials": {"type": "object", "description": "App-specific credentials (bot_token, phone, etc.)"},
            },
            "required": ["app"],
        },
    },
    {
        "name": "messaging_disconnect",
        "description": "Disconnect from a messaging app.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "app": {"type": "string", "description": "App to disconnect"},
            },
            "required": ["app"],
        },
    },
    {
        "name": "observer_stats",
        "description": "Get Aceline Smart Work Watcher statistics — activity events, workflows, improvement notes.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "observer_workflows",
        "description": "List detected workflows from the Aceline observer.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "observer_notes",
        "description": "List improvement notes from the Aceline observer.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filter by status: pending, approved, rejected, implemented"},
            },
        },
    },
]

MCP_RESOURCES = [
    {"uri": "mcp://messaging/apps", "name": "Connected Apps", "description": "List of connected messaging apps"},
    {"uri": "mcp://messaging/chats", "name": "Active Chats", "description": "Active conversations across all apps"},
    {"uri": "mcp://observer/stats", "name": "Observer Stats", "description": "Aceline observer statistics"},
    {"uri": "mcp://observer/workflows", "name": "Workflows", "description": "Detected workflows"},
    {"uri": "mcp://observer/notes", "name": "Improvement Notes", "description": "Improvement notes"},
]

MCP_PROMPTS = [
    {
        "name": "summarize_conversation",
        "description": "Summarize a conversation from any messaging app",
        "arguments": [
            {"name": "conversation_id", "description": "Conversation to summarize", "required": True},
        ],
    },
    {
        "name": "draft_reply",
        "description": "Draft a reply to a message",
        "arguments": [
            {"name": "message_id", "description": "Message to reply to", "required": True},
            {"name": "tone", "description": "Tone: formal, casual, urgent", "required": False},
        ],
    },
]


# ── MCP JSON-RPC Endpoint ───────────────────────────────────────────────

@router.post("")
@router.post("/")
async def mcp_handle(request: Request) -> JSONResponse:
    """Handle MCP JSON-RPC requests."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}}, status_code=400)

    # Handle batch requests
    if isinstance(body, list):
        results = [await _handle_single(req) for req in body]
        return JSONResponse(results)

    return JSONResponse(await _handle_single(body))


async def _handle_single(req: dict) -> dict:
    """Handle a single MCP JSON-RPC request."""
    method = req.get("method", "")
    req_id = req.get("id")
    params = req.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "aceline-mcp", "version": "1.0.0"},
                "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
            },
        }

    if method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": MCP_TOOLS}}

    if method == "tools/call":
        return await _handle_tool_call(req_id, params)

    if method == "resources/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": MCP_RESOURCES}}

    if method == "resources/read":
        return await _handle_resource_read(req_id, params)

    if method == "prompts/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"prompts": MCP_PROMPTS}}

    if method == "prompts/get":
        return await _handle_prompt_get(req_id, params)

    return {
        "jsonrpc": "2.0", "id": req_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


async def _handle_tool_call(req_id: Any, params: dict) -> dict:
    """Handle tools/call — invoke a tool."""
    tool_name = params.get("name", "")
    arguments = params.get("arguments", {})

    try:
        if tool_name == "messaging_send":
            result = await _tool_messaging_send(arguments)
        elif tool_name == "messaging_receive":
            result = await _tool_messaging_receive(arguments)
        elif tool_name == "messaging_chats":
            result = await _tool_messaging_chats(arguments)
        elif tool_name == "messaging_apps":
            result = await _tool_messaging_apps(arguments)
        elif tool_name == "messaging_connect":
            result = await _tool_messaging_connect(arguments)
        elif tool_name == "messaging_disconnect":
            result = await _tool_messaging_disconnect(arguments)
        elif tool_name == "observer_stats":
            result = await _tool_observer_stats()
        elif tool_name == "observer_workflows":
            result = await _tool_observer_workflows()
        elif tool_name == "observer_notes":
            result = await _tool_observer_notes(arguments)
        else:
            return {
                "jsonrpc": "2.0", "id": req_id,
                "error": {"code": -32602, "message": f"Unknown tool: {tool_name}"},
            }

        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {"content": [{"type": "text", "text": json.dumps(result, default=str)}]},
        }
    except Exception as e:
        logger.warning("MCP tool call failed (%s): %s", tool_name, e)
        return {
            "jsonrpc": "2.0", "id": req_id,
            "error": {"code": -32603, "message": str(e)},
        }


async def _handle_resource_read(req_id: Any, params: dict) -> dict:
    """Handle resources/read."""
    uri = params.get("uri", "")
    if uri == "mcp://messaging/apps":
        result = await _tool_messaging_apps({})
    elif uri == "mcp://messaging/chats":
        result = await _tool_messaging_chats({})
    elif uri == "mcp://observer/stats":
        result = await _tool_observer_stats()
    elif uri == "mcp://observer/workflows":
        result = await _tool_observer_workflows()
    elif uri == "mcp://observer/notes":
        result = await _tool_observer_notes({})
    else:
        return {
            "jsonrpc": "2.0", "id": req_id,
            "error": {"code": -32602, "message": f"Unknown resource: {uri}"},
        }

    return {
        "jsonrpc": "2.0", "id": req_id,
        "result": {"contents": [{"uri": uri, "text": json.dumps(result, default=str)}]},
    }


async def _handle_prompt_get(req_id: Any, params: dict) -> dict:
    """Handle prompts/get."""
    name = params.get("name", "")
    args = params.get("arguments", {})

    if name == "summarize_conversation":
        conv_id = args.get("conversation_id", "")
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "messages": [
                    {"role": "user", "content": f"Summarize the conversation {conv_id}. Key points, decisions, and action items."},
                ],
            },
        }

    if name == "draft_reply":
        msg_id = args.get("message_id", "")
        tone = args.get("tone", "professional")
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "messages": [
                    {"role": "user", "content": f"Draft a {tone} reply to message {msg_id}."},
                ],
            },
        }

    return {
        "jsonrpc": "2.0", "id": req_id,
        "error": {"code": -32602, "message": f"Unknown prompt: {name}"},
    }


# ── Tool Implementations ───────────────────────────────────────────────

async def _tool_messaging_send(args: dict) -> dict:
    """Send a message via UMA (Universal Messaging Adapter)."""
    if not _uma:
        return {"error": "UMA not initialized"}
    app = args.get("app", "auto")
    recipient = args.get("recipient", "")
    content = args.get("content", "")
    conv_id = args.get("conversation_id", "")
    return await _uma.send(app, recipient, content, conv_id)


async def _tool_messaging_receive(args: dict) -> dict:
    """Receive messages via UMA."""
    if not _uma:
        return {"error": "UMA not initialized"}
    app = args.get("app", "all")
    conv_id = args.get("conversation_id")
    limit = args.get("limit", 50)
    return await _uma.receive(app, conv_id, limit)


async def _tool_messaging_chats(args: dict) -> dict:
    """List active chats via UMA."""
    if not _uma:
        return {"error": "UMA not initialized"}
    app = args.get("app", "all")
    return await _uma.list_chats(app)


async def _tool_messaging_apps(args: dict) -> dict:
    """List connected apps via UMA."""
    if not _uma:
        return {"error": "UMA not initialized", "apps": []}
    return {"apps": _uma.list_apps()}


async def _tool_messaging_connect(args: dict) -> dict:
    """Connect to a messaging app via UMA."""
    if not _uma:
        return {"error": "UMA not initialized"}
    app = args.get("app", "")
    credentials = args.get("credentials", {})
    return await _uma.connect(app, credentials)


async def _tool_messaging_disconnect(args: dict) -> dict:
    """Disconnect from a messaging app via UMA."""
    if not _uma:
        return {"error": "UMA not initialized"}
    app = args.get("app", "")
    return await _uma.disconnect(app)


async def _tool_observer_stats() -> dict:
    """Get observer stats."""
    if not _hybrid_bus or not _hybrid_bus.log_channel:
        return {"error": "Observer not initialized"}
    return _hybrid_bus.log_channel.get_stats()


async def _tool_observer_workflows() -> dict:
    """Get observer workflows."""
    # This will be wired to the observer in Phase 5
    return {"workflows": []}


async def _tool_observer_notes(args: dict) -> dict:
    """Get observer improvement notes."""
    # This will be wired to the observer in Phase 5
    return {"notes": []}
