"""Ramm1 API — FastAPI router for all Ramm1 endpoints.

OpenAI-compatible + MCP + Ramm1-specific endpoints. Wires together the RAMM1 OS,
Universal RAM Pool, memory, scraper, hybrid link, and builder into one API.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/ramm1", tags=["ramm1"])

# Holds all the Ramm1 components — set by init_ramm1_api()
_components: dict[str, Any] = {}


def init_ramm1_api(
    ramm1_os: Any,
    pool: Any,
    selector: Any,
    memory: Any,
    manifest: Any,
    builder: Any,
    scraper: Any,
    peer_registry: Any,
    hybrid_link: Any,
    router_rlos: Any | None = None,
) -> None:
    """Initialize the Ramm1 API with all components."""
    global _components
    _components = {
        "os": ramm1_os,
        "pool": pool,
        "selector": selector,
        "memory": memory,
        "manifest": manifest,
        "builder": builder,
        "scraper": scraper,
        "peer_registry": peer_registry,
        "hybrid_link": hybrid_link,
        "router": router_rlos,
    }


def _get(name: str) -> Any:
    if name not in _components:
        raise RuntimeError(f"Ramm1 API not initialized — {name} missing")
    return _components[name]


# ── Status + pool ──

def get_ramm1_status() -> dict[str, Any]:
    """Synchronous status helper — for use from non-async contexts (e.g. terminal agent)."""
    try:
        os_status = _get("os").get_local_status() if _get("os") else {}
    except Exception:
        os_status = {}
    try:
        pool_status = _get("pool").get_status() if _get("pool") else {}
    except Exception:
        pool_status = {}
    try:
        memory_stats = _get("memory").get_stats() if _get("memory") else {}
    except Exception:
        memory_stats = {}
    try:
        builder_status = _get("builder").get_status() if _get("builder") else {}
    except Exception:
        builder_status = {}
    try:
        hybrid_status = _get("hybrid_link").get_status() if _get("hybrid_link") else {}
    except Exception:
        hybrid_status = {}
    return {
        "ramm1_os": os_status,
        "pool": pool_status,
        "memory": memory_stats,
        "builder": builder_status,
        "hybrid_link": hybrid_status,
    }


@router.get("/status")
async def status() -> dict[str, Any]:
    """Get the full Ramm1 status."""
    return get_ramm1_status()


@router.get("/pool")
async def pool_status() -> dict[str, Any]:
    """Get the Universal RAM Supply pool status."""
    return _get("pool").get_status()


@router.get("/watchdog")
async def watchdog_status() -> dict[str, Any]:
    """Get the always-connected detector (RAM Lock Watchdog) status.

    The watchdog continuously checks if the 3.5 GB RAM lock is still held.
    If the lock ever unlocks, it automatically re-reserves the RAM.
    """
    os_obj = _get("os")
    return os_obj.get_watchdog_status()


@router.post("/watchdog/start")
async def watchdog_start() -> dict[str, Any]:
    """Start the always-connected detector (RAM Lock Watchdog)."""
    os_obj = _get("os")
    await os_obj.start_watchdog()
    return {"running": True, "message": "RAM Lock Watchdog started — always-connected detector active"}


@router.post("/watchdog/stop")
async def watchdog_stop() -> dict[str, Any]:
    """Stop the always-connected detector (RAM Lock Watchdog)."""
    os_obj = _get("os")
    await os_obj.stop_watchdog()
    return {"running": False, "message": "RAM Lock Watchdog stopped"}


# ── Run external model ──

class RunModelRequest(BaseModel):
    model: str
    messages: list[dict[str, str]]
    max_tokens: int = 128
    temperature: float = 0.7


@router.post("/run")
async def run_model(req: RunModelRequest) -> dict[str, Any]:
    """Run a model via the Universal RAM Supply pool."""
    rlos_router = _get("router")
    if rlos_router:
        return await rlos_router.complete(
            model=req.model, messages=req.messages,
            max_tokens=req.max_tokens, temperature=req.temperature,
        )
    return {"status": "error", "error": "router not available"}


# ── Reserve / release ──

@router.post("/reserve")
async def reserve() -> dict[str, Any]:
    """Manually reserve RAM (if not already reserved)."""
    os_obj = _get("os")
    ok = os_obj.reserve()
    return {"status": "reserved" if ok else "failed", "reserved_gb": os_obj.get_reserved_gb()}


@router.post("/release")
async def release() -> dict[str, Any]:
    """Release the RAM reservation."""
    os_obj = _get("os")
    os_obj.release()
    return {"status": "released"}


# ── Peers ──

class PeerJoinRequest(BaseModel):
    endpoint: str
    peer_id: str = ""
    reserved_gb: float = 0.0
    models: list[str] = []
    gpu: bool = False
    vram_gb: float = 0.0
    capability_signature: str = ""


@router.get("/peers")
async def list_peers() -> dict[str, Any]:
    """List all peers."""
    return {"peers": _get("peer_registry").list_peers()}


@router.post("/peers/join")
async def peer_join(req: PeerJoinRequest) -> dict[str, Any]:
    """Join the mesh as a peer."""
    from inc_llm.ramm1.peer import PeerRecord
    peer = PeerRecord(
        peer_id=req.peer_id or req.endpoint,
        endpoint=req.endpoint,
        reserved_gb=req.reserved_gb,
        models=req.models,
        gpu=req.gpu,
        vram_gb=req.vram_gb,
        capability_signature=req.capability_signature,
    )
    _get("peer_registry").register_peer(peer)
    return {"status": "registered", "peer_id": peer.peer_id}


class PeerLeaveRequest(BaseModel):
    peer_id: str


@router.post("/peers/leave")
async def peer_leave(req: PeerLeaveRequest) -> dict[str, Any]:
    """Leave the mesh."""
    _get("peer_registry").remove_peer(req.peer_id)
    return {"status": "removed", "peer_id": req.peer_id}


class PeerApproveRequest(BaseModel):
    peer_id: str


@router.post("/peers/approve")
async def peer_approve(req: PeerApproveRequest) -> dict[str, Any]:
    """Approve a peer — grant consent."""
    ok = _get("peer_registry").approve_peer(req.peer_id)
    return {"status": "approved" if ok else "not_found", "peer_id": req.peer_id}


# ── Allocations ──

@router.get("/allocations")
async def allocations() -> dict[str, Any]:
    """Get current allocations."""
    return _get("os").get_local_status()


# ── Memory ──

class MemoryRecallRequest(BaseModel):
    query: str
    top_k: int = 5


class MemorySearchRequest(BaseModel):
    query: str
    top_k: int = 5


@router.get("/memory/recall")
async def memory_recall(query: str, top_k: int = 5) -> dict[str, Any]:
    """Recall relevant past turns."""
    results = _get("memory").recall(query, top_k=top_k)
    return {"query": query, "count": len(results), "results": results}


@router.post("/memory/search")
async def memory_search(req: MemorySearchRequest) -> dict[str, Any]:
    """Search past turns."""
    results = _get("memory").search(req.query, top_k=req.top_k)
    return {"query": req.query, "count": len(results), "results": results}


@router.get("/memory/stats")
async def memory_stats() -> dict[str, Any]:
    """Get memory stats."""
    return _get("memory").get_stats()


# ── Builder ──

@router.get("/builder/status")
async def builder_status() -> dict[str, Any]:
    """Get the autonomous builder status."""
    return _get("builder").get_status()


# ── MCP JSON-RPC ──

@router.post("/mcp")
async def mcp(request: Request) -> JSONResponse:
    """MCP JSON-RPC endpoint — tools/list, tools/call, resources/list, resources/read."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"jsonrpc": "2.0", "error": {"code": -32700, "message": "Parse error"}}, status_code=400)

    if isinstance(body, list):
        # Batch
        results = [_mcp_handle_single(req) for req in body]
        return JSONResponse(results)
    return JSONResponse(_mcp_handle_single(body))


def _mcp_handle_single(req: dict[str, Any]) -> dict[str, Any]:
    """Handle a single MCP JSON-RPC request."""
    req_id = req.get("id")
    method = req.get("method", "")

    if method == "tools/list":
        tools = [
            {"name": "ramm1_status", "description": "Get the full Ramm1 status (RAMM1 OS + pool + memory + builder + scraper + hybrid link)"},
            {"name": "ramm1_pool_status", "description": "Get the Universal RAM Supply pool status"},
            {"name": "ramm1_reserve", "description": "Reserve RAM (3.5 GB lock)"},
            {"name": "ramm1_release", "description": "Release the RAM reservation"},
            {"name": "ramm1_run_model", "description": "Run a model via the Universal RAM Supply pool", "inputSchema": {"type": "object", "properties": {"model": {"type": "string"}, "messages": {"type": "array"}}}},
            {"name": "ramm1_peer_list", "description": "List all peers"},
            {"name": "ramm1_peer_join", "description": "Join the mesh as a peer"},
            {"name": "ramm1_peer_leave", "description": "Leave the mesh"},
            {"name": "ramm1_alloc_status", "description": "Get current allocations"},
            {"name": "ramm1_memory_recall", "description": "Recall relevant past turns", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}}},
            {"name": "ramm1_memory_search", "description": "Search past turns", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}}},
            {"name": "ramm1_scrape", "description": "Scrape a URL", "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}}},
            {"name": "ramm1_scrape_search", "description": "Search + scrape", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}}},
            {"name": "ramm1_link_discover", "description": "Discover LLMs to link to", "inputSchema": {"type": "object", "properties": {"endpoints": {"type": "array"}}}},
            {"name": "ramm1_link_connect", "description": "Request a link to a remote LLM", "inputSchema": {"type": "object", "properties": {"endpoint": {"type": "string"}}}},
            {"name": "ramm1_link_list", "description": "List all hybrid links"},
            {"name": "ramm1_link_propagate", "description": "Trigger viral propagation (encourage linked LLMs to find new LLMs)"},
        ]
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": tools}}

    if method == "tools/call":
        params = req.get("params", {})
        name = params.get("name", "")
        args = params.get("arguments", {})
        try:
            result = _mcp_call_tool(name, args)
            return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps(result)}]}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": str(e)}}

    if method == "resources/list":
        resources = [
            {"uri": "ramm1://status", "name": "Ramm1 Status", "mimeType": "application/json"},
            {"uri": "ramm1://pool", "name": "Universal RAM Supply Pool", "mimeType": "application/json"},
            {"uri": "ramm1://memory/stats", "name": "Memory Stats", "mimeType": "application/json"},
            {"uri": "ramm1://builder/status", "name": "Builder Status", "mimeType": "application/json"},
            {"uri": "ramm1://hybrid-link/status", "name": "Hybrid Link Status", "mimeType": "application/json"},
        ]
        return {"jsonrpc": "2.0", "id": req_id, "result": {"resources": resources}}

    if method == "resources/read":
        params = req.get("params", {})
        uri = params.get("uri", "")
        try:
            content = _mcp_read_resource(uri)
            return {"jsonrpc": "2.0", "id": req_id, "result": {"contents": [{"uri": uri, "mimeType": "application/json", "text": json.dumps(content)}]}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": f"Unknown resource: {uri}"}}

    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def _mcp_call_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Handle an MCP tools/call request."""
    if name == "ramm1_status":
        return _get("os").get_local_status()
    elif name == "ramm1_pool_status":
        return _get("pool").get_status()
    elif name == "ramm1_reserve":
        return {"reserved": _get("os").reserve()}
    elif name == "ramm1_release":
        _get("os").release()
        return {"released": True}
    elif name == "ramm1_run_model":
        # Run synchronously in a thread
        rlos_router = _get("router")
        if rlos_router:
            result = asyncio.get_event_loop().run_until_complete(
                rlos_router.complete(args.get("model", ""), args.get("messages", []))
            )
            return result
        return {"error": "router not available"}
    elif name == "ramm1_peer_list":
        return {"peers": _get("peer_registry").list_peers()}
    elif name == "ramm1_peer_join":
        return {"status": "use POST /v1/ramm1/peers/join"}
    elif name == "ramm1_peer_leave":
        _get("peer_registry").remove_peer(args.get("peer_id", ""))
        return {"removed": True}
    elif name == "ramm1_alloc_status":
        return _get("os").get_local_status()
    elif name == "ramm1_memory_recall":
        return {"results": _get("memory").recall(args.get("query", ""), top_k=args.get("top_k", 5))}
    elif name == "ramm1_memory_search":
        return {"results": _get("memory").search(args.get("query", ""), top_k=args.get("top_k", 5))}
    elif name == "ramm1_scrape":
        scraper = _get("scraper")
        record = asyncio.get_event_loop().run_until_complete(scraper.scrape(args.get("url", "")))
        return record.to_dict()
    elif name == "ramm1_scrape_search":
        scraper = _get("scraper")
        results = asyncio.get_event_loop().run_until_complete(scraper.search(args.get("query", "")))
        return {"results": [r.to_dict() for r in results]}
    elif name == "ramm1_link_discover":
        return {"results": _get("hybrid_link").discover(args.get("endpoints", []))}
    elif name == "ramm1_link_connect":
        return _get("hybrid_link").request_link(args.get("endpoint", ""))
    elif name == "ramm1_link_list":
        return {"links": _get("hybrid_link").list_links()}
    elif name == "ramm1_link_propagate":
        return asyncio.get_event_loop().run_until_complete(_get("hybrid_link").propagate())
    raise ValueError(f"Unknown tool: {name}")


def _mcp_read_resource(uri: str) -> dict[str, Any]:
    """Handle an MCP resources/read request."""
    if uri == "ramm1://status":
        return _get("os").get_local_status()
    elif uri == "ramm1://pool":
        return _get("pool").get_status()
    elif uri == "ramm1://memory/stats":
        return _get("memory").get_stats()
    elif uri == "ramm1://builder/status":
        return _get("builder").get_status()
    elif uri == "ramm1://hybrid-link/status":
        return _get("hybrid_link").get_status()
    raise ValueError(f"Unknown resource: {uri}")
