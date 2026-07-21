"""Tests for episodic memory."""

from __future__ import annotations

import time

import pytest

from fable_mythos.memory.episodic import Episode, EpisodicMemory


@pytest.fixture
def episodic(tmp_path):
    return EpisodicMemory(db_path=tmp_path / "episodes.db", retention_days=90, top_k=3)


def make_episode(id: str = "ep1", task: str = "Fix timezone bug") -> Episode:
    return Episode(
        id=id,
        session_id="session-1",
        timestamp=time.time(),
        task_description=task,
        task_category="code",
        steps_taken=["read file", "edit code", "run tests"],
        tools_used=["edit", "bash"],
        execution_time_s=12.5,
        success=True,
        key_result="Timezone bug fixed by using UTC internally",
        skills_applied=["timezone-fix"],
        confidence_achieved=0.85,
    )


class TestEpisodicMemory:
    def test_store_and_get(self, episodic):
        ep = make_episode()
        episodic.store(ep)
        retrieved = episodic.get_by_id("ep1")
        assert retrieved is not None
        assert retrieved.task_description == "Fix timezone bug"
        assert retrieved.success is True

    def test_store_multiple(self, episodic):
        for i in range(5):
            ep = make_episode(id=f"ep{i}", task=f"Task {i}")
            episodic.store(ep)
        assert episodic.count() == 5

    def test_search_text(self, episodic):
        ep1 = make_episode(id="ep1", task="Fix timezone bug in Python")
        ep2 = make_episode(id="ep2", task="Deploy to production server")
        episodic.store(ep1)
        episodic.store(ep2)

        results = episodic.search("timezone")
        assert len(results) > 0
        assert any("timezone" in r.task_description.lower() for r in results)

    def test_search_no_results(self, episodic):
        results = episodic.search("nonexistent query xyz123")
        assert len(results) == 0

    def test_get_recent(self, episodic):
        for i in range(5):
            ep = make_episode(id=f"ep{i}", task=f"Task {i}")
            ep.timestamp = time.time() + i  # increasing timestamps
            episodic.store(ep)

        recent = episodic.get_recent(limit=3)
        assert len(recent) == 3
        # Most recent first (highest timestamp)
        assert recent[0].task_description == "Task 4"

    def test_cleanup_expired(self, episodic):
        # Store an old episode
        old_ep = make_episode(id="old", task="Old task")
        old_ep.timestamp = time.time() - (100 * 86400)  # 100 days ago
        episodic.store(old_ep)

        # Store a recent episode
        new_ep = make_episode(id="new", task="New task")
        episodic.store(new_ep)

        deleted = episodic.cleanup_expired()
        assert deleted == 1
        assert episodic.count() == 1
        assert episodic.get_by_id("new") is not None
        assert episodic.get_by_id("old") is None

    def test_episode_as_dict_and_from_dict(self):
        ep = make_episode()
        d = ep.as_dict()
        assert d["id"] == "ep1"
        assert d["task_description"] == "Fix timezone bug"
        assert d["success"] is True

    def test_count_empty(self, episodic):
        assert episodic.count() == 0

    def test_search_with_embedding(self, episodic):
        ep = make_episode()
        ep.embedding = [0.1] * 768
        episodic.store(ep)

        query_vec = [0.1] * 768
        results = episodic.search("timezone", query_embedding=query_vec)
        assert len(results) > 0
