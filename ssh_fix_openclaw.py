import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix the broken string literal — the \n\n became actual newlines
# Replace the broken multi-line string with a proper one using chr(10)
old = '''"system": "

".join([m["content"] for m in messages if m["role"] == "system"]) or None,'''

new = '''"system": chr(10).join([m["content"] for m in messages if m["role"] == "system"]) or None,'''

if old in content:
    content = content.replace(old, new, 1)
    print("Fixed broken string literal")
else:
    print("Could not find broken string — trying alternate fix")
    # Try to find and fix by line number
    lines = content.split('\n')
    # Lines 3573-3575 (0-indexed: 3572-3574)
    if '"system": "' in lines[3572] and lines[3572].endswith('"'):
        # Merge lines 3573-3575
        lines[3572] = '                "system": chr(10).join([m["content"] for m in messages if m["role"] == "system"]) or None,'
        # Remove lines 3573 and 3574 (the empty line and the .join line)
        del lines[3573:3575]
        content = '\n'.join(lines)
        print("Fixed by line manipulation")
    else:
        print(f"Line 3573: {lines[3572][:100]}")
        print("Could not fix automatically")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s "http://localhost:8546/v1/browser/proxy?url=https://example.com" 2>&1 | head -3',
    timeout=15
)
print(f"Browser proxy: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone!")
