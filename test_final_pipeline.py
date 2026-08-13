import paramiko
import time
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Check server is running
_, stdout, _ = c.exec_command("ps aux | grep api_server | grep -v grep")
print(f"Server: {stdout.read().decode()[:100]}")

# Check DB
_, stdout, _ = c.exec_command("python3 -c \"import sqlite3; db=sqlite3.connect('/opt/incentives-wallet/soulmedia.db'); print(db.execute('SELECT COUNT(*) FROM movies').fetchone())\"")
print(f"DB movies count: {stdout.read().decode()}")

# Create a new video
print("\n=== Creating test video ===")
_, stdout, _ = c.exec_command(
    """curl -s -X POST http://localhost:8546/v1/soulmovies/create """
    """-H 'Content-Type: application/json' """
    """-d '{"text_description":"A beautiful sunset over the ocean with waves crashing on the shore","style":"cinematic","duration_s":15}'"""
)
resp = stdout.read().decode()
print(f"Create: {resp}")

data = json.loads(resp)
pid = data.get("project_id")

# Poll
for i in range(40):
    time.sleep(5)
    _, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
    status = stdout.read().decode()
    try:
        sdata = json.loads(status)
        print(f"  [{i*5}s] status={sdata['status']} progress={sdata['progress']}")
        if sdata['status'] in ('complete', 'failed'):
            break
    except:
        print(f"  [{i*5}s] raw: {status[:100]}")

# Check file exists
_, stdout, _ = c.exec_command(f"ls -la /opt/incentives-wallet/videos/{pid}.mp4 2>/dev/null")
print(f"\nVideo file: {stdout.read().decode()}")

# Test download endpoint
_, stdout, _ = c.exec_command(f"curl -s -o /dev/null -w '%{{http_code}} %{{size_download}} %{{content_type}}' http://localhost:8546/v1/soulmovies/download/{pid}")
print(f"Download endpoint: {stdout.read().decode()}")

# Test from external URL
_, stdout, _ = c.exec_command(f"curl -s -k -o /dev/null -w '%{{http_code}} %{{size_download}}' 'https://191.44.121.29.sslip.io/v1/soulmovies/download/{pid}' --max-time 10")
print(f"External download: {stdout.read().decode()}")

# Check tier logs
_, stdout, _ = c.exec_command("grep -i 'tier' /tmp/api_server.log | tail -10")
print(f"\nTier logs:\n{stdout.read().decode()}")

c.close()
print("\nDone!")
