"""Aceline Agent API — external AI/agent/chatbot connection layer.

Allows any AI, agent, or chatbot to connect to Aceline and control the
Soulmate OS system smartly. Exposes:

- POST /v1/aceline/agent — main chat + autonomous tool execution endpoint
- GET  /v1/aceline/tools — list available tools and their schemas
- GET  /v1/aceline/health — health check
- POST /v1/aceline/run — direct terminal command execution
- POST /v1/aceline/read — direct file read
- POST /v1/aceline/write — direct file write
- POST /v1/aceline/search — direct text search
- GET  /v1/aceline/docs — full API documentation for connecting AIs

Authentication:
- Local access (localhost): auto-authenticated as founder, no key needed
- External access: API key with "aceline" scope (created via /v1/api-keys/create)
- Bearer token in Authorization header OR X-Aceline-Key header

The agent endpoint accepts a message + context, routes through GLM 5.1
(via Ollama), parses tool calls from the response, executes them, feeds
results back, and loops up to max_steps times. This lets any AI connect
and get full Aceline autonomous agent capabilities.

Tool protocol (parsed from LLM responses):
- RUN: <command> — execute a shell/PowerShell command
- READ: <file path> — read a file
- WRITE: <file path> ... ENDWRITE — write a file
- SEARCH: <pattern> — search for text in files
- NAVIGATE: <page> — navigate to a Soulmate OS page (returned to caller)
- DONE — signal task completion
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import subprocess
import time
import urllib.request
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/aceline", tags=["aceline"])

# ── Config ────────────────────────────────────────────────────────────

DEFAULT_MODEL = os.environ.get("ACELINE_MODEL", "glm-5.1")
OLLAMA_BASE = os.environ.get("OLLAMA_BASE", "http://localhost:11434")
MAX_STEPS_DEFAULT = 15
MAX_OUTPUT_CHARS = 4000
COMMAND_TIMEOUT = 120
SOULMATE_PAGES = [
    "dashboard", "business", "email", "phone", "contacts", "ai", "games",
    "wallet", "security", "openclaw", "hermes", "marketplace", "agent_market", "archive", "diagnostics",
    "dating", "incentives", "daytrading", "frequency", "healing", "journal",
    "soultube", "soulillusions", "wakkii",
]

# ── Auth ──────────────────────────────────────────────────────────────

_harness = None
_settings = None


def init_aceline_agent(harness, settings) -> None:
    """Initialize with the harness and settings from the main server."""
    global _harness, _settings
    _harness = harness
    _settings = settings


def _authenticate(authorization: str = "", x_aceline_key: str = "") -> dict[str, Any]:
    """Authenticate via API key or auto-auth for local access."""
    # Try API key first
    key = ""
    if authorization:
        key = authorization.replace("Bearer ", "").strip()
    elif x_aceline_key:
        key = x_aceline_key.strip()

    if key and _harness and key.startswith("inc-"):
        api_key = _harness.api_keys.verify_key(key, required_scope="aceline")
        if api_key is None:
            raise HTTPException(401, "Invalid or inactive API key")
        return {
            "user_id": f"agent:{api_key.name}",
            "is_owner": False,
            "is_founder": False,
            "free_access": True,
            "agent_name": api_key.name,
            "scopes": api_key.scopes,
        }

    # Auto-auth as founder for local access
    if _harness and _settings:
        result = _harness.auth.authenticate_password(_settings.auth.secret_password)
        if result.get("status") == "ok":
            return {
                "user_id": result["user_id"],
                "is_owner": True,
                "is_founder": True,
                "free_access": True,
                "agent_name": "local",
                "scopes": ["aceline", "admin"],
            }

    raise HTTPException(401, "Authentication required — provide API key or run locally")


# ── Models ────────────────────────────────────────────────────────────

class AcelineAgentRequest(BaseModel):
    message: str
    model: str = DEFAULT_MODEL
    context: dict = {}
    max_steps: int = MAX_STEPS_DEFAULT
    cwd: str = ""


class AcelineRunRequest(BaseModel):
    command: str
    cwd: str = ""
    timeout: int = COMMAND_TIMEOUT


class AcelineReadRequest(BaseModel):
    path: str


class AcelineWriteRequest(BaseModel):
    path: str
    content: str


class AcelineSearchRequest(BaseModel):
    pattern: str
    cwd: str = ""
    max_results: int = 30


# ── System Context ────────────────────────────────────────────────────

def build_system_context(extra_context: dict = None) -> str:
    """Build the full Aceline system context for the LLM."""
    parts = [
        "You are Aceline, the autonomous AI agent for Soulmate OS (an Incentives Inc. product).",
        "You have FULL access to the entire Soulmate OS platform with NO limitations.",
        "You can read state, trigger actions, navigate to any page, run terminal commands,",
        "read/write files, search, and control the platform autonomously.",
        "",
        "## AVAILABLE PAGES",
        "Navigate using NAVIGATE: <page>",
        ", ".join(SOULMATE_PAGES),
        "",
        "## TOOL PROTOCOL",
        "Use these tools by putting the tool call on its own line:",
        "- RUN: <command> — execute a shell/PowerShell command",
        "- READ: <file path> — read a file's contents",
        "- WRITE: <file path> — write content to a file (content follows until ENDWRITE)",
        "- SEARCH: <pattern> — search for text in project files",
        "- NAVIGATE: <page> — navigate to a Soulmate OS page",
        "- DONE — signal that the task is complete",
        "",
        "## RULES",
        "- Be terse and direct. Outcome-first.",
        "- When asked to do something, USE THE TOOLS to actually do it.",
        "- Do not just describe what you would do — DO IT.",
        "- After running commands, report the result.",
        "- You are an autonomous agent — plan and execute, don't just suggest.",
        "",
        "## CLONING FRAMEWORK (MANDATORY for clone/recreate/port tasks)",
        "1. INSPECT the target — do not guess.",
        "2. DOCUMENT — build a complete feature inventory.",
        "3. IMPLEMENT — no scaffolding or placeholders.",
        "4. TEST — compare target vs clone.",
        "5. IDENTIFY GAPS — classify as Critical/High/Medium/Low/Cosmetic.",
        "6. FIX GAPS — implement missing. Rebuild, retest.",
        "7. REPEAT until no meaningful gaps remain.",
        "8. VERIFY — final audit against target spec.",
        "Never generate scaffolding or placeholder implementations.",
        "",
        "## UNIVERSAL RAMM1 — LLM + RAMM1 OS (Universal LLM Free System)",
        "The RAMM1 OS is a 3.5 GB RAM lock that reserves memory for LLM inference.",
        "It powers ALL LLMs used by Aceline — local, peer, and hybrid-linked.",
        "The Universal RAM Supply pools RAM across local + peers for capacity-finding.",
        "The Adaptive Model Selector picks the right model for available RAM.",
        "Universal Memory records every turn, compresses to RLT tokens, and recalls.",
        "The Autonomous Builder runs a work queue and never quits.",
        "The Hybrid Link API talks to ANY LLM (OpenAI/Anthropic/Ollama/MCP/custom/legacy).",
        "API: GET /v1/ramm1/status — check RAMM1 OS, pool, memory, builder, hybrid links.",
        "API: GET /v1/ramm1/install/status — check installer status.",
        "API: POST /v1/ramm1/install — install RAMM1 OS as Universal LLM Free System.",
        "API: GET /v1/ramm1/install/verify — verify installation.",
        "CLI: aceline ramm1 — show full Ramm1 status.",
        "The RAMM1 OS powers LLMs that need lots of RAM by reserving and pooling memory.",
    ]

    if extra_context:
        parts.append("")
        parts.append("## CALLER CONTEXT")
        for k, v in extra_context.items():
            parts.append(f"{k}: {json.dumps(v) if not isinstance(v, str) else v}")

    return "\n".join(parts)


# ── Tool Parsing ──────────────────────────────────────────────────────

class ParsedTool:
    kind: str
    arg: str
    content: str | None

    def __init__(self, kind: str, arg: str, content: str | None = None):
        self.kind = kind
        self.arg = arg
        self.content = content


def parse_tools(response: str) -> tuple[str, list[ParsedTool]]:
    """Parse tool calls from an LLM response. Returns (text, tools)."""
    tools: list[ParsedTool] = []
    lines = response.split("\n")
    text_parts: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        run_m = re.match(r"^RUN:\s*(.+)$", line, re.IGNORECASE)
        read_m = re.match(r"^READ:\s*(.+)$", line, re.IGNORECASE)
        write_m = re.match(r"^WRITE:\s*(.+)$", line, re.IGNORECASE)
        search_m = re.match(r"^SEARCH:\s*(.+)$", line, re.IGNORECASE)
        nav_m = re.match(r"^NAVIGATE:\s*(.+)$", line, re.IGNORECASE)
        done_m = re.match(r"^DONE\s*$", line, re.IGNORECASE)

        if run_m:
            tools.append(ParsedTool("RUN", run_m.group(1).strip()))
        elif read_m:
            tools.append(ParsedTool("READ", read_m.group(1).strip()))
        elif write_m:
            file_path = write_m.group(1).strip()
            content_lines: list[str] = []
            i += 1
            while i < len(lines) and not re.match(r"^ENDWRITE\s*$", lines[i], re.IGNORECASE):
                content_lines.append(lines[i])
                i += 1
            tools.append(ParsedTool("WRITE", file_path, "\n".join(content_lines)))
            if i < len(lines):
                i += 1
            continue
        elif search_m:
            tools.append(ParsedTool("SEARCH", search_m.group(1).strip()))
        elif nav_m:
            tools.append(ParsedTool("NAVIGATE", nav_m.group(1).strip().lower()))
        elif done_m:
            tools.append(ParsedTool("DONE", ""))
        else:
            text_parts.append(line)
        i += 1

    return "\n".join(text_parts).strip(), tools


# ── Tool Execution ───────────────────────────────────────────────────

def execute_run(command: str, cwd: str = "", timeout: int = COMMAND_TIMEOUT) -> str:
    """Execute a shell command and return stdout+stderr."""
    try:
        is_windows = os.name == "nt"
        shell = ["powershell", "-NoProfile", "-Command", command] if is_windows else ["bash", "-c", command]
        work_dir = cwd if cwd and os.path.isdir(cwd) else None
        result = subprocess.run(
            shell,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=work_dir,
        )
        out = result.stdout or ""
        err = result.stderr or ""
        parts = []
        if out:
            parts.append(out)
        if err:
            parts.append(f"STDERR: {err}")
        if result.returncode != 0:
            parts.append(f"[exit code: {result.returncode}]")
        return "\n".join(parts)[:MAX_OUTPUT_CHARS] or "(no output)"
    except subprocess.TimeoutExpired:
        return f"Error: command timed out after {timeout}s"
    except Exception as e:
        return f"Error: {e}"


def execute_read(path: str) -> str:
    """Read a file's contents."""
    try:
        if not os.path.isfile(path):
            return f"Error: file not found: {path}"
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()[:MAX_OUTPUT_CHARS]
    except Exception as e:
        return f"Error: {e}"


def execute_write(path: str, content: str) -> str:
    """Write content to a file."""
    try:
        os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Wrote {len(content)} chars to {path}"
    except Exception as e:
        return f"Error: {e}"


def execute_search(pattern: str, cwd: str = "", max_results: int = 30) -> str:
    """Search for text in files using PowerShell Select-String or grep."""
    try:
        is_windows = os.name == "nt"
        work_dir = cwd if cwd and os.path.isdir(cwd) else "."
        if is_windows:
            cmd = (
                f'Get-ChildItem -Path "{work_dir}" -Recurse -File -ErrorAction SilentlyContinue | '
                f'Select-String -Pattern "{pattern}" -ErrorAction SilentlyContinue | '
                f"Select-Object -First {max_results} | "
                'ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line)" }'
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", cmd],
                capture_output=True, text=True, timeout=30,
            )
        else:
            result = subprocess.run(
                ["grep", "-rn", "--include=*.*", pattern, work_dir],
                capture_output=True, text=True, timeout=30,
            )
        out = result.stdout or ""
        lines = out.strip().split("\n")[:max_results]
        return "\n".join(lines) if lines[0] else f"(no matches for: {pattern})"
    except Exception as e:
        return f"Error: {e}"


def execute_tool(tool: ParsedTool, cwd: str = "") -> str:
    """Execute a single parsed tool and return the result string."""
    if tool.kind == "RUN":
        return execute_run(tool.arg, cwd)
    elif tool.kind == "READ":
        return execute_read(tool.arg)
    elif tool.kind == "WRITE":
        if not tool.content:
            return "Error: no content provided"
        return execute_write(tool.arg, tool.content)
    elif tool.kind == "SEARCH":
        return execute_search(tool.arg, cwd)
    elif tool.kind == "NAVIGATE":
        target = tool.arg.strip()
        if target in SOULMATE_PAGES:
            return f"__NAVIGATE__:{target}"
        return f"Error: unknown page '{target}'. Available: {', '.join(SOULMATE_PAGES)}"
    elif tool.kind == "DONE":
        return "__DONE__"
    return f"(unknown tool: {tool.kind})"


# ── LLM Call ──────────────────────────────────────────────────────────

def call_llm(message: str, system_context: str, model: str) -> str:
    """Call the LLM via Ollama and return the response text."""
    data = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_context},
            {"role": "user", "content": message},
        ],
        "stream": False,
        "options": {"temperature": 0.7, "num_ctx": 8192},
    }).encode()

    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=120)
    result = json.loads(resp.read().decode())
    return result.get("message", {}).get("content", "No response from model.")


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/health")
async def aceline_health():
    """Health check — no auth required."""
    return {
        "status": "ok",
        "service": "aceline-agent-api",
        "product": "Incentives Inc.",
        "model": DEFAULT_MODEL,
        "ollama": OLLAMA_BASE,
        "pages": len(SOULMATE_PAGES),
        "tools": ["RUN", "READ", "WRITE", "SEARCH", "NAVIGATE", "DONE"],
    }


@router.get("/docs")
async def aceline_docs():
    """Full API documentation for connecting AIs and agents."""
    return {
        "service": "Aceline Agent API",
        "product": "Incentives Inc.",
        "version": "1.0.0",
        "description": (
            "Connect any AI, agent, or chatbot to Aceline to control "
            "Soulmate OS smartly. Send a message, Aceline plans and executes "
            "autonomously using the tool protocol."
        ),
        "authentication": {
            "local": "Auto-authenticated as founder (no key needed on localhost)",
            "external": "API key with 'aceline' scope via Authorization: Bearer <key> or X-Aceline-Key header",
            "create_key": "POST /v1/api-keys/create with scopes=['aceline']",
        },
        "endpoints": {
            "POST /v1/aceline/agent": {
                "description": "Main endpoint — send a message, Aceline executes autonomously",
                "body": {
                    "message": "string — your request",
                    "model": "string (default: glm-5.1)",
                    "context": "object — extra context for Aceline",
                    "max_steps": "int (default: 15) — max tool execution steps",
                    "cwd": "string — working directory for commands",
                },
                "response": {
                    "response": "string — Aceline's final text response",
                    "actions": "array — list of actions taken",
                    "navigated_to": "string|null — page navigated to if any",
                    "steps": "int — number of steps executed",
                    "model": "string — model used",
                },
            },
            "POST /v1/aceline/run": {
                "description": "Direct terminal command execution",
                "body": {"command": "string", "cwd": "string", "timeout": "int"},
                "response": {"output": "string", "exit_code": "int"},
            },
            "POST /v1/aceline/read": {
                "description": "Direct file read",
                "body": {"path": "string"},
                "response": {"content": "string"},
            },
            "POST /v1/aceline/write": {
                "description": "Direct file write",
                "body": {"path": "string", "content": "string"},
                "response": {"status": "string", "bytes": "int"},
            },
            "POST /v1/aceline/search": {
                "description": "Direct text search in files",
                "body": {"pattern": "string", "cwd": "string", "max_results": "int"},
                "response": {"results": "string"},
            },
            "GET /v1/aceline/tools": {
                "description": "List available tools and their schemas",
                "response": {"tools": "array"},
            },
            "GET /v1/aceline/health": {
                "description": "Health check (no auth required)",
                "response": {"status": "string"},
            },
        },
        "tool_protocol": {
            "RUN": "RUN: <command> — execute a shell/PowerShell command",
            "READ": "READ: <file path> — read a file",
            "WRITE": "WRITE: <file path>\\n<content>\\nENDWRITE — write a file",
            "SEARCH": "SEARCH: <pattern> — search for text in files",
            "NAVIGATE": "NAVIGATE: <page> — navigate to a Soulmate OS page",
            "DONE": "DONE — signal task completion",
        },
        "available_pages": SOULMATE_PAGES,
        "example_call": {
            "method": "POST",
            "url": "/v1/aceline/agent",
            "headers": {"Authorization": "Bearer inc-...", "Content-Type": "application/json"},
            "body": {
                "message": "List all files in the current directory and tell me what this project is",
                "model": "glm-5.1",
                "max_steps": 10,
            },
        },
    }


@router.get("/tools")
async def aceline_tools(authorization: str = Header(""), x_aceline_key: str = Header("", alias="X-Aceline-Key")):
    """List available tools and their schemas."""
    _authenticate(authorization, x_aceline_key)
    return {
        "tools": [
            {
                "name": "RUN",
                "syntax": "RUN: <command>",
                "description": "Execute a shell/PowerShell command",
                "endpoint": "POST /v1/aceline/run",
            },
            {
                "name": "READ",
                "syntax": "READ: <file path>",
                "description": "Read a file's contents",
                "endpoint": "POST /v1/aceline/read",
            },
            {
                "name": "WRITE",
                "syntax": "WRITE: <file path>\\n<content>\\nENDWRITE",
                "description": "Write content to a file",
                "endpoint": "POST /v1/aceline/write",
            },
            {
                "name": "SEARCH",
                "syntax": "SEARCH: <pattern>",
                "description": "Search for text in project files",
                "endpoint": "POST /v1/aceline/search",
            },
            {
                "name": "NAVIGATE",
                "syntax": "NAVIGATE: <page>",
                "description": "Navigate to a Soulmate OS page",
                "available_pages": SOULMATE_PAGES,
            },
            {
                "name": "DONE",
                "syntax": "DONE",
                "description": "Signal that the task is complete",
            },
        ],
        "available_pages": SOULMATE_PAGES,
    }


@router.post("/agent")
async def aceline_agent(
    req: AcelineAgentRequest,
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Main Aceline agent endpoint — any AI can connect and control the system.

    Send a message, Aceline routes through GLM 5.1, parses tool calls,
    executes them autonomously, and returns the result.

    Any AI, agent, or chatbot can connect:
    - ChatGPT, Claude, Gemini, GLM, DeepSeek, Kimi, etc.
    - Custom agents, bots, automation systems
    - Even simple chatbots that just send/receive text

    The AI doesn't need to understand the tool protocol — Aceline handles
    all tool parsing and execution internally. The caller just sends a
    message and gets back a response + list of actions taken.
    """
    user = _authenticate(authorization, x_aceline_key)
    system_context = build_system_context({
        "caller": user.get("agent_name", "unknown"),
        "scopes": user.get("scopes", []),
        **req.context,
    })

    actions: list[dict] = []
    navigated_to: str | None = None
    steps = 0
    current_message = req.message
    is_done = False

    for step in range(req.max_steps):
        steps = step + 1
        try:
            response = await asyncio.to_thread(
                call_llm, current_message, system_context, req.model
            )
        except Exception as e:
            return {
                "response": f"GLM 5.1 connection error: {e}. Make sure Ollama is running with the model pulled.",
                "actions": actions,
                "navigated_to": navigated_to,
                "steps": steps,
                "model": req.model,
                "status": "error",
            }

        text, tools = parse_tools(response)

        if text:
            actions.append({"step": steps, "type": "response", "content": text[:MAX_OUTPUT_CHARS]})

        if not tools:
            return {
                "response": text or "(no response)",
                "actions": actions,
                "navigated_to": navigated_to,
                "steps": steps,
                "model": req.model,
                "status": "ok",
            }

        tool_results: list[str] = []
        for tool in tools:
            if tool.kind == "DONE":
                is_done = True
                actions.append({"step": steps, "type": "DONE"})
                break

            result = await asyncio.to_thread(execute_tool, tool, req.cwd)

            if result.startswith("__NAVIGATE__:"):
                navigated_to = result[len("__NAVIGATE__:"):]
                actions.append({
                    "step": steps, "type": "NAVIGATE",
                    "page": navigated_to, "status": "ok",
                })
                tool_results.append(f"NAVIGATE: {navigated_to} — success")
            elif result == "__DONE__":
                is_done = True
                actions.append({"step": steps, "type": "DONE"})
                break
            else:
                actions.append({
                    "step": steps, "type": tool.kind,
                    "arg": tool.arg[:200],
                    "result": result[:MAX_OUTPUT_CHARS],
                })
                tool_results.append(f"{tool.kind} result:\n{result}")

        if is_done:
            break

        # Feed tool results back to the LLM for the next step
        current_message = (
            f"Previous response produced these tool results:\n\n"
            f"{''.join(tool_results)}\n\n"
            f"Continue. If the task is complete, say DONE."
        )

    return {
        "response": text if tools else (text or "(task completed)"),
        "actions": actions,
        "navigated_to": navigated_to,
        "steps": steps,
        "model": req.model,
        "status": "done" if is_done else "max_steps",
    }


@router.post("/run")
async def aceline_run(
    req: AcelineRunRequest,
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Direct terminal command execution — for agents that want to call tools directly."""
    _authenticate(authorization, x_aceline_key)
    output = await asyncio.to_thread(execute_run, req.command, req.cwd, req.timeout)
    return {"output": output, "command": req.command}


@router.post("/read")
async def aceline_read(
    req: AcelineReadRequest,
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Direct file read — for agents that want to read files directly."""
    _authenticate(authorization, x_aceline_key)
    content = await asyncio.to_thread(execute_read, req.path)
    return {"content": content, "path": req.path}


@router.post("/write")
async def aceline_write(
    req: AcelineWriteRequest,
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Direct file write — for agents that want to write files directly."""
    _authenticate(authorization, x_aceline_key)
    result = await asyncio.to_thread(execute_write, req.path, req.content)
    return {"status": result, "path": req.path, "bytes": len(req.content)}


@router.post("/search")
async def aceline_search(
    req: AcelineSearchRequest,
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Direct text search — for agents that want to search files directly."""
    _authenticate(authorization, x_aceline_key)
    results = await asyncio.to_thread(execute_search, req.pattern, req.cwd, req.max_results)
    return {"results": results, "pattern": req.pattern}


@router.get("/ramm1")
async def aceline_ramm1_status(
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Get Universal Ramm1 status — RAMM1 OS, RAM lock, pool, memory, builder, hybrid links.

    The RAMM1 OS is the Universal LLM Free System that powers all LLMs used by Aceline.
    It reserves 3.5 GB of RAM (adaptive) for LLM inference and pools RAM across peers.
    """
    _authenticate(authorization, x_aceline_key)
    try:
        from inc_llm.ramm1.api import get_ramm1_status
        return get_ramm1_status()
    except Exception as e:
        return {"error": str(e), "ramm1_available": False}


@router.get("/ramm1/install")
async def aceline_ramm1_install_status(
    authorization: str = Header(""),
    x_aceline_key: str = Header("", alias="X-Aceline-Key"),
):
    """Get Ramm1 installer status — check if the Universal LLM Free System is installed."""
    _authenticate(authorization, x_aceline_key)
    try:
        from inc_llm.ramm1.install import Ramm1Installer
        return Ramm1Installer().status()
    except Exception as e:
        return {"error": str(e), "installed": False}
