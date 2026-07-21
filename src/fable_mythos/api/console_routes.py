"""Web console API routes — memory browser, skill browser, graph visualization.

Extends the base API routes with endpoints for:
- /v1/memory/state — working/episodic/semantic/graph stats
- /v1/memory/episodes — list and search episodic memory
- /v1/memory/graph — graph nodes, edges, traversal
- /v1/skills — already exists in base routes, extended here
- /v1/skills/{name} — get full skill content
- /v1/profiles — list, switch, create, delete profiles
- /v1/rml — RML stats and reset
- /v1/hooks — hook stats
- /v1/console — serves the web console HTML
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from fable_mythos.api.schemas import SkillCreateRequest

logger = logging.getLogger(__name__)


def create_console_router(
    memory_manager: Any,
    skill_manager: Any,
    rml_engine: Any,
    profile_manager: Any,
    session_end_hook: Any,
    fail_streak_hook: Any,
) -> APIRouter:
    """Create the web console API router.

    Args:
        memory_manager: MemoryManager instance.
        skill_manager: SkillManager instance.
        rml_engine: RMLEngine instance.
        profile_manager: ProfileManager instance.
        session_end_hook: SessionEndHook instance.
        fail_streak_hook: FailStreakHook instance.

    Returns:
        APIRouter with console endpoints.
    """
    router = APIRouter(prefix="/v1", tags=["console"])

    @router.get("/memory/state")
    async def memory_state() -> dict[str, Any]:
        """Get memory system state — all 3 layers + graph."""
        usage = memory_manager.working.get_token_usage()
        return {
            "working": {
                "tokens_used": usage["total"],
                "tokens_max": usage["max"],
                "sacred_tokens": usage["sacred"],
                "compressible_tokens": usage["compressible"],
                "turns": len(memory_manager.working.turns),
            },
            "episodic": {
                "count": memory_manager.episodic.count(),
            },
            "semantic": {
                "count": memory_manager.semantic.count(),
            },
            "graph": {
                "nodes": memory_manager.graph.count_nodes(),
                "edges": memory_manager.graph.count_edges(),
            },
        }

    @router.get("/memory/episodes")
    async def list_episodes(limit: int = 20) -> dict[str, Any]:
        """List recent episodes from episodic memory."""
        episodes = memory_manager.episodic.get_recent(limit=limit)
        return {
            "episodes": [ep.as_dict() for ep in episodes],
            "count": len(episodes),
        }

    @router.get("/memory/episodes/search")
    async def search_episodes(q: str = "", top_k: int = 5) -> dict[str, Any]:
        """Search episodic memory."""
        results = memory_manager.episodic.search(q, top_k=top_k)
        return {
            "episodes": [ep.as_dict() for ep in results],
            "count": len(results),
            "query": q,
        }

    @router.get("/memory/graph")
    async def graph_stats() -> dict[str, Any]:
        """Get knowledge graph statistics."""
        node_counts: dict[str, int] = {}
        for node_type in ("fact", "episode", "skill", "decision", "trace", "file", "concept"):
            nodes = memory_manager.graph.get_nodes_by_type(node_type)
            if nodes:
                node_counts[node_type] = len(nodes)

        return {
            "total_nodes": memory_manager.graph.count_nodes(),
            "total_edges": memory_manager.graph.count_edges(),
            "nodes_by_type": node_counts,
        }

    @router.get("/memory/graph/nodes")
    async def graph_nodes(node_type: str | None = None) -> dict[str, Any]:
        """Get graph nodes, optionally filtered by type."""
        if node_type:
            nodes = memory_manager.graph.get_nodes_by_type(node_type)
        else:
            nodes = []
            for nt in ("fact", "episode", "skill", "decision", "trace", "file", "concept"):
                nodes.extend(memory_manager.graph.get_nodes_by_type(nt))

        return {
            "nodes": [
                {
                    "id": n.id,
                    "node_type": n.node_type,
                    "content": n.content,
                    "metadata": n.metadata,
                }
                for n in nodes
            ],
            "count": len(nodes),
        }

    @router.get("/memory/graph/traverse/{node_id}")
    async def graph_traverse(node_id: str, max_depth: int = 2) -> dict[str, Any]:
        """Traverse the knowledge graph from a starting node."""
        result = memory_manager.graph.traverse(node_id, max_depth=max_depth)
        return {
            "start_node": node_id,
            "max_depth": max_depth,
            "connected": {
                connected_id: [
                    {
                        "source_id": e.source_id,
                        "target_id": e.target_id,
                        "edge_type": e.edge_type,
                        "weight": e.weight,
                    }
                    for e in edges
                ]
                for connected_id, edges in result.items()
            },
            "connected_count": len(result),
        }

    @router.get("/skills/{name}")
    async def get_skill(name: str) -> dict[str, Any]:
        """Get full skill content by name."""
        result = skill_manager.read(name)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.message)
        return result.skill.as_dict()

    @router.post("/skills")
    async def create_skill(req: SkillCreateRequest) -> dict[str, Any]:
        """Create a new skill."""
        result = skill_manager.create(
            name=req.name,
            description=req.description,
            content=req.content,
            category=req.category,
        )
        if not result.success:
            raise HTTPException(status_code=400, detail=result.message)
        return result.skill.as_dict()

    @router.delete("/skills/{name}")
    async def delete_skill(name: str) -> dict[str, Any]:
        """Delete a skill."""
        result = skill_manager.delete(name)
        if not result.success:
            raise HTTPException(status_code=404, detail=result.message)
        return {"deleted": True, "name": name}

    @router.get("/profiles")
    async def list_profiles() -> dict[str, Any]:
        """List all profiles."""
        return {
            "profiles": profile_manager.list_profiles(),
            "active": profile_manager.active_profile,
        }

    @router.post("/profiles/switch")
    async def switch_profile(name: str) -> dict[str, Any]:
        """Switch to a profile."""
        profile_manager.switch_profile(name)
        return {"switched": True, "active": name}

    @router.get("/rml")
    async def rml_stats() -> dict[str, Any]:
        """Get RML statistics."""
        return rml_engine.get_stats()

    @router.post("/rml/reset")
    async def rml_reset() -> dict[str, Any]:
        """Reset RML preferences."""
        rml_engine.reset()
        return {"reset": True}

    @router.get("/hooks")
    async def hook_stats() -> dict[str, Any]:
        """Get hook statistics."""
        stats: dict[str, Any] = {}
        if fail_streak_hook:
            stats["fail_streak"] = fail_streak_hook.get_stats()
        if session_end_hook:
            stats["session_end"] = session_end_hook.get_stats()
        return stats

    @router.get("/console", response_class=HTMLResponse)
    async def console_page() -> str:
        """Serve the web console HTML page."""
        return CONSOLE_HTML

    return router


CONSOLE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fable-Mythos Console</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #e0e0e0; }
        .header { background: #16213e; padding: 1rem 2rem; border-bottom: 1px solid #0f3460; }
        .header h1 { font-size: 1.5rem; color: #e94560; }
        .header .subtitle { font-size: 0.85rem; color: #888; margin-top: 0.25rem; }
        .tabs { display: flex; gap: 0; background: #16213e; border-bottom: 1px solid #0f3460; }
        .tab { padding: 0.75rem 1.5rem; cursor: pointer; border: none; background: none; color: #888; font-size: 0.9rem; }
        .tab.active { color: #e94560; border-bottom: 2px solid #e94560; }
        .tab:hover { color: #e0e0e0; }
        .content { padding: 2rem; max-width: 1200px; margin: 0 auto; }
        .panel { display: none; }
        .panel.active { display: block; }
        .card { background: #16213e; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; }
        .card h2 { font-size: 1.1rem; color: #e94560; margin-bottom: 0.75rem; }
        .stat { display: inline-block; margin-right: 2rem; }
        .stat .value { font-size: 1.8rem; font-weight: bold; color: #e0e0e0; }
        .stat .label { font-size: 0.75rem; color: #888; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; }
        th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #0f3460; }
        th { color: #888; font-size: 0.8rem; text-transform: uppercase; }
        .badge { display: inline-block; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.75rem; }
        .badge-coding { background: #0f3460; color: #53c0ff; }
        .badge-devops { background: #3a0f3a; color: #e053ff; }
        .badge-general { background: #333; color: #aaa; }
        .search-bar { width: 100%; padding: 0.5rem 1rem; border-radius: 4px; border: 1px solid #0f3460; background: #1a1a2e; color: #e0e0e0; margin-bottom: 1rem; }
        .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; background: #e94560; color: white; font-size: 0.85rem; }
        .btn:hover { background: #c73e54; }
        #graph-canvas { width: 100%; height: 500px; border: 1px solid #0f3460; border-radius: 8px; background: #0d1117; }
        .empty { color: #666; text-align: center; padding: 2rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Fable-Mythos Console</h1>
        <div class="subtitle">3-Layer Memory &bull; Knowledge Graph &bull; Skills &bull; RML</div>
    </div>
    <div class="tabs">
        <button class="tab active" onclick="switchTab('overview')">Overview</button>
        <button class="tab" onclick="switchTab('memory')">Memory</button>
        <button class="tab" onclick="switchTab('skills')">Skills</button>
        <button class="tab" onclick="switchTab('graph')">Graph</button>
        <button class="tab" onclick="switchTab('rml')">RML</button>
    </div>
    <div class="content">
        <div id="overview" class="panel active">
            <div class="card">
                <h2>System Overview</h2>
                <div id="overview-stats">Loading...</div>
            </div>
        </div>
        <div id="memory" class="panel">
            <div class="card">
                <h2>Memory Layers</h2>
                <div id="memory-state">Loading...</div>
            </div>
            <div class="card">
                <h2>Recent Episodes</h2>
                <input class="search-bar" id="episode-search" placeholder="Search episodes..." onkeyup="searchEpisodes()">
                <div id="episodes-list">Loading...</div>
            </div>
        </div>
        <div id="skills" class="panel">
            <div class="card">
                <h2>Skills</h2>
                <input class="search-bar" id="skill-search" placeholder="Search skills..." onkeyup="searchSkills()">
                <div id="skills-list">Loading...</div>
            </div>
        </div>
        <div id="graph" class="panel">
            <div class="card">
                <h2>Knowledge Graph</h2>
                <div id="graph-stats">Loading...</div>
            </div>
            <canvas id="graph-canvas"></canvas>
        </div>
        <div id="rml" class="panel">
            <div class="card">
                <h2>RML Stats</h2>
                <div id="rml-stats">Loading...</div>
                <button class="btn" onclick="resetRML()" style="margin-top:1rem">Reset Preferences</button>
            </div>
        </div>
    </div>
    <script>
        function switchTab(name) {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.getElementById(name).classList.add('active');
            event.target.classList.add('active');
            loadTab(name);
        }
        async function api(path) {
            const res = await fetch('/v1/' + path);
            return res.json();
        }
        async function loadTab(name) {
            if (name === 'overview') { const s = await api('memory/state'); document.getElementById('overview-stats').innerHTML = formatOverview(s); }
            if (name === 'memory') { loadMemory(); }
            if (name === 'skills') { loadSkills(); }
            if (name === 'graph') { loadGraph(); }
            if (name === 'rml') { const s = await api('rml'); document.getElementById('rml-stats').innerHTML = formatRML(s); }
        }
        function formatOverview(s) {
            return `<div class="stat"><div class="value">${s.working.tokens_used}</div><div class="label">Working Tokens</div></div>` +
                   `<div class="stat"><div class="value">${s.episodic.count}</div><div class="label">Episodes</div></div>` +
                   `<div class="stat"><div class="value">${s.semantic.count}</div><div class="label">Skills</div></div>` +
                   `<div class="stat"><div class="value">${s.graph.nodes}</div><div class="label">Graph Nodes</div></div>` +
                   `<div class="stat"><div class="value">${s.graph.edges}</div><div class="label">Graph Edges</div></div>`;
        }
        async function loadMemory() {
            const s = await api('memory/state');
            document.getElementById('memory-state').innerHTML = formatOverview(s);
            const eps = await api('memory/episodes?limit=20');
            document.getElementById('episodes-list').innerHTML = formatEpisodes(eps.episodes);
        }
        function formatEpisodes(eps) {
            if (!eps || eps.length === 0) return '<div class="empty">No episodes yet</div>';
            return '<table><tr><th>Task</th><th>Success</th><th>Confidence</th><th>Skills</th></tr>' +
                eps.map(e => `<tr><td>${e.task_description||''}</td><td>${e.success?'✓':'✗'}</td><td>${(e.confidence_achieved||0).toFixed(0)}%</td><td>${(e.skills_applied||[]).join(', ')}</td></tr>`).join('') +
                '</table>';
        }
        async function searchEpisodes() {
            const q = document.getElementById('episode-search').value;
            if (!q) { loadMemory(); return; }
            const eps = await api('memory/episodes/search?q=' + encodeURIComponent(q));
            document.getElementById('episodes-list').innerHTML = formatEpisodes(eps.episodes);
        }
        async function loadSkills() {
            const skills = await api('skills');
            document.getElementById('skills-list').innerHTML = formatSkills(skills.skills || []);
        }
        function formatSkills(skills) {
            if (!skills || skills.length === 0) return '<div class="empty">No skills yet</div>';
            return '<table><tr><th>Name</th><th>Category</th><th>Description</th><th>Usage</th></tr>' +
                skills.map(s => `<tr><td>${s.name}</td><td><span class="badge badge-${s.category||'general'}">${s.category||'general'}</span></td><td>${s.description||''}</td><td>${s.usage_count||0}x</td></tr>`).join('') +
                '</table>';
        }
        async function searchSkills() {
            const q = document.getElementById('skill-search').value;
            const skills = await api('skills?q=' + encodeURIComponent(q));
            document.getElementById('skills-list').innerHTML = formatSkills(skills.skills || []);
        }
        async function loadGraph() {
            const stats = await api('memory/graph');
            document.getElementById('graph-stats').innerHTML = formatOverview({graph: stats, working:{tokens_used:0}, episodic:{count:0}, semantic:{count:0}});
        }
        function formatRML(s) {
            return `<div class="stat"><div class="value">${s.total_sessions}</div><div class="label">Sessions</div></div>` +
                   `<div class="stat"><div class="value">${(s.success_rate*100).toFixed(0)}%</div><div class="label">Success Rate</div></div>` +
                   `<div class="stat"><div class="value">${s.active_hints}</div><div class="label">Hints</div></div>` +
                   `<div class="stat"><div class="value">${s.active_adjustments}</div><div class="label">Adjustments</div></div>`;
        }
        async function resetRML() {
            await fetch('/v1/rml/reset', {method: 'POST'});
            loadTab('rml');
        }
        loadTab('overview');
    </script>
</body>
</html>"""
