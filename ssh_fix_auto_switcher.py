import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

# Self-contained auto-switcher that doesn't depend on _call_* functions
FIX_CODE = r'''
# ===== LLM AUTO-SWITCHER (self-contained) =====
import time as _time
import os as _os2
import urllib.request as _urllib2
import json as _json2

_rate_limited = {}
_LLM_FALLBACK_CHAIN = ["gemini", "groq", "openrouter", "ollama"]
_RATE_LIMIT_COOLDOWN = 60

def _is_rate_limited(provider):
    until = _rate_limited.get(provider)
    if until and _time.time() < until:
        return True
    if until:
        del _rate_limited[provider]
    return False

def _mark_rate_limited(provider):
    _rate_limited[provider] = _time.time() + _RATE_LIMIT_COOLDOWN

def _call_gemini_direct(messages):
    """Call Gemini API directly."""
    gemini_key = _os2.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        raise Exception("No GEMINI_API_KEY set")
    gemini_model = "gemini-flash-latest"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
    contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
    system_text = chr(10).join([m["content"] for m in messages if m["role"] == "system"])
    body = {"contents": contents}
    if system_text:
        body["systemInstruction"] = {"parts": [{"text": system_text}]}}
    req = _urllib2.Request(url, data=_json2.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with _urllib2.urlopen(req, timeout=30) as resp:
        result = _json2.loads(resp.read().decode())
        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return text

def _call_groq_direct(messages):
    """Call Groq API directly."""
    groq_key = _os2.environ.get("GROQ_API_KEY", "")
    if not groq_key:
        raise Exception("No GROQ_API_KEY set")
    url = "https://api.groq.com/openai/v1/chat/completions"
    body = {"model": "llama-3.3-70b-versatile", "messages": messages, "max_tokens": 1024}
    req = _urllib2.Request(url, data=_json2.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {groq_key}"})
    with _urllib2.urlopen(req, timeout=30) as resp:
        result = _json2.loads(resp.read().decode())
        return result.get("choices", [{}])[0].get("message", {}).get("content", "")

def _call_openrouter_direct(messages):
    """Call OpenRouter API directly."""
    or_key = _os2.environ.get("OPENROUTER_API_KEY", "")
    if not or_key:
        raise Exception("No OPENROUTER_API_KEY set")
    url = "https://openrouter.ai/api/v1/chat/completions"
    body = {"model": "auto", "messages": messages, "max_tokens": 1024}
    req = _urllib2.Request(url, data=_json2.dumps(body).encode(), headers={"Content-Type": "application/json", "Authorization": f"Bearer {or_key}"})
    with _urllib2.urlopen(req, timeout=30) as resp:
        result = _json2.loads(resp.read().decode())
        return result.get("choices", [{}])[0].get("message", {}).get("content", "")

def _call_ollama_direct(messages):
    """Call Ollama directly."""
    url = "http://localhost:11434/api/chat"
    body = {"model": "gemma4:e4b", "messages": messages, "stream": False, "options": {"temperature": 0.7, "num_predict": 1024}}
    req = _urllib2.Request(url, data=_json2.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with _urllib2.urlopen(req, timeout=90) as resp:
        result = _json2.loads(resp.read().decode())
        return result.get("message", {}).get("content", "")

async def _auto_llm_call_v2(messages, preferred_provider=None):
    """Try providers in fallback order."""
    chain = list(_LLM_FALLBACK_CHAIN)
    if preferred_provider and preferred_provider in chain:
        chain.remove(preferred_provider)
        chain.insert(0, preferred_provider)

    errors = []
    for provider in chain:
        if _is_rate_limited(provider):
            errors.append(f"{provider}: rate-limited (cooldown)")
            continue
        try:
            if provider == "gemini":
                resp = _call_gemini_direct(messages)
                return resp, "gemini-flash-latest", "gemini"
            elif provider == "groq":
                resp = _call_groq_direct(messages)
                return resp, "llama-3.3-70b-versatile", "groq"
            elif provider == "openrouter":
                resp = _call_openrouter_direct(messages)
                return resp, "auto", "openrouter"
            elif provider == "ollama":
                resp = _call_ollama_direct(messages)
                return resp, "gemma4:e4b", "ollama"
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "rate limit" in err_str or "quota" in err_str:
                _mark_rate_limited(provider)
                errors.append(f"{provider}: rate-limited")
            else:
                errors.append(f"{provider}: {str(e)[:100]}")
            continue

    return f"All LLM providers failed: {'; '.join(errors)}", "none", "failed"

@app.post("/v1/ai/auto-llm")
async def auto_llm_endpoint_v2(request: Request):
    try:
        body = await request.json()
        messages = body.get("messages", [])
        preferred = body.get("preferred_provider")
        resp, model, provider = await _auto_llm_call_v2(messages, preferred)
        return {
            "response": resp,
            "model": model,
            "provider": provider,
            "rate_limited": {k: int(v - _time.time()) for k, v in _rate_limited.items() if _time.time() < v},
        }
    except Exception as e:
        return {"error": str(e), "provider": "failed"}

@app.get("/v1/ai/auto-llm/status")
async def auto_llm_status_v2():
    now = _time.time()
    status = {}
    for p in _LLM_FALLBACK_CHAIN:
        until = _rate_limited.get(p)
        if until and now < until:
            status[p] = {"available": False, "retry_in_seconds": int(until - now)}
        else:
            status[p] = {"available": True}
    status["gemini"]["has_key"] = bool(_os2.environ.get("GEMINI_API_KEY", ""))
    status["groq"]["has_key"] = bool(_os2.environ.get("GROQ_API_KEY", ""))
    status["openrouter"]["has_key"] = bool(_os2.environ.get("OPENROUTER_API_KEY", ""))
    return {"providers": status, "chain": _LLM_FALLBACK_CHAIN}

# ===== END LLM AUTO-SWITCHER =====
'''

# Script to replace the old auto-switcher code on the VPS
REPLACE_SCRIPT = r'''#!/usr/bin/env python3
import sys

API_FILE = "/opt/incentives-wallet/api_server.py"

with open(API_FILE, "r") as f:
    content = f.read()

# Remove old auto-switcher code (between markers)
start_marker = "# ===== LLM AUTO-SWITCHER"
end_marker = "# ===== END LLM AUTO-SWITCHER ====="

start_idx = content.find(start_marker)
if start_idx == -1:
    print("NO_OLD_CODE_FOUND")
else:
    end_idx = content.find(end_marker, start_idx)
    if end_idx == -1:
        print("END_MARKER_NOT_FOUND")
        sys.exit(1)
    end_idx += len(end_marker)
    content = content[:start_idx] + content[end_idx:]
    print("REMOVED_OLD_CODE")

NEW_CODE = """''' + FIX_CODE.replace('"""', "'''").replace("\\", "\\\\") + r'''"""

# Insert before if __name__
if 'if __name__' in content:
    content = content.replace('if __name__', NEW_CODE + '\n\nif __name__')
else:
    content = content + '\n' + NEW_CODE

with open(API_FILE, "w") as f:
    f.write(content)

print("PATCHED_SUCCESS")
'''

def main():
    print(f"Connecting to VPS at {SSH_HOST}...")
    try:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=30)
        print("Connected.\n")
    except Exception as e:
        print(f"SSH connection failed: {e}")
        sys.exit(1)

    # Write replace script to VPS
    print("Writing fix script...")
    sftp = client.open_sftp()
    with sftp.file("/tmp/fix_auto_switcher.py", "w") as f:
        f.write(REPLACE_SCRIPT)
    sftp.close()

    # Run fix
    print("\n=== Fixing api_server.py ===")
    stdin, stdout, stderr = client.exec_command("python3 /tmp/fix_auto_switcher.py", timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f"[stderr] {err}")

    if "PATCHED_SUCCESS" not in out:
        print("PATCH FAILED!")
        client.close()
        sys.exit(1)

    # Restart service
    print("\n=== Restarting service ===")
    stdin, stdout, stderr = client.exec_command("systemctl restart incentives-wallet.service", timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out, err)

    time.sleep(5)

    # Test status endpoint
    print("\n=== Testing status ===")
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/ai/auto-llm/status 2>&1", timeout=15)
    out = stdout.read().decode()
    print("STATUS:", out)

    # Test LLM call
    print("\n=== Testing LLM call ===")
    stdin, stdout, stderr = client.exec_command('''curl -s -X POST http://localhost:8546/v1/ai/auto-llm -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"Say hello in one word"}]}' 2>&1''', timeout=60)
    out = stdout.read().decode()
    print("LLM:", out)

    client.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
