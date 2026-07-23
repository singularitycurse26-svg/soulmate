import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix double-replaced __time back to _time
content = content.replace("__time.", "_time.")
print("Fixed __time -> _time")

# Also fix any remaining bare 'time.' that should be '_time.' in the new sections
# But be careful not to change 'time.time' in the original code
# The original code uses '_time' so any bare 'time.' in new sections is wrong
marker = "OAUTH SOCIAL LOGIN"
if marker in content:
    parts = content.split(marker, 1)
    before = parts[0]
    after = marker + parts[1]
    # Replace any remaining bare time. (not _time.) with _time.
    after = after.replace("(time.", "(_time.")
    after = after.replace(" time.", " _time.")
    after = after.replace("=time.", "=_time.")
    content = before + after

# Same for game rooms section
marker2 = "GAME ROOMS"
if marker2 in content:
    parts = content.split(marker2, 1)
    before = parts[0]
    after = marker2 + parts[1]
    after = after.replace("(time.", "(_time.")
    after = after.replace(" time.", " _time.")
    after = after.replace("=time.", "=_time.")
    content = before + after

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test all endpoints
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print(f"Google Pay: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/card/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 100, "wallet_address": "0x1234567890123456789012345678901234567890", "card_number": "4111111111111111", "card_expiry": "12/25", "card_cvc": "123"}\' 2>&1',
    timeout=10
)
print(f"Card deposit: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/auth/oauth/google/start 2>&1',
    timeout=10
)
print(f"OAuth start: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/games/rooms/list 2>&1',
    timeout=10
)
print(f"Game rooms: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

ssh.close()
print("\nDone!")
