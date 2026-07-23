import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Add HTMLResponse import if not present
if "HTMLResponse" not in content.split('# ===== OpenClaw')[0]:
    # Find the fastapi import line
    if "from fastapi import" in content:
        old_import = "from fastapi import"
        if "HTMLResponse" not in content[:content.find('# ===== OpenClaw')]:
            # Add HTMLResponse to the imports
            content = content.replace(
                "from fastapi import",
                "from fastapi import HTMLResponse,",
                1
            )
            # Actually, let's be more careful — find the exact import line
            # and add HTMLResponse to it
            print("Added HTMLResponse to fastapi import")
        else:
            print("HTMLResponse already imported")
    else:
        # Add a standalone import
        content = content.replace(
            "import urllib.request",
            "from fastapi.responses import HTMLResponse\nimport urllib.request",
            1
        )
        print("Added HTMLResponse import")
else:
    print("HTMLResponse already present")

# Actually, let's check and add it properly
if "HTMLResponse" not in content:
    # Add after the fastapi import
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'from fastapi' in line and 'import' in line:
            if 'HTMLResponse' not in line:
                lines[i] = line.rstrip() + ', HTMLResponse' if not line.rstrip().endswith(',') else line.rstrip() + ' HTMLResponse'
                print(f"Added HTMLResponse to line {i+1}: {lines[i][:100]}")
                break
    content = '\n'.join(lines)

# Also check for Response import
if "HTMLResponse" not in content:
    # Just add a standalone import before the OpenClaw section
    content = content.replace(
        "# ===== OpenClaw Browser Proxy =====",
        "from fastapi.responses import HTMLResponse\n\n# ===== OpenClaw Browser Proxy =====",
        1
    )
    print("Added standalone HTMLResponse import")

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
print(f"Health: {stdout.read().decode().strip()[:100]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s "http://localhost:8546/v1/browser/proxy?url=https://example.com" 2>&1 | head -5',
    timeout=15
)
print(f"Browser proxy: {stdout.read().decode().strip()[:300]}")

ssh.close()
print("\nDone!")
