#!/usr/bin/env python3
"""Test Ollama directly with different models."""
import json
import urllib.request
import time

BASE = "http://127.0.0.1:11434"

models_to_test = [
    "incentives-incllmv2",
    "incentives-incllmv2:latest",
    "qwen2.5:0.5b",
    "smollm2:360m",
]

for model in models_to_test:
    print(f"\n--- Testing {model} ---")
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "Hello, who are you? Reply in one sentence."}],
        "stream": False,
        "options": {"num_predict": 64, "temperature": 0.7, "num_ctx": 2048},
        "keep_alive": "300s",
    }).encode()
    req = urllib.request.Request(f"{BASE}/api/chat", data=body, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        data = json.loads(resp.read().decode())
        elapsed = time.time() - t0
        content = data.get("message", {}).get("content", "")
        print(f"  Time: {elapsed:.1f}s")
        print(f"  Response: {content[:200]}")
    except Exception as e:
        elapsed = time.time() - t0
        print(f"  Error after {elapsed:.1f}s: {e}")
        try:
            body = e.read().decode()
            print(f"  Body: {body[:300]}")
        except:
            pass
