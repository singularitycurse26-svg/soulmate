#!/usr/bin/env python3
"""Benchmark incentives-incllmv2 with the short system prompt."""
import json, time, urllib.request

BASE = "http://127.0.0.1:11434"

SYSTEM = "You are Incentives incllmv2, a self-improving AI assistant. Be concise and direct."

tests = [
    "What is the capital of France? One word.",
    "Hello, who are you?",
]

for q in tests:
    body = json.dumps({
        "model": "incentives-incllmv2",
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": q}],
        "stream": False,
        "options": {"num_predict": 128, "temperature": 0.3, "num_ctx": 2048},
        "keep_alive": "300s",
    }).encode()
    req = urllib.request.Request(f"{BASE}/api/chat", data=body, headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        r = urllib.request.urlopen(req, timeout=300)
        d = json.loads(r.read())
        elapsed = time.time() - t0
        tokens = d.get("eval_count", 0)
        tps = tokens / elapsed if elapsed > 0 else 0
        content = d.get("message", {}).get("content", "")
        print(f"{elapsed:6.1f}s  {tokens:4d} tok  {tps:5.1f} tok/s  Q: {q[:40]}")
        print(f"         A: {content[:120]}")
    except Exception as e:
        print(f"ERROR after {time.time()-t0:.1f}s: {e}")
