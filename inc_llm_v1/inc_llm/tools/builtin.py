"""Built-in tools — 13 production-ready tools for the enhanced tool system.

All tools are async-compatible and use the ToolSchema format. They cover:
file operations, code execution, web search, calculations, time/date,
text processing, list/dict operations, and system info.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

from inc_llm.tools.schema import ToolSchema, ToolParameter, EnhancedToolRegistry

logger = logging.getLogger(__name__)


def _create_file(path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
    """Create a file with the given content."""
    p = Path(path)
    if p.exists() and not overwrite:
        return {"success": False, "error": f"File already exists: {path}. Use overwrite=true."}
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return {"success": True, "output": f"Created file: {path} ({len(content)} bytes)"}


def _read_file(path: str) -> dict[str, Any]:
    """Read a file's content."""
    p = Path(path)
    if not p.exists():
        return {"success": False, "error": f"File not found: {path}"}
    content = p.read_text(encoding="utf-8")
    return {"success": True, "output": content[:10000]}


def _list_directory(path: str = ".") -> dict[str, Any]:
    """List directory contents."""
    p = Path(path)
    if not p.is_dir():
        return {"success": False, "error": f"Not a directory: {path}"}
    entries = []
    for entry in sorted(p.iterdir()):
        entries.append({
            "name": entry.name,
            "type": "dir" if entry.is_dir() else "file",
            "size": entry.stat().st_size if entry.is_file() else 0,
        })
    return {"success": True, "output": json.dumps(entries, indent=2)}


def _run_command(command: str, timeout_s: int = 30) -> dict[str, Any]:
    """Run a shell command and return stdout/stderr."""
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True, timeout=timeout_s
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        return {
            "success": result.returncode == 0,
            "output": output[:10000],
            "error": "" if result.returncode == 0 else f"Exit code: {result.returncode}",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Command timed out after {timeout_s}s"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _execute_python(code: str) -> dict[str, Any]:
    """Execute Python code and return the output."""
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = captured_out = type("S", (), {"write": lambda self, s: None, "buffer": type("B", (), {"write": lambda self, s: None})()})()
    sys.stderr = type("S", (), {"write": lambda self, s: None})()

    import io
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    sys.stdout = stdout_buf
    sys.stderr = stderr_buf

    try:
        exec(code, {"__name__": "__main__"})
        output = stdout_buf.getvalue()
        return {"success": True, "output": output[:10000] if output else "(no output)"}
    except Exception as e:
        return {"success": False, "error": f"{type(e).__name__}: {e}", "output": stderr_buf.getvalue()[:5000]}
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr


def _calculate(expression: str) -> dict[str, Any]:
    """Safely evaluate a mathematical expression."""
    allowed_names = {
        "abs": abs, "round": round, "min": min, "max": max,
        "sum": sum, "pow": pow, "len": len,
    }
    import math
    for name in dir(math):
        if not name.startswith("_"):
            allowed_names[name] = getattr(math, name)

    try:
        code = compile(expression, "<string>", "eval")
        for name in code.co_names:
            if name not in allowed_names:
                return {"success": False, "error": f"Name not allowed: {name}"}
        result = eval(code, {"__builtins__": {}}, allowed_names)
        return {"success": True, "output": str(result)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _get_time(timezone: str = "UTC") -> dict[str, Any]:
    """Get current date and time."""
    now = datetime.datetime.now(datetime.timezone.utc)
    return {
        "success": True,
        "output": json.dumps({
            "utc": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M:%S"),
            "weekday": now.strftime("%A"),
            "unix_timestamp": now.timestamp(),
        }),
    }


def _text_replace(text: str, find: str, replace: str) -> dict[str, Any]:
    """Replace all occurrences of find with replace in text."""
    return {"success": True, "output": text.replace(find, replace)}


def _text_split(text: str, delimiter: str = " ") -> dict[str, Any]:
    """Split text by delimiter."""
    return {"success": True, "output": json.dumps(text.split(delimiter))}


def _text_join(items: str, delimiter: str = " ") -> dict[str, Any]:
    """Join a JSON list of items with a delimiter."""
    try:
        lst = json.loads(items)
        return {"success": True, "output": delimiter.join(str(x) for x in lst)}
    except json.JSONDecodeError:
        return {"success": False, "error": "items must be a JSON array"}


def _json_parse(text: str) -> dict[str, Any]:
    """Parse JSON text and return formatted output."""
    try:
        data = json.loads(text)
        return {"success": True, "output": json.dumps(data, indent=2)}
    except json.JSONDecodeError as e:
        return {"success": False, "error": str(e)}


def _system_info() -> dict[str, Any]:
    """Get system information."""
    return {
        "success": True,
        "output": json.dumps({
            "platform": platform.platform(),
            "python_version": sys.version,
            "processor": platform.processor(),
            "machine": platform.machine(),
            "hostname": platform.node(),
            "cpu_count": os.cpu_count(),
        }, indent=2),
    }


def _search_text(text: str, pattern: str, case_sensitive: bool = False) -> dict[str, Any]:
    """Search for a pattern in text and return matching lines."""
    import re
    flags = 0 if case_sensitive else re.IGNORECASE
    matches = []
    for i, line in enumerate(text.split("\n"), 1):
        if re.search(pattern, line, flags):
            matches.append({"line": i, "text": line})
    return {"success": True, "output": json.dumps(matches, indent=2)}


def get_builtin_tools() -> list[ToolSchema]:
    """Return all 13 built-in tool schemas."""
    return [
        ToolSchema(
            name="create_file",
            description="Create a file with the given content. Creates parent directories if needed.",
            parameters=[
                ToolParameter("path", "string", "File path (relative or absolute)", required=True),
                ToolParameter("content", "string", "File content", required=True),
                ToolParameter("overwrite", "boolean", "Overwrite if file exists", required=False, default=False),
            ],
            handler=_create_file,
            category="file",
        ),
        ToolSchema(
            name="read_file",
            description="Read the content of a file.",
            parameters=[
                ToolParameter("path", "string", "File path", required=True),
            ],
            handler=_read_file,
            category="file",
        ),
        ToolSchema(
            name="list_directory",
            description="List the contents of a directory.",
            parameters=[
                ToolParameter("path", "string", "Directory path", required=False, default="."),
            ],
            handler=_list_directory,
            category="file",
        ),
        ToolSchema(
            name="run_command",
            description="Run a shell command and return stdout/stderr.",
            parameters=[
                ToolParameter("command", "string", "Shell command to execute", required=True),
                ToolParameter("timeout_s", "integer", "Timeout in seconds", required=False, default=30),
            ],
            handler=_run_command,
            category="system",
        ),
        ToolSchema(
            name="execute_python",
            description="Execute Python code and return the output.",
            parameters=[
                ToolParameter("code", "string", "Python code to execute", required=True),
            ],
            handler=_execute_python,
            category="code",
        ),
        ToolSchema(
            name="calculate",
            description="Safely evaluate a mathematical expression. Supports math functions.",
            parameters=[
                ToolParameter("expression", "string", "Math expression (e.g. '2+2', 'math.sqrt(16)')", required=True),
            ],
            handler=_calculate,
            category="math",
        ),
        ToolSchema(
            name="get_time",
            description="Get current date and time.",
            parameters=[
                ToolParameter("timezone", "string", "Timezone name", required=False, default="UTC"),
            ],
            handler=_get_time,
            category="system",
        ),
        ToolSchema(
            name="text_replace",
            description="Replace all occurrences of a substring in text.",
            parameters=[
                ToolParameter("text", "string", "Input text", required=True),
                ToolParameter("find", "string", "Text to find", required=True),
                ToolParameter("replace", "string", "Replacement text", required=True),
            ],
            handler=_text_replace,
            category="text",
        ),
        ToolSchema(
            name="text_split",
            description="Split text by a delimiter into a list.",
            parameters=[
                ToolParameter("text", "string", "Input text", required=True),
                ToolParameter("delimiter", "string", "Delimiter to split on", required=False, default=" "),
            ],
            handler=_text_split,
            category="text",
        ),
        ToolSchema(
            name="text_join",
            description="Join a JSON array of items with a delimiter.",
            parameters=[
                ToolParameter("items", "string", "JSON array of items", required=True),
                ToolParameter("delimiter", "string", "Delimiter to join with", required=False, default=" "),
            ],
            handler=_text_join,
            category="text",
        ),
        ToolSchema(
            name="json_parse",
            description="Parse and pretty-print JSON text.",
            parameters=[
                ToolParameter("text", "string", "JSON text to parse", required=True),
            ],
            handler=_json_parse,
            category="text",
        ),
        ToolSchema(
            name="system_info",
            description="Get system information (platform, Python version, CPU, etc.).",
            parameters=[],
            handler=_system_info,
            category="system",
        ),
        ToolSchema(
            name="search_text",
            description="Search for a regex pattern in text and return matching lines.",
            parameters=[
                ToolParameter("text", "string", "Text to search in", required=True),
                ToolParameter("pattern", "string", "Regex pattern to search for", required=True),
                ToolParameter("case_sensitive", "boolean", "Case sensitive search", required=False, default=False),
            ],
            handler=_search_text,
            category="text",
        ),
    ]


def create_enhanced_registry() -> EnhancedToolRegistry:
    """Create an EnhancedToolRegistry with all built-in tools registered."""
    registry = EnhancedToolRegistry()
    for tool in get_builtin_tools():
        registry.register(tool)
    return registry
