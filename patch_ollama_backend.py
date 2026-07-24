#!/usr/bin/env python3
"""Patch VPS backend: add _call_ollama function and remove duplicate hermes-llm route."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

PATCH = r"""#!/usr/bin/env python3
import re

FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

# 1. Add _call_ollama async function before the second hermes-llm endpoint
# Insert it right before the duplicate route at line ~4591
if "async def _call_ollama(" not in content:
    ollama_func = '''
async def _call_ollama(model, messages, ollama_url="http://localhost:11434"):
    """Call Ollama chat API."""
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
        raise Exception(f"Ollama error: {e}")

'''
    # Insert before the second @app.post("/v1/ai/hermes-llm")
    # Find the second occurrence
    first_idx = content.find('@app.post("/v1/ai/hermes-llm")')
    if first_idx > 0:
        second_idx = content.find('@app.post("/v1/ai/hermes-llm")', first_idx + 1)
        if second_idx > 0:
            content = content[:second_idx] + ollama_func + content[second_idx:]
            print("Added _call_ollama function before second hermes-llm endpoint")
        else:
            print("WARNING: Could not find second hermes-llm endpoint")
    else:
        print("WARNING: Could not find any hermes-llm endpoint")
else:
    print("_call_ollama already exists")

with open(FILE, "w") as f:
    f.write(content)
print("Done")
"""

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Upload and run patch
    sftp = c.open_sftp()
    with sftp.file("/tmp/patch_ollama.py", "w") as f:
        f.write(PATCH)
    sftp.close()

    _, stdout, stderr = c.exec_command("python3 /tmp/patch_ollama.py", timeout=15)
    print("Patch:", stdout.read().decode(), stderr.read().decode())

    # Restart backend
    import time
    c.exec_command("pkill -f api_server.py", timeout=5)
    time.sleep(2)
    c.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &", timeout=5)
    time.sleep(4)

    # Verify running
    _, stdout, _ = c.exec_command("pgrep -f api_server.py", timeout=5)
    pid = stdout.read().decode().strip()
    print("Backend PID:", pid)

    if pid:
        # Test hermes-llm with ollama provider
        test_cmd = """curl -s -X POST http://localhost:8546/v1/ai/hermes-llm \
          -H "Content-Type: application/json" \
          -d '{"provider":"ollama","model":"gemma4:e4b","messages":[{"role":"user","content":"Say hello in one word"}]}'"""
        _, stdout, _ = c.exec_command(test_cmd, timeout=30)
        result = stdout.read().decode()
        print("Hermes-llm ollama test:", result[:300])
    else:
        _, stdout, _ = c.exec_command("tail -20 /tmp/api_server.log", timeout=5)
        print("Error log:", stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()
