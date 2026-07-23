import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix all broken \n\n in the Google Gemini section too
old2 = '''system_text = "

".join([m["content"] for m in messages if m["role"] == "system"])'''
new2 = '''system_text = chr(10).join([m["content"] for m in messages if m["role"] == "system"])'''

if old2 in content:
    content = content.replace(old2, new2, 1)
    print("Fixed Google Gemini system_text")
else:
    print("Google Gemini fix not found — checking lines")
    lines = content.split('\n')
    for i in range(3590, min(3600, len(lines))):
        print(f"{i+1}: {lines[i][:100]}")

# Also check for any other broken multi-line strings
# Look for pattern: a line ending with " followed by empty line followed by " 
lines = content.split('\n')
i = 0
fixed_count = 0
while i < len(lines):
    if i + 2 < len(lines) and lines[i].rstrip().endswith('"') and lines[i+1].strip() == '' and lines[i+2].lstrip().startswith('"'):
        # This is likely a broken \n\n — merge and fix
        print(f"Found another broken string at lines {i+1}-{i+3}")
        # Get the content before and after
        before = lines[i].rstrip()[:-1]  # remove trailing quote
        after = lines[i+2].lstrip()[1:]  # remove leading quote
        # Reconstruct — this is tricky, let's just use chr(10)
        # Find the pattern: something = "\n\n".join(...)
        # Replace with chr(10).join(...)
        if '.join(' in after:
            indent = len(lines[i]) - len(lines[i].lstrip())
            lines[i] = ' ' * indent + before.rstrip() + ' chr(10)' + after
            del lines[i+1:i+3]
            fixed_count += 1
            continue
    i += 1

if fixed_count > 0:
    content = '\n'.join(lines)
    print(f"Fixed {fixed_count} additional broken strings")

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
