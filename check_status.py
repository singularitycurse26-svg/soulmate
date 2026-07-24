import paramiko
import json

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=30)

# Check what env vars / config the server has
stdin, stdout, stderr = c.exec_command('cat /opt/incentives-wallet/.env 2>/dev/null || echo "NO .env"', timeout=15)
print("ENV:", stdout.read().decode())

# Check wallet address from config
stdin, stdout, stderr = c.exec_command('grep -r "WALLET\\|PRIVATE_KEY\\|0x7Fb10" /opt/incentives-wallet/.env /opt/incentives-wallet/api_server.py 2>/dev/null | head -10', timeout=15)
print("WALLET_CONFIG:", stdout.read().decode())

# Check INC contract setting
stdin, stdout, stderr = c.exec_command('grep -r "inc_contract\\|INC_CONTRACT\\|0x" /opt/incentives-wallet/.env 2>/dev/null | head -10', timeout=15)
print("INC:", stdout.read().decode())

# Check if there's a sessions database
stdin, stdout, stderr = c.exec_command('sqlite3 /opt/incentives-wallet/auth.db "SELECT id, email, substr(token,1,10) FROM sessions ORDER BY id DESC LIMIT 5;" 2>&1', timeout=15)
print("SESSIONS:", stdout.read().decode())

# Check users
stdin, stdout, stderr = c.exec_command('sqlite3 /opt/incentives-wallet/auth.db "SELECT id, email, is_founder FROM users ORDER BY id DESC LIMIT 5;" 2>&1', timeout=15)
print("USERS:", stdout.read().decode())

# Check incentives endpoints
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/incentives/price 2>&1', timeout=15)
print("INC_PRICE:", stdout.read().decode()[:200])

stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/incentives/stats 2>&1', timeout=15)
print("INC_STATS:", stdout.read().decode()[:200])

# Check staking
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/incentives/staking 2>&1', timeout=15)
print("STAKING:", stdout.read().decode()[:200])

# Check vault
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/incentives/vault 2>&1', timeout=15)
print("VAULT:", stdout.read().decode()[:200])

# Check auto-llm status
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/ai/auto-llm-status 2>&1', timeout=15)
print("AUTO_LLM:", stdout.read().decode()[:200])

# Check healing pending
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/v1/auto-heal/pending 2>&1', timeout=15)
print("HEALING:", stdout.read().decode()[:200])

# Check openapi routes count
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:8546/openapi.json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d[\'paths\']),\'routes\'); [print(k) for k in sorted(d[\'paths\'].keys()) if \'incentive\' in k or \'heal\' in k or \'auto-llm\' in k]"', timeout=15)
print("ROUTES:", stdout.read().decode())

c.close()
