#!/usr/bin/env python3
"""
SSH script to add LLM auto-switcher to api_server.py on the VPS.
Adds POST /v1/ai/auto-llm endpoint that tries providers in order:
  1. Gemini (backend) — free, uses Google API key on VPS
  2. Groq — fast, needs GROQ_API_KEY env var
  3. OpenRouter — fallback, needs OPENROUTER_API_KEY env var
  4. Ollama gemma4:e4b — local, always available as last resort

When a provider returns 429 (rate limit) or fails, it auto-switches to the next.
Tracks which providers are rate-limited and skips them for 60 seconds.
"""

import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

AUTO_SWITCHER_CODE = r'''
# ===== LLM AUTO-SWITCHER =====

import time as _time
import os as _os

# Track rate-limited providers: {provider: timestamp_when_retry_ok}
_rate_limited = {}

# Provider fallback chain
_LLM_FALLBACK_CHAIN = ["gemini", "groq", "openrouter", "ollama"]

# How long to skip a rate-limited provider (seconds)
_RATE_LIMIT_COOLDOWN = 60

def _is_rate_limited(provider):
    """Check if a provider is currently rate-limited."""
    until = _rate_limited.get(provider)
    if until and _time.time() < until:
        return True
    if until:
        del _rate_limited[provider]
    return False

def _mark_rate_limited(provider):
    """Mark a provider as rate-limited for the cooldown period."""
    _rate_limited[provider] = _time.time() + _RATE_LIMIT_COOLDOWN

async def _auto_llm_call(messages, preferred_provider=None):
    """Try providers in fallback order. Return (response, model_used, provider_used)."""
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
                prompt = messages[-1].get("content", "") if messages else ""
                resp = await _call_backend_llm(prompt)
                return resp, "gemini-flash-latest", "gemini"

            elif provider == "groq":
                groq_key = _os.environ.get("GROQ_API_KEY", "")
                if not groq_key:
                    errors.append("groq: no API key")
                    continue
                resp = await _call_groq("llama-3.3-70b-versatile", messages, groq_key)
                return resp, "llama-3.3-70b-versatile", "groq"

            elif provider == "openrouter":
                or_key = _os.environ.get("OPENROUTER_API_KEY", "")
                if not or_key:
                    errors.append("openrouter: no API key")
                    continue
                resp = await _call_openrouter("auto", messages, or_key)
                return resp, "auto", "openrouter"

            elif provider == "ollama":
                resp = await _call_ollama("gemma4:e4b", messages, "http://localhost:11434")
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
async def auto_llm_endpoint(request: Request):
    """Auto-switching LLM endpoint. Tries Gemini -> Groq -> OpenRouter -> Ollama."""
    try:
        body = await request.json()
        messages = body.get("messages", [])
        preferred = body.get("preferred_provider")

        resp, model, provider = await _auto_llm_call(messages, preferred)

        return {
            "response": resp,
            "model": model,
            "provider": provider,
            "rate_limited": {k: int(v - _time.time()) for k, v in _rate_limited.items() if _time.time() < v},
        }
    except Exception as e:
        return {"error": str(e), "provider": "failed"}


@app.get("/v1/ai/auto-llm/status")
async def auto_llm_status():
    """Check which providers are currently available vs rate-limited."""
    now = _time.time()
    status = {}
    for p in _LLM_FALLBACK_CHAIN:
        until = _rate_limited.get(p)
        if until and now < until:
            status[p] = {"available": False, "retry_in_seconds": int(until - now)}
        else:
            status[p] = {"available": True}

    # Check env vars
    status["groq"]["has_key"] = bool(_os.environ.get("GROQ_API_KEY", ""))
    status["openrouter"]["has_key"] = bool(_os.environ.get("OPENROUTER_API_KEY", ""))

    return {"providers": status, "chain": _LLM_FALLBACK_CHAIN}

# ===== END LLM AUTO-SWITCHER =====
'''

PATCH_SCRIPT = r'''#!/usr/bin/env python3
import sys

API_FILE = "/opt/incentives-wallet/api_server.py"

with open(API_FILE, "r") as f:
    content = f.read()

if "auto-llm" in content:
    print("ALREADY_PATCHED")
    sys.exit(0)

INSERTION = """''' + AUTO_SWITCHER_CODE.replace('"""', "'''").replace("\\", "\\\\") + r'''"""

if 'if __name__' in content:
    content = content.replace('if __name__', INSERTION + '\n\nif __name__')
else:
    content = content + '\n' + INSERTION

with open(API_FILE, "w") as f:
    f.write(content)

print("PATCHED_SUCCESS")
'''

RESTART_CMD = "cd /opt/incentives-wallet && pkill -f 'uvicorn.*api_server' ; sleep 2 ; nohup python3 -m uvicorn api_server:app --host 0.0.0.0 --port 443 --ssl-keyfile /root/ssl/key.pem --ssl-certfile /root/ssl/cert.pem > /tmp/api_server.log 2>&1 & sleep 3 && curl -s http://localhost:443/v1/ai/auto-llm/status"

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

    # Write patch script to VPS
    print("Writing patch script...")
    sftp = client.open_sftp()
    with sftp.file("/tmp/patch_auto_switcher.py", "w") as f:
        f.write(PATCH_SCRIPT)
    sftp.close()

    # Run patch
    print("\n=== Patching api_server.py ===")
    stdin, stdout, stderr = client.exec_command("python3 /tmp/patch_auto_switcher.py", timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f"[stderr] {err}")

    if "ALREADY_PATCHED" in out:
        print("Auto-switcher already installed. Restarting server...")
    elif "PATCHED_SUCCESS" not in out:
        print("PATCH FAILED!")
        client.close()
        sys.exit(1)

    # Restart server
    print("\n=== Restarting API server ===")
    stdin, stdout, stderr = client.exec_command(RESTART_CMD, timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f"[stderr] {err}")

    # Test the endpoint
    print("\n=== Testing /v1/ai/auto-llm/status ===")
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:443/v1/ai/auto-llm/status", timeout=15)
    out = stdout.read().decode()
    print(out)

    client.close()
    print("\nDone! LLM auto-switcher installed.")

if __name__ == "__main__":
    main()
