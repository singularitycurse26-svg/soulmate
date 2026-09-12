"""MCP Server — exposes Aceline messaging as a standalone MCP server.

This module provides a standalone MCP server that can be run separately
or embedded in the main FastAPI server. It exposes the standard MCP
JSON-RPC interface plus messaging-specific tools.

External AI tools (Claude, GPT, etc.) can connect to this MCP server and
use Aceline's messaging capabilities without knowing the underlying APIs.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from inc_llm.messaging.uma import UniversalMessagingAdapter

logger = logging.getLogger(__name__)


class MCPServer:
    """Standalone MCP server for Aceline messaging.

    Can be embedded in the FastAPI server or run standalone.
    Exposes standard MCP JSON-RPC methods plus messaging tools.
    """

    def __init__(self, uma: UniversalMessagingAdapter | None = None) -> None:
        self.uma = uma
        self._running = False

    def set_uma(self, uma: UniversalMessagingAdapter) -> None:
        """Set the UMA instance."""
        self.uma = uma

    async def handle_request(self, request: dict) -> dict:
        """Handle a single MCP JSON-RPC request."""
        method = request.get("method", "")
        req_id = request.get("id")
        params = request.get("params", {})

        if method == "initialize":
            return {
                "jsonrpc": "2.0", "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {"name": "aceline-mcp-server", "version": "1.0.0"},
                    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                },
            }

        if method == "tools/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": self._get_tools()}}

        if method == "tools/call":
            return await self._handle_tool_call(req_id, params)

        if method == "resources/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": self._get_resources()}}

        if method == "resources/read":
            return await self._handle_resource_read(req_id, params)

        return {
            "jsonrpc": "2.0", "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }

    def _get_tools(self) -> list[dict]:
        return [
            {
                "name": "messaging_send",
                "description": "Send a message to any connected messaging app",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "app": {"type": "string"},
                        "recipient": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["recipient", "content"],
                },
            },
            {
                "name": "messaging_receive",
                "description": "Receive messages from any connected messaging app",
                "inputSchema": {"type": "object", "properties": {"app": {"type": "string"}}},
            },
            {
                "name": "messaging_apps",
                "description": "List connected messaging apps",
                "inputSchema": {"type": "object", "properties": {}},
            },
        ]

    def _get_resources(self) -> list[dict]:
        return [
            {"uri": "mcp://messaging/apps", "name": "Connected Apps", "description": "List connected apps"},
        ]

    async def _handle_tool_call(self, req_id: Any, params: dict) -> dict:
        if not self.uma:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": "UMA not initialized"}}

        tool = params.get("name", "")
        args = params.get("arguments", {})

        try:
            if tool == "messaging_send":
                result = await self.uma.send(args.get("app", "auto"), args.get("recipient", ""), args.get("content", ""))
            elif tool == "messaging_receive":
                result = await self.uma.receive(args.get("app", "all"))
            elif tool == "messaging_apps":
                result = {"apps": self.uma.list_apps()}
            else:
                return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": f"Unknown tool: {tool}"}}

            return {
                "jsonrpc": "2.0", "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps(result, default=str)}]},
            }
        except Exception as e:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": str(e)}}

    async def _handle_resource_read(self, req_id: Any, params: dict) -> dict:
        uri = params.get("uri", "")
        if uri == "mcp://messaging/apps" and self.uma:
            return {
                "jsonrpc": "2.0", "id": req_id,
                "result": {"contents": [{"uri": uri, "text": json.dumps(self.uma.list_apps())}]},
            }
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": f"Unknown resource: {uri}"}}
