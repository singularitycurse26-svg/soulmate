import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read the full api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Find and remove the old root route (around line 294)
# The old root route looks like:
# @app.get("/")
# async def root():
#     return {"status": "online", "service": "Incentives Wallet API", ...}

old_root = '''@app.get("/")
async def root():
    return {"status": "online", "service": "Incentives Wallet API", "version": "4.0.0"}'''

if old_root in content:
    content = content.replace(old_root, '''@app.get("/api/info")
async def root():
    return {"status": "online", "service": "Incentives Wallet API", "version": "4.0.0"}''')
    print("Replaced old root route with /api/info")
else:
    # Try to find it with different formatting
    import re
    pattern = r'@app\.get\("/"\)\nasync def root\(\):.*?return \{[^}]+\}'
    match = re.search(pattern, content, re.DOTALL)
    if match:
        old_text = match.group(0)
        print(f"Found old root route: {old_text[:100]}...")
        content = content.replace(old_text, old_text.replace('"/"', '"/api/info"'))
        print("Replaced old root route with /api/info")
    else:
        print("Could not find old root route pattern")

# Write back
with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)
print("API server updated")

sftp.close()

# Restart
print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
stdin, stdout, stderr = ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test root
print("\nTesting root URL...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/ 2>&1 | head -3", timeout=10)
resp = stdout.read().decode().strip()
print(f"Root response: {resp[:200]}")

# Test health
print("\nTesting health...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
health = stdout.read().decode().strip()
print(f"Health: {health[:100]}")

# Test assets
print("\nTesting assets...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/assets/ 2>&1 | head -3", timeout=10)
assets = stdout.read().decode().strip()
print(f"Assets: {assets[:100]}")

ssh.close()
print("\nDone!")
