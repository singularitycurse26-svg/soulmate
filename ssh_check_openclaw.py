import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check service status
stdin, stdout, stderr = ssh.exec_command('systemctl status incentives-wallet 2>&1 | head -20', timeout=10)
print("Service status:")
print(stdout.read().decode())

# Check journal logs
stdin, stdout, stderr = ssh.exec_command('journalctl -u incentives-wallet --no-pager -n 30 2>&1', timeout=10)
print("Journal logs:")
print(stdout.read().decode())

ssh.close()
