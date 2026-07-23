import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Add RedirectResponse import
old_import = "from fastapi.responses import JSONResponse"
new_import = "from fastapi.responses import JSONResponse, RedirectResponse"

if "RedirectResponse" not in content.split("OAUTH SOCIAL")[0]:
    content = content.replace(old_import, new_import)
    print("Added RedirectResponse import")
else:
    print("RedirectResponse already imported")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test endpoints
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-H "X-API-Token: REDACTED_API_TOKEN" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print(f"Google Pay: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/card/deposit '
    '-H "Content-Type: application/json" '
    '-H "X-API-Token: REDACTED_API_TOKEN" '
    '-d \'{"amount": 100, "wallet_address": "0x1234567890123456789012345678901234567890", "card_number": "4111111111111111", "card_expiry": "12/25", "card_cvc": "123"}\' 2>&1',
    timeout=10
)
print(f"Card deposit: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/auth/oauth/google/start 2>&1',
    timeout=10
)
print(f"OAuth start: {stdout.read().decode().strip()[:300]}")

ssh.close()
print("\nDone!")
