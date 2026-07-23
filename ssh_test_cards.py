import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/wallet/cards -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print("GET /v1/wallet/cards:", stdout.read().decode()[:300])

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print("Health:", stdout.read().decode()[:100])

ssh.close()
