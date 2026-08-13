"""File agent — secure file system operations within a project workspace.

All file operations are sandboxed to the workspace root. Path traversal
attacks are prevented by resolving and checking that the path stays within
the workspace. Command execution is limited to an allowlist.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_ALLOWED_COMMANDS = [
    "pip", "python", "python3", "npm", "node", "npx", "yarn", "pnpm",
    "cargo", "go", "git", "make", "cmake", "rustc", "gcc", "g++",
    "clang", "clang++", "javac", "java", "dotnet", "mvn", "gradle",
    "ruff", "mypy", "pytest", "eslint", "prettier", "black", "isort",
    "tsc", "webpack", "vite", "rollup", "esbuild",
]


class FileAgent:
    """Secure file system operations within a workspace."""

    def __init__(
        self,
        workspace_root: str | Path,
        allowed_commands: list[str] | None = None,
    ) -> None:
        self.workspace_root = Path(os.path.expanduser(str(workspace_root)))
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.allowed_commands = set(allowed_commands or DEFAULT_ALLOWED_COMMANDS)

    def _safe_path(self, relative_path: str) -> Path:
        """Resolve a path and verify it's within the workspace root."""
        if not relative_path:
            raise ValueError("Empty path")
        full = (self.workspace_root / relative_path).resolve()
        try:
            full.relative_to(self.workspace_root)
        except ValueError:
            raise ValueError(f"Path traversal detected: {relative_path}")
        return full

    async def create_file(self, path: str, content: str) -> dict[str, Any]:
        """Create a file with the given content."""
        def _write():
            safe = self._safe_path(path)
            safe.parent.mkdir(parents=True, exist_ok=True)
            safe.write_text(content, encoding="utf-8")
            return safe.stat().st_size

        size = await asyncio.to_thread(_write)
        return {"status": "ok", "path": path, "size_bytes": size}

    async def read_file(self, path: str) -> dict[str, Any]:
        """Read a file's content."""
        def _read():
            safe = self._safe_path(path)
            if not safe.exists():
                raise FileNotFoundError(f"File not found: {path}")
            return safe.read_text(encoding="utf-8")

        try:
            content = await asyncio.to_thread(_read)
            return {"status": "ok", "path": path, "content": content}
        except FileNotFoundError as e:
            return {"status": "error", "error": str(e)}

    async def update_file(self, path: str, content: str, mode: str = "replace") -> dict[str, Any]:
        """Update a file — replace, append, or prepend."""
        def _update():
            safe = self._safe_path(path)
            if not safe.exists():
                raise FileNotFoundError(f"File not found: {path}")
            if mode == "append":
                existing = safe.read_text(encoding="utf-8")
                safe.write_text(existing + content, encoding="utf-8")
            elif mode == "prepend":
                existing = safe.read_text(encoding="utf-8")
                safe.write_text(content + existing, encoding="utf-8")
            else:
                safe.write_text(content, encoding="utf-8")
            return safe.stat().st_size

        try:
            size = await asyncio.to_thread(_update)
            return {"status": "ok", "path": path, "size_bytes": size, "mode": mode}
        except FileNotFoundError as e:
            return {"status": "error", "error": str(e)}

    async def delete_file(self, path: str) -> dict[str, Any]:
        """Delete a file."""
        def _delete():
            safe = self._safe_path(path)
            if not safe.exists():
                raise FileNotFoundError(f"File not found: {path}")
            safe.unlink()
            return True

        try:
            await asyncio.to_thread(_delete)
            return {"status": "ok", "path": path, "deleted": True}
        except FileNotFoundError as e:
            return {"status": "error", "error": str(e)}

    async def create_directory(self, path: str) -> dict[str, Any]:
        """Create a directory."""
        def _mkdir():
            safe = self._safe_path(path)
            safe.mkdir(parents=True, exist_ok=True)
            return True

        await asyncio.to_thread(_mkdir)
        return {"status": "ok", "path": path}

    async def list_directory(self, path: str = ".") -> dict[str, Any]:
        """List directory contents."""
        def _list():
            safe = self._safe_path(path)
            if not safe.is_dir():
                raise NotADirectoryError(f"Not a directory: {path}")
            entries = []
            for entry in sorted(safe.iterdir()):
                entries.append({
                    "name": entry.name,
                    "type": "directory" if entry.is_dir() else "file",
                    "size": entry.stat().st_size if entry.is_file() else 0,
                })
            return entries

        try:
            entries = await asyncio.to_thread(_list)
            return {"status": "ok", "path": path, "entries": entries}
        except (NotADirectoryError, FileNotFoundError) as e:
            return {"status": "error", "error": str(e)}

    async def file_exists(self, path: str) -> dict[str, Any]:
        """Check if a file or directory exists."""
        try:
            safe = self._safe_path(path)
            exists = safe.exists()
            return {"status": "ok", "path": path, "exists": exists}
        except ValueError as e:
            return {"status": "error", "error": str(e)}

    async def run_command(self, command: str, cwd: str = "", timeout_s: int = 120) -> dict[str, Any]:
        """Run a shell command within the workspace (allowlisted commands only)."""
        cmd_parts = command.strip().split()
        if not cmd_parts:
            return {"status": "error", "error": "Empty command"}

        base_cmd = os.path.basename(cmd_parts[0])
        if base_cmd not in self.allowed_commands:
            return {
                "status": "error",
                "error": f"Command '{base_cmd}' not in allowed list: {sorted(self.allowed_commands)}",
            }

        work_dir = self._safe_path(cwd) if cwd else self.workspace_root

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                cwd=str(work_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
            return {
                "status": "ok" if proc.returncode == 0 else "error",
                "returncode": proc.returncode,
                "stdout": stdout.decode("utf-8", errors="replace")[:10000],
                "stderr": stderr.decode("utf-8", errors="replace")[:5000],
            }
        except asyncio.TimeoutError:
            proc.kill()
            return {"status": "error", "error": f"Command timed out after {timeout_s}s"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_workspace_tree(self, max_depth: int = 3) -> dict[str, Any]:
        """Get a recursive listing of the workspace."""
        def _build_tree(path: Path, depth: int) -> dict[str, Any]:
            if depth > max_depth:
                return {"name": path.name, "type": "directory", "truncated": True}
            if path.is_file():
                return {"name": path.name, "type": "file", "size": path.stat().st_size}
            children = []
            for child in sorted(path.iterdir()):
                if child.name.startswith("."):
                    continue
                children.append(_build_tree(child, depth + 1))
            return {"name": path.name, "type": "directory", "children": children}

        return _build_tree(self.workspace_root, 0)
