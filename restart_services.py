import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Check how the API server serves frontend
cmds = [
    "grep -n 'StaticFiles\|FileResponse\|HTMLResponse\|index.html\|catch_all\|not_found' /opt/incentives-wallet/api_server.py | head -20",
    "tail -50 /opt/incentives-wallet/api_server.py",
    # Restart the API server and Caddy
    "systemctl restart caddy 2>&1",
    "kill -HUP $(pgrep -f api_server.py) 2>&1",
    # Verify new index.html is served
    "curl -s http://localhost:8546/ | head -20",
    "curl -s http://localhost:8546/locales/en/common.json | head -20",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err.strip():
        print(f"ERR: {err}")

ssh.close()
