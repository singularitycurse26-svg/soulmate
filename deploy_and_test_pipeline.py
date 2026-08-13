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

# Upload the module
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
print("\n=== Server log ===")
print(stdout.read().decode())

# Verify endpoints still work
_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/styles")
print("\n=== Styles ===")
print(stdout.read().decode()[:200])

# Test Pollinations image API from VPS
print("\n=== Testing Pollinations image API from VPS ===")
_, stdout, _ = c.exec_command(
    "curl -s -o /tmp/test_ai.jpg -w '%{http_code} %{size_download}' "
    "'https://image.pollinations.ai/prompt/cinematic%20wide%20shot%20of%20a%20beautiful%20sunset%20over%20the%20ocean?model=flux&width=1920&height=1080&seed=42&nologo=true' "
    "--max-time 60 2>&1"
)
print(f"Image download: {stdout.read().decode()}")

_, stdout, _ = c.exec_command("ls -la /tmp/test_ai.jpg 2>/dev/null")
print(f"File: {stdout.read().decode()}")

# Test ffmpeg Ken Burns with the downloaded image
print("\n=== Testing ffmpeg Ken Burns ===")
_, stdout, stderr = c.exec_command(
    "ffmpeg -y -loop 1 -i /tmp/test_ai.jpg -t 5 "
    "-filter_complex \"scale=8000:-1,zoompan=z='min(zoom+0.001,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=125:s=1920x1080:fps=25\" "
    "-c:v libx264 -preset fast -crf 26 -pix_fmt yuv420p /tmp/test_kenburns.mp4 2>&1 | tail -5"
)
print(stdout.read().decode())

_, stdout, _ = c.exec_command("ls -la /tmp/test_kenburns.mp4 2>/dev/null")
print(f"Ken Burns video: {stdout.read().decode()}")

# Now test full pipeline: create a video
print("\n=== Testing full video generation pipeline ===")
_, stdout, _ = c.exec_command(
    """curl -s -X POST http://localhost:8546/v1/soulmovies/create """
    """-H 'Content-Type: application/json' """
    """-d '{"text_description":"A beautiful sunset over the ocean with waves crashing on the shore","style":"cinematic","duration_s":15}'"""
)
resp = stdout.read().decode()
print(f"Create response: {resp}")

data = json.loads(resp)
pid = data.get("project_id")
print(f"Project ID: {pid}")

# Poll status
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

# Check final result
_, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"\n=== Final ===")
print(f"Status: {final['status']}")
print(f"Output: {final.get('output_path', 'none')}")

if final.get('output_path'):
    _, stdout, _ = c.exec_command(f"ls -la {final['output_path']} 2>&1")
    print(f"File: {stdout.read().decode()}")

# Check API server log for tier info
_, stdout, _ = c.exec_command("grep -i 'tier' /tmp/api_server.log | tail -10")
print(f"\n=== Tier logs ===")
print(stdout.read().decode())

c.close()
print("\nDone!")
