import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check the end of api_server.py for the static serving code and any conflicts
stdin, stdout, stderr = ssh.exec_command("tail -60 /opt/incentives-wallet/api_server.py 2>&1", timeout=10)
print("=== Last 60 lines of api_server.py ===")
print(stdout.read().decode())

# Check if there's an existing root route
stdin, stdout, stderr = ssh.exec_command("grep -n 'def.*root\\|@app.get..\"/\"' /opt/incentives-wallet/api_server.py 2>&1", timeout=10)
print("\n=== Root route definitions ===")
print(stdout.read().decode())

# Check if wallet directory exists and has index.html
stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/wallet/ 2>&1", timeout=10)
print("\n=== Wallet directory ===")
print(stdout.read().decode())

ssh.close()
