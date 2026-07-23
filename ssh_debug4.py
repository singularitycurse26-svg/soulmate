import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Stop service, run server manually and capture error
ssh.exec_command("systemctl stop incentives-wallet 2>&1", timeout=5)
time.sleep(2)

# Start server in background, wait, then test
ssh.exec_command("cd /opt/incentives-wallet && python3 -c '"
    "import uvicorn;"
    "import api_server;"
    "app = api_server.app;"
    "uvicorn.run(app, host=\"0.0.0.0\", port=8546, log_level=\"error\")"
    "' > /tmp/api_err.log 2>&1 &", timeout=5)
time.sleep(4)

# Test the endpoint
stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print("Response:", stdout.read().decode()[:300])

time.sleep(1)

# Check error log
stdin, stdout, stderr = ssh.exec_command("cat /tmp/api_err.log 2>&1", timeout=5)
print("Error log:", stdout.read().decode()[:1000])

# Kill the manual server and restart service
ssh.exec_command("pkill -f 'python3 -c' 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl start incentives-wallet 2>&1", timeout=10)

ssh.close()
