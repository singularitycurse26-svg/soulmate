"""Test Universal Memory — turn recording, recall, smart-context build."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.memory import UniversalRamm1Memory
from inc_llm.config import Ramm1Config


def test_memory_record_and_recall():
    """Test that turns are recorded and can be recalled."""
    config = Ramm1Config(
        memory_enabled=True, memory_share_turns=False,
        peer_db_path=":memory:",
    )
    memory = UniversalRamm1Memory(config)
    memory.record_turn("How do I build a FastAPI server?", "Use FastAPI() and add routes.", "success", "cli", "standard", 0.5)
    memory.record_turn("How do I deploy to Docker?", "Use a Dockerfile with FROM python:3.11.", "success", "cli", "standard", 1.2)
    results = memory.recall("FastAPI server", top_k=5)
    assert len(results) > 0, "Recall should find results"
    assert any("FastAPI" in r.get("user_msg", "") for r in results), "Recall should find the FastAPI turn"
    print("PASS: test_memory_record_and_recall")


def test_memory_search():
    """Test keyword search."""
    config = Ramm1Config(memory_enabled=True, memory_share_turns=False, peer_db_path=":memory:")
    memory = UniversalRamm1Memory(config)
    memory.record_turn("What is Python?", "Python is a programming language.", "success", "cli", "standard", 0.1)
    results = memory.search("Python")
    assert len(results) > 0, "Search should find results"
    print("PASS: test_memory_search")


def test_memory_smart_context():
    """Test get_smart_context builds a context block."""
    config = Ramm1Config(memory_enabled=True, memory_share_turns=False, peer_db_path=":memory:")
    memory = UniversalRamm1Memory(config)
    memory.record_turn("How do I use FastAPI?", "FastAPI is a web framework.", "success", "cli", "standard", 0.1)
    ctx = memory.get_smart_context("FastAPI")
    assert isinstance(ctx, str), "Smart context should be a string"
    print("PASS: test_memory_smart_context")


def test_memory_stats():
    """Test get_stats."""
    config = Ramm1Config(memory_enabled=True, memory_share_turns=False, peer_db_path=":memory:")
    memory = UniversalRamm1Memory(config)
    memory.record_turn("test", "response", "success", "cli", "standard", 0.1)
    stats = memory.get_stats()
    assert stats["turn_count"] >= 1, "Turn count should be >= 1"
    print("PASS: test_memory_stats")


if __name__ == "__main__":
    test_memory_record_and_recall()
    test_memory_search()
    test_memory_smart_context()
    test_memory_stats()
    print("\nAll Ramm1 Memory tests passed.")
