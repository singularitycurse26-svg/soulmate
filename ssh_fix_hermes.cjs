const { Client } = require('ssh2');
const c = new Client();
c.on('ready', async () => {
  const exec = (cmd) => new Promise((r) => {
    c.exec(cmd, (e, s) => {
      let o = ''; s.on('data', d => o += d); s.stderr.on('data', d => o += d);
      s.on('close', () => r(o));
    });
  });

  const FIX_SCRIPT = `#!/usr/bin/env python3
import sys
API_FILE = "/opt/incentives-wallet/api_server.py"
with open(API_FILE, "r") as f:
    content = f.read()

# Remove old hermes patch
marker_start = "import subprocess as _subprocess"
marker_end = "if __name__"
# Find the SECOND occurrence of "import subprocess as _subprocess" (the one from our patch)
first_idx = content.find(marker_start)
if first_idx != -1:
    second_idx = content.find(marker_start, first_idx + 1)
    if second_idx != -1:
        name_idx = content.find(marker_end, second_idx)
        if name_idx != -1:
            content = content[:second_idx] + content[name_idx:]
            print("Removed old patch")

# Now insert BEFORE the catch-all route
CATCHALL = '@app.get("/{path:path}")'
HERMES_CODE = '''
import subprocess as _subprocess
import json as _json
import uuid as _uuid

@app.post("/v1/ai/hermes-llm")
async def hermes_llm_proxy(request: Request):
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
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions",
            data=_json.dumps({"model": model or "gpt-4o-mini", "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}
    elif provider == "anthropic":
        import urllib.request
        req = urllib.request.Request("https://api.anthropic.com/v1/messages",
            data=_json.dumps({"model": model or "claude-3-5-sonnet-20241022", "max_tokens": 4096,
                "messages": [{"role": m["role"], "content": m["content"]} for m in messages if m["role"] != "system"],
                "system": chr(10).join([m["content"] for m in messages if m["role"] == "system"]) or None}).encode(),
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("content", [{}])[0].get("text", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}
    elif provider == "google":
        import urllib.request
        gemini_model = model or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={api_key}"
        contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
        system_text = chr(10).join([m["content"] for m in messages if m["role"] == "system"])
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
        req = urllib.request.Request("https://api.groq.com/openai/v1/chat/completions",
            data=_json.dumps({"model": model or "llama-3.3-70b-versatile", "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}
    elif provider == "openrouter":
        import urllib.request
        req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions",
            data=_json.dumps({"model": model or "auto", "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}
    elif provider == "ollama":
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
            return {"error": f"Ollama error: {str(e)}."}
    elif provider == "custom":
        import urllib.request
        custom_url = data.get("custom_url", "")
        if not custom_url:
            return {"error": "Custom URL not provided"}
        req = urllib.request.Request(f"{custom_url}/chat/completions",
            data=_json.dumps({"model": model, "messages": messages}).encode(),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                return {"response": result.get("choices", [{}])[0].get("message", {}).get("content", ""), "model": model}
        except Exception as e:
            return {"error": str(e)}
    elif provider == "backend":
        # Use Gemini API key from environment
        import os
        gemini_key = os.environ.get("GEMINI_API_KEY", "")
        if not gemini_key:
            return {"error": "No GEMINI_API_KEY set"}
        gemini_model = model or "gemini-1.5-flash"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
        contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in messages if m["role"] != "system"]
        system_text = chr(10).join([m["content"] for m in messages if m["role"] == "system"])
        body = {"contents": contents}
        if system_text:
            body["systemInstruction"] = {"parts": [{"text": system_text}]}}
        req = urllib.request.Request(url, data=_json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read().decode())
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                return {"response": text, "model": gemini_model}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": f"Unknown provider: {provider}"}

@app.post("/v1/openclaw/terminal")
async def openclaw_terminal_exec(request: Request):
    try:
        body = await request.json()
        command = body.get("command", "")
        cwd = body.get("cwd", None)
        if not command:
            return {"error": "No command provided", "exitCode": -1}
        result = _subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30, cwd=cwd)
        return {"stdout": result.stdout, "stderr": result.stderr, "exitCode": result.returncode}
    except _subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 30s", "exitCode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exitCode": -1}

@app.post("/v1/hermes/terminal")
async def hermes_terminal_exec(request: Request):
    try:
        body = await request.json()
        command = body.get("command", "")
        cwd = body.get("cwd", None)
        if not command:
            return {"error": "No command provided", "exitCode": -1}
        result = _subprocess.run(command, shell=True, capture_output=True, text=True, timeout=30, cwd=cwd)
        return {"stdout": result.stdout, "stderr": result.stderr, "exitCode": result.returncode}
    except _subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out after 30s", "exitCode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exitCode": -1}

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
    job = {"id": job_id, "schedule": body.get("schedule", ""), "description": body.get("description", ""), "active": True}
    _hermes_cron[job_id] = job
    return job

@app.delete("/v1/hermes/cron/{job_id}")
async def hermes_cron_delete(job_id):
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
    sub = {"id": sub_id, "task": body.get("task", ""), "status": "running"}
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
async def hermes_session_switch(sid):
    for s in _hermes_sessions.values():
        s["active"] = s["id"] == sid
    return _hermes_sessions.get(sid, {"error": "Not found"})

'''

if CATCHALL in content:
    content = content.replace(CATCHALL, HERMES_CODE + '\\n\\n' + CATCHALL)
    print("INSERTED_BEFORE_CATCHALL")
else:
    print("CATCHALL_NOT_FOUND")

with open(API_FILE, "w") as f:
    f.write(content)
print("DONE")
`;

  // Write and run the fix script
  console.log("Writing fix script...");
  await new Promise((resolve, reject) => {
    c.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.writeFile('/tmp/fix_hermes.py', FIX_SCRIPT, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });

  console.log("Running fix...");
  const fixResult = await exec("python3 /tmp/fix_hermes.py 2>&1");
  console.log("Fix result:", fixResult.trim());

  console.log("Restarting service...");
  const restartResult = await exec("systemctl restart incentives-wallet && sleep 3 && systemctl is-active incentives-wallet 2>&1");
  console.log("Service:", restartResult.trim());

  console.log("\nVerifying endpoints on port 8546...");
  const health = await exec("curl -s http://localhost:8546/health 2>&1 | head -c 100");
  console.log("Health:", health.trim());

  const llm = await exec('curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini-1.5-flash","messages":[{"role":"user","content":"say hi in 3 words"}]}\' 2>&1');
  console.log("Hermes LLM:", llm.trim().slice(0, 400));

  const term = await exec('curl -s -X POST http://localhost:8546/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\' 2>&1');
  console.log("Hermes Terminal:", term.trim());

  const oterm = await exec('curl -s -X POST http://localhost:8546/v1/openclaw/terminal -H "Content-Type: application/json" -d \'{"command":"whoami"}\' 2>&1');
  console.log("OpenClaw Terminal:", oterm.trim());

  const cron = await exec("curl -s http://localhost:8546/v1/hermes/cron 2>&1");
  console.log("Hermes Cron:", cron.trim());

  const sess = await exec("curl -s http://localhost:8546/v1/hermes/sessions 2>&1");
  console.log("Hermes Sessions:", sess.trim());

  const sub = await exec("curl -s http://localhost:8546/v1/hermes/subagent 2>&1");
  console.log("Hermes Subagents:", sub.trim());

  c.end();
});
c.on('error', (e) => console.error('SSH error:', e.message));
c.connect({ host: '191.44.121.29', username: 'root', password: 'wallmartxxxxxxxx8', readyTimeout: 15000 });
