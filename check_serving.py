import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

stdin, stdout, stderr = ssh.exec_command('grep -n "static\\|mount\\|dist\\|frontend\\|html\\|FileResponse\\|StaticFiles" /opt/incentives-wallet/api_server.py | head -20')
print("=== Static file serving ===")
print(stdout.read().decode())

# Also check if Caddy serves static files directly
stdin, stdout, stderr = ssh.exec_command('cat /etc/caddy/Caddyfile')
print("=== Caddyfile ===")
print(stdout.read().decode())

# Test the URL
stdin, stdout, stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://localhost:8546/ 2>&1')
print("=== HTTP status on port 8546 root ===")
print(stdout.read().decode())

ssh.close()
