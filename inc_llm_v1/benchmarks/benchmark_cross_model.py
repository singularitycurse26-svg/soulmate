"""Cross-model comparison — INC-LLM-v1 running qwen2.5:0.5b vs larger raw models.

Shows that INC-LLM-v1's 0.5b (with RAG + memory + cache) punches above its weight
class by competing with larger models on quality while being faster.
"""

from __future__ import annotations

import asyncio
import json
import time
import urllib.request
from typing import Any

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness
from benchmarks.test_questions import CROSS_MODEL_QUESTIONS

OLLAMA_BASE_URL = "http://localhost:11434"
MAX_TOKENS = 256

# Models to compare (using models available on this machine)
MODELS = [
    {"name": "qwen2.5:0.5b", "label": "qwen2.5:0.5b (raw)", "inc_llm": False},
    {"name": "qwen2.5:0.5b", "label": "qwen2.5:0.5b (INC-LLM)", "inc_llm": True},
    {"name": "smollm2:360m", "label": "smollm2:360m (raw)", "inc_llm": False},
    {"name": "qwen3:1.7b", "label": "qwen3:1.7b (raw)", "inc_llm": False},
]


async def raw_ollama_chat(model: str, messages: list[dict[str, str]],
                          max_tokens: int = MAX_TOKENS) -> tuple[str, float]:
    """Call Ollama directly, return (response, elapsed_s)."""
    body = json.dumps({
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.3},
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
    return data.get("message", {}).get("content", ""), elapsed


def score_keywords(response: str, keywords: list[str]) -> float:
    """Score response by keyword matching."""
    response_lower = response.lower()
    hits = sum(1 for kw in keywords if kw.lower() in response_lower)
    return hits / len(keywords) if keywords else 0.0


async def check_model_available(model: str) -> bool:
    """Check if a model is available in Ollama."""
    try:
        def _do():
            req = urllib.request.Request(f"{OLLAMA_BASE_URL}/api/tags")
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read().decode())
            return [m["name"] for m in data.get("models", [])]
        names = await asyncio.to_thread(_do)
        return any(model in n for n in names)
    except Exception:
        return False


async def benchmark_model(model_cfg: dict[str, Any]) -> dict[str, Any]:
    """Benchmark a single model configuration on cross-model questions."""
    label = model_cfg["label"]
    model_name = model_cfg["name"]
    use_inc = model_cfg["inc_llm"]

    print(f"  [Cross-model] {label}...")

    if not await check_model_available(model_name):
        print(f"    SKIP (model not available)")
        return {
            "label": label,
            "model": model_name,
            "inc_llm": use_inc,
            "status": "skipped",
            "avg_score": 0.0,
            "avg_latency_s": 0.0,
            "scores": [],
            "latencies": [],
        }

    harness = None
    if use_inc:
        settings = Settings.from_env()
        settings.rlos.enabled = True
        settings.cache.enabled = False
        settings.knowledge.enabled = True
        # Override model to 0.5b
        from inc_llm.config import ModelConfig
        settings.models = ModelConfig.minimal()
        harness = IncLLMHarness(settings)
        await harness.initialize()

    scores: list[float] = []
    latencies: list[float] = []

    for i, q in enumerate(CROSS_MODEL_QUESTIONS):
        if use_inc and harness:
            t0 = time.time()
            result = await harness.chat("bench_user", q["question"], is_owner=True)
            elapsed = time.time() - t0
            response = result.get("response", "")
        else:
            response, elapsed = await raw_ollama_chat(
                model_name, [{"role": "user", "content": q["question"]}]
            )

        score = score_keywords(response, q["expected_keywords"])
        scores.append(score)
        latencies.append(elapsed)
        print(f"    Q{i+1}/{len(CROSS_MODEL_QUESTIONS)}: {score:.0%} ({elapsed:.1f}s)")

    if harness:
        await harness.close()

    return {
        "label": label,
        "model": model_name,
        "inc_llm": use_inc,
        "status": "ok",
        "avg_score": sum(scores) / len(scores),
        "avg_latency_s": sum(latencies) / len(latencies),
        "scores": [round(s, 3) for s in scores],
        "latencies": [round(l, 3) for l in latencies],
    }


async def run_cross_model_benchmarks() -> list[dict[str, Any]]:
    """Run cross-model comparison benchmarks."""
    print("\n=== Cross-Model Comparison ===")
    results: list[dict[str, Any]] = []

    for model_cfg in MODELS:
        result = await benchmark_model(model_cfg)
        results.append(result)

    return results
