import paramiko
import time
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

cmds = [
    "ps aux | grep api_server | grep -v grep",
    "grep -n 'WALLET_STATIC_DIR' /opt/incentives-wallet/api_server.py | head -5",
    # Restart the API server
    "cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &",
    "sleep 3",
    "ps aux | grep api_server | grep -v grep",
    "curl -s http://localhost:8546/ | head -25",
    "curl -s http://localhost:8546/locales/en/common.json | head -20",
]

for cmd in cmds:
    print(f"\n=== {cmd} ===")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out.strip():
        print(out)
    if err.strip():
        print(f"ERR: {err}")
    time.sleep(0.5)

ssh.close()
