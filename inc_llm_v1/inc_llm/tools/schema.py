"""Tool schema — structured tool definitions for Ollama native function calling.

Defines ToolSchema and ToolParameter dataclasses that describe tools in a format
compatible with Ollama's native tool calling API. Each tool has a name, description,
and typed parameters with validation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable


@dataclass
class ToolParameter:
    """A single parameter for a tool."""
    name: str
    type: str  # string, integer, number, boolean, array, object
    description: str
    required: bool = True
    default: Any = None
    enum: list[str] | None = None
    items: dict[str, Any] | None = None  # For array type

    def to_ollama_schema(self) -> dict[str, Any]:
        """Convert to Ollama function-calling JSON schema format."""
        schema: dict[str, Any] = {
            "type": self.type,
            "description": self.description,
        }
        if self.enum:
            schema["enum"] = self.enum
        if self.items and self.type == "array":
            schema["items"] = self.items
        return schema


@dataclass
class ToolSchema:
    """Structured tool definition compatible with Ollama native function calling."""
    name: str
    description: str
    parameters: list[ToolParameter] = field(default_factory=list)
    handler: Callable[..., Any] | None = None
    async_handler: Callable[..., Awaitable[Any]] | None = None
    category: str = "general"
    examples: list[str] = field(default_factory=list)

    def to_ollama_format(self) -> dict[str, Any]:
        """Convert to Ollama's tool definition format."""
        properties: dict[str, Any] = {}
        required: list[str] = []

        for param in self.parameters:
            properties[param.name] = param.to_ollama_schema()
            if param.required:
                required.append(param.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }

    def validate_args(self, args: dict[str, Any]) -> tuple[bool, str]:
        """Validate arguments against the schema."""
        for param in self.parameters:
            if param.required and param.name not in args:
                if param.default is not None:
                    args[param.name] = param.default
                else:
                    return False, f"Missing required parameter: {param.name}"

            if param.name in args:
                value = args[param.name]
                if not self._check_type(value, param.type):
                    return False, f"Parameter '{param.name}' must be {param.type}, got {type(value).__name__}"

                if param.enum and value not in param.enum:
                    return False, f"Parameter '{param.name}' must be one of {param.enum}, got '{value}'"

        return True, ""

    @staticmethod
    def _check_type(value: Any, expected_type: str) -> bool:
        type_map = {
            "string": str,
            "integer": int,
            "number": (int, float),
            "boolean": bool,
            "array": list,
            "object": dict,
        }
        expected = type_map.get(expected_type)
        if expected is None:
            return True
        if expected_type == "integer" and isinstance(value, bool):
            return False
        if expected_type == "number" and isinstance(value, bool):
            return False
        return isinstance(value, expected)

    async def execute(self, args: dict[str, Any]) -> dict[str, Any]:
        """Execute the tool with validated arguments."""
        valid, error = self.validate_args(args)
        if not valid:
            return {"success": False, "error": error, "output": ""}

        try:
            if self.async_handler:
                output = await self.async_handler(**args)
            elif self.handler:
                output = self.handler(**args)
            else:
                return {"success": False, "error": "No handler registered", "output": ""}

            if isinstance(output, dict) and "success" in output:
                return output
            return {"success": True, "output": str(output) if not isinstance(output, str) else output, "error": ""}
        except Exception as e:
            return {"success": False, "error": str(e), "output": ""}


class EnhancedToolRegistry:
    """Enhanced tool registry with schema support and parallel execution."""

    def __init__(self) -> None:
        self._schemas: dict[str, ToolSchema] = {}

    def register(self, schema: ToolSchema) -> None:
        self._schemas[schema.name] = schema

    def get(self, name: str) -> ToolSchema | None:
        return self._schemas.get(name)

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": s.name,
                "description": s.description,
                "category": s.category,
                "parameters": [
                    {"name": p.name, "type": p.type, "required": p.required, "description": p.description}
                    for p in s.parameters
                ],
            }
            for s in self._schemas.values()
        ]

    def get_ollama_tools(self) -> list[dict[str, Any]]:
        """Get all tools in Ollama native format."""
        return [s.to_ollama_format() for s in self._schemas.values()]

    def get_prompt_description(self) -> str:
        """Generate a description of available tools for the system prompt."""
        if not self._schemas:
            return ""
        lines = ["Available tools:"]
        for schema in self._schemas.values():
            params_str = ", ".join(
                f"{p.name}: {p.type}" + (" (required)" if p.required else "")
                for p in schema.parameters
            )
            lines.append(f"- {schema.name}({params_str}): {schema.description}")
        return "\n".join(lines)

    async def execute_tool(self, name: str, args: dict[str, Any]) -> dict[str, Any]:
        """Execute a single tool by name."""
        schema = self._schemas.get(name)
        if not schema:
            return {"success": False, "error": f"Unknown tool: {name}", "output": ""}
        return await schema.execute(args)

    async def execute_parallel(self, calls: list[tuple[str, dict[str, Any]]]) -> list[dict[str, Any]]:
        """Execute multiple tool calls in parallel."""
        import asyncio
        tasks = [self.execute_tool(name, args) for name, args in calls]
        return await asyncio.gather(*tasks, return_exceptions=False)

    def parse_native_tool_calls(self, response: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
        """Parse tool calls from Ollama's native function calling response."""
        calls: list[tuple[str, dict[str, Any]]] = []
        tool_calls = response.get("tool_calls", [])
        for tc in tool_calls:
            func = tc.get("function", {})
            name = func.get("name", "")
            args = func.get("arguments", {})
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            if name:
                calls.append((name, args))
        return calls
