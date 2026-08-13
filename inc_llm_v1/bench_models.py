#!/usr/bin/env python3
"""Benchmark different Ollama models for response speed."""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:11434"

SYSTEM_PROMPT = "You are a helpful AI assistant. Be concise and direct."

models = [
    "qwen2.5:0.5b",
    "smollm2:360m",
    "qwen3:1.7b",
    "incentives-incllmv2",
]

for model in models:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "What is 2+2? Answer in one word."},
        ],
        "stream": False,
        "options": {"num_predict": 64, "temperature": 0.3, "num_ctx": 2048},
        "keep_alive": "300s",
    }).encode()

    req = urllib.request.Request(f"{BASE}/api/chat", data=body, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.loads(resp.read().decode())
        elapsed = time.time() - t0
        content = data.get("message", {}).get("content", "")
        tokens = data.get("eval_count", 0)
        tps = tokens / elapsed if elapsed > 0 else 0
        print(f"{model:30s}  {elapsed:6.1f}s  {tokens:4d} tokens  {tps:5.1f} tok/s  {content[:80]}")
    except Exception as e:
        elapsed = time.time() - t0
        print(f"{model:30s}  ERROR after {elapsed:.1f}s: {e}")
