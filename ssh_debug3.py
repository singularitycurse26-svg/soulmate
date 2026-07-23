import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check Python syntax
stdin, stdout, stderr = ssh.exec_command("python3 -c 'import py_compile; py_compile.compile(\"/opt/incentives-wallet/api_server.py\", doraise=True)' 2>&1", timeout=10)
out = stdout.read().decode()
print("Syntax check:", out[:500] if out else "OK")

# Check for the actual error by looking at the API logs more carefully
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 50 2>&1 | grep -i error", timeout=10)
print("Errors in journal:", stdout.read().decode()[:500])

# Try to access the endpoint with verbose output
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-H "X-API-Token: REDACTED_API_TOKEN" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print("Google Pay response:", stdout.read().decode()[:500])

# Check if the API token matches
stdin, stdout, stderr = ssh.exec_command("grep 'API_TOKEN' /opt/incentives-wallet/api_server.py | head -1", timeout=5)
print("API_TOKEN line:", stdout.read().decode().strip())

ssh.close()
