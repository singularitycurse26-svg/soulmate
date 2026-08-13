#!/usr/bin/env python3
"""Quick test of incllmv2 /v1/ai/chat endpoint — measures response time."""
import json
import time
import urllib.request
import urllib.error

BASE = "http://localhost:8547"

# 1. Auth
req = urllib.request.Request(
    f"{BASE}/v1/auth/password",
    data=json.dumps({"password": "soulmate"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
r = urllib.request.urlopen(req, timeout=10)
data = json.loads(r.read())
print(f"Auth: {data.get('status')}")
token = data.get("token", "")

# 2. Chat
t0 = time.time()
req2 = urllib.request.Request(
    f"{BASE}/v1/ai/chat",
    data=json.dumps({"message": "What is 3+5? Answer in one word."}).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    method="POST",
)
try:
    r2 = urllib.request.urlopen(req2, timeout=300)
    data2 = json.loads(r2.read())
    elapsed = time.time() - t0
    print(f"Response time: {elapsed:.1f}s")
    print(f"Model: {data2.get('model', '')}")
    print(f"Status: {data2.get('status', '')}")
    resp = data2.get("response", "")
    print(f"Response ({len(resp)} chars): {resp[:300]}")
except urllib.error.HTTPError as e:
    elapsed = time.time() - t0
    body = e.read().decode()
    print(f"HTTP {e.code} after {elapsed:.1f}s: {body[:500]}")
