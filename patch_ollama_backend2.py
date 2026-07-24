#!/usr/bin/env python3
"""Patch VPS backend: add _call_ollama function for hermes-llm ollama support."""
import paramiko
import time

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

# The patch script to run on the VPS
PATCH_LINES = [
    'import re',
    '',
    'FILE = "/opt/incentives-wallet/api_server.py"',
    'with open(FILE, "r") as f:',
    '    content = f.read()',
    '',
    'if "async def _call_ollama(" not in content:',
    '    ollama_func = "\\n"',
    '    ollama_func += "async def _call_ollama(model, messages, ollama_url=\\"http://localhost:11434\\"):\\n"',
    '    ollama_func += "    import urllib.request\\n"',
    '    ollama_func += "    req = urllib.request.Request(\\n"',
    '    ollama_func += "        f\\"{ollama_url}/api/chat\\",\\n"',
    '    ollama_func += "        data=_json.dumps({\\"model\\": model or \\"gemma4:e4b\\", \\"messages\\": messages, \\"stream\\": False}).encode(),\\n"',
    '    ollama_func += "        headers={\\"Content-Type\\": \\"application/json\\"},\\n"',
    '    ollama_func += "    )\\n"',
    '    ollama_func += "    try:\\n"',
    '    ollama_func += "        with urllib.request.urlopen(req, timeout=120) as resp:\\n"',
    '    ollama_func += "            result = _json.loads(resp.read().decode())\\n"',
    '    ollama_func += "            return result.get(\\"message\\", {}).get(\\"content\\", \\"\\")\\n"',
    '    ollama_func += "    except Exception as e:\\n"',
    '    ollama_func += "        raise Exception(f\\"Ollama error: {e}\\")\\n"',
    '    ollama_func += "\\n\\n"',
    '    first_idx = content.find(\'@app.post("/v1/ai/hermes-llm")\')',
    '    if first_idx > 0:',
    '        second_idx = content.find(\'@app.post("/v1/ai/hermes-llm")\', first_idx + 1)',
    '        if second_idx > 0:',
    '            content = content[:second_idx] + ollama_func + content[second_idx:]',
    '            print("Added _call_ollama function")',
    '        else:',
    '            print("WARNING: second hermes-llm not found")',
    '    else:',
    '        print("WARNING: hermes-llm not found")',
    'else:',
    '    print("_call_ollama already exists")',
    '',
    'with open(FILE, "w") as f:',
    '    f.write(content)',
    'print("Done")',
]

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Upload patch script
    patch_code = "\n".join(PATCH_LINES)
    sftp = c.open_sftp()
    with sftp.file("/tmp/patch_ollama2.py", "w") as f:
        f.write(patch_code)
    sftp.close()

    # Run patch
    _, stdout, stderr = c.exec_command("python3 /tmp/patch_ollama2.py", timeout=15)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("Patch:", out)
    if err:
        print("Errors:", err)

    # Restart backend
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
        test_cmd = 'curl -s -X POST http://localhost:8546/v1/ai/hermes-llm -H "Content-Type: application/json" -d \'{"provider":"ollama","model":"gemma4:e4b","messages":[{"role":"user","content":"Say hello in one word"}]}\''
        _, stdout, _ = c.exec_command(test_cmd, timeout=60)
        result = stdout.read().decode()
        print("Hermes-llm ollama test:", result[:500])
    else:
        _, stdout, _ = c.exec_command("tail -20 /tmp/api_server.log", timeout=5)
        print("Error log:", stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()
