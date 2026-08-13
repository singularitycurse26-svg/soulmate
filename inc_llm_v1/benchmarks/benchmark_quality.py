"""Quality benchmark — compares INC-LLM-v1 (RAG + memory) vs raw Ollama.

Measures:
- Knowledge question accuracy (20 questions across 32 RAG domains)
- Coding task pass rate (10 tasks, auto-executed)
- Multi-turn conversation memory retention (5 conversations)
"""

from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
import time
import urllib.request
from typing import Any

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness
from benchmarks.test_questions import (
    CODING_TASKS,
    KNOWLEDGE_QUESTIONS,
    MULTI_TURN_CONVERSATIONS,
)

OLLAMA_BASE_URL = "http://localhost:11434"
TEST_MODEL = "qwen2.5:0.5b"
MAX_TOKENS = 256


async def raw_ollama_chat(model: str, messages: list[dict[str, str]],
                          max_tokens: int = MAX_TOKENS) -> str:
    """Call Ollama directly and return response text."""
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

    data = await asyncio.to_thread(_do)
    return data.get("message", {}).get("content", "")


def score_keywords(response: str, keywords: list[str]) -> float:
    """Score response by checking for expected keywords (case-insensitive)."""
    response_lower = response.lower()
    hits = sum(1 for kw in keywords if kw.lower() in response_lower)
    return hits / len(keywords) if keywords else 0.0


def extract_code(response: str) -> str:
    """Extract Python code from LLM response."""
    # Try ```python blocks
    match = re.search(r"```(?:python)?\s*\n(.*?)```", response, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Try to find function definitions
    lines = response.split("\n")
    code_lines: list[str] = []
    in_func = False
    for line in lines:
        if line.startswith("def ") or line.startswith("    ") and in_func:
            in_func = True
            code_lines.append(line)
        elif in_func and line and not line.startswith(" ") and not line.startswith("\t"):
            break
        elif in_func:
            code_lines.append(line)
    if code_lines:
        return "\n".join(code_lines)
    return response


def execute_code_safely(code: str, test_code: str, timeout: int = 10) -> str:
    """Execute generated code + test code safely, return output or error."""
    full_code = f"{code}\n\n{test_code}"
    try:
        result = subprocess.run(
            [sys.executable, "-c", full_code],
            capture_output=True, text=True, timeout=timeout,
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return f"ERROR: {result.stderr.strip()[:200]}"
    except subprocess.TimeoutExpired:
        return "ERROR: Timeout"
    except Exception as e:
        return f"ERROR: {e}"


async def benchmark_knowledge_raw() -> dict[str, Any]:
    """Test raw model on knowledge questions."""
    print("  [Quality] Knowledge questions (raw)...")
    scores: list[float] = []
    for i, q in enumerate(KNOWLEDGE_QUESTIONS):
        response = await raw_ollama_chat(
            TEST_MODEL, [{"role": "user", "content": q["question"]}]
        )
        score = score_keywords(response, q["expected_keywords"])
        scores.append(score)
        print(f"    Q{i+1}/{len(KNOWLEDGE_QUESTIONS)}: {score:.0%}")
    return {
        "test": "knowledge_raw",
        "scores": scores,
        "avg_score": sum(scores) / len(scores),
        "questions": len(KNOWLEDGE_QUESTIONS),
    }


async def benchmark_knowledge_inc() -> dict[str, Any]:
    """Test INC-LLM-v1 (with RAG) on knowledge questions."""
    print("  [Quality] Knowledge questions (INC-LLM)...")
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    settings.knowledge.enabled = True
    harness = IncLLMHarness(settings)
    await harness.initialize()

    scores: list[float] = []
    for i, q in enumerate(KNOWLEDGE_QUESTIONS):
        result = await harness.chat("bench_user", q["question"], is_owner=True)
        response = result.get("response", "")
        score = score_keywords(response, q["expected_keywords"])
        scores.append(score)
        print(f"    Q{i+1}/{len(KNOWLEDGE_QUESTIONS)}: {score:.0%}")

    await harness.close()
    return {
        "test": "knowledge_inc",
        "scores": scores,
        "avg_score": sum(scores) / len(scores),
        "questions": len(KNOWLEDGE_QUESTIONS),
    }


async def benchmark_coding_raw() -> dict[str, Any]:
    """Test raw model on coding tasks."""
    print("  [Quality] Coding tasks (raw)...")
    results: list[dict[str, Any]] = []
    for i, task in enumerate(CODING_TASKS):
        response = await raw_ollama_chat(
            TEST_MODEL, [{"role": "user", "content": task["prompt"]}],
            max_tokens=512,
        )
        code = extract_code(response)
        output = execute_code_safely(code, task["test_code"])
        passed = output == task["expected_output"]
        results.append({"task": i + 1, "passed": passed, "output": output[:100]})
        print(f"    Task {i+1}/{len(CODING_TASKS)}: {'PASS' if passed else 'FAIL'}")
    passes = sum(1 for r in results if r["passed"])
    return {
        "test": "coding_raw",
        "results": results,
        "pass_rate": passes / len(CODING_TASKS),
        "passed": passes,
        "total": len(CODING_TASKS),
    }


async def benchmark_coding_inc() -> dict[str, Any]:
    """Test INC-LLM-v1 on coding tasks."""
    print("  [Quality] Coding tasks (INC-LLM)...")
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    harness = IncLLMHarness(settings)
    await harness.initialize()

    results: list[dict[str, Any]] = []
    for i, task in enumerate(CODING_TASKS):
        result = await harness.chat("bench_user", task["prompt"], is_owner=True)
        response = result.get("response", "")
        code = extract_code(response)
        output = execute_code_safely(code, task["test_code"])
        passed = output == task["expected_output"]
        results.append({"task": i + 1, "passed": passed, "output": output[:100]})
        print(f"    Task {i+1}/{len(CODING_TASKS)}: {'PASS' if passed else 'FAIL'}")

    await harness.close()
    passes = sum(1 for r in results if r["passed"])
    return {
        "test": "coding_inc",
        "results": results,
        "pass_rate": passes / len(CODING_TASKS),
        "passed": passes,
        "total": len(CODING_TASKS),
    }


async def benchmark_multiturn_raw() -> dict[str, Any]:
    """Test raw model on multi-turn conversations (no memory between turns)."""
    print("  [Quality] Multi-turn conversations (raw)...")
    scores: list[float] = []
    for conv_idx, conv in enumerate(MULTI_TURN_CONVERSATIONS):
        messages: list[dict[str, str]] = []
        turn_scores: list[float] = []
        for turn_idx, turn in enumerate(conv):
            messages.append({"role": "user", "content": turn["content"]})
            response = await raw_ollama_chat(TEST_MODEL, messages)
            messages.append({"role": "assistant", "content": response})

            # Score last 2 turns (the questions about earlier context)
            if turn_idx >= 1:
                # Check if response references info from first turn
                first_content = conv[0]["content"].lower()
                response_lower = response.lower()
                # Extract key info from first message
                key_words = [w for w in first_content.split() if len(w) > 3
                             and w not in ("what", "name", "like", "building", "learning",
                                           "prefer", "list", "numbers", "rest", "need")]
                hits = sum(1 for w in key_words if w in response_lower)
                score = min(1.0, hits / 3) if key_words else 0.5
                turn_scores.append(score)

        conv_score = sum(turn_scores) / len(turn_scores) if turn_scores else 0.0
        scores.append(conv_score)
        print(f"    Conv {conv_idx+1}/{len(MULTI_TURN_CONVERSATIONS)}: {conv_score:.0%}")

    return {
        "test": "multiturn_raw",
        "scores": scores,
        "avg_score": sum(scores) / len(scores),
        "conversations": len(MULTI_TURN_CONVERSATIONS),
    }


async def benchmark_multiturn_inc() -> dict[str, Any]:
    """Test INC-LLM-v1 on multi-turn conversations (with memory)."""
    print("  [Quality] Multi-turn conversations (INC-LLM)...")
    settings = Settings.from_env()
    settings.rlos.enabled = True
    settings.cache.enabled = False
    harness = IncLLMHarness(settings)
    await harness.initialize()

    scores: list[float] = []
    for conv_idx, conv in enumerate(MULTI_TURN_CONVERSATIONS):
        turn_scores: list[float] = []
        for turn_idx, turn in enumerate(conv):
            result = await harness.chat(
                f"bench_user_{conv_idx}", turn["content"], is_owner=True,
            )
            response = result.get("response", "")

            if turn_idx >= 1:
                first_content = conv[0]["content"].lower()
                response_lower = response.lower()
                key_words = [w for w in first_content.split() if len(w) > 3
                             and w not in ("what", "name", "like", "building", "learning",
                                           "prefer", "list", "numbers", "rest", "need")]
                hits = sum(1 for w in key_words if w in response_lower)
                score = min(1.0, hits / 3) if key_words else 0.5
                turn_scores.append(score)

        conv_score = sum(turn_scores) / len(turn_scores) if turn_scores else 0.0
        scores.append(conv_score)
        print(f"    Conv {conv_idx+1}/{len(MULTI_TURN_CONVERSATIONS)}: {conv_score:.0%}")

    await harness.close()
    return {
        "test": "multiturn_inc",
        "scores": scores,
        "avg_score": sum(scores) / len(scores),
        "conversations": len(MULTI_TURN_CONVERSATIONS),
    }


async def run_quality_benchmarks() -> list[dict[str, Any]]:
    """Run all quality benchmarks."""
    print("\n=== Quality Benchmarks ===")
    results: list[dict[str, Any]] = []

    results.append(await benchmark_knowledge_raw())
    results.append(await benchmark_knowledge_inc())
    results.append(await benchmark_coding_raw())
    results.append(await benchmark_coding_inc())
    results.append(await benchmark_multiturn_raw())
    results.append(await benchmark_multiturn_inc())

    return results
