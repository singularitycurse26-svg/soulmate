import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

def run(cmd, label="", timeout=120):
    print(f"\n[{label or cmd[:60]}]")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(out[-600:])
    if err:
        print(f"STDERR: {err[-400:]}")
    return out

# 1. Check VPS resources
print("=== System Info ===")
run("free -h 2>&1", "RAM check")
run("df -h / 2>&1", "Disk check")

# 2. Install Ollama
print("\n=== Installing Ollama ===")
run("curl -fsSL https://ollama.com/install.sh | sh 2>&1", "install ollama", timeout=180)

# 3. Check status
time.sleep(3)
run("systemctl is-active ollama 2>&1", "ollama status")
run("ollama --version 2>&1", "ollama version")

# 4. Pull Qwen 2.5 3B
print("\n=== Pulling Qwen 2.5 3B ===")
run("ollama pull qwen2.5:3b 2>&1", "pull qwen 3b", timeout=300)

# 5. Verify
run("ollama list 2>&1", "models list")

# 6. Configure for API access (localhost only - FastAPI proxies)
sftp = ssh.open_sftp()
try:
    sftp.mkdir("/etc/systemd/system/ollama.service.d")
except IOError:
    pass

with sftp.file("/etc/systemd/system/ollama.service.d/override.conf", "w") as f:
    f.write("[Service]\nEnvironment=\"OLLAMA_HOST=127.0.0.1:11434\"\n")
print("\nOllama override written (localhost only)")
sftp.close()

run("systemctl daemon-reload 2>&1", "reload systemd")
run("systemctl restart ollama 2>&1", "restart ollama")
time.sleep(3)
run("systemctl is-active ollama 2>&1", "final status")

# 7. Test API
print("\n=== Testing Ollama API ===")
run("curl -s http://localhost:11434/api/tags 2>&1", "API tags")

ssh.close()
print("\n=== Ollama setup complete! ===")
