import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=30)

for ep in ['/v1/incentives/price', '/v1/incentives/stats', '/v1/incentives/daily', '/v1/incentives/halvings', '/v1/incentives/news', '/v1/incentives/staking/leaderboard']:
    stdin, stdout, stderr = c.exec_command(f'curl -s http://localhost:8546{ep} 2>&1 | head -c 300', timeout=10)
    print(f"\n{ep}:")
    print(stdout.read().decode())

c.close()
