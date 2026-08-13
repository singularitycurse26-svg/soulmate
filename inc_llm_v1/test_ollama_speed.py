#!/usr/bin/env python3
"""Check available Ollama models and test response speed."""
import urllib.request, json, time

# List models
resp = urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=5)
data = json.loads(resp.read())
print("=== Available Models ===")
for m in data.get("models", []):
    size_mb = m.get("size", 0) // 1024 // 1024
    print(f"  {m['name']:40s} {size_mb:>6}MB")

# Test direct Ollama call with incentives-incllmv2
print("\n=== Test: incentives-incllmv2 ===")
messages = [
    {"role": "system", "content": "You are Incentives incllmv2, a self-improving AI assistant. Be concise and helpful."},
    {"role": "user", "content": "Hello, who are you?"},
]
body = json.dumps({
    "model": "incentives-incllmv2",
    "messages": messages,
    "stream": False,
    "options": {
        "num_predict": 256,
        "temperature": 0.7,
        "num_ctx": 2048,
        "num_batch": 512,
    },
    "keep_alive": "300s",
}).encode()

t0 = time.time()
req = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=120)
result = json.loads(resp.read().decode())
dt = time.time() - t0
print(f"  Response: {result.get('message', {}).get('content', '')[:200]}")
print(f"  Time: {dt:.1f}s")
print(f"  eval_count: {result.get('eval_count', '?')}")
print(f"  eval_duration: {result.get('eval_duration', 0) / 1e9:.1f}s")
print(f"  load_duration: {result.get('load_duration', 0) / 1e9:.1f}s")
print(f"  prompt_eval_duration: {result.get('prompt_eval_duration', 0) / 1e9:.1f}s")

# Test with qwen2.5:0.5b for comparison
print("\n=== Test: qwen2.5:0.5b ===")
body2 = json.dumps({
    "model": "qwen2.5:0.5b",
    "messages": messages,
    "stream": False,
    "options": {
        "num_predict": 256,
        "temperature": 0.7,
        "num_ctx": 2048,
        "num_batch": 512,
    },
    "keep_alive": "300s",
}).encode()

t0 = time.time()
req2 = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body2, headers={"Content-Type": "application/json"})
resp2 = urllib.request.urlopen(req2, timeout=60)
result2 = json.loads(resp2.read().decode())
dt2 = time.time() - t0
print(f"  Response: {result2.get('message', {}).get('content', '')[:200]}")
print(f"  Time: {dt2:.1f}s")
print(f"  eval_count: {result2.get('eval_count', '?')}")
print(f"  eval_duration: {result2.get('eval_duration', 0) / 1e9:.1f}s")

# Test with qwen2.5:3b for comparison
print("\n=== Test: qwen2.5:3b ===")
body3 = json.dumps({
    "model": "qwen2.5:3b",
    "messages": messages,
    "stream": False,
    "options": {
        "num_predict": 256,
        "temperature": 0.7,
        "num_ctx": 2048,
        "num_batch": 512,
    },
    "keep_alive": "300s",
}).encode()

t0 = time.time()
req3 = urllib.request.Request("http://127.0.0.1:11434/api/chat", data=body3, headers={"Content-Type": "application/json"})
try:
    resp3 = urllib.request.urlopen(req3, timeout=120)
    result3 = json.loads(resp3.read().decode())
    dt3 = time.time() - t0
    print(f"  Response: {result3.get('message', {}).get('content', '')[:200]}")
    print(f"  Time: {dt3:.1f}s")
    print(f"  eval_count: {result3.get('eval_count', '?')}")
    print(f"  eval_duration: {result3.get('eval_duration', 0) / 1e9:.1f}s")
except Exception as e:
    print(f"  Error: {e}")
