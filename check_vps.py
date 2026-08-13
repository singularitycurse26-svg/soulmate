#!/usr/bin/env python3
"""Check VPS static file serving configuration."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

# Check WALLET_STATIC_DIR
stdin, stdout, stderr = ssh.exec_command("grep -n WALLET_STATIC_DIR /opt/incentives-wallet/api_server.py | head -10")
print("WALLET_STATIC_DIR refs:", stdout.read().decode())

# Check how index.html is served
stdin, stdout, stderr = ssh.exec_command('grep -n "index.html" /opt/incentives-wallet/api_server.py | head -10')
print("index.html refs:", stdout.read().decode())

# Check the old index.html
stdin, stdout, stderr = ssh.exec_command("head -5 /opt/incentives-wallet/index.html")
print("Old index.html:", stdout.read().decode())

# Check the new index.html
stdin, stdout, stderr = ssh.exec_command("head -5 /opt/incentives-wallet/frontend/dist/index.html")
print("New index.html:", stdout.read().decode())

# Check what URL the old index.html references
stdin, stdout, stderr = ssh.exec_command("grep -o 'src=[\"' + chr(39) + '][^\"' + chr(39) + ']*' /opt/incentives-wallet/index.html | head -5")
print("Old index.html scripts:", stdout.read().decode())

ssh.close()
