import paramiko
import os

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

LOCAL_MODULE = r"C:\Users\hawpe\CascadeProjects\soulmate\soul_media_api.py"
REMOTE_MODULE = "/opt/incentives-wallet/soul_media_api.py"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

sftp = c.open_sftp()

# Upload the module
print(f"Uploading {LOCAL_MODULE} -> {REMOTE_MODULE}")
sftp.put(LOCAL_MODULE, REMOTE_MODULE)
print("Module uploaded.")

# Check if api_server.py already imports the module
_, stdout, _ = c.exec_command("grep -n 'soul_media' /opt/incentives-wallet/api_server.py")
existing = stdout.read().decode()
print(f"Existing soul_media references:\n{existing}")

if "soul_media" not in existing:
    # Add import and router inclusion after the FastAPI app creation
    # Find the line with "app = FastAPI"
    _, stdout, _ = c.exec_command("grep -n 'app = FastAPI' /opt/incentives-wallet/api_server.py")
    line_info = stdout.read().decode()
    print(f"FastAPI app line: {line_info}")
    
    # We need to add after the CORS middleware setup. Let's find a good insertion point.
    # Add the import at the top and the router include after app setup
    patch_script = r'''
import re

with open("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read()

# Add import at the top (after the docstring)
if "from soul_media_api import router as soul_media_router" not in content:
    # Find a good insertion point - after the last import
    lines = content.split("\n")
    last_import = 0
    for i, line in enumerate(lines):
        if line.startswith("from ") or line.startswith("import "):
            last_import = i
    
    lines.insert(last_import + 1, "from soul_media_api import router as soul_media_router")
    
    # Find the app = FastAPI line and add router include after CORS setup
    content = "\n".join(lines)
    
    # Add router include right before the first @app route
    # Find the first endpoint definition
    match = re.search(r'(@app\.(get|post|put|delete|patch)\()', content)
    if match:
        pos = match.start()
        insert_text = "\n# Include SoulMedia routes\napp.include_router(soul_media_router)\n\n"
        content = content[:pos] + insert_text + content[pos:]
    
    with open("/opt/incentives-wallet/api_server.py", "w") as f:
        f.write(content)
    print("PATCHED api_server.py")
else:
    print("Already patched")
'''
    
    # Write and execute the patch script on the VPS
    sftp.putfo(__import__('io').BytesIO(patch_script.encode()), "/tmp/patch_api.py")
    _, stdout, stderr = c.exec_command("python3 /tmp/patch_api.py")
    print("Patch output:", stdout.read().decode())
    print("Patch errors:", stderr.read().decode())
else:
    print("api_server.py already has soul_media import")

# Verify
_, stdout, _ = c.exec_command("grep -n 'soul_media' /opt/incentives-wallet/api_server.py")
print("\nVerification:")
print(stdout.read().decode())

# Restart the API server
print("\nRestarting API server...")
_, stdout, stderr = c.exec_command("kill $(pgrep -f api_server.py) 2>/dev/null; sleep 1; cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 & sleep 3; ps aux | grep api_server | grep -v grep")
print(stdout.read().decode())
print(stderr.read().decode())

# Test the endpoints
_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/styles")
print("\n=== Styles test ===")
print(stdout.read().decode())

_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/stats")
print("\n=== Stats test ===")
print(stdout.read().decode())

_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/list")
print("\n=== List test ===")
print(stdout.read().decode())

_, stdout, _ = c.exec_command("""curl -s -X POST http://localhost:8546/v1/soulmovies/create -H 'Content-Type: application/json' -d '{"text_description":"A beautiful sunset over the ocean","style":"cinematic","duration_s":15}'""")
print("\n=== Create test ===")
print(stdout.read().decode())

sftp.close()
c.close()
print("\nDone!")
