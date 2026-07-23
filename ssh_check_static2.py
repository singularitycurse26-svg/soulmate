import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Find WALLET_STATIC_DIR
stdin, stdout, stderr = ssh.exec_command("grep -n 'WALLET_STATIC_DIR' /opt/incentives-wallet/api_server.py 2>&1")
print("WALLET_STATIC_DIR config:")
print(stdout.read().decode())

# Check if the directory exists
stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/dist/ 2>&1 || ls -la /opt/incentives-wallet/build/ 2>&1 || echo 'No dist/build dir'")
print("\nExisting dist/build:")
print(stdout.read().decode())

ssh.close()
