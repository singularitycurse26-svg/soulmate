import paramiko
import os
import stat

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Check current caddy config
stdin, stdout, stderr = ssh.exec_command('cat /etc/caddy/Caddyfile 2>/dev/null; echo "---"; ls -la /opt/incentives-wallet/frontend/dist/')
print("=== Caddyfile ===")
print(stdout.read().decode())
print(stderr.read().decode())

ssh.close()
