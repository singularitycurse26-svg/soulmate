import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Fix: move import to top, remove from line 4897
fix_script = r'''
with open("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read()

# Remove the misplaced import
content = content.replace("\nfrom soul_media_api import router as soul_media_router\n", "\n", 1)

# Add import near the top, after "from __future__ import annotations"
content = content.replace(
    "from __future__ import annotations\n",
    "from __future__ import annotations\n\nfrom soul_media_api import router as soul_media_router\n",
    1
)

with open("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

print("Fixed import position")
'''

sftp = ssh.open_sftp()
import io
sftp.putfo(io.BytesIO(fix_script.encode()), "/tmp/fix_import.py")
sftp.close()

_, stdout, stderr = ssh.exec_command("python3 /tmp/fix_import.py")
print("Fix:", stdout.read().decode(), stderr.read().decode())

# Verify
_, stdout, _ = ssh.exec_command("grep -n 'soul_media' /opt/incentives-wallet/api_server.py")
print("\nVerification:")
print(stdout.read().decode())

# Kill any existing process and restart
print("\nKilling old process...")
_, stdout, _ = ssh.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null; sleep 2; ss -tlnp | grep 8546 || echo 'Port free'")
print(stdout.read().decode())

print("\nStarting API server...")
_, stdout, stderr = ssh.exec_command(
    "cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 & sleep 4; ps aux | grep api_server | grep -v grep"
)
print(stdout.read().decode())
print(stderr.read().decode())

# Check log for errors
_, stdout, _ = ssh.exec_command("tail -10 /tmp/api_server.log")
print("\n=== Server log ===")
print(stdout.read().decode())

# Test endpoints
_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/styles")
print("\n=== Styles ===")
print(stdout.read().decode())

_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/stats")
print("\n=== Stats ===")
print(stdout.read().decode())

_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/list")
print("\n=== List ===")
print(stdout.read().decode())

ssh.close()
print("\nDone!")
