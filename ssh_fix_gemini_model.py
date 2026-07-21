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

# Switch to gemini-2.5-flash
content = content.replace(
    "gemini-2.0-flash:generateContent",
    "gemini-2.5-flash:generateContent"
)
print("Switched to gemini-2.5-flash")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

run("systemctl restart incentives-wallet 2>&1", "restart")
time.sleep(5)

# Test Gemini 2.5 Flash
print("\n=== Testing Gemini 2.5 Flash ===")
run("""curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" -H "Content-Type: application/json" -d '{"contents":[{"role":"user","parts":[{"text":"Say hello in one sentence"}]}],"generationConfig":{"maxOutputTokens":50}}' 2>&1 | head -c 500""", "gemini 2.5 test", timeout=30)

# Check health
run("curl -s http://localhost:8546/v1/health 2>&1 | head -c 80", "health")

ssh.close()
print("\nDone!")
