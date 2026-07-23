import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Find the fastapi import line
lines = content.split('\n')
for i, line in enumerate(lines[:30]):
    if 'fastapi' in line.lower() or 'import' in line.lower():
        print(f"{i+1}: {line[:200]}")

# Run the server to see the error
ssh.exec_command("systemctl stop incentives-wallet 2>/dev/null", timeout=5)
time.sleep(2)

stdin, stdout, stderr = ssh.exec_command(
    'cd /opt/incentives-wallet && python3 api_server.py 2>&1 & sleep 5 && kill %1 2>/dev/null; wait 2>/dev/null',
    timeout=15
)
print("\nError output:")
print(stdout.read().decode()[:1000])

sftp.close()
ssh.close()
