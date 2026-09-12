"""Soulmate OS Catalog — Two-part universal memory and journaling system.

Part 1: Project Archive
  - Catalogs all projects, files, working bodies of work
  - Stores build structures, formats, and workflows for every project
  - Professional categorization with categories and subcategories
  - Status tracking (planned, in-progress, completed, archived, paused)
  - Tech stack, repo URLs, live URLs, build/test/deploy commands
  - File inventory with type and description
  - Searchable, filterable, exportable

Part 2: Agent Log
  - Logs everything AI agents, Aceline, LLMs, and chatbots do
  - Saves build structures and workflow formats agents create
  - Action types: read, write, run, navigate, build, test, deploy, clone, repair, improve
  - Result tracking: success, failure, partial
  - Duration and output capture
  - Per-agent isolation (each agent has its own log stream)

Part 3: Suggestions
  - Aceline and agents propose improvements to projects, workflows, and systems
  - Priority levels: critical, high, medium, low
  - Status: pending, approved, rejected, implemented
  - Aceline reads the best pending suggestions and asks the user for approval
    via the Aceline questions/consent system
  - Approved suggestions become tasks for Aceline to implement

Database: SQLite at ~/.inc_llm/catalog.db
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/catalog", tags=["catalog"])

# ── Config ────────────────────────────────────────────────────────────

DB_PATH = Path(os.path.expanduser("~/.inc_llm/catalog.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

PROJECT_CATEGORIES = [
    "AI/ML", "Web Application", "Mobile App", "CLI Tool", "Desktop App",
    "Browser Extension", "API/Backend", "Database", "DevOps/Infrastructure",
    "Security", "Blockchain/Crypto", "Game", "Music/Audio", "Video/Media",
    "Social/Communication", "Productivity", "Finance/Wallet", "Health/Wellness",
    "Education", "Research/Experiment", "Template/Boilerplate", "Documentation",
    "Automation/Script", "Other",
]

PROJECT_STATUSES = [
    "planned", "in-progress", "completed", "archived", "paused", "blocked",
]

AGENT_TYPES = [
    "aceline", "jarvis", "llm", "chatbot", "instance", "external_agent", "system",
]

ACTION_TYPES = [
    "read", "write", "run", "navigate", "build", "test", "deploy",
    "clone", "repair", "improve", "analyze", "plan", "verify", "communicate",
]

SUGGESTION_TYPES = [
    "improvement", "optimization", "refactor", "new_feature",
    "bug_fix", "security", "architecture", "workflow", "documentation",
]

SUGGESTION_PRIORITIES = ["critical", "high", "medium", "low"]
SUGGESTION_STATUSES = ["pending", "approved", "rejected", "implemented"]


# ── Database ──────────────────────────────────────────────────────────

def _db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    """Initialize all catalog tables."""
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS project_archive (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT DEFAULT 'Other',
                subcategory TEXT DEFAULT '',
                status TEXT DEFAULT 'planned',
                description TEXT DEFAULT '',
                repo_url TEXT DEFAULT '',
                local_path TEXT DEFAULT '',
                live_url TEXT DEFAULT '',
                build_command TEXT DEFAULT '',
                test_command TEXT DEFAULT '',
                deploy_command TEXT DEFAULT '',
                tech_stack TEXT DEFAULT '[]',
                file_inventory TEXT DEFAULT '[]',
                build_structure TEXT DEFAULT '{}',
                workflows TEXT DEFAULT '[]',
                tags TEXT DEFAULT '[]',
                metadata TEXT DEFAULT '{}',
                created_at REAL DEFAULT 0,
                updated_at REAL DEFAULT 0,
                completed_at REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS agent_log (
                id TEXT PRIMARY KEY,
                agent_type TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                action_type TEXT NOT NULL,
                target_project TEXT DEFAULT '',
                target_file TEXT DEFAULT '',
                description TEXT DEFAULT '',
                result TEXT DEFAULT 'success',
                output TEXT DEFAULT '',
                build_structure TEXT DEFAULT '{}',
                workflow_format TEXT DEFAULT '{}',
                duration_ms INTEGER DEFAULT 0,
                tags TEXT DEFAULT '[]',
                metadata TEXT DEFAULT '{}',
                timestamp REAL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS suggestions (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                target TEXT DEFAULT '',
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                priority TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                proposed_by TEXT DEFAULT 'system',
                proposed_at REAL DEFAULT 0,
                reviewed_at REAL DEFAULT 0,
                reviewed_by TEXT DEFAULT '',
                implementation_notes TEXT DEFAULT '',
                metadata TEXT DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                parent_id TEXT DEFAULT '',
                description TEXT DEFAULT '',
                color TEXT DEFAULT '#6366f1',
                icon TEXT DEFAULT 'Folder',
                sort_order INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_project_status ON project_archive(status);
            CREATE INDEX IF NOT EXISTS idx_project_category ON project_archive(category);
            CREATE INDEX IF NOT EXISTS idx_agent_log_agent ON agent_log(agent_type, agent_name);
            CREATE INDEX IF NOT EXISTS idx_agent_log_timestamp ON agent_log(timestamp);
            CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
            CREATE INDEX IF NOT EXISTS idx_suggestions_priority ON suggestions(priority);
        """)

        # Seed default categories if empty
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            for i, cat in enumerate(PROJECT_CATEGORIES):
                cat_id = f"cat_{cat.lower().replace('/', '_').replace(' ', '_')}"
                conn.execute(
                    "INSERT OR IGNORE INTO categories (id, name, description, sort_order) VALUES (?, ?, ?, ?)",
                    (cat_id, cat, f"Projects in the {cat} category", i),
                )


def _gen_id(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def _now() -> float:
    return time.time()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, default=str)


def _json_loads(value: str, default: Any = None):
    try:
        return json.loads(value) if value else (default if default is not None else [])
    except Exception:
        return default if default is not None else []


# ── Auth ──────────────────────────────────────────────────────────────

_harness = None
_settings = None


def init_catalog(harness, settings) -> None:
    """Initialize with the harness and settings from the main server."""
    global _harness, _settings
    _harness = harness
    _settings = settings
    _init_db()
    _auto_scan_projects()


def _auth(authorization: str = "", x_catalog_key: str = "") -> dict[str, Any]:
    """Authenticate via incllmv2 token or auto-auth local."""
    key = ""
    if authorization:
        key = authorization.replace("Bearer ", "").strip()
    elif x_catalog_key:
        key = x_catalog_key.strip()

    if _harness and key:
        user = _harness.auth.verify_token(key)
        if user:
            return {"user_id": user["user_id"], "name": "founder",
                    "is_owner": True, "free_access": True}

    if _harness and _settings:
        result = _harness.auth.authenticate_password(_settings.auth.secret_password)
        if result.get("status") == "ok":
            return {"user_id": result["user_id"], "name": "founder",
                    "is_owner": True, "free_access": True}

    raise HTTPException(401, "Authentication required")


# ── Auto-Scan ─────────────────────────────────────────────────────────

def _detect_tech_stack(project_path: Path) -> list[str]:
    """Detect tech stack from project files."""
    stack = []
    checks = [
        ("package.json", "Node.js/TypeScript"),
        ("frontend/package.json", "React/Vite"),
        ("requirements.txt", "Python"),
        ("pyproject.toml", "Python"),
        ("Cargo.toml", "Rust"),
        ("go.mod", "Go"),
        ("pom.xml", "Java/Maven"),
        ("build.gradle", "Java/Gradle"),
        ("Dockerfile", "Docker"),
        ("docker-compose.yml", "Docker Compose"),
        (".github/workflows", "GitHub Actions"),
        ("manifest.json", "Browser Extension"),
        ("index.html", "HTML/Web"),
    ]
    for marker, label in checks:
        if (project_path / marker).exists():
            if label not in stack:
                stack.append(label)
    return stack


def _detect_build_commands(project_path: Path) -> dict[str, str]:
    """Detect build, test, deploy commands from project files."""
    cmds = {"build": "", "test": "", "deploy": ""}
    pkg = project_path / "package.json"
    if pkg.exists():
        try:
            pkg_data = _json_loads(pkg.read_text(encoding="utf-8"), {})
            scripts = pkg_data.get("scripts", {})
            if "build" in scripts:
                cmds["build"] = f"npm run build"
            if "test" in scripts:
                cmds["test"] = f"npm test"
            if "dev" in scripts and not cmds["build"]:
                cmds["build"] = f"npm run dev"
        except Exception:
            pass

    req = project_path / "requirements.txt"
    if req.exists() and not cmds["test"]:
        cmds["test"] = "python -m pytest"

    return cmds


def _scan_file_inventory(project_path: Path, max_depth: int = 2) -> list[dict]:
    """Build a lightweight file inventory of key project files."""
    inventory = []
    key_files = [
        "package.json", "requirements.txt", "pyproject.toml", "Cargo.toml",
        "README.md", "Dockerfile", "docker-compose.yml", ".env.example",
        "tsconfig.json", "vite.config.ts", "tailwind.config.js",
        "manifest.json", "setup.py", "Makefile",
    ]
    for kf in key_files:
        fp = project_path / kf
        if fp.exists():
            inventory.append({
                "path": kf,
                "type": "config",
                "size": fp.stat().st_size,
            })

    # Count directories at top level
    try:
        for item in project_path.iterdir():
            if item.name.startswith(".") and item.name not in (".github", ".devin"):
                continue
            if item.is_dir() and not any(item.name == n for n in ("node_modules", "__pycache__", ".git", "dist", "build", ".venv")):
                inventory.append({
                    "path": item.name + "/",
                    "type": "directory",
                    "size": 0,
                })
    except Exception:
        pass

    return inventory[:50]  # cap


def _auto_scan_projects():
    """Auto-scan CascadeProjects directory and catalog existing projects."""
    scan_paths = [
        Path(os.path.expanduser("~/CascadeProjects")),
        Path("C:/Users/hawpe/CascadeProjects"),
    ]

    scanned = 0
    for scan_path in scan_paths:
        if not scan_path.exists() or not scan_path.is_dir():
            continue
        for item in scan_path.iterdir():
            if not item.is_dir():
                continue
            if item.name.startswith(".") or item.name in ("node_modules", "__pycache__"):
                continue
            # Check if already cataloged
            with _db() as conn:
                existing = conn.execute(
                    "SELECT id FROM project_archive WHERE local_path = ?",
                    (str(item),),
                ).fetchone()
            if existing:
                # Update existing entry
                _update_scanned_project(item, existing["id"])
                continue

            # Create new entry
            _create_scanned_project(item)
            scanned += 1

    if scanned > 0:
        logger.info("Catalog auto-scanned %d new projects", scanned)


def _create_scanned_project(project_path: Path):
    """Create a catalog entry for a scanned project."""
    name = project_path.name
    tech_stack = _detect_tech_stack(project_path)
    build_cmds = _detect_build_commands(project_path)
    file_inv = _scan_file_inventory(project_path)

    # Try to read README for description
    description = ""
    for readme in ["README.md", "readme.md", "README.txt", "README"]:
        rp = project_path / readme
        if rp.exists():
            try:
                content = rp.read_text(encoding="utf-8")
                description = content[:500]
            except Exception:
                pass
            break

    # Detect category from tech stack and name
    category = _infer_category(name, tech_stack)

    # Detect repo URL from git
    repo_url = ""
    git_config = project_path / ".git" / "config"
    if git_config.exists():
        try:
            content = git_config.read_text(encoding="utf-8")
            for line in content.split("\n"):
                if "url =" in line and "github.com" in line:
                    repo_url = line.split("url =")[1].strip()
                    break
        except Exception:
            pass

    pid = _gen_id("proj")
    now = _now()

    with _db() as conn:
        conn.execute(
            """INSERT INTO project_archive
               (id, name, category, status, description, repo_url, local_path,
                build_command, test_command, tech_stack, file_inventory,
                build_structure, created_at, updated_at)
               VALUES (?, ?, ?, 'in-progress', ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)""",
            (pid, name, category, description, repo_url, str(project_path),
             build_cmds["build"], build_cmds["test"], _json_dumps(tech_stack),
             _json_dumps(file_inv), now, now),
        )


def _update_scanned_project(project_path: Path, pid: str):
    """Update an existing catalog entry with fresh scan data."""
    tech_stack = _detect_tech_stack(project_path)
    build_cmds = _detect_build_commands(project_path)
    file_inv = _scan_file_inventory(project_path)

    with _db() as conn:
        conn.execute(
            """UPDATE project_archive
               SET tech_stack = ?, file_inventory = ?,
                   build_command = ?, test_command = ?, updated_at = ?
               WHERE id = ?""",
            (_json_dumps(tech_stack), _json_dumps(file_inv),
             build_cmds["build"], build_cmds["test"], _now(), pid),
        )


def _infer_category(name: str, tech_stack: list[str]) -> str:
    """Infer project category from name and tech stack."""
    name_lower = name.lower()
    if "soulmate" in name_lower:
        return "Web Application"
    if "aceline" in name_lower:
        return "AI/ML"
    if "radio" in name_lower or "music" in name_lower or "frequency" in name_lower:
        return "Music/Audio"
    if "wallet" in name_lower or "incentive" in name_lower or "crypto" in name_lower:
        return "Blockchain/Crypto"
    if "extension" in name_lower:
        return "Browser Extension"
    if "cli" in name_lower:
        return "CLI Tool"
    if "api" in name_lower or "backend" in name_lower:
        return "API/Backend"
    if any("React" in t for t in tech_stack):
        return "Web Application"
    if any("Python" in t for t in tech_stack):
        return "Automation/Script"
    return "Other"


# ── Pydantic Models ──────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    category: str = "Other"
    subcategory: str = ""
    status: str = "planned"
    description: str = ""
    repo_url: str = ""
    local_path: str = ""
    live_url: str = ""
    build_command: str = ""
    test_command: str = ""
    deploy_command: str = ""
    tech_stack: list[str] = []
    file_inventory: list[dict] = []
    build_structure: dict = {}
    workflows: list[dict] = []
    tags: list[str] = []


class ProjectUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    subcategory: str | None = None
    status: str | None = None
    description: str | None = None
    repo_url: str | None = None
    local_path: str | None = None
    live_url: str | None = None
    build_command: str | None = None
    test_command: str | None = None
    deploy_command: str | None = None
    tech_stack: list[str] | None = None
    file_inventory: list[dict] | None = None
    build_structure: dict | None = None
    workflows: list[dict] | None = None
    tags: list[str] | None = None


class AgentLogCreate(BaseModel):
    agent_type: str = "aceline"
    agent_name: str = "aceline"
    action_type: str = "read"
    target_project: str = ""
    target_file: str = ""
    description: str = ""
    result: str = "success"
    output: str = ""
    build_structure: dict = {}
    workflow_format: dict = {}
    duration_ms: int = 0
    tags: list[str] = []


class SuggestionCreate(BaseModel):
    type: str = "improvement"
    target: str = ""
    title: str
    description: str = ""
    priority: str = "medium"
    proposed_by: str = "aceline"


class SuggestionReview(BaseModel):
    status: str  # approved or rejected
    reviewed_by: str = "founder"
    implementation_notes: str = ""


# ── Project Archive Endpoints ────────────────────────────────────────

@router.post("/projects")
async def create_project(
    req: ProjectCreate,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Create a new project in the archive."""
    _auth(authorization, x_catalog_key)
    pid = _gen_id("proj")
    now = _now()
    with _db() as conn:
        conn.execute(
            """INSERT INTO project_archive
               (id, name, category, subcategory, status, description, repo_url,
                local_path, live_url, build_command, test_command, deploy_command,
                tech_stack, file_inventory, build_structure, workflows, tags,
                metadata, created_at, updated_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, 0)""",
            (pid, req.name, req.category, req.subcategory, req.status,
             req.description, req.repo_url, req.local_path, req.live_url,
             req.build_command, req.test_command, req.deploy_command,
             _json_dumps(req.tech_stack), _json_dumps(req.file_inventory),
             _json_dumps(req.build_structure), _json_dumps(req.workflows),
             _json_dumps(req.tags), now, now),
        )
    return {"id": pid, "status": "created"}


@router.get("/projects")
async def list_projects(
    status: str = "",
    category: str = "",
    search: str = "",
    limit: int = 100,
    offset: int = 0,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """List projects with optional filters."""
    _auth(authorization, x_catalog_key)
    query = "SELECT * FROM project_archive WHERE 1=1"
    params: list[Any] = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if category:
        query += " AND category = ?"
        params.append(category)
    if search:
        query += " AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
    query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) FROM project_archive WHERE 1=1"
            + (" AND status = ?" if status else "")
            + (" AND category = ?" if category else ""),
            [p for p in [status, category] if p],
        ).fetchone()[0]

    projects = []
    for row in rows:
        p = dict(row)
        p["tech_stack"] = _json_loads(p["tech_stack"])
        p["file_inventory"] = _json_loads(p["file_inventory"])
        p["build_structure"] = _json_loads(p["build_structure"], {})
        p["workflows"] = _json_loads(p["workflows"])
        p["tags"] = _json_loads(p["tags"])
        p["metadata"] = _json_loads(p["metadata"], {})
        projects.append(p)

    return {"projects": projects, "total": total, "limit": limit, "offset": offset}


@router.get("/projects/{pid}")
async def get_project(
    pid: str,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Get a single project by ID."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        row = conn.execute("SELECT * FROM project_archive WHERE id = ?", (pid,)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found")
    p = dict(row)
    p["tech_stack"] = _json_loads(p["tech_stack"])
    p["file_inventory"] = _json_loads(p["file_inventory"])
    p["build_structure"] = _json_loads(p["build_structure"], {})
    p["workflows"] = _json_loads(p["workflows"])
    p["tags"] = _json_loads(p["tags"])
    p["metadata"] = _json_loads(p["metadata"], {})
    return p


@router.patch("/projects/{pid}")
async def update_project(
    pid: str,
    req: ProjectUpdate,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Update a project."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        row = conn.execute("SELECT * FROM project_archive WHERE id = ?", (pid,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")

        updates = []
        params = []
        for field, value in req.dict(exclude_none=True).items():
            if field in ("tech_stack", "file_inventory", "build_structure", "workflows", "tags"):
                updates.append(f"{field} = ?")
                params.append(_json_dumps(value))
            else:
                updates.append(f"{field} = ?")
                params.append(value)

        if req.status == "completed" and not row["completed_at"]:
            updates.append("completed_at = ?")
            params.append(_now())

        updates.append("updated_at = ?")
        params.append(_now())
        params.append(pid)

        conn.execute(
            f"UPDATE project_archive SET {', '.join(updates)} WHERE id = ?",
            params,
        )
    return {"id": pid, "status": "updated"}


@router.delete("/projects/{pid}")
async def delete_project(
    pid: str,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Delete a project from the archive."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        row = conn.execute("SELECT * FROM project_archive WHERE id = ?", (pid,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        conn.execute("DELETE FROM project_archive WHERE id = ?", (pid,))
    return {"id": pid, "status": "deleted"}


@router.post("/projects/scan")
async def rescan_projects(
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Manually trigger a rescan of the projects directory."""
    _auth(authorization, x_catalog_key)
    _auto_scan_projects()
    with _db() as conn:
        count = conn.execute("SELECT COUNT(*) FROM project_archive").fetchone()[0]
    return {"status": "scanned", "total_projects": count}


# ── Agent Log Endpoints ──────────────────────────────────────────────

@router.post("/agents/log")
async def create_agent_log(
    req: AgentLogCreate,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Log an action by an AI agent, Aceline, LLM, or chatbot."""
    _auth(authorization, x_catalog_key)
    log_id = _gen_id("log")
    now = _now()
    with _db() as conn:
        conn.execute(
            """INSERT INTO agent_log
               (id, agent_type, agent_name, action_type, target_project, target_file,
                description, result, output, build_structure, workflow_format,
                duration_ms, tags, metadata, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)""",
            (log_id, req.agent_type, req.agent_name, req.action_type,
             req.target_project, req.target_file, req.description, req.result,
             req.output[:4000], _json_dumps(req.build_structure),
             _json_dumps(req.workflow_format), req.duration_ms,
             _json_dumps(req.tags), now),
        )
    return {"id": log_id, "status": "logged", "timestamp": now}


@router.get("/agents/log")
async def list_agent_log(
    agent_type: str = "",
    agent_name: str = "",
    action_type: str = "",
    target_project: str = "",
    result: str = "",
    limit: int = 100,
    offset: int = 0,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """List agent log entries with optional filters."""
    _auth(authorization, x_catalog_key)
    query = "SELECT * FROM agent_log WHERE 1=1"
    params: list[Any] = []
    if agent_type:
        query += " AND agent_type = ?"
        params.append(agent_type)
    if agent_name:
        query += " AND agent_name = ?"
        params.append(agent_name)
    if action_type:
        query += " AND action_type = ?"
        params.append(action_type)
    if target_project:
        query += " AND target_project = ?"
        params.append(target_project)
    if result:
        query += " AND result = ?"
        params.append(result)
    query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM agent_log").fetchone()[0]

    logs = []
    for row in rows:
        l = dict(row)
        l["build_structure"] = _json_loads(l["build_structure"], {})
        l["workflow_format"] = _json_loads(l["workflow_format"], {})
        l["tags"] = _json_loads(l["tags"])
        l["metadata"] = _json_loads(l["metadata"], {})
        logs.append(l)

    return {"logs": logs, "total": total, "limit": limit, "offset": offset}


@router.get("/agents/log/{log_id}")
async def get_agent_log(
    log_id: str,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Get a single agent log entry."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        row = conn.execute("SELECT * FROM agent_log WHERE id = ?", (log_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Log entry not found")
    l = dict(row)
    l["build_structure"] = _json_loads(l["build_structure"], {})
    l["workflow_format"] = _json_loads(l["workflow_format"], {})
    l["tags"] = _json_loads(l["tags"])
    l["metadata"] = _json_loads(l["metadata"], {})
    return l


@router.get("/agents/stats")
async def agent_stats(
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Get aggregate stats about agent activity."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        total = conn.execute("SELECT COUNT(*) FROM agent_log").fetchone()[0]
        by_type = conn.execute(
            "SELECT agent_type, COUNT(*) as count FROM agent_log GROUP BY agent_type"
        ).fetchall()
        by_action = conn.execute(
            "SELECT action_type, COUNT(*) as count FROM agent_log GROUP BY action_type"
        ).fetchall()
        by_result = conn.execute(
            "SELECT result, COUNT(*) as count FROM agent_log GROUP BY result"
        ).fetchall()
        recent = conn.execute(
            "SELECT COUNT(*) FROM agent_log WHERE timestamp > ?",
            (_now() - 86400,),
        ).fetchone()[0]

    return {
        "total_logs": total,
        "last_24h": recent,
        "by_agent_type": {r["agent_type"]: r["count"] for r in by_type},
        "by_action_type": {r["action_type"]: r["count"] for r in by_action},
        "by_result": {r["result"]: r["count"] for r in by_result},
    }


# ── Suggestions Endpoints ────────────────────────────────────────────

@router.post("/suggestions")
async def create_suggestion(
    req: SuggestionCreate,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Create a new improvement suggestion."""
    _auth(authorization, x_catalog_key)
    sid = _gen_id("sug")
    now = _now()
    with _db() as conn:
        conn.execute(
            """INSERT INTO suggestions
               (id, type, target, title, description, priority, status,
                proposed_by, proposed_at, metadata)
               VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, '{}')""",
            (sid, req.type, req.target, req.title, req.description,
             req.priority, req.proposed_by, now),
        )
    return {"id": sid, "status": "created", "timestamp": now}


@router.get("/suggestions")
async def list_suggestions(
    status: str = "",
    priority: str = "",
    target: str = "",
    limit: int = 100,
    offset: int = 0,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """List suggestions with optional filters."""
    _auth(authorization, x_catalog_key)
    query = "SELECT * FROM suggestions WHERE 1=1"
    params: list[Any] = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    if target:
        query += " AND target LIKE ?"
        params.append(f"%{target}%")
    query += " ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, proposed_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with _db() as conn:
        rows = conn.execute(query, params).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM suggestions" + (" WHERE status = ?" if status else ""), [status] if status else []).fetchone()[0]

    suggestions = [dict(row) for row in rows]
    for s in suggestions:
        s["metadata"] = _json_loads(s["metadata"], {})

    return {"suggestions": suggestions, "total": total, "limit": limit, "offset": offset}


@router.get("/suggestions/pending")
async def pending_suggestions(
    limit: int = 10,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Get the best pending suggestions for Aceline to review and ask the user about."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        rows = conn.execute(
            """SELECT * FROM suggestions WHERE status = 'pending'
               ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1
               WHEN 'medium' THEN 2 ELSE 3 END, proposed_at DESC LIMIT ?""",
            (limit,),
        ).fetchall()
    suggestions = [dict(row) for row in rows]
    for s in suggestions:
        s["metadata"] = _json_loads(s["metadata"], {})
    return {"suggestions": suggestions, "count": len(suggestions)}


@router.patch("/suggestions/{sid}")
async def review_suggestion(
    sid: str,
    req: SuggestionReview,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Approve or reject a suggestion."""
    _auth(authorization, x_catalog_key)
    if req.status not in ("approved", "rejected", "implemented"):
        raise HTTPException(400, "Status must be approved, rejected, or implemented")
    with _db() as conn:
        row = conn.execute("SELECT * FROM suggestions WHERE id = ?", (sid,)).fetchone()
        if not row:
            raise HTTPException(404, "Suggestion not found")
        conn.execute(
            """UPDATE suggestions SET status = ?, reviewed_at = ?, reviewed_by = ?,
               implementation_notes = ? WHERE id = ?""",
            (req.status, _now(), req.reviewed_by, req.implementation_notes, sid),
        )
    return {"id": sid, "status": req.status}


@router.delete("/suggestions/{sid}")
async def delete_suggestion(
    sid: str,
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Delete a suggestion."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        row = conn.execute("SELECT * FROM suggestions WHERE id = ?", (sid,)).fetchone()
        if not row:
            raise HTTPException(404, "Suggestion not found")
        conn.execute("DELETE FROM suggestions WHERE id = ?", (sid,))
    return {"id": sid, "status": "deleted"}


# ── Categories Endpoints ─────────────────────────────────────────────

@router.get("/categories")
async def list_categories(
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """List all project categories."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        rows = conn.execute("SELECT * FROM categories ORDER BY sort_order").fetchall()
        # Count projects per category
        counts = conn.execute(
            "SELECT category, COUNT(*) as count FROM project_archive GROUP BY category"
        ).fetchall()
    count_map = {r["category"]: r["count"] for r in counts}
    categories = [dict(row) for row in rows]
    for c in categories:
        c["project_count"] = count_map.get(c["name"], 0)
    return {"categories": categories}


# ── Catalog Stats ────────────────────────────────────────────────────

@router.get("/stats")
async def catalog_stats(
    authorization: str = Header(""),
    x_catalog_key: str = Header("", alias="X-Catalog-Key"),
):
    """Get overall catalog statistics."""
    _auth(authorization, x_catalog_key)
    with _db() as conn:
        project_total = conn.execute("SELECT COUNT(*) FROM project_archive").fetchone()[0]
        project_by_status = conn.execute(
            "SELECT status, COUNT(*) as count FROM project_archive GROUP BY status"
        ).fetchall()
        project_by_category = conn.execute(
            "SELECT category, COUNT(*) as count FROM project_archive GROUP BY category"
        ).fetchall()
        agent_log_total = conn.execute("SELECT COUNT(*) FROM agent_log").fetchone()[0]
        suggestions_pending = conn.execute(
            "SELECT COUNT(*) FROM suggestions WHERE status = 'pending'"
        ).fetchone()[0]
        suggestions_approved = conn.execute(
            "SELECT COUNT(*) FROM suggestions WHERE status = 'approved'"
        ).fetchone()[0]
        suggestions_implemented = conn.execute(
            "SELECT COUNT(*) FROM suggestions WHERE status = 'implemented'"
        ).fetchone()[0]

    return {
        "projects": {
            "total": project_total,
            "by_status": {r["status"]: r["count"] for r in project_by_status},
            "by_category": {r["category"]: r["count"] for r in project_by_category},
        },
        "agent_log": {
            "total": agent_log_total,
        },
        "suggestions": {
            "pending": suggestions_pending,
            "approved": suggestions_approved,
            "implemented": suggestions_implemented,
        },
    }


# ── Docs ─────────────────────────────────────────────────────────────

@router.get("/docs")
async def catalog_docs():
    """Full API documentation for the catalog system."""
    return {
        "name": "Soulmate OS Catalog",
        "description": "Two-part universal memory and journaling system for Soulmate OS",
        "parts": {
            "project_archive": "Catalogs all projects, files, build structures, formats, and workflows",
            "agent_log": "Logs everything AI agents, Aceline, LLMs, and chatbots do",
            "suggestions": "Improvement suggestions that Aceline reads and asks the user to approve",
        },
        "endpoints": {
            "project_archive": {
                "POST /v1/catalog/projects": "Create a project",
                "GET /v1/catalog/projects": "List projects (filter by status, category, search)",
                "GET /v1/catalog/projects/{id}": "Get a project",
                "PATCH /v1/catalog/projects/{id}": "Update a project",
                "DELETE /v1/catalog/projects/{id}": "Delete a project",
                "POST /v1/catalog/projects/scan": "Rescan projects directory",
            },
            "agent_log": {
                "POST /v1/catalog/agents/log": "Log an agent action",
                "GET /v1/catalog/agents/log": "List log entries (filter by agent, action, project, result)",
                "GET /v1/catalog/agents/log/{id}": "Get a log entry",
                "GET /v1/catalog/agents/stats": "Agent activity stats",
            },
            "suggestions": {
                "POST /v1/catalog/suggestions": "Create a suggestion",
                "GET /v1/catalog/suggestions": "List suggestions (filter by status, priority, target)",
                "GET /v1/catalog/suggestions/pending": "Get best pending suggestions for Aceline to review",
                "PATCH /v1/catalog/suggestions/{id}": "Approve/reject/implement a suggestion",
                "DELETE /v1/catalog/suggestions/{id}": "Delete a suggestion",
            },
            "categories": {
                "GET /v1/catalog/categories": "List all categories with project counts",
            },
            "stats": {
                "GET /v1/catalog/stats": "Overall catalog statistics",
            },
        },
        "categories": PROJECT_CATEGORIES,
        "project_statuses": PROJECT_STATUSES,
        "agent_types": AGENT_TYPES,
        "action_types": ACTION_TYPES,
        "suggestion_types": SUGGESTION_TYPES,
        "suggestion_priorities": SUGGESTION_PRIORITIES,
    }
