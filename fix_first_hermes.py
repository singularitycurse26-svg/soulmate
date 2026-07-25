FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

old = '''    elif provider == "ollama":
        import urllib.request
        ollama_url = data.get("ollama_url", "http://localhost:11434")
        req = urllib.request.Request(f"{ollama_url}/api/chat",
            data=_json.dumps({"model": model or "llama3", "messages": messages, "stream": False}).encode(),
            headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": f"Ollama error: {str(e)}."}'''

new = '''    elif provider == "ollama":
        import asyncio, urllib.request
        ollama_url = data.get("ollama_url", "http://localhost:11434")
        if len(messages) > 6:
            system_msgs = [m for m in messages if m.get("role") == "system"]
            other_msgs = [m for m in messages if m.get("role") != "system"]
            messages = system_msgs + other_msgs[-5:]
        def _ollama_call():
            req = urllib.request.Request(f"{ollama_url}/api/chat",
                data=_json.dumps({"model": model or "gemma4:e4b", "messages": messages, "stream": False,
                    "options": {"num_predict": 256, "temperature": 0.7}}).encode(),
                headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = _json.loads(resp.read().decode())
                return result.get("message", {}).get("content", "")
        try:
            resp_text = await asyncio.to_thread(_ollama_call)
            return {"response": resp_text, "model": model}
        except Exception as e:
            return {"error": f"Ollama error: {str(e)}."}'''

if old in content:
    content = content.replace(old, new)
    with open(FILE, "w") as f:
        f.write(content)
    print("Patched first hermes-llm ollama handler: timeout=300s, num_predict=256, async-safe")
else:
    print("OLD NOT FOUND")
