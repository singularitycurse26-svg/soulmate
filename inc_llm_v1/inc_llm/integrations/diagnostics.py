"""Soulmate OS Diagnostics — Step-by-step system health checker.

Runs a comprehensive series of checks on every subsystem and returns
a detailed report so issues can be identified and fixed immediately.

Checks performed:
1.  Backend server health
2.  Frontend dev server reachability
3.  Ollama LLM service
4.  GLM 5.1 model availability
5.  SQLite databases (catalog, marketplace, biometric)
6.  Catalog system (project count, agent log, suggestions)
7.  Marketplace system (accounts, jobs, escrow)
8.  Aceline agent API (tools, health, docs)
9.  Vite proxy configuration
10. Registered API routes
11. Python module imports
12. Memory and disk usage
13. File system permissions
14. Network connectivity
15. Environment variables
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/diagnostics", tags=["diagnostics"])

_harness = None
_settings = None


def init_diagnostics(harness, settings) -> None:
    global _harness, _settings
    _harness = harness
    _settings = settings


def _check(name: str, status: str, detail: str = "", data: Any = None) -> dict:
    return {
        "name": name,
        "status": status,  # "pass", "fail", "warn"
        "detail": detail,
        "data": data,
        "timestamp": time.time(),
    }


async def _http_get(url: str, timeout: float = 5.0) -> tuple[bool, str, int]:
    """Quick HTTP GET. Returns (success, detail, status_code). Runs in a thread to avoid blocking the event loop."""
    def _do_get():
        try:
            import urllib.request
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=timeout)
            return True, f"HTTP {resp.status}", resp.status
        except Exception as e:
            return False, str(e)[:200], 0
    return await asyncio.to_thread(_do_get)


async def _http_get_json(url: str, timeout: float = 5.0) -> tuple[bool, str, any]:
    """HTTP GET that returns parsed JSON. Runs in a thread."""
    def _do_get():
        try:
            import urllib.request
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=timeout)
            return True, f"HTTP {resp.status}", json.loads(resp.read())
        except Exception as e:
            return False, str(e)[:200], None
    return await asyncio.to_thread(_do_get)


@router.get("/")
@router.get("")
async def run_diagnostics(authorization: str = Header("")):
    """Run all diagnostic checks and return a step-by-step report."""
    results: list[dict] = []
    overall_start = time.time()

    # ── Step 1: Backend server health ────────────────────────────────
    try:
        ok, detail, code = await _http_get("http://localhost:8547/v1/health")
        results.append(_check(
            "Backend Server (port 8547)",
            "pass" if ok else "fail",
            detail,
            {"port": 8547, "status_code": code},
        ))
    except Exception as e:
        results.append(_check("Backend Server (port 8547)", "fail", str(e)[:200]))

    # ── Step 2: Frontend dev server ──────────────────────────────────
    try:
        ok, detail, code = await _http_get("http://localhost:5173")
        results.append(_check(
            "Frontend Dev Server (port 5173)",
            "pass" if ok else "warn",
            detail,
            {"port": 5173, "status_code": code},
        ))
    except Exception as e:
        results.append(_check("Frontend Dev Server (port 5173)", "warn", str(e)[:200]))

    # ── Step 3: Ollama LLM service ───────────────────────────────────
    try:
        ok, detail, tags_data = await _http_get_json("http://localhost:11434/api/tags")
        if ok and tags_data:
            models = [m["name"] for m in tags_data.get("models", [])]
            results.append(_check(
                "Ollama LLM Service (port 11434)",
                "pass",
                f"{len(models)} models available",
                {"models": models},
            ))
        else:
            results.append(_check("Ollama LLM Service (port 11434)", "fail", detail))
    except Exception as e:
        results.append(_check("Ollama LLM Service (port 11434)", "fail", str(e)[:200]))

    # ── Step 4: GLM 5.1 model ────────────────────────────────────────
    try:
        ok, detail, tags_data = await _http_get_json("http://localhost:11434/api/tags")
        if ok and tags_data:
            models = [m["name"] for m in tags_data.get("models", [])]
            glm_found = any("glm" in m.lower() for m in models)
            results.append(_check(
                "GLM 5.1 Model",
                "pass" if glm_found else "warn",
                f"GLM model {'found' if glm_found else 'NOT found — run: ollama pull glm-5.1'}",
                {"glm_models": [m for m in models if "glm" in m.lower()],
                 "all_models": models},
            ))
        else:
            results.append(_check("GLM 5.1 Model", "fail", "Ollama not reachable"))
    except Exception as e:
        results.append(_check("GLM 5.1 Model", "fail", str(e)[:200]))

    # ── Step 5: SQLite databases ────────────────────────────────────
    db_paths = {
        "catalog": Path(os.path.expanduser("~/.inc_llm/catalog.db")),
        "marketplace": Path(os.path.expanduser("~/.inc_llm/marketplace.db")),
        "biometric": Path(os.path.expanduser("~/.inc_llm/biometric.db")),
    }
    for name, path in db_paths.items():
        def _check_db(p=path, n=name):
            try:
                if not p.exists():
                    return _check(f"Database: {n}", "warn", f"File not found: {p}")
                conn = sqlite3.connect(str(p))
                conn.execute("SELECT 1").fetchone()
                tables = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
                conn.close()
                return _check(
                    f"Database: {n}",
                    "pass",
                    f"{len(tables)} tables",
                    {"path": str(p), "tables": [t[0] for t in tables]},
                )
            except Exception as e:
                return _check(f"Database: {n}", "fail", str(e)[:200])
        results.append(await asyncio.to_thread(_check_db))

    # ── Step 6: Catalog system ──────────────────────────────────────
    try:
        ok, detail, stats = await _http_get_json("http://localhost:8547/v1/catalog/stats")
        if ok and stats:
            results.append(_check(
                "Catalog System",
                "pass",
                f"{stats['projects']['total']} projects, {stats['agent_log']['total']} logs, {stats['suggestions']['pending']} pending suggestions",
                stats,
            ))
        else:
            results.append(_check("Catalog System", "fail", detail))
    except Exception as e:
        results.append(_check("Catalog System", "fail", str(e)[:200]))

    # ── Step 7: Marketplace system ───────────────────────────────────
    try:
        ok, detail, stats = await _http_get_json("http://localhost:8547/v1/marketplace/stats")
        if ok and stats:
            results.append(_check(
                "Marketplace System",
                "pass",
                f"Marketplace reachable",
                stats,
            ))
        else:
            results.append(_check("Marketplace System", "warn", detail))
    except Exception as e:
        results.append(_check("Marketplace System", "warn", str(e)[:200]))

    # ── Step 8: Aceline agent API ────────────────────────────────────
    try:
        ok, detail, code = await _http_get("http://localhost:8547/v1/aceline/health")
        results.append(_check(
            "Aceline Agent API",
            "pass" if ok else "fail",
            detail,
            {"status_code": code},
        ))
    except Exception as e:
        results.append(_check("Aceline Agent API", "fail", str(e)[:200]))

    # ── Step 9: Vite proxy config ────────────────────────────────────
    try:
        vite_config = Path("C:/Users/hawpe/CascadeProjects/soulmate/frontend/vite.config.ts")
        if not vite_config.exists():
            results.append(_check("Vite Proxy Config", "warn", "vite.config.ts not found"))
        else:
            content = vite_config.read_text(encoding="utf-8")
            has_proxy = "/v1" in content and "proxy" in content.lower()
            has_local = "localhost:8547" in content
            has_remote = "191.44.121.29" in content
            if has_remote:
                results.append(_check(
                    "Vite Proxy Config",
                    "fail",
                    "Proxy target still points to dead remote IP 191.44.121.29 — should be localhost:8547",
                    {"issue": "dead_proxy_target"},
                ))
            elif has_proxy and has_local:
                results.append(_check(
                    "Vite Proxy Config",
                    "pass",
                    "Proxy configured for localhost:8547",
                ))
            else:
                results.append(_check(
                    "Vite Proxy Config",
                    "warn",
                    "Proxy config unclear — check vite.config.ts",
                ))
    except Exception as e:
        results.append(_check("Vite Proxy Config", "fail", str(e)[:200]))

    # ── Step 10: Registered API routes ───────────────────────────────
    try:
        from inc_llm.server import app as _app
        routes = []
        for route in _app.routes:
            if hasattr(route, "path"):
                routes.append({
                    "path": route.path,
                    "methods": list(route.methods) if hasattr(route, "methods") else [],
                })
        results.append(_check(
            "Registered API Routes",
            "pass",
            f"{len(routes)} routes registered",
            {"routes": routes[:20], "total": len(routes)},
        ))
    except Exception as e:
        results.append(_check("Registered API Routes", "fail", str(e)[:200]))

    # ── Step 11: Python module imports ───────────────────────────────
    modules_to_check = [
        "inc_llm.server",
        "inc_llm.harness",
        "inc_llm.integrations.catalog",
        "inc_llm.integrations.aceline_agent",
        "inc_llm.integrations.agent_marketplace",
        "inc_llm.config",
    ]
    for mod_name in modules_to_check:
        try:
            __import__(mod_name)
            results.append(_check(f"Python Module: {mod_name}", "pass", "imported"))
        except Exception as e:
            results.append(_check(f"Python Module: {mod_name}", "fail", str(e)[:200]))

    # ── Step 12: Memory and disk ─────────────────────────────────────
    try:
        import psutil
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage("C:/")
        results.append(_check(
            "System Resources",
            "pass" if mem.percent < 90 else "warn",
            f"RAM: {mem.percent}% used ({mem.available // (1024**2)}MB free), Disk: {disk.percent}% used",
            {
                "ram_percent": mem.percent,
                "ram_available_mb": mem.available // (1024**2),
                "disk_percent": disk.percent,
                "disk_free_gb": disk.free // (1024**3),
            },
        ))
    except ImportError:
        results.append(_check("System Resources", "warn", "psutil not installed"))
    except Exception as e:
        results.append(_check("System Resources", "fail", str(e)[:200]))

    # ── Step 13: File system — project directory ─────────────────────
    try:
        project_path = Path("C:/Users/hawpe/CascadeProjects/soulmate")
        key_files = ["frontend/src/App.tsx", "inc_llm_v1/inc_llm/server.py",
                      ".devin/rules/aceline-definition.md"]
        missing = [f for f in key_files if not (project_path / f).exists()]
        if missing:
            results.append(_check(
                "Project Files",
                "fail",
                f"Missing: {', '.join(missing)}",
                {"missing": missing},
            ))
        else:
            results.append(_check("Project Files", "pass", "All key files present"))
    except Exception as e:
        results.append(_check("Project Files", "fail", str(e)[:200]))

    # ── Step 14: Network — external connectivity ─────────────────────
    try:
        ok, detail, code = await _http_get("https://api.github.com", timeout=5.0)
        results.append(_check(
            "External Network",
            "pass" if ok else "warn",
            detail,
        ))
    except Exception as e:
        results.append(_check("External Network", "warn", str(e)[:200]))

    # ── Step 15: Environment variables ───────────────────────────────
    try:
        env_vars = {
            "OLLAMA_BASE_URL": os.environ.get("OLLAMA_BASE_URL", "not set"),
            "ACELINE_MODEL": os.environ.get("ACELINE_MODEL", "not set"),
            "PYTHONPATH": os.environ.get("PYTHONPATH", "not set"),
        }
        results.append(_check(
            "Environment Variables",
            "pass",
            "Environment checked",
            env_vars,
        ))
    except Exception as e:
        results.append(_check("Environment Variables", "fail", str(e)[:200]))

    # ── Summary ──────────────────────────────────────────────────────
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = sum(1 for r in results if r["status"] == "fail")
    warnings = sum(1 for r in results if r["status"] == "warn")
    overall = "healthy" if failed == 0 else ("degraded" if warnings > 0 else "unhealthy")

    return {
        "overall": overall,
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
        },
        "duration_ms": int((time.time() - overall_start) * 1000),
        "checks": results,
        "timestamp": time.time(),
    }


@router.get("/quick")
async def quick_check(authorization: str = Header("")):
    """Quick health check — just the essentials."""
    checks = {}

    # Backend
    ok, _, _ = await _http_get("http://localhost:8547/v1/health")
    checks["backend"] = "up" if ok else "down"

    # Frontend
    ok, _, _ = await _http_get("http://localhost:5173")
    checks["frontend"] = "up" if ok else "down"

    # Ollama
    ok, _, _ = await _http_get("http://localhost:11434/api/tags")
    checks["ollama"] = "up" if ok else "down"

    # Catalog
    ok, _, _ = await _http_get("http://localhost:8547/v1/catalog/stats")
    checks["catalog"] = "up" if ok else "down"

    # Aceline
    ok, _, _ = await _http_get("http://localhost:8547/v1/aceline/health")
    checks["aceline"] = "up" if ok else "down"

    all_up = all(v == "up" for v in checks.values())
    return {
        "status": "all_up" if all_up else "partial",
        "checks": checks,
        "timestamp": time.time(),
    }
