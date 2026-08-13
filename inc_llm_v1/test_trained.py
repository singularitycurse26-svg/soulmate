#!/usr/bin/env python3
"""Test the newly trained incllmv2 model."""
import urllib.request, json, time

OLLAMA = "http://127.0.0.1:11434"

def chat(msg):
    body = json.dumps({
        "model": "incentives-incllmv2",
        "messages": [{"role": "user", "content": msg}],
        "stream": False,
        "options": {"num_predict": 256, "temperature": 0.7, "num_ctx": 4096},
        "keep_alive": "300s",
    }).encode()
    t0 = time.time()
    req = urllib.request.Request(f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    result = json.loads(resp.read().decode())
    dt = time.time() - t0
    return result.get("message", {}).get("content", ""), dt

tests = [
    "Hello, who are you?",
    "What is 3+5?",
    "What is 10*7?",
    "What is the capital of France?",
    "Write hello world in Python",
    "If I have 10 apples and eat 3, how many left?",
    "What is blockchain?",
    "Tell me a joke",
    "What is an API?",
    "What is 25+75?",
    "How do I read a file in Python?",
    "What comes next: 2, 4, 6, 8, ?",
]

print("=== Testing trained incllmv2 (3.1B base + 102 training examples) ===\n")
for q in tests:
    r, dt = chat(q)
    print(f"Q: {q}")
    print(f"A: {r[:200]}")
    print(f"Time: {dt:.1f}s\n")
