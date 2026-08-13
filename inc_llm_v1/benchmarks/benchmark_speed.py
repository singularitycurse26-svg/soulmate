"""Speed benchmark — compares INC-LLM-v1 (RLOS + cache) vs raw Ollama calls.

Measures:
- Cold start latency (first request)
- Warm latency (model preloaded by RLOS)
- Tokens/sec generation throughput
- Cache hit speedup (repeated identical query)
- Prefix cache benefit (multi-turn conversation)
- Concurrent request throughput (batch processing)
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness

OLLAMA_BASE_URL = "http://localhost:11434"
TEST_MODEL = "qwen2.5:0.5b"
TEST_PROMPT = "Explain what Python is in 3 sentences."
MAX_TOKENS = 128


async def raw_ollama_complete(model: str, messages: list[dict[str, str]],
                              max_tokens: int = MAX_TOKENS) -> dict[str, Any]:
    """Call Ollama API directly without RLOS."""
    body = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.7},
    }).encode()

    def _do():
        req = urllib.request.Request(
            f"{OLLAMA_BASE_URL}/api/chat",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        resp = urllib.request.urlopen(req, timeout=300)
        return json.loads(resp.read().decode())

    t0 = time.time()
    data = await asyncio.to_thread(_do)
    elapsed = time.time() - t0
    content = data.get("message", {}).get("content", "")
    eval_count = data.get("eval_count", len(content.split()))
    return {
        "content": content,
        "elapsed_s": elapsed,
        "tokens": eval_count,
        "tokens_per_sec": eval_count / elapsed if elapsed > 0 else 0,
    }


async def benchmark_cold_start() -> dict[str, Any]:
    """Cold start — first request, model may not be loaded."""
    print("  [Speed] Cold start (raw vs INC-LLM)...")

    # Raw cold start
    raw_result = await raw_ollama_complete(
        TEST_MODEL, [{"role": "user", "content": TEST_PROMPT}]
    )

    # INC-LLM cold start (RLOS will preload model)
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False  # disable cache for cold start test
    harness = IncLLMHarness(settings)
    await harness.initialize()

    t0 = time.time()
    inc_result = await harness.chat("bench_user", TEST_PROMPT, is_owner=True)
    inc_elapsed = time.time() - t0
    inc_tokens = len(inc_result.get("response", "").split())

    await harness.close()

    return {
        "test": "cold_start",
        "raw_latency_s": raw_result["elapsed_s"],
        "raw_tokens_per_sec": raw_result["tokens_per_sec"],
        "inc_latency_s": inc_elapsed,
        "inc_tokens_per_sec": inc_tokens / inc_elapsed if inc_elapsed > 0 else 0,
    }


async def benchmark_warm() -> dict[str, Any]:
    """Warm start — model already loaded by RLOS."""
    print("  [Speed] Warm start (raw vs INC-LLM)...")

    # Warm up raw
    await raw_ollama_complete(TEST_MODEL, [{"role": "user", "content": "warmup"}])

    # Raw warm
    raw_times: list[float] = []
    for _ in range(3):
        r = await raw_ollama_complete(TEST_MODEL, [{"role": "user", "content": TEST_PROMPT}])
        raw_times.append(r["elapsed_s"])
    raw_avg = sum(raw_times) / len(raw_times)

    # INC-LLM warm (RLOS keeps model loaded)
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    harness = IncLLMHarness(settings)
    await harness.initialize()

    # Warm up
    await harness.chat("bench_user", "warmup", is_owner=True)

    inc_times: list[float] = []
    for _ in range(3):
        t0 = time.time()
        await harness.chat("bench_user", TEST_PROMPT, is_owner=True)
        inc_times.append(time.time() - t0)
    inc_avg = sum(inc_times) / len(inc_times)

    await harness.close()

    return {
        "test": "warm_start",
        "raw_latency_s": round(raw_avg, 3),
        "raw_times": [round(t, 3) for t in raw_times],
        "inc_latency_s": round(inc_avg, 3),
        "inc_times": [round(t, 3) for t in inc_times],
        "speedup": round(raw_avg / inc_avg, 2) if inc_avg > 0 else 0,
    }


async def benchmark_cache_hit() -> dict[str, Any]:
    """Cache hit speedup — same query twice, second should be instant."""
    print("  [Speed] Cache hit speedup...")

    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = True
    settings.cache.similarity_threshold = 0.80
    harness = IncLLMHarness(settings)
    await harness.initialize()

    query = "What is Python programming language?"

    # First call — cache miss
    t0 = time.time()
    first = await harness.chat("bench_user", query, is_owner=True)
    first_elapsed = time.time() - t0

    # Second call — should hit cache
    t0 = time.time()
    second = await harness.chat("bench_user", query, is_owner=True)
    second_elapsed = time.time() - t0

    await harness.close()

    return {
        "test": "cache_hit",
        "first_call_s": round(first_elapsed, 3),
        "second_call_s": round(second_elapsed, 3),
        "speedup": round(first_elapsed / second_elapsed, 2) if second_elapsed > 0 else 0,
        "cached": second.get("cached", False),
    }


async def benchmark_prefix_cache() -> dict[str, Any]:
    """Prefix cache benefit — multi-turn conversation reuses prefix."""
    print("  [Speed] Prefix cache (multi-turn)...")

    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    harness = IncLLMHarness(settings)
    await harness.initialize()

    turns = [
        "Hello, I'm learning Python.",
        "Can you show me a simple example?",
        "How do I install packages with pip?",
    ]

    turn_times: list[float] = []
    for turn in turns:
        t0 = time.time()
        await harness.chat("bench_user", turn, is_owner=True)
        turn_times.append(time.time() - t0)

    await harness.close()

    # Raw multi-turn (no prefix cache)
    raw_turn_times: list[float] = []
    messages: list[dict[str, str]] = []
    for turn in turns:
        messages.append({"role": "user", "content": turn})
        r = await raw_ollama_complete(TEST_MODEL, messages)
        raw_turn_times.append(r["elapsed_s"])
        messages.append({"role": "assistant", "content": r["content"]})

    return {
        "test": "prefix_cache",
        "raw_turn_times": [round(t, 3) for t in raw_turn_times],
        "inc_turn_times": [round(t, 3) for t in turn_times],
        "raw_total_s": round(sum(raw_turn_times), 3),
        "inc_total_s": round(sum(turn_times), 3),
        "speedup": round(sum(raw_turn_times) / sum(turn_times), 2) if sum(turn_times) > 0 else 0,
    }


async def benchmark_concurrent() -> dict[str, Any]:
    """Concurrent request throughput — batch processing."""
    print("  [Speed] Concurrent requests (batch)...")

    num_concurrent = 10
    prompt = "Write a short greeting."

    # Raw concurrent
    t0 = time.time()
    raw_tasks = [
        raw_ollama_complete(TEST_MODEL, [{"role": "user", "content": prompt}])
        for _ in range(num_concurrent)
    ]
    raw_results = await asyncio.gather(*raw_tasks)
    raw_total = time.time() - t0

    # INC-LLM concurrent (RLOS batch processing)
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    harness = IncLLMHarness(settings)
    await harness.initialize()

    t0 = time.time()
    inc_tasks = [
        harness.chat(f"bench_user_{i}", prompt, is_owner=True)
        for i in range(num_concurrent)
    ]
    await asyncio.gather(*inc_tasks)
    inc_total = time.time() - t0

    await harness.close()

    return {
        "test": "concurrent",
        "num_requests": num_concurrent,
        "raw_total_s": round(raw_total, 3),
        "inc_total_s": round(inc_total, 3),
        "raw_per_request_s": round(raw_total / num_concurrent, 3),
        "inc_per_request_s": round(inc_total / num_concurrent, 3),
        "speedup": round(raw_total / inc_total, 2) if inc_total > 0 else 0,
    }


async def run_speed_benchmarks() -> list[dict[str, Any]]:
    """Run all speed benchmarks."""
    print("\n=== Speed Benchmarks ===")
    results: list[dict[str, Any]] = []

    results.append(await benchmark_cold_start())
    results.append(await benchmark_warm())
    results.append(await benchmark_cache_hit())
    results.append(await benchmark_prefix_cache())
    results.append(await benchmark_concurrent())

    return results
