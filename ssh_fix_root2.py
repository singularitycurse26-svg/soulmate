import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read the full api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# The static serving code is after the __main__ block. We need to move it before.
# Find the static serving section
static_marker = "# --- SERVE REACT FRONTEND ---"
main_marker = 'if __name__ == "__main__":'

if static_marker in content and main_marker in content:
    # Extract the static serving code
    static_start = content.index(static_marker)
    static_code = content[static_start:]
    
    # Remove it from the end
    content = content[:static_start].rstrip()
    
    # Find the main block and insert static code before it
    main_idx = content.index(main_marker)
    
    # Insert static code before the main block
    content = content[:main_idx] + static_code + "\n\n" + content[main_idx:]
    
    print("Moved static serving code before __main__ block")
else:
    print(f"Static marker found: {static_marker in content}")
    print(f"Main marker found: {main_marker in content}")

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

# Check server logs for errors
print("\nChecking server logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 20 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-500:]}")

# Test root
print("\nTesting root URL...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/ 2>&1 | head -5", timeout=10)
resp = stdout.read().decode().strip()
print(f"Root response: {resp[:300]}")

# Test health
print("\nTesting health...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
health = stdout.read().decode().strip()
print(f"Health: {health[:100]}")

ssh.close()
print("\nDone!")
