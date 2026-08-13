import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

cmds = [
    "cat /tmp/api_server.log | tail -30",
    "ps aux | grep api_server | grep -v grep",
    "ss -tlnp | grep 8546",
    "grep -n 'soul_media' /opt/incentives-wallet/api_server.py",
    "head -20 /opt/incentives-wallet/api_server.py",
    "sed -n '4890,4900p' /opt/incentives-wallet/api_server.py",
    "sed -n '310,320p' /opt/incentives-wallet/api_server.py",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out.strip())
    if err.strip():
        print(f"ERR: {err.strip()}")

ssh.close()
