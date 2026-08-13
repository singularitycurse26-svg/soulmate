#!/usr/bin/env python3
"""Quick end-to-end test: auth + chat + RLT stats."""
import urllib.request, json, time

BASE = "http://localhost:8547"

# Auth
req = urllib.request.Request(
    f"{BASE}/v1/auth/password",
    data=json.dumps({"password": "soulmate"}).encode(),
    headers={"Content-Type": "application/json"},
)
resp = json.loads(urllib.request.urlopen(req, timeout=5).read())
token = resp["token"]
print(f"Auth: OK (token={token[:16]}...)")

# Chat
t0 = time.time()
req2 = urllib.request.Request(
    f"{BASE}/v1/ai/chat",
    data=json.dumps({"message": "What is 3+5? Answer in one word."}).encode(),
    headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
)
r = json.loads(urllib.request.urlopen(req2, timeout=120).read())
wall_time = time.time() - t0
print(f"Response: {r.get('response', '')[:100]}")
print(f"Execution time: {r.get('execution_time_s', '?')}s (wall: {wall_time:.1f}s)")
print(f"Cached: {r.get('cached', False)}")
print(f"RLT tokens: {r.get('context_used', {}).get('rlt_tokens', 0)}")
print(f"RLT context: {r.get('context_used', {}).get('rlt_context', '')[:200]}")

# RLT stats
try:
    req3 = urllib.request.Request(
        f"{BASE}/v1/rlt/stats",
        headers={"Authorization": f"Bearer {token}"},
    )
    stats = json.loads(urllib.request.urlopen(req3, timeout=5).read())
    print(f"RLT stats: {json.dumps(stats)}")
except Exception as e:
    print(f"RLT stats error: {e}")

# Health
try:
    hc = json.loads(urllib.request.urlopen(f"{BASE}/v1/health", timeout=5).read())
    print(f"Health: {hc.get('status', '?')}")
except Exception as e:
    print(f"Health error: {e}")

print("\nDone!")
