import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check stderr from the API server process
stdin, stdout, stderr = ssh.exec_command("python3 /opt/incentives-wallet/api_server.py 2>&1 & sleep 3 && kill %1 2>/dev/null; wait 2>/dev/null", timeout=10)
print("Startup output:")
print(stdout.read().decode()[:1000])

# Try the endpoint and check error
stdin, stdout, stderr = ssh.exec_command("""curl -sv -X POST http://localhost:8546/v1/wallet/googlepay/deposit \
  -H 'Content-Type: application/json' \
  -H 'X-API-Token: soulmate_wallet_2024' \
  -d '{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}' 2>&1""", timeout=10)
print("Google Pay response:")
print(stdout.read().decode()[:500])

ssh.close()
