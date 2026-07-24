#!/usr/bin/env python3
"""
SSH script to add auto-heal endpoints to api_server.py on the VPS.
Adds:
  POST /v1/auto-heal/report  — Receive error batch from frontend
  GET  /v1/auto-heal/pending — Bouncer polls this for new errors
  POST /v1/auto-heal/ack     — Bouncer acknowledges errors as received
  GET  /v1/auto-heal/log     — View healing history
"""

import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

HEALING_CODE = r'''
# ===== AUTO-HEAL ENDPOINTS =====
import os as _heal_os
import json as _heal_json
import uuid as _heal_uuid
import time as _heal_time

_HEAL_DIR = "/opt/incentives-wallet/healing"
_HEAL_ERRORS_FILE = os.path.join(_HEAL_DIR, "errors.json")
_HEAL_LOG_FILE = os.path.join(_HEAL_DIR, "healing_log.json")

os.makedirs(_HEAL_DIR, exist_ok=True)

def _load_errors():
    try:
        with open(_HEAL_ERRORS_FILE, "r") as f:
            return _heal_json.load(f)
    except:
        return []

def _save_errors(errors):
    with open(_HEAL_ERRORS_FILE, "w") as f:
        _heal_json.dump(errors, f, indent=2)

def _load_heal_log():
    try:
        with open(_HEAL_LOG_FILE, "r") as f:
            return _heal_json.load(f)
    except:
        return []

def _save_heal_log(log):
    with open(_HEAL_LOG_FILE, "w") as f:
        _heal_json.dump(log, f, indent=2)

@app.post("/v1/auto-heal/report")
async def auto_heal_report(request: Request):
    """Receive error batch from frontend."""
    try:
        body = await request.json()
        errors = body.get("errors", [])
        existing = _load_errors()

        for err in errors:
            err["id"] = str(_heal_uuid.uuid4())[:12]
            err["status"] = "new"
            err["received_at"] = _heal_time.time()
            existing.append(err)

        if len(existing) > 200:
            existing = existing[-200:]

        _save_errors(existing)
        return {"status": "ok", "received": len(errors), "total_pending": len([e for e in existing if e["status"] == "new"])}
    except Exception as e:
        return {"error": str(e)}

@app.get("/v1/auto-heal/pending")
async def auto_heal_pending():
    """Bouncer polls this for new errors to fix."""
    errors = _load_errors()
    new_errors = [e for e in errors if e["status"] == "new"]

    for e in new_errors:
        e["status"] = "queued"

    _save_errors(errors)
    return {"errors": new_errors}

@app.post("/v1/auto-heal/ack")
async def auto_heal_ack(request: Request):
    """Bouncer acknowledges errors as received/injected."""
    try:
        body = await request.json()
        ids = body.get("ids", [])
        errors = _load_errors()

        for e in errors:
            if e["id"] in ids:
                e["status"] = "received"
                e["acked_at"] = _heal_time.time()

        _save_errors(errors)

        log = _load_heal_log()
        for e in errors:
            if e["id"] in ids:
                log.append({
                    "id": e["id"],
                    "type": e.get("type", ""),
                    "message": e.get("message", ""),
                    "page": e.get("page", ""),
                    "timestamp": e.get("timestamp", ""),
                    "acked_at": e.get("acked_at"),
                })
        if len(log) > 100:
            log = log[-100:]
        _save_heal_log(log)

        return {"status": "ok", "acked": len(ids)}
    except Exception as e:
        return {"error": str(e)}

@app.get("/v1/auto-heal/log")
async def auto_heal_log():
    """View healing history."""
    return {"log": _load_heal_log(), "pending": len([e for e in _load_errors() if e["status"] in ("new", "queued")])}

# ===== END AUTO-HEAL ENDPOINTS =====
'''

PATCH_SCRIPT = r'''#!/usr/bin/env python3
import sys

API_FILE = "/opt/incentives-wallet/api_server.py"

with open(API_FILE, "r") as f:
    content = f.read()

if "auto-heal" in content:
    print("ALREADY_PATCHED")
    sys.exit(0)

INSERTION = """''' + HEALING_CODE.replace('"""', "'''").replace("\\", "\\\\") + r'''"""

if 'if __name__' in content:
    content = content.replace('if __name__', INSERTION + '\n\nif __name__')
else:
    content = content + '\n' + INSERTION

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

    sftp = client.open_sftp()
    with sftp.file("/tmp/patch_healing.py", "w") as f:
        f.write(PATCH_SCRIPT)
    sftp.close()

    print("=== Patching api_server.py ===")
    stdin, stdout, stderr = client.exec_command("python3 /tmp/patch_healing.py", timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f"[stderr] {err}")

    if "ALREADY_PATCHED" in out:
        print("Healing endpoints already installed.")
    elif "PATCHED_SUCCESS" not in out:
        print("PATCH FAILED!")
        client.close()
        sys.exit(1)

    # Verify syntax
    stdin, stdout, stderr = client.exec_command('python3 -c "import py_compile; py_compile.compile(\'/opt/incentives-wallet/api_server.py\', doraise=True)" 2>&1', timeout=15)
    compile_out = stdout.read().decode()
    if compile_out:
        print(f"COMPILE ERROR: {compile_out}")
        client.close()
        sys.exit(1)

    print("\n=== Restarting service ===")
    stdin, stdout, stderr = client.exec_command("systemctl restart incentives-wallet.service", timeout=30)
    print(stdout.read().decode(), stderr.read().decode())

    time.sleep(5)

    print("\n=== Testing endpoints ===")
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/auto-heal/pending 2>&1", timeout=15)
    print("PENDING:", stdout.read().decode())

    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/auto-heal/log 2>&1", timeout=15)
    print("LOG:", stdout.read().decode())

    client.close()
    print("\nDone! Auto-heal endpoints installed.")

if __name__ == "__main__":
    main()
