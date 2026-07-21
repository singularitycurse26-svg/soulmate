import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=30):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    if out:
        print(out[-600:])
    return out

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix model name to gemini-flash-latest
content = content.replace(
    "gemini-2.5-flash:generateContent",
    "gemini-flash-latest:generateContent"
)

# Increase maxOutputTokens from 1024 to 2048 (gemini 3.x uses thinking tokens)
content = content.replace(
    '"maxOutputTokens": 1024',
    '"maxOutputTokens": 2048'
)

print("Updated: gemini-flash-latest + 2048 max tokens")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

run("systemctl restart incentives-wallet 2>&1", "restart")
time.sleep(5)
run("systemctl is-active incentives-wallet 2>&1", "status")

# Test the AI chat endpoint with a real session
print("\n=== Checking logs ===")
run("tail -5 /var/log/wallet-api.log 2>&1", "logs")

ssh.close()
print("\nDone! Try the AI chat now.")
