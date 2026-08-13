import paramiko
import time
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Upload updated module
sftp = c.open_sftp()
sftp.put(r"C:\Users\hawpe\CascadeProjects\soulmate\soul_media_api.py", "/opt/incentives-wallet/soul_media_api.py")
sftp.close()
print("Module uploaded")

# Restart server
c.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null")
time.sleep(2)
c.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &")
time.sleep(5)

_, stdout, _ = c.exec_command("tail -3 /tmp/api_server.log")
print(f"Server: {stdout.read().decode().strip()}")

# Test 15s movie
print("\n=== Testing 15s movie with Agnes AI (with retry) ===")
payload = json.dumps({
    "text_description": "A cat walking on a beach at sunset with waves crashing, cinematic golden hour lighting, the cat moves naturally across the sand",
    "style": "cinematic",
    "duration_s": 15,
    "resolution": "1080p"
})

sftp = c.open_sftp()
with sftp.open("/tmp/movie_test2.json", "w") as f:
    f.write(payload)
sftp.close()

_, stdout, _ = c.exec_command(
    "curl -s -X POST http://localhost:8546/v1/soulmovies/create "
    "-H 'Content-Type: application/json' "
    "-d @/tmp/movie_test2.json"
)
resp = stdout.read().decode()
data = json.loads(resp)
pid = data.get("project_id")
print(f"Project ID: {pid}")

# Poll - Agnes takes ~45-60s per clip, plus retry time
for i in range(120):
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

# Check logs
_, stdout, _ = c.exec_command("grep -i 'tier\\|agnes\\|retry\\|video' /tmp/api_server.log | tail -30")
print(f"\n=== Logs ===\n{stdout.read().decode()}")

# Final
_, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"Final: status={final['status']} output={final.get('output_path', 'none')}")

if final.get('output_path'):
    _, stdout, _ = c.exec_command(f"ls -lh {final['output_path']}")
    print(f"File: {stdout.read().decode()}")
    _, stdout, _ = c.exec_command(f"ffprobe -v quiet -show_entries stream=codec_name,width,height,nb_frames,duration -of csv {final['output_path']} 2>&1")
    print(f"Video: {stdout.read().decode()}")

c.close()
print("\nDone!")
