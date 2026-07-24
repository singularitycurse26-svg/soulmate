import paramiko
import time
import sys

SSH_HOST = "191.44.121.29"
SSH_USER = "root"
SSH_PASSWORD = "wallmartxxxxxxxx8"

REORDER_SCRIPT = r'''#!/usr/bin/env python3
"""Move the catch-all route to the very end of the file, after all other routes."""
import re

API_FILE = "/opt/incentives-wallet/api_server.py"

with open(API_FILE, "r") as f:
    content = f.read()

# Find the catch-all route block
catchall_start = content.find('@app.get("/{path:path}")')
if catchall_start == -1:
    print("NO_CATCHALL")
    sys.exit(0)

# Find the end of the catch-all function (next @app or class or if __name__)
search_from = catchall_start
lines = content[catchall_start:].split("\n")
catchall_lines = []
for i, line in enumerate(lines):
    catchall_lines.append(line)
    if i > 0 and (line.startswith("@app.") or line.startswith("if __name__") or line.startswith("import ")):
        catchall_lines.pop()  # don't include the next decorator/statement
        break

catchall_block = "\n".join(catchall_lines)

# Remove the catch-all from its current position
content = content.replace(catchall_block + "\n", "", 1)
# Also clean up any leftover blank lines
content = re.sub(r'\n{4,}', '\n\n\n', content)

# Insert the catch-all just before if __name__
if "if __name__" in content:
    content = content.replace("if __name__", catchall_block + "\n\nif __name__")
else:
    content = content + "\n" + catchall_block

with open(API_FILE, "w") as f:
    f.write(content)

print("REORDERED_SUCCESS")
'''

def main():
    print("Connecting to VPS...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(SSH_HOST, username=SSH_USER, password=SSH_PASSWORD, timeout=30)
    print("Connected.\n")

    sftp = client.open_sftp()
    with sftp.file("/tmp/reorder_routes.py", "w") as f:
        f.write(REORDER_SCRIPT)
    sftp.close()

    print("=== Reordering routes ===")
    stdin, stdout, stderr = client.exec_command("python3 /tmp/reorder_routes.py", timeout=30)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print(out)
    if err:
        print(f"[stderr] {err}")

    if "REORDERED_SUCCESS" not in out and "NO_CATCHALL" not in out:
        print("REORDER FAILED!")
        client.close()
        sys.exit(1)

    # Verify syntax
    stdin, stdout, stderr = client.exec_command('python3 -c "import py_compile; py_compile.compile(\'/opt/incentives-wallet/api_server.py\', doraise=True)" 2>&1', timeout=15)
    compile_out = stdout.read().decode()
    if compile_out:
        print(f"COMPILE ERROR: {compile_out}")
        client.close()
        sys.exit(1)
    print("Compile OK")

    print("\n=== Restarting ===")
    stdin, stdout, stderr = client.exec_command("systemctl restart incentives-wallet.service", timeout=30)
    print(stdout.read().decode(), stderr.read().decode())

    time.sleep(5)

    print("\n=== Testing all GET endpoints ===")
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/auto-heal/pending 2>&1", timeout=15)
    print("HEAL_PENDING:", stdout.read().decode())

    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/auto-heal/log 2>&1", timeout=15)
    print("HEAL_LOG:", stdout.read().decode())

    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/ai/auto-llm-status 2>&1", timeout=15)
    print("LLM_STATUS:", stdout.read().decode())

    # Verify health still works
    stdin, stdout, stderr = client.exec_command("curl -s http://localhost:8546/v1/health 2>&1 | head -c 100", timeout=15)
    print("HEALTH:", stdout.read().decode())

    client.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
