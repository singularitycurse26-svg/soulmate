import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix: Remove HTMLResponse from fastapi import, add to fastapi.responses import
content = content.replace(
    "from fastapi import HTMLResponse, FastAPI, Header, HTTPException, Request, Depends",
    "from fastapi import FastAPI, Header, HTTPException, Request, Depends",
    1
)
content = content.replace(
    "from fastapi.responses import JSONResponse, RedirectResponse",
    "from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse",
    1
)
print("Fixed HTMLResponse import")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s "http://localhost:8546/v1/browser/proxy?url=https://example.com" 2>&1 | head -5',
    timeout=15
)
print(f"Browser proxy: {stdout.read().decode().strip()[:300]}")

ssh.close()
print("\nDone!")
