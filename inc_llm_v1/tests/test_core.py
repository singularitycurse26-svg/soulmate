"""Tests for INC-LLM-v1 core modules."""

from __future__ import annotations

import pytest


def test_config_from_env():
    """Test that Settings can be created from env."""
    from inc_llm.config import Settings
    s = Settings.from_env()
    assert s.hardware_tier is not None
    assert s.ollama.host == "127.0.0.1"


def test_knowledge_seeds():
    """Test that knowledge seeds are loaded."""
    from inc_llm.knowledge.seeds import DOMAINS
    assert len(DOMAINS) >= 32
    for domain_id, domain in DOMAINS.items():
        assert "name" in domain
        assert "content" in domain
        assert "category" in domain


def test_tool_parsing():
    """Test tool call parsing."""
    from inc_llm.tools import parse_tool_calls
    text = "Let me search: [TOOL: search(query='hello world')]"
    calls = parse_tool_calls(text)
    assert len(calls) == 1
    assert calls[0][0] == "search"
    assert "hello world" in calls[0][1]


def test_usage_tracker():
    """Test usage tracker basic operations."""
    from inc_llm.usage import UsageTracker, UsageRecord
    import tempfile
    import os
    with tempfile.TemporaryDirectory() as tmpdir:
        tracker = UsageTracker(db_path=os.path.join(tmpdir, "test_usage.db"))
        record = UsageRecord(
            user_id="test_user", model="test-model",
            prompt_tokens=100, completion_tokens=50,
        )
        tracker.record(record)
        stats = tracker.get_user_usage("test_user")
        assert stats["prompt_tokens"] == 100
        assert stats["completion_tokens"] == 50
        assert stats["request_count"] == 1


def test_json_mode():
    """Test JSON mode enforcement."""
    from inc_llm.usage import enforce_json_mode
    assert enforce_json_mode('```json\n{"key": "value"}\n```') == '{"key": "value"}'
    assert enforce_json_mode('Some text {"key": "value"} more text') == '{"key": "value"}'


def test_conversation_branching():
    """Test conversation branching."""
    from inc_llm.usage import ConversationBranchManager
    manager = ConversationBranchManager()
    branch = manager.create_branch("user1", "branch1")
    branch.add_message("user", "hello")
    branch.add_message("assistant", "hi there")
    forked = manager.create_branch("user1", "branch2", parent_id="branch1")
    assert len(forked.messages) == 2
    assert forked.parent_id == "branch1"


def test_retry_handler():
    """Test retry handler."""
    from inc_llm.usage import RetryHandler
    handler = RetryHandler(max_retries=2, base_delay_s=0.01, max_delay_s=0.05)

    call_count = 0

    async def flaky_func():
        nonlocal call_count
        call_count += 1
        if call_count < 2:
            raise ValueError("flaky")
        return {"status": "ok"}

    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        handler.execute_with_retry(flaky_func)
    )
    assert result["status"] == "ok"
    assert call_count == 2


def test_cache():
    """Test response cache."""
    from inc_llm.cache import ResponseCache
    from inc_llm.config import CacheConfig
    import tempfile
    import os
    with tempfile.TemporaryDirectory() as tmpdir:
        config = CacheConfig(enabled=True, db_path=os.path.join(tmpdir, "test_cache.db"))
        cache = ResponseCache(config)
        cache.store("hello world", "hi there", model="test")
        result = cache.lookup("hello world")
        assert result is not None
        assert result["response"] == "hi there"
