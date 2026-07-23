import paramiko
import os
import stat

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check how static files are served
stdin, stdout, stderr = ssh.exec_command("grep -n 'SERVE REACT\|StaticFiles\|mount\|index.html\|static' /opt/incentives-wallet/api_server.py 2>&1")
print("Static serving config:")
print(stdout.read().decode())

# Check if there's a frontend directory
stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/frontend/ 2>&1")
print("\nFrontend dir:")
print(stdout.read().decode())

# Check systemd service for how it's run
stdin, stdout, stderr = ssh.exec_command("cat /etc/systemd/system/incentives-wallet.service 2>&1")
print("\nSystemd service:")
print(stdout.read().decode())

ssh.close()
