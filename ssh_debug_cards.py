import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Stop service, run manually to see errors
ssh.exec_command("systemctl stop incentives-wallet 2>&1", timeout=5)
time.sleep(2)

ssh.exec_command("cd /opt/incentives-wallet && python3 -c '"
    "import uvicorn;"
    "import api_server;"
    "app = api_server.app;"
    "uvicorn.run(app, host=\"0.0.0.0\", port=8546, log_level=\"error\")"
    "' > /tmp/api_err2.log 2>&1 &", timeout=5)
time.sleep(4)

# Test
stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/wallet/cards -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print("Response:", stdout.read().decode()[:200])

time.sleep(1)

# Check error log
stdin, stdout, stderr = ssh.exec_command("cat /tmp/api_err2.log 2>&1 | tail -20", timeout=5)
print("Error log:")
print(stdout.read().decode()[-1500:])

# Kill and restart
ssh.exec_command("pkill -f 'python3 -c' 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl start incentives-wallet 2>&1", timeout=10)

ssh.close()
