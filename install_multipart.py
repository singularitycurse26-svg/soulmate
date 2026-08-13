import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Install python-multipart
print("Installing python-multipart...")
_, stdout, stderr = ssh.exec_command("pip3 install python-multipart 2>&1")
print(stdout.read().decode())

# Restart server
print("\nKilling old process...")
ssh.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null")
time.sleep(2)

print("Starting API server...")
ssh.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &")
time.sleep(5)

# Check log
_, stdout, _ = ssh.exec_command("tail -5 /tmp/api_server.log")
print("\n=== Server log ===")
print(stdout.read().decode())

# Test all endpoints
tests = [
    ("Styles", "curl -s http://localhost:8546/v1/soulmovies/styles"),
    ("Stats", "curl -s http://localhost:8546/v1/soulmovies/stats"),
    ("List", "curl -s http://localhost:8546/v1/soulmovies/list"),
    ("Trending", "curl -s http://localhost:8546/v1/soultube/trending"),
    ("Search", "curl -s 'http://localhost:8546/v1/soultube/search?q=test'"),
    ("ST Stats", "curl -s http://localhost:8546/v1/soultube/stats"),
    ("Create", """curl -s -X POST http://localhost:8546/v1/soulmovies/create -H 'Content-Type: application/json' -d '{"text_description":"A beautiful sunset over the ocean","style":"cinematic","duration_s":15}'"""),
]

for name, cmd in tests:
    _, stdout, _ = ssh.exec_command(cmd)
    out = stdout.read().decode()
    print(f"\n=== {name} ===")
    print(out[:300] if out else "(empty)")

# Check if create returned a project_id, then check status
_, stdout, _ = ssh.exec_command("""curl -s -X POST http://localhost:8546/v1/soulmovies/create -H 'Content-Type: application/json' -d '{"text_description":"A beautiful sunset over the ocean","style":"cinematic","duration_s":15}'""")
create_resp = stdout.read().decode()
print(f"\n=== Create response ===")
print(create_resp)

import json
try:
    data = json.loads(create_resp)
    pid = data.get("project_id")
    if pid:
        time.sleep(3)
        _, stdout, _ = ssh.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
        print(f"\n=== Status for {pid} ===")
        print(stdout.read().decode())
except:
    pass

ssh.close()
print("\nDone!")
