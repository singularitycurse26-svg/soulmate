import re
FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as fh:
    content = fh.read()

old = '''async def _call_ollama(model, messages, ollama_url="http://localhost:11434"):
    import urllib.request
    req = urllib.request.Request(
        f"{ollama_url}/api/chat",
        data=_json.dumps({"model": model or "gemma4:e4b", "messages": messages, "stream": False}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = _json.loads(resp.read().decode())
            return result.get("message", {}).get("content", "")
    except Exception as e:
        raise Exception(f"Ollama error: {e}")'''

new = '''async def _call_ollama(model, messages, ollama_url="http://localhost:11434"):
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

if old in content:
    content = content.replace(old, new)
    with open(FILE, "w") as fh:
        fh.write(content)
    print("Patched _call_ollama successfully")
else:
    print("OLD NOT FOUND - checking partial match")
    if "async def _call_ollama" in content:
        print("Function exists but content differs")
    else:
        print("Function not found at all")
