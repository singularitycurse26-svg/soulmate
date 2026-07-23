#!/usr/bin/env python3
"""
SSH patch to add Hermes Agent + terminal exec endpoints to api_server.py on the VPS.
Adds:
  - POST /v1/ai/hermes-llm  (Hermes LLM proxy)
  - POST /v1/openclaw/terminal  (shell command execution)
  - POST /v1/hermes/terminal  (shell command execution)
  - GET/POST/DELETE /v1/hermes/cron  (cron scheduling)
  - GET/POST /v1/hermes/subagent  (subagent spawning)
  - GET/POST /v1/hermes/sessions  (session management)
"""

import paramiko
import time

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

HERMES_CODE = r'''
# ===== HERMES AGENT + TERMINAL ENDPOINTS =====

import subprocess as _subprocess
import json as _json
import uuid as _uuid

@app.post("/v1/ai/hermes-llm")
async def hermes_llm_proxy(request: Request):
    """Hermes Agent LLM proxy — same as openclaw-llm but for Hermes."""
    try:
        body = await request.json()
        provider = body.get("provider", "backend")
        model = body.get("model", "gemini")
        messages = body.get("messages", [])
        api_key = body.get("api_key")

        if provider == "backend":
            prompt = messages[-1].get("content", "") if messages else ""
            resp = await _call_backend_llm(prompt)
            return {"response": resp, "model": "backend"}

        if provider == "ollama":
            resp = await _call_ollama(model, messages, api_key or "http://localhost:11434")
            return {"response": resp, "model": f"ollama/{model}"}

        if provider == "openai":
            resp = await _call_openai(model, messages, api_key)
            return {"response": resp, "model": f"openai/{model}"}

        if provider == "anthropic":
            resp = await _call_anthropic(model, messages, api_key)
            return {"response": resp, "model": f"anthropic/{model}"}

        if provider == "google":
            resp = await _call_google(model, messages, api_key)
            return {"response": resp, "model": f"google/{model}"}

        if provider == "groq":
            resp = await _call_groq(model, messages, api_key)
            return {"response": resp, "model": f"groq/{model}"}

        if provider == "openrouter":
            resp = await _call_openrouter(model, messages, api_key)
            return {"response": resp, "model": f"openrouter/{model}"}

        return {"error": f"Unknown provider: {provider}"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/v1/openclaw/terminal")
async def openclaw_terminal_exec(request: Request):
    """Execute a shell command on the server (OpenClaw)."""
    try:
        body = await request.json()
        command = body.get("command", "")
        cwd = body.get("cwd", None)

        if not command:
            return {"error": "No command provided", "exitCode": -1}

        result = _subprocess.run(
            command, shell=True, capture_output=True, text=True,
            timeout=30, cwd=cwd
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exitCode": result.returncode,
        }
    except _subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 30s", "exitCode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exitCode": -1}


@app.post("/v1/hermes/terminal")
async def hermes_terminal_exec(request: Request):
    """Execute a shell command on the server (Hermes Agent)."""
    try:
        body = await request.json()
        command = body.get("command", "")
        cwd = body.get("cwd", None)

        if not command:
            return {"error": "No command provided", "exitCode": -1}

        result = _subprocess.run(
            command, shell=True, capture_output=True, text=True,
            timeout=30, cwd=cwd
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exitCode": result.returncode,
        }
    except _subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 30s", "exitCode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exitCode": -1}


# In-memory storage for cron/subagents/sessions
_hermes_cron = {}
_hermes_subagents = {}
_hermes_sessions = {"s1": {"id": "s1", "title": "Main Session", "active": True}}


@app.get("/v1/hermes/cron")
async def hermes_cron_list():
    return {"jobs": list(_hermes_cron.values())}


@app.post("/v1/hermes/cron")
async def hermes_cron_add(request: Request):
    body = await request.json()
    job_id = str(_uuid.uuid4())[:8]
    job = {
        "id": job_id,
        "schedule": body.get("schedule", ""),
        "description": body.get("description", ""),
        "active": True,
    }
    _hermes_cron[job_id] = job
    return job


@app.delete("/v1/hermes/cron/{job_id}")
async def hermes_cron_delete(job_id: str):
    if job_id in _hermes_cron:
        del _hermes_cron[job_id]
        return {"status": "deleted"}
    return {"error": "Not found"}


@app.get("/v1/hermes/subagent")
async def hermes_subagent_list():
    return {"subagents": list(_hermes_subagents.values())}


@app.post("/v1/hermes/subagent")
async def hermes_subagent_spawn(request: Request):
    body = await request.json()
    sub_id = str(_uuid.uuid4())[:8]
    sub = {
        "id": sub_id,
        "task": body.get("task", ""),
        "status": "running",
    }
    _hermes_subagents[sub_id] = sub
    return sub


@app.get("/v1/hermes/sessions")
async def hermes_session_list():
    return {"sessions": list(_hermes_sessions.values())}


@app.post("/v1/hermes/sessions")
async def hermes_session_create():
    sid = f"s{len(_hermes_sessions) + 1}"
    session = {"id": sid, "title": f"Session {len(_hermes_sessions) + 1}", "active": True}
    _hermes_sessions[sid] = session
    return session


@app.post("/v1/hermes/sessions/{sid}/switch")
async def hermes_session_switch(sid: str):
    for s in _hermes_sessions.values():
        s["active"] = s["id"] == sid
    return _hermes_sessions.get(sid, {"error": "Not found"})

# ===== END HERMES AGENT ENDPOINTS =====
'''

PATCH_SCRIPT = r'''#!/usr/bin/env python3
import sys

API_FILE = "/root/incentives-wallet/api_server.py"

with open(API_FILE, "r") as f:
    content = f.read()

# Check if already patched
if "hermes-llm" in content:
    print("ALREADY_PATCHED")
    sys.exit(0)

# Find a good insertion point — before the last line or at the end of the file
# We'll insert before the final `if __name__` block or at the end
insertion = """''' + HERMES_CODE.replace('"""', "'''") + r""""""

if 'if __name__' in content:
    content = content.replace('if __name__', insertion + '\n\nif __name__')
else:
    content = content + '\n' + insertion

with open(API_FILE, "w") as f:
    f.write(content)

print("PATCHED_SUCCESS")
'''

def main():
    print("Connecting to VPS...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=15)

    # Write the patch script
    print("Writing patch script...")
    sftp = ssh.open_sftp()
    with sftp.file("/tmp/patch_hermes.py", "w") as f:
        f.write(PATCH_SCRIPT)
    sftp.close()

    # Run the patch
    print("Running patch...")
    stdin, stdout, stderr = ssh.exec_command("python3 /tmp/patch_hermes.py")
    result = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"Patch result: {result}")
    if err:
        print(f"Stderr: {err}")

    if result == "ALREADY_PATCHED":
        print("Server already has Hermes endpoints. Skipping.")
    elif result == "PATCHED_SUCCESS":
        print("Patch applied successfully!")
    else:
        print(f"Unexpected result: {result}")
        if err:
            print(f"Error: {err}")
        ssh.close()
        return

    # Restart the service
    print("Restarting incentives-wallet service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart incentives-wallet")
    time.sleep(3)

    # Check status
    stdin, stdout, stderr = ssh.exec_command("systemctl is-active incentives-wallet")
    status = stdout.read().decode().strip()
    print(f"Service status: {status}")

    # Check health
    print("Checking health...")
    stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8000/health")
    health = stdout.read().decode().strip()
    print(f"Health: {health[:200]}")

    # Check if hermes-llm endpoint exists
    print("Checking hermes-llm endpoint...")
    stdin, stdout, stderr = ssh.exec_command('curl -s -X POST http://localhost:8000/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini","messages":[{"role":"user","content":"hello"}]}\'')
    resp = stdout.read().decode().strip()
    print(f"Hermes LLM response: {resp[:300]}")

    # Check terminal endpoint
    print("Checking terminal endpoint...")
    stdin, stdout, stderr = ssh.exec_command('curl -s -X POST http://localhost:8000/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\'')
    resp = stdout.read().decode().strip()
    print(f"Terminal response: {resp[:300]}")

    ssh.close()
    print("Done!")


if __name__ == "__main__":
    main()
