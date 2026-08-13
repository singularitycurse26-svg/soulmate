import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Install with --break-system-packages
print("Installing python-multipart...")
_, stdout, stderr = ssh.exec_command("pip3 install --break-system-packages python-multipart 2>&1")
print(stdout.read().decode())

# Also check if it's available as apt package
_, stdout, _ = ssh.exec_command("apt-get install -y python3-multipart 2>&1 | tail -5")
print("apt:", stdout.read().decode())

# Restart server
print("\nKilling old process...")
ssh.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null")
time.sleep(2)

print("Starting API server...")
ssh.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &")
time.sleep(5)

# Check log
_, stdout, _ = ssh.exec_command("tail -8 /tmp/api_server.log")
print("\n=== Server log ===")
print(stdout.read().decode())

# Test endpoints
_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/styles")
print("\n=== Styles ===")
print(stdout.read().decode()[:300])

_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/stats")
print("\n=== Stats ===")
print(stdout.read().decode()[:300])

_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/list")
print("\n=== List ===")
print(stdout.read().decode()[:300])

ssh.close()
