import urllib.request, json, time

messages = [
    {"role": "user", "content": "Say hello and tell me what you can do in 2 sentences."}
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
    print("Response:", repr(data.get("message", {}).get("content", "")[:500]))
    print("Eval count:", data.get("eval_count", 0))
except Exception as e:
    print("Time:", round(time.time()-t0, 1), "s")
    print("Error:", e)
