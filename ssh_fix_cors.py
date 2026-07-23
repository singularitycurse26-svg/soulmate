import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix CORS origins
old_cors = '''allow_origins=[
        "https://191.44.121.29.sslip.io",
        "http://localhost:8545",
        "http://localhost:8546",
        "http://127.0.0.1:8545",
        "http://127.0.0.1:8546",
    ],
    allow_methods=["GET", "POST"],'''

new_cors = '''allow_origins=[
        "*",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],'''

if old_cors in content:
    content = content.replace(old_cors, new_cors)
    print("Fixed CORS: allow all origins + methods")
else:
    print("CORS block not found exactly, trying broader match...")
    # Try just replacing the origins list
    old_origins = '''allow_origins=[
        "https://191.44.121.29.sslip.io",
        "http://localhost:8545",
        "http://localhost:8546",
        "http://127.0.0.1:8545",
        "http://127.0.0.1:8546",
    ],'''
    new_origins = '''allow_origins=["*"],'''
    if old_origins in content:
        content = content.replace(old_origins, new_origins)
        print("Fixed CORS origins")
    else:
        print("Could not find CORS block")

# Also fix allow_methods
content = content.replace('allow_methods=["GET", "POST"],', 'allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],')

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
print(f"Health: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone! CORS fixed.")
