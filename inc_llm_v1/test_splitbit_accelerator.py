#!/usr/bin/env python
"""Test SplitBit LLM Accelerator — all 7 internal optimizations."""

import sys
import os
import tempfile
sys.path.insert(0, ".")

from inc_llm.splitbit_accelerator import (
    SplitBitAccelerator,
    SplitBitContextPrefetcher,
    SplitBitPromptCompressor,
    SplitBitConversationCache,
    SplitBitRecursiveLinkInjector,
    SplitBitUniversalLearning,
    SplitBitAdaptiveFormatSwitcher,
    SplitBitResponseStreamDecoder,
)


def test_context_prefetcher():
    """Test 1: Context prefetching — pre-encode conversation turns."""
    print("\n=== 1. Context Prefetcher Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_prefetch_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    # Simulate conversation turns
    accel.prefetcher.prefetch_turn("sess-1", "user", "Hello, how are you?")
    accel.prefetcher.prefetch_turn("sess-1", "assistant", "I'm doing great, thanks for asking!")
    accel.prefetcher.prefetch_turn("sess-1", "user", "Can you help me with Python?")

    size = accel.prefetcher.get_context_size("sess-1")
    print(f"  Context size: {size}")
    print(f"  Token count: {size.get('token_count', 0)} — {'PASS' if size.get('token_count', 0) > 0 else 'FAIL'}")
    print(f"  Compression: {size.get('compression', 0)}x — {'PASS' if size.get('compression', 0) > 1 else 'FAIL'}")
    print(f"  Savings: {size.get('savings_kb', 0)} KB")


def test_prompt_compressor():
    """Test 2: Prompt compression — compress system prompt + context."""
    print("\n=== 2. Prompt Compressor Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_compress_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    system_prompt = "You are Incentives incllmv2, a self-improving AI assistant. Be concise and helpful."
    rlt_context = "[EP:fix-login→patched-auth] [SK:python-debug→isolate-repro-test-fix]"
    rag_text = "Knowledge: Python is a high-level programming language."
    goal_context = "Current goal: Deploy application to production"

    # First compression
    result1 = accel.prompt_compressor.compress_prompt(system_prompt, rlt_context, rag_text, goal_context)
    print(f"  First compression: {result1['total_tokens']} tokens, {result1['compressed_bytes']} bytes")
    print(f"  Compression ratio: {result1.get('compression_ratio', 0)}x — {'PASS' if result1.get('compression_ratio', 0) > 1 else 'FAIL'}")
    print(f"  Cached: {result1['cached']} — {'PASS' if not result1['cached'] else 'FAIL'}")

    # Same context — should be cached
    result2 = accel.prompt_compressor.compress_prompt(system_prompt, rlt_context, rag_text, goal_context)
    print(f"  Second call cached: {'PASS' if result2['cached'] else 'FAIL'}")

    # Max context expansion
    max_ctx = accel.prompt_compressor.get_max_context_for_window(2048)
    print(f"  2048 window → {max_ctx:,} effective tokens — {'PASS' if max_ctx > 2048 else 'FAIL'}")


def test_conversation_cache():
    """Test 3: Conversation cache — instant repeat responses."""
    print("\n=== 3. Conversation Cache Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_cache_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    # Store a conversation
    accel.conversation_cache.store(
        "What is Python?",
        "Python is a high-level programming language.",
        context_id="ctx-1",
    )
    accel.conversation_cache.store(
        "How do I install Python?",
        "You can install Python from python.org.",
        context_id="ctx-2",
    )
    print(f"  Stored 2 conversations")

    # Exact match
    hit = accel.conversation_cache.lookup("What is Python?")
    print(f"  Exact match: {'PASS' if hit else 'FAIL'}")
    if hit:
        print(f"    Response: {hit.response_text[:50]}...")

    # Fuzzy match (similar keywords)
    hit2 = accel.conversation_cache.lookup("What is Python programming language?")
    print(f"  Fuzzy match: {'PASS' if hit2 else 'FAIL'}")
    if hit2:
        print(f"    Similarity: {hit2.similarity_score:.2f}")
        print(f"    Response: {hit2.response_text[:50]}...")

    # No match
    miss = accel.conversation_cache.lookup("What is the weather today?")
    print(f"  No match: {'PASS' if not miss else 'FAIL'}")

    stats = accel.conversation_cache.get_stats()
    print(f"  Stats: {stats['hits']} hits, {stats['misses']} misses, hit rate: {stats['hit_rate']:.2f}")


def test_recursive_link_injector():
    """Test 4: Recursive link injection — find related past contexts."""
    print("\n=== 4. Recursive Link Injector Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_inject_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    # Create some contexts and link them
    # Use the accelerator's OS directly
    tokens1 = [1, 2, 3, 4, 5]
    tokens2 = [6, 7, 8, 9, 10]
    tokens3 = [11, 12, 13, 14, 15]

    accel.os.tokenizer.build_codebook(
        [(tid, i) for i, tid in enumerate(sorted(set(tokens1 + tokens2 + tokens3)))]
    )
    accel.os.allocate("ctx-python-1", tokens1)
    accel.os.allocate("ctx-python-2", tokens2)
    accel.os.allocate("ctx-other", tokens3)

    # Link them
    accel.os.link_contexts("ctx-python-1", "ctx-python-2", "related")
    accel.os.link_contexts("ctx-python-1", "ctx-other", "reference")

    # Inject context for ctx-python-1
    injection = accel.link_injector.inject_context("sess-1", "ctx-python-1", "Python question")
    print(f"  Injection: {injection}")
    print(f"  Has injection: {'PASS' if injection else 'FAIL'}")

    stats = accel.link_injector.get_stats()
    print(f"  Stats: {stats}")


def test_universal_learning():
    """Test 5: Universal learning — share and receive patterns."""
    print("\n=== 5. Universal Learning Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_learn_")
    accel = SplitBitAccelerator(
        tier="standard", storage_dir=tmpdir,
        instance_id="test-learn-01",
    )

    # Analyze a conversation
    learning = accel.universal_learning.analyze_conversation(
        "How do I write a Python function?",
        "You can define a function using the def keyword.",
        session_id="sess-1",
        response_time_s=1.5,
        channel="cli",
    )
    print(f"  Codebook learning: {learning['codebook_learning']['total_unique_tokens']} unique tokens")
    print(f"  Flow pattern: avg_msg={learning['flow_pattern']['avg_message_length']:.0f} chars")
    print(f"  Compression: {learning['compression_ratio']}x")

    stats = accel.universal_learning.get_stats()
    print(f"  Patterns shared: {stats['patterns_shared']} — {'PASS' if stats['patterns_shared'] > 0 else 'FAIL'}")

    # Simulate receiving a peer learning
    peer_learning = {
        "id": "peer-learn-001",
        "learning_type": "pattern",
        "content": "Peer flow pattern",
        "source_instance": "peer-alpha",
        "timestamp": 1234567890,
        "metadata": {
            "avg_message_length": 50,
            "avg_response_length": 200,
            "avg_response_time": 2.0,
            "channel": "telegram",
        },
    }
    accel.os.receive_token_learning(peer_learning)
    applied = accel.universal_learning.sync_peer_learnings()
    print(f"  Peer learnings applied: {applied} — {'PASS' if applied > 0 else 'FAIL'}")

    stats = accel.universal_learning.get_stats()
    print(f"  Patterns received: {stats['patterns_received']}")
    print(f"  Patterns applied: {stats['patterns_applied']}")


def test_format_switcher():
    """Test 6: Adaptive format switching — complexity detection."""
    print("\n=== 6. Adaptive Format Switcher Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_format_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    # Simple message
    result1 = accel.format_switcher.maybe_switch("hey thanks", urgency="normal")
    print(f"  Simple ('hey thanks'): complexity={result1['complexity']}, format={result1['format']}")
    print(f"    Switched to q2_k: {'PASS' if result1['format'] == 'q2_k' else 'FAIL'}")

    # Normal message
    result2 = accel.format_switcher.maybe_switch("Can you help me understand how to use this feature?", urgency="normal")
    print(f"  Normal: complexity={result2['complexity']}, format={result2['format']}")
    print(f"    Is normal/complex: {'PASS' if result2['complexity'] in ('normal', 'complex') else 'FAIL'}")

    # Complex message (code)
    result3 = accel.format_switcher.maybe_switch("def calculate(x): return x * 2 + import math", urgency="normal")
    print(f"  Complex (code): complexity={result3['complexity']}, format={result3['format']}")
    print(f"    Detected complex: {'PASS' if result3['complexity'] == 'complex' else 'FAIL'}")

    # Urgent voice command
    result4 = accel.format_switcher.maybe_switch("stop", urgency="urgent")
    print(f"  Urgent voice ('stop'): complexity={result4['complexity']}")
    print(f"    Detected simple: {'PASS' if result4['complexity'] == 'simple' else 'FAIL'}")

    stats = accel.format_switcher.get_stats()
    print(f"  Total switches: {stats['total_switches']}")


def test_stream_decoder():
    """Test 7: Response stream decoder — early TTS."""
    print("\n=== 7. Response Stream Decoder Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_stream_")
    accel = SplitBitAccelerator(tier="standard", storage_dir=tmpdir)

    # Simulate streaming response
    chunks = [
        "Hello! I'm doing ",
        "great today. The weather ",
        "is nice. Would you like ",
        "to hear about Python? ",
        "It's a great language.",
    ]

    all_sentences = []
    for chunk in chunks:
        sentences = accel.stream_decoder.process_chunk(chunk)
        all_sentences.extend(sentences)
        if sentences:
            print(f"  Chunk → {len(sentences)} sentence(s) ready for TTS: {sentences[0][:40]}...")

    print(f"  Total early sentences: {len(all_sentences)} — {'PASS' if len(all_sentences) > 0 else 'FAIL'}")

    # Finalize
    full_response = "".join(chunks)
    final = accel.stream_decoder.finalize(full_response, session_id="sess-1", context_id="ctx-1")
    print(f"  Finalized: {final['total_chars']} chars, {final['total_tokens']} tokens")
    print(f"  Sentences sent early: {final['sentences_sent_early']}")

    stats = accel.stream_decoder.get_stats()
    print(f"  Avg latency saved: {stats['avg_latency_saved_ms']}ms")


def test_unified_accelerator():
    """Test the unified accelerator — full pre/post inference flow."""
    print("\n=== Unified Accelerator Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_unified_")
    accel = SplitBitAccelerator(
        tier="standard", storage_dir=tmpdir,
        instance_id="unified-test",
    )

    # Simulate first conversation
    print("  --- Turn 1 ---")
    pre1 = accel.pre_inference(
        user_id="user-1",
        message="What is Python?",
        session_id="sess-1",
        channel="cli",
        system_prompt="You are a helpful assistant.",
        rlt_context="[EP:python-intro]",
    )
    print(f"  Pre-inference: cache_hit={pre1.get('cache_hit')}, format={pre1.get('format', {}).get('format')}")
    print(f"  Pre-inference time: {pre1.get('pre_inference_ms')}ms")

    # Simulate LLM response
    response1 = "Python is a high-level programming language."

    post1 = accel.post_inference(
        user_id="user-1",
        message="What is Python?",
        response=response1,
        session_id="sess-1",
        elapsed_s=1.2,
        channel="cli",
        context_id=pre1.get("context_id"),
        accel_data=pre1,
    )
    print(f"  Post-inference: cached_as={post1.get('cached_as')}")
    print(f"  Learning: {post1.get('learning', {}).get('compression_ratio')}x compression")
    print(f"  Peer learnings applied: {post1.get('peer_learnings_applied')}")

    # Simulate second conversation — should hit cache
    print("\n  --- Turn 2 (similar question — should cache hit) ---")
    pre2 = accel.pre_inference(
        user_id="user-1",
        message="What is Python?",
        session_id="sess-1",
        channel="cli",
        system_prompt="You are a helpful assistant.",
    )
    print(f"  Cache hit: {'PASS' if pre2.get('cache_hit') else 'FAIL'}")
    if pre2.get('cache_hit'):
        print(f"  Cached response: {pre2.get('cached_response', '')[:50]}...")

    # Full stats
    print("\n  --- Full Stats ---")
    stats = accel.full_stats()
    print(f"  Total accelerations: {stats['total_accelerations']}")
    print(f"  Prefetcher: {stats['prefetcher']}")
    print(f"  Cache: {stats['conversation_cache']}")
    print(f"  Format switcher: {stats['format_switcher']['total_switches']} switches")
    print(f"  Universal learning: {stats['universal_learning']['patterns_shared']} patterns shared")
    print(f"  Stream decoder: {stats['stream_decoder']['streams_processed']} streams")


if __name__ == "__main__":
    test_context_prefetcher()
    test_prompt_compressor()
    test_conversation_cache()
    test_recursive_link_injector()
    test_universal_learning()
    test_format_switcher()
    test_stream_decoder()
    test_unified_accelerator()
    print("\n=== All 7 tests complete ===")
