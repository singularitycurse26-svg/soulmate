import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=30)

# Check which incentive routes exist
stdin, stdout, stderr = c.exec_command(
    'curl -s http://localhost:8546/openapi.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(k) for k in sorted(d[\'paths\'].keys()) if \'incentive\' in k.lower()]"',
    timeout=15
)
print("INCENTIVE_ROUTES:", stdout.read().decode())

# Check if incentives endpoints return data
for ep in ['/v1/incentives/price', '/v1/incentives/stats', '/v1/incentives/daily', '/v1/incentives/halvings', '/v1/incentives/news', '/v1/incentives/staking/leaderboard']:
    stdin, stdout, stderr = c.exec_command(f'curl -s -o /dev/null -w "%{{http_code}}" http://localhost:8546{ep}', timeout=10)
    print(f"{ep}: {stdout.read().decode()}")

# Check BNB balance of wallet
stdin, stdout, stderr = c.exec_command(
    'python3 -c "from web3 import Web3; w3=Web3(Web3.HTTPProvider(\'https://bsc-dataseed.binance.org\')); addr=Web3.to_checksum_address(\'0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d\'); bal=w3.eth.get_balance(addr); print(f\'BNB: {w3.from_wei(bal,\\\"ether\\\")}\')" 2>&1',
    timeout=15
)
print("WALLET_BNB:", stdout.read().decode())

c.close()
