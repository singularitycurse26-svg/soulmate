import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

if "openclaw-llm" in content:
    print("OpenClaw endpoints already patched, skipping...")
else:
    # Add browser proxy and LLM proxy endpoints
    # Find a good insertion point — after the last AI endpoint
    insert_marker = '# --- End of AI endpoints ---'
    if insert_marker not in content:
        # Try to find the end of the file or a good marker
        # Find the last route definition
        idx = content.rfind('@app.')
        if idx < 0:
            print("ERROR: Could not find insertion point")
            exit(1)
        # Find the end of that function
        line_end = content.find('\n\n\n', idx)
        if line_end < 0:
            line_end = len(content)
        insert_marker = content[idx:line_end+3]

    new_endpoints = '''
# ===== OpenClaw Browser Proxy =====
import urllib.request
import urllib.error

@app.get("/v1/browser/proxy")
async def browser_proxy(request: Request, url: str = ""):
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter required")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='replace')
            # Remove X-Frame-Options and CSP to allow iframe embedding
            # Rewrite relative URLs to go through proxy
            from urllib.parse import urljoin, urlparse
            parsed = urlparse(url)
            base_url = f"{parsed.scheme}://{parsed.netloc}"
            # Rewrite relative links
            html = html.replace('href="/', f'href="{base_url}/')
            html = html.replace('src="/', f'src="{base_url}/')
            html = html.replace("href='/", f"href='{base_url}/")
            html = html.replace("src='/", f"src='{base_url}/")
            # Add a base tag
            html = html.replace('<head>', f'<head><base href="{url}">')
            return HTMLResponse(content=html)
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== OpenClaw LLM Proxy =====
import json as _json

@app.post("/v1/ai/openclaw-llm")
async def openclaw_llm(request: Request):
    try:
        data = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    provider = data.get("provider", "backend")
    model = data.get("model", "")
    messages = data.get("messages", [])
    api_key = data.get("api_key", "")

    if provider == "openai":
        import urllib.request
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=_json.dumps({
                "model": model or "gpt-4o-mini",
                "messages": messages,
            }).encode(),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}

    elif provider == "anthropic":
        import urllib.request
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=_json.dumps({
                "model": model or "claude-3-5-sonnet-20241022",
                "max_tokens": 4096,
                "messages": [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
                "system": "\n\n".join([m["content"] for m in messages if m["role"] == "system"]) or None,
            }).encode(),
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("content", [{}])[0].get("text", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}

    elif provider == "google":
        import urllib.request
        # Gemini API
        gemini_model = model or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
        contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
        system_text = "\n\n".join([m["content"] for m in messages if m["role"] == "system"])
        body = {"contents": contents}
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}
        req = urllib.request.Request(url, data=_json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"response": text, "model": gemini_model}
        except Exception as e:
            return {"error": str(e)}

    elif provider == "groq":
        import urllib.request
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=_json.dumps({"model": model or "llama-3.3-70b-versatile", "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}

    elif provider == "openrouter":
        import urllib.request
        req = urllib.request.Request(
            "https://openrouter.ai/api/v1/chat/completions",
            data=_json.dumps({"model": model or "auto", "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}

    elif provider == "ollama":
        import urllib.request
        ollama_url = data.get("ollama_url", "http://localhost:11434")
        req = urllib.request.Request(
            f"{ollama_url}/api/chat",
            data=_json.dumps({"model": model or "llama3", "messages": messages, "stream": False}).encode(),
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": f"Ollama error: {str(e)}. Make sure Ollama is running."}

    elif provider == "custom":
        import urllib.request
        custom_url = data.get("custom_url", "")
        if not custom_url:
            return {"error": "Custom URL not provided"}
        req = urllib.request.Request(
            f"{custom_url}/chat/completions",
            data=_json.dumps({"model": model, "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}

    else:
        return {"error": f"Unknown provider: {provider}"}

'''

    content = content.replace(insert_marker, new_endpoints + "\n" + insert_marker)
    print("Added OpenClaw browser proxy and LLM proxy endpoints")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test
stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

# Test browser proxy
stdin, stdout, stderr = ssh.exec_command(
    'curl -s "http://localhost:8546/v1/browser/proxy?url=https://example.com" 2>&1 | head -5',
    timeout=15
)
print(f"Browser proxy: {stdout.read().decode().strip()[:200]}")

# Test LLM proxy (should return error for missing key, but endpoint exists)
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/ai/openclaw-llm -H "Content-Type: application/json" -H "X-API-Token: soulmate_wallet_2024" -d \'{"provider":"openai","model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"api_key":"test"}\' 2>&1',
    timeout=15
)
print(f"LLM proxy: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone!")
