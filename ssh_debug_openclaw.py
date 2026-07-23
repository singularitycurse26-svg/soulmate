import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Stop the service and run manually to see the error
ssh.exec_command("systemctl stop incentives-wallet 2>/dev/null", timeout=5)
time.sleep(2)

stdin, stdout, stderr = ssh.exec_command(
    'cd /opt/incentives-wallet && python3 api_server.py 2>&1 &  sleep 5 && kill %1 2>/dev/null; wait 2>/dev/null',
    timeout=15
)
output = stdout.read().decode()
err_output = stderr.read().decode()
print("STDOUT:", output[:2000])
print("STDERR:", err_output[:2000])

ssh.close()
