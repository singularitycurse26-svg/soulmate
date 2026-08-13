import paramiko
import time
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

LOCAL_MODULE = r"C:\Users\hawpe\CascadeProjects\soulmate\soul_media_api.py"
REMOTE_MODULE = "/opt/incentives-wallet/soul_media_api.py"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

sftp = c.open_sftp()
print(f"Uploading {LOCAL_MODULE} -> {REMOTE_MODULE}")
sftp.put(LOCAL_MODULE, REMOTE_MODULE)
print("Module uploaded.")
sftp.close()

# Kill old process and restart
print("\nKilling old API server...")
c.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null")
time.sleep(2)

print("Starting API server...")
c.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &")
time.sleep(5)

# Check log
_, stdout, _ = c.exec_command("tail -5 /tmp/api_server.log")
print(f"\n=== Server log ===\n{stdout.read().decode()}")

# Verify endpoints work
_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/styles")
print(f"\n=== Styles ===\n{stdout.read().decode()[:200]}")

# Check if Agnes key exists
_, stdout, _ = c.exec_command("ls -la /opt/incentives-wallet/.agnes_key 2>/dev/null; cat /opt/incentives-wallet/.agnes_key 2>/dev/null || echo 'No Agnes key'")
agnes_key = stdout.read().decode().strip()
print(f"\n=== Agnes key ===\n{agnes_key}")

# Check if Pollinations key exists
_, stdout, _ = c.exec_command("ls -la /opt/incentives-wallet/.pollinations_key 2>/dev/null; cat /opt/incentives-wallet/.pollinations_key 2>/dev/null || echo 'No Pollinations key'")
poll_key = stdout.read().decode().strip()
print(f"\n=== Pollinations key ===\n{poll_key}")

# Test a short video generation (15s) to see which tier kicks in
print("\n=== Testing 15s video generation ===")
payload = json.dumps({
    "text_description": "A cat walking on a beach at sunset with waves crashing, cinematic golden hour lighting",
    "style": "cinematic",
    "duration_s": 15,
    "resolution": "1080p"
})

sftp = c.open_sftp()
with sftp.open("/tmp/test_payload.json", "w") as f:
    f.write(payload)
sftp.close()

_, stdout, _ = c.exec_command(
    "curl -s -X POST http://localhost:8546/v1/soulmovies/create "
    "-H 'Content-Type: application/json' "
    "-d @/tmp/test_payload.json"
)
resp = stdout.read().decode()
print(f"Create: {resp}")

data = json.loads(resp)
pid = data.get("project_id")
print(f"Project ID: {pid}")

# Poll for a while
for i in range(60):
    time.sleep(10)
    _, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
    status = stdout.read().decode()
    try:
        sdata = json.loads(status)
        print(f"  [{i*10}s] status={sdata['status']} progress={sdata['progress']:.2f}")
        if sdata['status'] in ('complete', 'failed'):
            break
    except:
        print(f"  [{i*10}s] raw: {status[:100]}")

# Check tier logs
_, stdout, _ = c.exec_command("grep -i 'tier' /tmp/api_server.log | tail -20")
print(f"\n=== Tier logs ===\n{stdout.read().decode()}")

# Final status
_, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"Final: status={final['status']} output={final.get('output_path', 'none')}")

if final.get('output_path'):
    _, stdout, _ = c.exec_command(f"ls -lh {final['output_path']}")
    print(f"File: {stdout.read().decode()}")

c.close()
print("\nDone!")
