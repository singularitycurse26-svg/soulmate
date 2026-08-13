"""Benchmark orchestrator — runs all benchmarks and generates a markdown report.

Usage:
    python -m benchmarks.run_all

Requires Ollama running on localhost:11434 with qwen2.5:0.5b pulled.
For cross-model tests, also pull qwen2.5:1.5b and llama3.2:1b.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import os
import sys
import time
from typing import Any

from benchmarks.benchmark_speed import run_speed_benchmarks
from benchmarks.benchmark_quality import run_quality_benchmarks
from benchmarks.benchmark_cross_model import run_cross_model_benchmarks


def generate_report(speed_results: list[dict[str, Any]],
                    quality_results: list[dict[str, Any]],
                    cross_model_results: list[dict[str, Any]]) -> str:
    """Generate a markdown benchmark report."""

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    report = f"""# INC-LLM-v1 Benchmark Report

Generated: {now}

## Overview

This report compares INC-LLM-v1 (with RLOS, RAG, memory, and caching) against raw Ollama model calls. INC-LLM-v1 is a **harness** that wraps Ollama models — it is not an LLM itself. These benchmarks show how the harness enhances the same base model (qwen2.5:0.5b).

---

## 1. Speed Benchmarks

"""

    # Speed results
    for r in speed_results:
        test = r.get("test", "unknown")
        report += f"### {test.replace('_', ' ').title()}\n\n"

        if test == "cold_start":
            report += f"| Metric | Raw Ollama | INC-LLM-v1 |\n|--------|-----------|------------|\n"
            report += f"| Latency (s) | {r['raw_latency_s']:.3f} | {r['inc_latency_s']:.3f} |\n"
            report += f"| Tokens/sec | {r['raw_tokens_per_sec']:.1f} | {r['inc_tokens_per_sec']:.1f} |\n\n"
        elif test == "warm_start":
            report += f"| Metric | Raw Ollama | INC-LLM-v1 | Speedup |\n|--------|-----------|------------|---------|\n"
            report += f"| Avg latency (s) | {r['raw_latency_s']:.3f} | {r['inc_latency_s']:.3f} | {r['speedup']}x |\n"
            report += f"| Run times (s) | {r['raw_times']} | {r['inc_times']} | - |\n\n"
        elif test == "cache_hit":
            cached = "Yes" if r.get("cached") else "No"
            report += f"| Metric | First Call | Second Call (cached) | Speedup |\n|--------|-----------|---------------------|---------|\n"
            report += f"| Latency (s) | {r['first_call_s']:.3f} | {r['second_call_s']:.3f} | {r['speedup']}x |\n"
            report += f"| Cache hit | No | {cached} | - |\n\n"
        elif test == "prefix_cache":
            report += f"| Metric | Raw Ollama | INC-LLM-v1 | Speedup |\n|--------|-----------|------------|---------|\n"
            report += f"| Total 3-turn time (s) | {r['raw_total_s']:.3f} | {r['inc_total_s']:.3f} | {r['speedup']}x |\n"
            report += f"| Per-turn times (s) | {r['raw_turn_times']} | {r['inc_turn_times']} | - |\n\n"
        elif test == "concurrent":
            report += f"| Metric | Raw Ollama | INC-LLM-v1 | Speedup |\n|--------|-----------|------------|---------|\n"
            report += f"| {r['num_requests']} concurrent (s) | {r['raw_total_s']:.3f} | {r['inc_total_s']:.3f} | {r['speedup']}x |\n"
            report += f"| Per-request (s) | {r['raw_per_request_s']:.3f} | {r['inc_per_request_s']:.3f} | - |\n\n"

    # Quality results
    report += """---

## 2. Quality Benchmarks

"""

    # Pair up raw vs inc results
    quality_pairs = [
        ("Knowledge Questions", "knowledge_raw", "knowledge_inc"),
        ("Coding Tasks", "coding_raw", "coding_inc"),
        ("Multi-turn Memory", "multiturn_raw", "multiturn_inc"),
    ]

    for title, raw_key, inc_key in quality_pairs:
        raw = next((r for r in quality_results if r["test"] == raw_key), None)
        inc = next((r for r in quality_results if r["test"] == inc_key), None)
        if not raw or not inc:
            continue

        report += f"### {title}\n\n"

        if "pass_rate" in raw:
            report += f"| Metric | Raw Ollama | INC-LLM-v1 |\n|--------|-----------|------------|\n"
            report += f"| Pass rate | {raw['pass_rate']:.0%} ({raw['passed']}/{raw['total']}) | {inc['pass_rate']:.0%} ({inc['passed']}/{inc['total']}) |\n"
            improvement = inc['pass_rate'] - raw['pass_rate']
            report += f"| Improvement | - | {'+' if improvement >= 0 else ''}{improvement:.0%} |\n\n"
        else:
            report += f"| Metric | Raw Ollama | INC-LLM-v1 |\n|--------|-----------|------------|\n"
            report += f"| Avg score | {raw['avg_score']:.0%} | {inc['avg_score']:.0%} |\n"
            report += f"| Per-question | {[f'{s:.0%}' for s in raw['scores']]} | {[f'{s:.0%}' for s in inc['scores']]} |\n"
            improvement = inc['avg_score'] - raw['avg_score']
            report += f"| Improvement | - | {'+' if improvement >= 0 else ''}{improvement:.0%} |\n\n"

    # Cross-model results
    report += """---

## 3. Cross-Model Comparison

Shows INC-LLM-v1 running qwen2.5:0.5b (smallest) competing against larger raw models.

"""

    available = [r for r in cross_model_results if r.get("status") == "ok"]
    if available:
        report += f"| Model | Avg Quality Score | Avg Latency (s) | Status |\n"
        report += f"|-------|------------------|-----------------|--------|\n"
        for r in available:
            inc_tag = " **(INC-LLM)**" if r["inc_llm"] else ""
            report += f"| {r['label']}{inc_tag} | {r['avg_score']:.0%} | {r['avg_latency_s']:.3f} | {r['status']} |\n"
        report += "\n"

        # Find INC-LLM result
        inc_result = next((r for r in available if r["inc_llm"]), None)
        if inc_result:
            report += "### Key Finding\n\n"
            # Compare against each raw model
            for r in available:
                if not r["inc_llm"]:
                    quality_diff = inc_result["avg_score"] - r["avg_score"]
                    speed_diff = r["avg_latency_s"] - inc_result["avg_latency_s"]
                    q_sign = "+" if quality_diff >= 0 else ""
                    s_sign = "faster" if speed_diff > 0 else "slower"
                    report += f"- **vs {r['label']}:** Quality {q_sign}{quality_diff:.0%}, {abs(speed_diff):.3f}s {s_sign}\n"
            report += "\n"
    else:
        report += "*No models available for cross-model comparison. Pull additional models:*\n"
        report += "```bash\nollama pull qwen2.5:1.5b\nollama pull llama3.2:1b\n```\n\n"

    # Summary
    report += """---

## 4. Summary

### What INC-LLM-v1 Is

INC-LLM-v1 is **not an LLM model** — it is a self-improving harness that wraps Ollama models. The actual inference is done by Ollama running qwen2.5:0.5b (or other models). INC-LLM-v1 enhances the base model with:

- **RLOS**: Connection pooling, model preloading, prefix caching, batch processing
- **RAG**: 32 domain knowledge seeds injected into context
- **Memory**: 3-layer (working + episodic + semantic) with knowledge graph
- **Cache**: Semantic similarity-based response caching
- **Universal Linking**: Peer-to-peer learning across all instances

### Expected Results

| Benchmark | Expected INC-LLM-v1 Advantage |
|-----------|------------------------------|
| Cold start | Slightly slower (RLOS init overhead) |
| Warm start | Faster (connection reuse + model preloaded) |
| Cache hit | Much faster (skips LLM call entirely) |
| Prefix cache | Faster on multi-turn (prefix reuse) |
| Concurrent | Faster (batch processing + connection pool) |
| Knowledge | Higher accuracy (RAG domain seeds) |
| Coding | Similar or slightly better (knowledge graph) |
| Multi-turn | Better retention (episodic memory) |
| Cross-model | 0.5b + INC-LLM should compete with 1.5b raw |

### How to Run

```bash
# Prerequisites
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:1.5b  # for cross-model
ollama pull llama3.2:1b   # for cross-model

# Run all benchmarks
python -m benchmarks.run_all

# Or run individual benchmarks
python -m benchmarks.benchmark_speed
python -m benchmarks.benchmark_quality
python -m benchmarks.benchmark_cross_model
```
"""

    return report


async def main() -> None:
    """Run all benchmarks and generate report."""
    print("INC-LLM-v1 Benchmark Suite")
    print("=" * 60)
    print(f"Started: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # Check Ollama is running
    import urllib.request
    try:
        urllib.request.urlopen("http://localhost:11434/api/tags", timeout=5)
    except Exception:
        print("ERROR: Ollama is not running on localhost:11434")
        print("Start it with: ollama serve")
        sys.exit(1)

    t0 = time.time()

    # Run benchmarks
    speed_results = await run_speed_benchmarks()
    quality_results = await run_quality_benchmarks()
    cross_model_results = await run_cross_model_benchmarks()

    elapsed = time.time() - t0

    # Generate report
    report = generate_report(speed_results, quality_results, cross_model_results)

    # Save report
    report_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "benchmark_report.md",
    )
    with open(report_path, "w") as f:
        f.write(report)

    # Save raw JSON results
    json_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "benchmark_results.json",
    )
    with open(json_path, "w") as f:
        json.dump({
            "timestamp": datetime.datetime.now().isoformat(),
            "elapsed_s": round(elapsed, 2),
            "speed": speed_results,
            "quality": quality_results,
            "cross_model": cross_model_results,
        }, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"Benchmarks completed in {elapsed:.1f}s")
    print(f"Report saved to: {report_path}")
    print(f"Raw results saved to: {json_path}")


if __name__ == "__main__":
    asyncio.run(main())
