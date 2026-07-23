import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Simple approach: add sessions table creation right after DB_PATH connection in each endpoint
# The issue is the sessions table doesn't exist. Add CREATE TABLE before any SELECT FROM sessions.

# Find all occurrences of "SELECT user_id FROM sessions" and add table creation before each
sessions_select = 'c.execute("SELECT user_id FROM sessions WHERE token'
sessions_create = 'c.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT, created TEXT)")\n    '

# Count occurrences
count = content.count(sessions_select)
print(f"Found {count} occurrences of sessions SELECT")

# Add table creation before each one
content = content.replace(sessions_select, sessions_create + sessions_select)
print(f"Added sessions table creation before each SELECT")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test
stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/wallet/cards -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print(f"GET /v1/wallet/cards: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print(f"Google Pay: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone!")
