import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Check what the API server serves
cmds = [
    "grep -rn 'StaticFiles\|FileResponse\|mount\|static\|dist\|frontend' /opt/incentives-wallet/api_server.py | head -20",
    "head -30 /opt/incentives-wallet/api_server.py",
    "cat /opt/incentives-wallet/frontend/dist/index.html",
    "ls -la /opt/incentives-wallet/frontend/dist/assets/",
    "ls -la /opt/incentives-wallet/frontend/dist/locales/en/",
    "cat /opt/incentives-wallet/frontend/dist/locales/en/common.json | head -20",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err.strip():
        print(f"ERR: {err}")

ssh.close()
