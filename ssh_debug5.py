import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Stop service
ssh.exec_command("systemctl stop incentives-wallet 2>&1", timeout=5)
time.sleep(2)

# Start server with full debug logging
ssh.exec_command("cd /opt/incentives-wallet && python3 -c '"
    "import uvicorn;"
    "import api_server;"
    "app = api_server.app;"
    "uvicorn.run(app, host=\"0.0.0.0\", port=8546, log_level=\"debug\")"
    "' > /tmp/api_debug.log 2>&1 &", timeout=5)
time.sleep(4)

# Test
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print("Response:", stdout.read().decode()[:200])

time.sleep(1)

# Get full debug log
stdin, stdout, stderr = ssh.exec_command("cat /tmp/api_debug.log 2>&1 | tail -50", timeout=5)
log = stdout.read().decode()
print("Debug log (last 50 lines):")
print(log[-2000:])

# Cleanup
ssh.exec_command("pkill -f 'python3 -c' 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl start incentives-wallet 2>&1", timeout=10)

ssh.close()
