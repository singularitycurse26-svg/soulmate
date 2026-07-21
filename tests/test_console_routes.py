"""Tests for web console API routes."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from fable_mythos.api.console_routes import create_console_router
from fable_mythos.config import Settings
from fable_mythos.hooks.fail_streak import FailStreakHook
from fable_mythos.hooks.session_end import SessionEndHook
from fable_mythos.memory.manager import MemoryManager
from fable_mythos.memory.profiles import ProfileManager
from fable_mythos.providers.bus import ModelBus
from fable_mythos.providers.deterministic import DeterministicProvider
from fable_mythos.rml.engine import RMLEngine
from fable_mythos.skills.skill_manager import SkillManager


@pytest.fixture
def client(tmp_path):
    settings = Settings()
    settings.memory.episodic_db_path = str(tmp_path / "episodes.db")
    settings.memory.chroma_db_path = str(tmp_path / "chroma")
    settings.memory.profiles_dir = str(tmp_path / "profiles")
    settings.rml.preferences_path = str(tmp_path / "rml.json")

    bus = ModelBus(provider=DeterministicProvider(), models=settings.models)
    memory = MemoryManager(settings=settings, bus=bus)
    skill_manager = SkillManager(memory)
    rml = RMLEngine(settings.rml)
    profiles = ProfileManager(profiles_dir=tmp_path / "profiles")
    session_end = SessionEndHook()
    fail_streak = FailStreakHook()

    app = FastAPI()
    router = create_console_router(
        memory_manager=memory,
        skill_manager=skill_manager,
        rml_engine=rml,
        profile_manager=profiles,
        session_end_hook=session_end,
        fail_streak_hook=fail_streak,
    )
    app.include_router(router)

    return TestClient(app), memory, skill_manager, rml, profiles


class TestConsoleRoutes:
    def test_memory_state(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/state")
        assert resp.status_code == 200
        data = resp.json()
        assert "working" in data
        assert "episodic" in data
        assert "semantic" in data
        assert "graph" in data

    def test_list_episodes_empty(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/episodes")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] == 0

    def test_search_episodes(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/episodes/search?q=test")
        assert resp.status_code == 200
        data = resp.json()
        assert "query" in data

    def test_graph_stats(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/graph")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_nodes" in data
        assert "total_edges" in data

    def test_graph_nodes(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/graph/nodes")
        assert resp.status_code == 200
        data = resp.json()
        assert "nodes" in data

    def test_graph_nodes_filtered(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/memory/graph/nodes?node_type=skill")
        assert resp.status_code == 200

    def test_graph_traverse(self, client):
        c, memory, _, _, _ = client
        # Add a node to traverse
        memory.graph.add_node("test:1", "fact", "Test fact")
        resp = c.get("/v1/memory/graph/traverse/test:1?max_depth=1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["start_node"] == "test:1"

    def test_get_skill_not_found(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/skills/nonexistent")
        assert resp.status_code == 404

    def test_create_and_get_skill(self, client):
        c, _, _, _, _ = client
        # Create
        resp = c.post("/v1/skills", json={
            "name": "test-skill",
            "description": "Test description",
            "content": "## Test",
            "category": "coding",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "test-skill"

        # Get
        resp = c.get("/v1/skills/test-skill")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "test-skill"
        assert data["content"] == "## Test"

    def test_delete_skill(self, client):
        c, _, _, _, _ = client
        # Create first
        c.post("/v1/skills", json={
            "name": "delme",
            "description": "Delete me",
            "content": "## Bye",
        })
        # Delete
        resp = c.delete("/v1/skills/delme")
        assert resp.status_code == 200
        # Verify gone
        resp = c.get("/v1/skills/delme")
        assert resp.status_code == 404

    def test_list_profiles(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/profiles")
        assert resp.status_code == 200
        data = resp.json()
        assert "profiles" in data
        assert "active" in data

    def test_switch_profile(self, client):
        c, _, _, _, _ = client
        resp = c.post("/v1/profiles/switch?name=work")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active"] == "work"

    def test_rml_stats(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/rml")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data

    def test_rml_reset(self, client):
        c, _, _, _, _ = client
        resp = c.post("/v1/rml/reset")
        assert resp.status_code == 200
        assert resp.json()["reset"] is True

    def test_hook_stats(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/hooks")
        assert resp.status_code == 200
        data = resp.json()
        assert "fail_streak" in data
        assert "session_end" in data

    def test_console_page(self, client):
        c, _, _, _, _ = client
        resp = c.get("/v1/console")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        assert "Fable-Mythos" in resp.text
