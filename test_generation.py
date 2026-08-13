import paramiko
import time
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Create a video
print("=== Creating video ===")
_, stdout, _ = ssh.exec_command("""curl -s -X POST http://localhost:8546/v1/soulmovies/create -H 'Content-Type: application/json' -d '{"text_description":"A beautiful sunset over the ocean with waves crashing on the shore","style":"cinematic","duration_s":15}'""")
resp = stdout.read().decode()
print(resp)

data = json.loads(resp)
pid = data.get("project_id")
print(f"\nProject ID: {pid}")

# Poll status
for i in range(20):
    time.sleep(3)
    _, stdout, _ = ssh.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
    status = stdout.read().decode()
    sdata = json.loads(status)
    print(f"  [{i*3}s] status={sdata['status']} progress={sdata['progress']}")
    if sdata['status'] in ('complete', 'failed'):
        break

# Check final status
_, stdout, _ = ssh.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"\n=== Final ===")
print(f"Status: {final['status']}")
print(f"Output: {final.get('output_path', 'none')}")

# Check if file exists
if final.get('output_path'):
    _, stdout, _ = ssh.exec_command(f"ls -la {final['output_path']} 2>&1")
    print(f"File: {stdout.read().decode()}")

# List projects
_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soulmovies/list")
print(f"\n=== List ===")
print(stdout.read().decode()[:500])

# Test SoulTube endpoints
_, stdout, _ = ssh.exec_command("curl -s http://localhost:8546/v1/soultube/trending")
print(f"\n=== Trending ===")
print(stdout.read().decode()[:300])

ssh.close()
print("\nDone!")
