"""Tool execution loop — parses and executes tool calls from LLM output.

Supports the [TOOL: name(args)] syntax. Tools are registered in a registry
and executed in a loop until no more tool calls are found or max rounds reached.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)

TOOL_PATTERN = re.compile(r"\[TOOL:\s*(\w+)\s*\((.*?)\)\s*\]", re.DOTALL)


@dataclass
class ToolResult:
    name: str
    args: str
    success: bool
    output: str
    error: str = ""


@dataclass
class Tool:
    name: str
    description: str
    handler: Callable[..., str]
    examples: list[str] = field(default_factory=list)


class ToolRegistry:
    """Registry of available tools for the LLM to call."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool
        logger.debug("Registered tool: %s", tool.name)

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {"name": t.name, "description": t.description, "examples": t.examples}
            for t in self._tools.values()
        ]

    def get_prompt_description(self) -> str:
        """Generate a description of available tools for the system prompt."""
        if not self._tools:
            return ""
        lines = ["Available tools:"]
        for tool in self._tools.values():
            lines.append(f"- {tool.name}: {tool.description}")
        return "\n".join(lines)


def parse_tool_calls(text: str) -> list[tuple[str, str]]:
    """Extract tool calls from LLM output text."""
    matches = TOOL_PATTERN.findall(text)
    return [(name, args.strip()) for name, args in matches]


def execute_tools(text: str, registry: ToolRegistry) -> list[ToolResult]:
    """Execute all tool calls found in text."""
    results: list[ToolResult] = []
    for name, args in parse_tool_calls(text):
        tool = registry.get(name)
        if tool is None:
            results.append(ToolResult(name=name, args=args, success=False, output="", error=f"Unknown tool: {name}"))
            continue
        try:
            output = tool.handler(args)
            results.append(ToolResult(name=name, args=args, success=True, output=output))
        except Exception as e:
            results.append(ToolResult(name=name, args=args, success=False, output="", error=str(e)))
    return results


async def tool_loop(
    initial_text: str,
    registry: ToolRegistry,
    bus: Any,
    messages: list[dict[str, str]],
    max_rounds: int = 3,
) -> tuple[str, list[ToolResult]]:
    """Run the tool execution loop.

    1. Parse tool calls from the LLM output
    2. Execute each tool
    3. Feed results back to the LLM
    4. Repeat until no tool calls or max_rounds reached
    """
    all_results: list[ToolResult] = []
    current_text = initial_text

    for round_num in range(max_rounds):
        calls = parse_tool_calls(current_text)
        if not calls:
            break

        results = execute_tools(current_text, registry)
        all_results.extend(results)

        tool_feedback = "\n".join(
            f"[TOOL_RESULT: {r.name}({'success' if r.success else 'error'})] {r.output or r.error}"
            for r in results
        )

        messages.append({"role": "assistant", "content": current_text})
        messages.append({"role": "user", "content": f"Tool results:\n{tool_feedback}\n\nContinue with the tool results."})

        response = await bus.complete(role="base", messages=messages, max_tokens=256, temperature=0.5)
        current_text = response.get("content", "")

    return current_text, all_results


async def enhanced_tool_loop(
    initial_text: str,
    registry: Any,
    bus: Any,
    messages: list[dict[str, str]],
    max_rounds: int = 5,
    use_native: bool = True,
    skill_creator: Any = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Enhanced tool execution loop with native Ollama support and parallel execution.

    1. Try native Ollama tool calls first (if bus supports it)
    2. Fall back to [TOOL: name(args)] text parsing
    3. Execute independent tool calls in parallel
    4. Feed results back to the LLM
    5. Repeat until no tool calls or max_rounds reached
    """
    import asyncio as _asyncio
    import json as _json

    all_results: list[dict[str, Any]] = []
    current_text = initial_text

    enhanced_registry = None
    if hasattr(registry, "parse_native_tool_calls"):
        enhanced_registry = registry
    elif hasattr(registry, "_schemas"):
        enhanced_registry = registry

    for round_num in range(max_rounds):
        calls: list[tuple[str, dict[str, Any]]] = []

        if use_native and enhanced_registry and hasattr(bus, "complete_with_tools"):
            try:
                tools = enhanced_registry.get_ollama_tools() if hasattr(enhanced_registry, "get_ollama_tools") else []
                response = await bus.complete_with_tools(
                    role="base",
                    messages=messages,
                    tools=tools,
                    max_tokens=512,
                    temperature=0.5,
                )
                current_text = response.get("content", "")
                calls = enhanced_registry.parse_native_tool_calls(response)
            except Exception:
                use_native = False
                calls = []

        if not calls:
            text_calls = parse_tool_calls(current_text)
            for name, args_str in text_calls:
                try:
                    args = _json.loads(args_str) if args_str.startswith("{") else {"input": args_str}
                except _json.JSONDecodeError:
                    args = {"input": args_str}
                calls.append((name, args))

        if not calls:
            break

        if enhanced_registry and hasattr(enhanced_registry, "execute_parallel"):
            results = await enhanced_registry.execute_parallel(calls)
        else:
            results = []
            for name, args in calls:
                tool = registry.get(name)
                if tool is None:
                    results.append({"success": False, "error": f"Unknown tool: {name}", "output": ""})
                    continue
                try:
                    if hasattr(tool, "handler"):
                        output = tool.handler(args.get("input", str(args)))
                    elif hasattr(tool, "execute"):
                        output = await tool.execute(args)
                    else:
                        output = {"success": False, "error": "No handler", "output": ""}
                    if isinstance(output, dict):
                        results.append(output)
                    else:
                        results.append({"success": True, "output": str(output), "error": ""})
                except Exception as e:
                    results.append({"success": False, "error": str(e), "output": ""})

        for (name, args), result in zip(calls, results):
            result["tool_name"] = name
            result["args"] = args
            all_results.append(result)
            if skill_creator:
                try:
                    _asyncio.create_task(
                        skill_creator.record_tool_call(
                            tool_name=name,
                            task_type=args.get("task_type", "general"),
                            success=result.get("success", False),
                            error=result.get("error", ""),
                        )
                    )
                except Exception:
                    pass

        tool_feedback = "\n".join(
            f"[TOOL_RESULT: {r.get('tool_name', '?')}({'success' if r.get('success') else 'error'})] "
            f"{r.get('output', '') or r.get('error', '')}"
            for r in results
        )

        messages.append({"role": "assistant", "content": current_text})
        messages.append({"role": "user", "content": f"Tool results:\n{tool_feedback}\n\nContinue with the tool results."})

        response = await bus.complete(role="base", messages=messages, max_tokens=256, temperature=0.5)
        current_text = response.get("content", "")

    return current_text, all_results
