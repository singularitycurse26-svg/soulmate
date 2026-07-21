import paramiko
import time
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=30):
    print(f"\n[{label}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-400:])
    if err:
        print(f"STDERR: {err[-300:]}")
    return out

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "SET_VIA_ENV_VAR")

# 1. Add GEMINI_API_KEY to systemd service environment
print("=== Setting Gemini API key on VPS ===")
sftp = ssh.open_sftp()

# Read current systemd service file
try:
    with sftp.file("/etc/systemd/system/incentives-wallet.service", "r") as f:
        service_content = f.read().decode()
    print(f"Current service file:\n{service_content[:500]}")
    
    # Add Environment line if not present
    if "GEMINI_API_KEY" not in service_content:
        # Add after [Service] section
        if "[Service]" in service_content:
            service_content = service_content.replace(
                "[Service]",
                f"[Service]\nEnvironment=GEMINI_API_KEY={GEMINI_KEY}"
            )
        else:
            service_content += f"\n[Service]\nEnvironment=GEMINI_API_KEY={GEMINI_KEY}\n"
        
        with sftp.file("/etc/systemd/system/incentives-wallet.service", "w") as f:
            f.write(service_content)
        print("Gemini API key added to service file")
    else:
        # Update existing key
        import re
        service_content = re.sub(
            r'GEMINI_API_KEY=.*',
            f'GEMINI_API_KEY={GEMINI_KEY}',
            service_content
        )
        with sftp.file("/etc/systemd/system/incentives-wallet.service", "w") as f:
            f.write(service_content)
        print("Gemini API key updated in service file")
except Exception as e:
    print(f"Error reading service file: {e}")
    # Try environment file approach
    with sftp.file("/etc/environment", "a") as f:
        f.write(f"\nGEMINI_API_KEY={GEMINI_KEY}\n")
    print("Gemini API key added to /etc/environment")

sftp.close()

# 2. Reload systemd and restart
run("systemctl daemon-reload 2>&1", "reload systemd")
run("systemctl restart incentives-wallet 2>&1", "restart API server")
time.sleep(5)

# 3. Verify key is set
run("systemctl show incentives-wallet --property=Environment 2>&1", "check env vars")

# 4. Check health
run("curl -s http://localhost:8546/v1/health 2>&1 | head -c 100", "health check")

# 5. Test AI chat endpoint (should now use Gemini)
print("\n=== Testing AI with Gemini ===")
run("""curl -s -X POST http://localhost:8546/v1/ai/chat -H "Content-Type: application/json" -H "X-Session-Token: test" -d '{"message":"hello"}' 2>&1 | head -c 300""", "AI test (expect auth error since no real session)")

# 6. Also set it in /etc/environment for any process
run(f'echo "GEMINI_API_KEY={GEMINI_KEY}" >> /etc/environment 2>&1', "add to /etc/environment")

ssh.close()
print("\n=== Gemini API key set! AI will now use Gemini as primary model. ===")
