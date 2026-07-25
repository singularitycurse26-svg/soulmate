import urllib.request, json, time

messages = [
    {"role": "system", "content": "You are Hermes, a helpful AI assistant. Be concise."},
    {"role": "user", "content": "Hello! What can you do?"}
]

body = json.dumps({
    "model": "gemma4:e4b",
    "messages": messages,
    "stream": False,
    "options": {"num_predict": 256, "temperature": 0.7}
}).encode()

t0 = time.time()
req = urllib.request.Request("http://localhost:11434/api/chat", data=body, headers={"Content-Type": "application/json"})
try:
    resp = urllib.request.urlopen(req, timeout=300)
    print("Time:", round(time.time()-t0, 1), "s")
    data = json.loads(resp.read().decode())
    print("Response:", data.get("message", {}).get("content", "")[:300])
    print("Eval count:", data.get("eval_count", 0))
    print("Eval duration:", data.get("eval_duration", 0) / 1e9, "s")
    print("Load duration:", data.get("load_duration", 0) / 1e9, "s")
except Exception as e:
    print("Time:", round(time.time()-t0, 1), "s")
    print("Error:", e)
