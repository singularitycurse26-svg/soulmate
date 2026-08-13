#!/usr/bin/env python3
"""Check Soulmate OS server status."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

# 1. API server process
stdin, stdout, stderr = ssh.exec_command("ps aux | grep api_server | grep -v grep")
print("=== API Server Process ===")
print(stdout.read().decode())

# 2. Port 8546
stdin, stdout, stderr = ssh.exec_command("ss -tlnp | grep 8546")
print("=== Port 8546 ===")
print(stdout.read().decode())

# 3. Caddy
stdin, stdout, stderr = ssh.exec_command("systemctl is-active caddy")
print("=== Caddy Status ===")
print(stdout.read().decode())

# 4. Full HTML served
stdin, stdout, stderr = ssh.exec_command("curl -sk https://191.44.121.29.sslip.io/ 2>&1")
print("=== Full HTML ===")
print(stdout.read().decode())

# 5. Health endpoint
stdin, stdout, stderr = ssh.exec_command("curl -sk https://191.44.121.29.sslip.io/v1/health 2>&1")
print("=== Health ===")
print(stdout.read().decode())

# 6. JS asset
stdin, stdout, stderr = ssh.exec_command('curl -sk -o /dev/null -w "%{http_code}" https://191.44.121.29.sslip.io/assets/index-HzPXe72H.js 2>&1')
print("=== JS Asset HTTP Status ===")
print(stdout.read().decode())

# 7. CSS asset
stdin, stdout, stderr = ssh.exec_command('curl -sk -o /dev/null -w "%{http_code}" https://191.44.121.29.sslip.io/assets/index-DiE7Dlmx.css 2>&1')
print("=== CSS Asset HTTP Status ===")
print(stdout.read().decode())

# 8. Coin image
stdin, stdout, stderr = ssh.exec_command('curl -sk -o /dev/null -w "%{http_code}" https://191.44.121.29.sslip.io/assets/incentives-coin-BZKGGrn5.png 2>&1')
print("=== Coin Image HTTP Status ===")
print(stdout.read().decode())

# 9. Recent logs
stdin, stdout, stderr = ssh.exec_command("tail -30 /tmp/api_server.log 2>&1")
print("=== Recent Logs ===")
print(stdout.read().decode())

# 10. SSL cert
stdin, stdout, stderr = ssh.exec_command("echo | openssl s_client -connect 191.44.121.29:443 -servername 191.44.121.29.sslip.io 2>/dev/null | openssl x509 -noout -dates 2>&1")
print("=== SSL Cert Dates ===")
print(stdout.read().decode())

# 11. Check what files are in the wallet static dir
stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/wallet/ 2>&1")
print("=== Wallet Static Dir ===")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/wallet/assets/ 2>&1")
print("=== Wallet Assets Dir ===")
print(stdout.read().decode())

ssh.close()
