#!/usr/bin/env python
"""Test SplitBit Token Persistent OS — persistent memory, recursive links, universal sync."""

import sys
import os
import tempfile
sys.path.insert(0, ".")

from inc_llm.splitbit_os import (
    SplitBitTokenPersistentOS,
    TokenContextLink,
    TokenLearning,
    TIER_HOT, TIER_WARM, TIER_COLD,
    LINK_MIN_STRENGTH, LINK_MAX_STRENGTH,
)


def test_persistent_storage():
    """Test save/load contexts to SQLite."""
    print("\n=== Persistent Storage Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_test_")
    os_instance = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="test-instance-01",
    )

    # Build codebook and allocate
    tokens = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50]
    os_instance.tokenizer.build_codebook([(tid, i) for i, tid in enumerate(sorted(set(tokens)))])
    os_instance.allocate("ctx-persist-1", tokens)

    # Save
    os_instance.save_context("ctx-persist-1", metadata={"session": "test"})
    print(f"  Saved context with {len(tokens)} tokens")

    # Simulate restart — create new OS instance
    os_instance.shutdown()
    os2 = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="test-instance-01",
    )

    # Load
    loaded = os2.load_context("ctx-persist-1")
    if loaded is not None:
        match = loaded == tokens
        print(f"  Loaded context: {len(loaded)} tokens — {'PASS' if match else 'FAIL'}")
        if not match:
            print(f"    Expected: {tokens}")
            print(f"    Got:      {loaded}")
    else:
        print("  FAIL: Could not load context")

    # Codebook should be loaded too
    print(f"  Codebook entries: {len(os2.tokenizer._codebook)} — {'PASS' if len(os2.tokenizer._codebook) > 0 else 'FAIL'}")


def test_recursive_links():
    """Test bidirectional context linking and traversal."""
    print("\n=== Recursive Link Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_link_")
    os_instance = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="test-link-01",
    )

    # Allocate some contexts
    for i in range(5):
        tokens = list(range(i * 10, (i + 1) * 10))
        os_instance.tokenizer.build_codebook(
            [(tid, idx) for idx, tid in enumerate(sorted(set(tokens)))]
        )
        os_instance.allocate(f"ctx-{i}", tokens)

    # Create links: 0→1→2→3→4 (chain) and 0→3 (skip)
    os_instance.link_contexts("ctx-0", "ctx-1", "continuation")
    os_instance.link_contexts("ctx-1", "ctx-2", "continuation")
    os_instance.link_contexts("ctx-2", "ctx-3", "continuation")
    os_instance.link_contexts("ctx-3", "ctx-4", "continuation")
    os_instance.link_contexts("ctx-0", "ctx-3", "reference")

    # Check direct links from ctx-0
    linked = os_instance.get_linked_contexts("ctx-0", max_depth=1)
    print(f"  Direct links from ctx-0: {len(linked)} — {'PASS' if len(linked) == 2 else 'FAIL'}")
    for ctx_id, strength, depth in linked:
        print(f"    → {ctx_id} (strength: {strength:.3f}, depth: {depth})")

    # Check 2-hop traversal from ctx-0
    linked_2hop = os_instance.get_linked_contexts("ctx-0", max_depth=2)
    print(f"  2-hop links from ctx-0: {len(linked_2hop)} — {'PASS' if len(linked_2hop) >= 3 else 'FAIL'}")
    for ctx_id, strength, depth in linked_2hop:
        print(f"    → {ctx_id} (strength: {strength:.3f}, depth: {depth})")

    # Access ctx-0 — should reinforce its links
    os_instance.access_context("ctx-0")
    stats = os_instance.link_stats()
    print(f"  Link stats: {stats['total_links']} links, avg strength: {stats['avg_strength']:.3f}")

    # Test link decay
    pruned = os_instance.decay_all_links()
    print(f"  Decay pruned: {pruned} links")


def test_universal_recursive_link():
    """Test peer registration and learning sharing."""
    print("\n=== Universal Recursive Link Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_univ_")
    os_instance = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="instance-alpha",
    )

    # Add peers
    os_instance.add_peer("peer-beta", "Beta Instance", "http://beta:8547")
    os_instance.add_peer("peer-gamma", "Gamma Instance", "http://gamma:8547")
    print(f"  Added 2 peers")

    # Share a learning
    learning = os_instance.share_token_learning(
        "codebook",
        "Top 1000 tokens use 2-bit packing → 16x compression on mobile tier",
        metadata={"tier": "mobile", "format": "q2_k"},
    )
    print(f"  Shared learning: {learning['id'][:8]}... (type: {learning['learning_type']})")

    # Simulate receiving a learning from a peer
    received = os_instance.receive_token_learning({
        "id": "learning-from-beta-001",
        "learning_type": "compression",
        "content": "Q4_K_M achieves 8x compression with <1% quality loss on standard tier",
        "source_instance": "peer-beta",
        "timestamp": 1234567890,
        "metadata": {"tier": "standard", "format": "q4_k_m"},
    })
    print(f"  Received learning from peer-beta: {'PASS' if received else 'FAIL'}")

    # Try duplicate — should fail
    duplicate = os_instance.receive_token_learning({
        "id": "learning-from-beta-001",
        "learning_type": "compression",
        "content": "duplicate",
        "source_instance": "peer-beta",
    })
    print(f"  Duplicate rejected: {'PASS' if not duplicate else 'FAIL'}")

    # Try self-sourced — should fail
    self_sourced = os_instance.receive_token_learning({
        "id": "self-learning-001",
        "learning_type": "pattern",
        "content": "self",
        "source_instance": "instance-alpha",
    })
    print(f"  Self-sourced rejected: {'PASS' if not self_sourced else 'FAIL'}")

    # Get pending learnings
    pending = os_instance.get_pending_learnings()
    print(f"  Pending learnings: {len(pending)} — {'PASS' if len(pending) == 1 else 'FAIL'}")

    # Mark as applied
    if pending:
        os_instance.mark_learning_applied(pending[0]["id"])
        remaining = os_instance.get_pending_learnings()
        print(f"  After marking applied: {len(remaining)} pending — {'PASS' if len(remaining) == 0 else 'FAIL'}")

    # Sync stats
    sync = os_instance.sync_with_peer("peer-beta")
    print(f"  Sync with peer-beta: shared={sync['shared_to_peer']}, received={sync['received_from_peer']}")


def test_tiered_storage():
    """Test hot/warm/cold tier migration."""
    print("\n=== Tiered Storage Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_tier_")
    os_instance = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="test-tier-01",
    )

    # Allocate and save a context
    tokens = list(range(100))
    os_instance.tokenizer.build_codebook(
        [(tid, idx) for idx, tid in enumerate(sorted(set(tokens)))]
    )
    os_instance.allocate("ctx-cold-test", tokens)
    os_instance.save_context("ctx-cold-test")

    # Check it's in hot tier
    import sqlite3
    db_path = os_instance.db_path
    with sqlite3.connect(str(db_path)) as conn:
        tier = conn.execute(
            "SELECT tier FROM token_contexts WHERE context_id = ?", ("ctx-cold-test",),
        ).fetchone()
    print(f"  Initial tier: {tier[0] if tier else 'not found'} — {'PASS' if tier and tier[0] == 'hot' else 'FAIL'}")

    # Simulate aging — manually update last_accessed to past
    import time
    old_time = time.time() - 100000  # > 24h ago
    with sqlite3.connect(str(db_path)) as conn:
        conn.execute(
            "UPDATE token_contexts SET last_accessed = ?, tier = ? WHERE context_id = ?",
            (old_time, "warm", "ctx-cold-test"),
        )

    # Run migration — should move warm→cold
    migration = os_instance.migrate_tiers()
    print(f"  Migration: {migration}")

    # Check it moved to cold
    with sqlite3.connect(str(db_path)) as conn:
        tier = conn.execute(
            "SELECT tier FROM token_contexts WHERE context_id = ?", ("ctx-cold-test",),
        ).fetchone()
    print(f"  After migration tier: {tier[0] if tier else 'not found'} — {'PASS' if tier and tier[0] == 'cold' else 'FAIL'}")

    # Load from cold — should promote back to hot
    loaded = os_instance.load_context("ctx-cold-test")
    print(f"  Loaded from cold: {len(loaded) if loaded else 0} tokens — {'PASS' if loaded and len(loaded) == 100 else 'FAIL'}")

    with sqlite3.connect(str(db_path)) as conn:
        tier = conn.execute(
            "SELECT tier FROM token_contexts WHERE context_id = ?", ("ctx-cold-test",),
        ).fetchone()
    print(f"  After load tier: {tier[0] if tier else 'not found'} — {'PASS' if tier and tier[0] == 'hot' else 'FAIL'}")


def test_full_stats():
    """Test full system statistics."""
    print("\n=== Full Stats Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_stats_")
    os_instance = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="test-stats-01",
    )

    # Do some operations
    tokens = [1, 2, 3, 4, 5]
    os_instance.tokenizer.build_codebook([(tid, i) for i, tid in enumerate(sorted(set(tokens)))])
    os_instance.allocate("ctx-a", tokens)
    os_instance.allocate("ctx-b", tokens)
    os_instance.save_context("ctx-a")
    os_instance.link_contexts("ctx-a", "ctx-b", "related")
    os_instance.add_peer("peer-1", "Peer 1")
    os_instance.share_token_learning("pattern", "test pattern")

    stats = os_instance.full_stats()
    print(f"  Instance ID: {stats['instance_id']}")
    print(f"  Tier: {stats['tier']}")
    print(f"  Format: {stats['quant_format']}")
    print(f"  Allocated contexts: {stats['allocated_contexts']}")
    print(f"  Persisted contexts: {stats['persisted_contexts']}")
    print(f"  Context links: {stats['context_links']}")
    print(f"  Peers: {stats['peers']}")
    print(f"  Learnings shared: {stats['learnings_shared']}")
    print(f"  Total learnings: {stats['total_learnings']}")
    print(f"  Compression: {stats['compression_ratio']}x")
    print(f"  Memory: {stats['memory_used_mb']:.4f} MB / {stats['memory_max_mb']:.0f} MB")


def test_shutdown_and_restore():
    """Test that full state survives shutdown and restart."""
    print("\n=== Shutdown & Restore Test ===")

    tmpdir = tempfile.mkdtemp(prefix="splitbit_restore_")
    os1 = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="restore-test",
    )

    # Setup state
    tokens = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    os1.tokenizer.build_codebook([(tid, i) for i, tid in enumerate(sorted(set(tokens)))])
    os1.allocate("ctx-survive", tokens)
    os1.save_context("ctx-survive")
    os1.link_contexts("ctx-survive", "ctx-other", "related")
    os1.add_peer("peer-survive", "Survival Peer")
    os1.share_token_learning("codebook", "pattern for survival")

    # Shutdown
    os1.shutdown()
    print("  Shutdown complete")

    # Restore
    os2 = SplitBitTokenPersistentOS(
        tier="standard", context_window=4096,
        storage_dir=tmpdir, instance_id="restore-test",
    )

    # Check codebook restored
    cb_ok = len(os2.tokenizer._codebook) > 0
    print(f"  Codebook restored: {'PASS' if cb_ok else 'FAIL'} ({len(os2.tokenizer._codebook)} entries)")

    # Check context restored
    loaded = os2.load_context("ctx-survive")
    ctx_ok = loaded is not None and len(loaded) == len(tokens)
    print(f"  Context restored: {'PASS' if ctx_ok else 'FAIL'}")

    # Check links restored
    links_ok = len(os2._links) > 0
    print(f"  Links restored: {'PASS' if links_ok else 'FAIL'} ({len(os2._links)} contexts with links)")

    # Check peers restored
    stats = os2.full_stats()
    peers_ok = stats["peers"] > 0
    print(f"  Peers restored: {'PASS' if peers_ok else 'FAIL'} ({stats['peers']} peers)")

    # Check learnings restored
    learn_ok = stats["total_learnings"] > 0
    print(f"  Learnings restored: {'PASS' if learn_ok else 'FAIL'} ({stats['total_learnings']} learnings)")


if __name__ == "__main__":
    test_persistent_storage()
    test_recursive_links()
    test_universal_recursive_link()
    test_tiered_storage()
    test_full_stats()
    test_shutdown_and_restore()
    print("\n=== All tests complete ===")
