import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Stop the service, run manually to see errors
ssh.exec_command("systemctl stop incentives-wallet 2>&1", timeout=5)
time.sleep(2)

# Run the server in background and capture stderr
stdin, stdout, stderr = ssh.exec_command(
    "cd /opt/incentives-wallet && timeout 5 python3 -c '"
    "import api_server;"
    "import requests;"
    "r = requests.post(\"http://localhost:8546/v1/wallet/googlepay/deposit\","
    "json={\"amount\": 50, \"wallet_address\": \"0x1234567890123456789012345678901234567890\"},"
    "headers={\"Content-Type\": \"application/json\", \"X-API-Token\": \"REDACTED_API_TOKEN\"});"
    "print(r.status_code, r.text[:300])"
    "' 2>&1",
    timeout=15
)
print("Test result:")
print(stdout.read().decode()[:1000])
print("Stderr:")
print(stderr.read().decode()[:500])

# Restart service
ssh.exec_command("systemctl start incentives-wallet 2>&1", timeout=10)
time.sleep(3)

ssh.close()
