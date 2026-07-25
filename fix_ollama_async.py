FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

old = '''async def _call_ollama(model, messages, ollama_url="http://localhost:11434"):
    import urllib.request
    if len(messages) > 6:
        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]
        messages = system_msgs + other_msgs[-5:]
    req = urllib.request.Request(
        f"{ollama_url}/api/chat",
        data=_json.dumps({
            "model": model or "gemma4:e4b",
            "messages": messages,
            "stream": False,
            "options": {"num_predict": 512, "temperature": 0.7}
        }).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("message", {}).get("content", "")
    except Exception as e:
        raise Exception(f"Ollama error: {e}")'''

new = '''def _call_ollama_sync(model, messages, ollama_url="http://localhost:11434"):
    import urllib.request
    if len(messages) > 6:
        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]
        messages = system_msgs + other_msgs[-5:]
    req = urllib.request.Request(
        f"{ollama_url}/api/chat",
        data=_json.dumps({
            "model": model or "gemma4:e4b",
            "messages": messages,
            "stream": False,
            "options": {"num_predict": 256, "temperature": 0.7}
        }).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("message", {}).get("content", "")
    except Exception as e:
        raise Exception(f"Ollama error: {e}")

async def _call_ollama(model, messages, ollama_url="http://localhost:11434"):
    import asyncio
    return await asyncio.to_thread(_call_ollama_sync, model, messages, ollama_url)'''

if old in content:
    content = content.replace(old, new)
    with open(FILE, "w") as f:
        f.write(content)
    print("Patched: made _call_ollama async-safe with to_thread, timeout=300s, num_predict=256")
else:
    print("OLD NOT FOUND")
