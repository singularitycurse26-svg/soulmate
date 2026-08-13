#!/usr/bin/env python
"""Test SplitBit Token System — verify encoding/decoding and memory savings."""

import sys
sys.path.insert(0, ".")

from inc_llm.splitbit_tokens import (
    SplitBitTokenizer,
    SplitBitTokenOS,
    SplitBitTokenConfig,
    get_optimal_token_config,
    estimate_token_savings,
    STANDARD_TOKEN_BITS,
)
from inc_llm.math_core.precision import TIER_QUANT_FORMAT


def test_encode_decode():
    """Test that encode → decode round-trips correctly."""
    print("\n=== Encode/Decode Round-Trip Test ===")

    for fmt in ["q2_k", "q4_k_m", "q8_0", "fp16"]:
        config = SplitBitTokenConfig(quant_format=fmt)
        tok = SplitBitTokenizer(config)

        # Simulate token IDs
        token_ids = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 1, 2, 3]
        tok.build_codebook([(tid, i) for i, tid in enumerate(sorted(set(token_ids)))])

        encoded = tok.encode(token_ids)
        decoded = tok.decode(encoded, len(token_ids))

        match = token_ids == decoded
        print(f"  {fmt:8s}: {len(token_ids)} tokens → {len(encoded)} bytes → "
              f"decoded {len(decoded)} tokens — {'PASS' if match else 'FAIL'}")

        if not match:
            print(f"    Original: {token_ids}")
            print(f"    Decoded:  {decoded}")


def test_memory_savings():
    """Test memory savings vs standard 32-bit tokens."""
    print("\n=== Memory Savings Test (4096 tokens) ===")

    token_count = 4096
    standard_kb = (token_count * 4) / 1024  # 32-bit per token

    for tier, fmt in TIER_QUANT_FORMAT.items():
        savings = estimate_token_savings(tier, token_count)
        print(f"  {tier:15s} ({fmt:10s}): "
              f"{savings['standard_memory_kb']:.1f} KB → "
              f"{savings['splitbit_memory_kb']:.1f} KB "
              f"(saved {savings['saved_kb']:.1f} KB, "
              f"{savings['compression_ratio']:.1f}x compression, "
              f"expanded context: {savings['expanded_context_tokens']:,} tokens)")


def test_token_os():
    """Test the SplitBit Token OS allocation and retrieval."""
    print("\n=== SplitBit Token OS Test ===")

    os = SplitBitTokenOS(tier="standard", context_window=4096)

    # Allocate contexts
    ctx1_tokens = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50]
    ctx2_tokens = [100, 200, 300, 400, 500]

    os.tokenizer.build_codebook([(tid, i) for i, tid in enumerate(
        sorted(set(ctx1_tokens + ctx2_tokens))
    )])

    os.allocate("ctx1", ctx1_tokens)
    os.allocate("ctx2", ctx2_tokens)

    # Retrieve
    retrieved1 = os.retrieve("ctx1")
    retrieved2 = os.retrieve("ctx2")

    print(f"  ctx1: {ctx1_tokens} → retrieved: {retrieved1} — {'PASS' if ctx1_tokens == retrieved1 else 'FAIL'}")
    print(f"  ctx2: {ctx2_tokens} → retrieved: {retrieved2} — {'PASS' if ctx2_tokens == retrieved2 else 'FAIL'}")

    # Append
    os.append("ctx1", [60, 70, 80])
    retrieved1_extended = os.retrieve("ctx1")
    expected = ctx1_tokens + [60, 70, 80]
    print(f"  ctx1 after append: {len(retrieved1_extended)} tokens — {'PASS' if expected == retrieved1_extended else 'FAIL'}")

    # Memory stats
    stats = os.memory_stats()
    print(f"\n  Memory Stats:")
    print(f"    Tier: {stats['tier']}")
    print(f"    Format: {stats['quant_format']} ({stats['bits_per_token']} bits/token)")
    print(f"    Contexts: {stats['allocated_contexts']}")
    print(f"    Memory: {stats['memory_used_mb']:.4f} MB / {stats['memory_max_mb']:.0f} MB")
    print(f"    Compression: {stats['compression_ratio']}x vs 32-bit")
    print(f"    Total encoded: {stats['total_encoded']}")
    print(f"    Total decoded: {stats['total_decoded']}")

    # Free
    os.free("ctx2")
    print(f"\n  After freeing ctx2: {len(os._allocated)} contexts remaining")


def test_context_expansion():
    """Test how SplitBit expands context window vs standard."""
    print("\n=== Context Expansion Test ===")

    comparison = SplitBitTokenOS(tier="standard").standard_vs_splitbit_comparison(4096)

    print(f"  Standard 4096 tokens = {comparison['standard']['standard_kb']:.1f} KB (32-bit)")
    print()
    for tier in comparison:
        data = comparison[tier]
        print(f"  {tier:15s}: {data['splitbit_kb']:8.1f} KB "
              f"({data['compression_ratio']:5.1f}x compression) "
              f"→ {data['expanded_context']:>8,} tokens in same memory")


def test_format_switch():
    """Test switching encoding format mid-session."""
    print("\n=== Format Switch Test ===")

    os = SplitBitTokenOS(tier="mobile", context_window=2048)
    tokens = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    os.tokenizer.build_codebook([(tid, i) for i, tid in enumerate(sorted(set(tokens)))])
    os.allocate("ctx", tokens)

    before = os.retrieve("ctx")
    print(f"  Before switch (mobile/ternary): {len(before)} tokens")

    os.switch_format("q4_k_m")
    after = os.retrieve("ctx")
    print(f"  After switch (standard/q4_k_m): {len(after)} tokens")
    print(f"  Round-trip preserved: {'PASS' if before == after else 'FAIL'}")

    stats = os.memory_stats()
    print(f"  Format switches: {stats['format_switches']}")


if __name__ == "__main__":
    test_encode_decode()
    test_memory_savings()
    test_token_os()
    test_context_expansion()
    test_format_switch()
    print("\n=== All tests complete ===")
