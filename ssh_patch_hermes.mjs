import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const SSH_HOST = "191.44.121.29";
const SSH_USER = "root";
const SSH_PASS = "wallmartxxxxxxxx8";

const PATCH_SCRIPT = `#!/usr/bin/env python3
import sys
API_FILE = "/opt/incentives-wallet/api_server.py"
with open(API_FILE, "r") as f:
    content = f.read()
if "hermes-llm" in content:
    print("ALREADY_PATCHED")
    sys.exit(0)
HERMES_CODE = '''
import subprocess as _subprocess
import json as _json
import uuid as _uuid

@app.post("/v1/ai/hermes-llm")
async def hermes_llm_proxy(request: Request):
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
if 'if __name__' in content:
    content = content.replace('if __name__', HERMES_CODE + '\\n\\nif __name__')
else:
    content = content + '\\n' + HERMES_CODE
with open(API_FILE, "w") as f:
    f.write(content)
print("PATCHED_SUCCESS")
`;

const conn = new Client();

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
      stream.on('close', () => resolve({ stdout, stderr }));
    });
  });
}

conn.on('ready', async () => {
  try {
    // Write patch script via SFTP
    console.log("Writing patch script to VPS...");
    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.writeFile('/tmp/patch_hermes.py', PATCH_SCRIPT, (err) => {
          if (err) return reject(err);
          console.log("Patch script written.");
          resolve();
        });
      });
    });

    // Run the patch
    console.log("Running patch...");
    const patchResult = await sshExec(conn, 'python3 /tmp/patch_hermes.py');
    console.log("Patch result:", patchResult.stdout.trim() || patchResult.stderr.trim());

    // Restart service
    console.log("Restarting service...");
    const restartResult = await sshExec(conn, 'systemctl restart incentives-wallet && sleep 3 && systemctl is-active incentives-wallet');
    console.log("Service status:", restartResult.stdout.trim() || restartResult.stderr.trim());

    // Check health
    console.log("Checking health...");
    const healthResult = await sshExec(conn, 'curl -s http://localhost:8000/health');
    console.log("Health:", healthResult.stdout.trim().slice(0, 200));

    // Check hermes-llm endpoint
    console.log("Checking hermes-llm endpoint...");
    const llmResult = await sshExec(conn, 'curl -s -X POST http://localhost:8000/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"backend","model":"gemini","messages":[{"role":"user","content":"hello"}]}\'');
    console.log("Hermes LLM:", llmResult.stdout.trim().slice(0, 300));

    // Check terminal endpoint
    console.log("Checking terminal endpoint...");
    const termResult = await sshExec(conn, 'curl -s -X POST http://localhost:8000/v1/hermes/terminal -H "Content-Type: application/json" -d \'{"command":"echo hello"}\'');
    console.log("Terminal:", termResult.stdout.trim().slice(0, 300));

    console.log("\nDone!");
    conn.end();
  } catch (e) {
    console.error("Error:", e.message);
    conn.end();
  }
});

conn.on('error', (err) => {
  console.error("SSH connection error:", err.message);
});

console.log("Connecting to VPS...");
conn.connect({
  host: SSH_HOST,
  port: 22,
  username: SSH_USER,
  password: SSH_PASS,
  readyTimeout: 15000,
});
