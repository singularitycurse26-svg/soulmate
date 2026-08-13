import paramiko
import time
import json

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"
AGNES_KEY = "sk-Kg6Vyt7XwKw79BnSn5CUaQIoHI47yentNvYM5oDumz6Qis5U"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

# Write Agnes API key to file
sftp = c.open_sftp()
with sftp.open("/opt/incentives-wallet/.agnes_key", "w") as f:
    f.write(AGNES_KEY)
sftp.close()
print("Agnes API key installed on VPS")

# Verify key file
_, stdout, _ = c.exec_command("cat /opt/incentives-wallet/.agnes_key")
print(f"Key verified: {stdout.read().decode().strip()[:10]}...")

# Test Agnes API directly - create a short video task
print("\n=== Testing Agnes AI API directly ===")
test_payload = json.dumps({
    "model": "agnes-video-v2.0",
    "prompt": "A cinematic shot of a cat walking on a beach at sunset, soft ocean waves, warm golden lighting, realistic motion",
    "width": 1280,
    "height": 720,
    "num_frames": 81,
    "frame_rate": 24
})

sftp = c.open_sftp()
with sftp.open("/tmp/agnes_test.json", "w") as f:
    f.write(test_payload)
sftp.close()

_, stdout, stderr = c.exec_command(
    f"curl -s -X POST https://apihub.agnes-ai.com/v1/videos "
    "-H 'Authorization: Bearer sk-Kg6Vyt7XwKw79BnSn5CUaQIoHI47yentNvYM5oDumz6Qis5U' "
    "-H 'Content-Type: application/json' "
    "-d @/tmp/agnes_test.json"
)
resp = stdout.read().decode()
err = stderr.read().decode()
print(f"Create response: {resp[:500]}")
if err:
    print(f"Stderr: {err[:200]}")

# Parse response
try:
    data = json.loads(resp)
    video_id = data.get("video_id") or data.get("id")
    task_id = data.get("task_id") or data.get("id")
    print(f"\nVideo ID: {video_id}")
    print(f"Task ID: {task_id}")
    print(f"Full response: {json.dumps(data, indent=2)[:500]}")
    
    if video_id or task_id:
        # Poll for result
        print("\nPolling for video result...")
        for i in range(60):
            time.sleep(5)
            poll_url = f"https://apihub.agnes-ai.com/agnesapi?video_id={video_id}" if video_id else f"https://apihub.agnes-ai.com/v1/videos/{task_id}"
            _, stdout, _ = c.exec_command(
                f"curl -s '{poll_url}' "
                f"-H 'Authorization: Bearer sk-Kg6Vyt7XwKw79BnSn5CUaQIoHI47yentNvYM5oDumz6Qis5U'"
            )
            poll_resp = stdout.read().decode()
            try:
                pdata = json.loads(poll_resp)
                status = pdata.get("status", "unknown")
                print(f"  [{i*5}s] status={status}")
                print(f"  Response: {json.dumps(pdata, indent=2)[:300]}")
                
                if status.lower() in ("succeeded", "success", "completed", "complete"):
                    video_url = pdata.get("video_url") or pdata.get("url") or pdata.get("output", {}).get("video_url", "")
                    if video_url:
                        print(f"\n=== SUCCESS! Video URL: {video_url} ===")
                        
                        # Download the video
                        _, stdout, _ = c.exec_command(f"curl -s -o /tmp/agnes_test_video.mp4 '{video_url}' && ls -lh /tmp/agnes_test_video.mp4")
                        print(f"Downloaded: {stdout.read().decode()}")
                        
                        # Check if it's a real video
                        _, stdout, _ = c.exec_command("ffprobe -v quiet -print_format json -show_streams /tmp/agnes_test_video.mp4 2>&1 | head -30")
                        print(f"Video info: {stdout.read().decode()[:300]}")
                    break
                elif status.lower() in ("failed", "error"):
                    print(f"FAILED: {pdata}")
                    break
            except:
                print(f"  [{i*5}s] raw: {poll_resp[:150]}")
except Exception as e:
    print(f"Error parsing: {e}")

# Restart API server with new key
print("\n=== Restarting API server ===")
c.exec_command("kill -9 $(pgrep -f api_server.py) 2>/dev/null")
time.sleep(2)
c.exec_command("cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &")
time.sleep(5)

_, stdout, _ = c.exec_command("tail -3 /tmp/api_server.log")
print(f"Server log: {stdout.read().decode()}")

# Now test a short movie through SoulMovies API
print("\n=== Testing 15s movie through SoulMovies ===")
movie_payload = json.dumps({
    "text_description": "A cat walking on a beach at sunset with waves crashing, cinematic golden hour lighting, the cat moves naturally",
    "style": "cinematic",
    "duration_s": 15,
    "resolution": "1080p"
})

sftp = c.open_sftp()
with sftp.open("/tmp/movie_test.json", "w") as f:
    f.write(movie_payload)
sftp.close()

_, stdout, _ = c.exec_command(
    "curl -s -X POST http://localhost:8546/v1/soulmovies/create "
    "-H 'Content-Type: application/json' "
    "-d @/tmp/movie_test.json"
)
resp = stdout.read().decode()
print(f"Create: {resp}")

data = json.loads(resp)
pid = data.get("project_id")
print(f"Project ID: {pid}")

# Poll
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

# Check tier logs
_, stdout, _ = c.exec_command("grep -i 'tier\\|agnes' /tmp/api_server.log | tail -20")
print(f"\n=== Tier logs ===\n{stdout.read().decode()}")

# Final
_, stdout, _ = c.exec_command(f"curl -s http://localhost:8546/v1/soulmovies/status/{pid}")
final = json.loads(stdout.read().decode())
print(f"Final: status={final['status']} output={final.get('output_path', 'none')}")

if final.get('output_path'):
    _, stdout, _ = c.exec_command(f"ls -lh {final['output_path']}")
    print(f"File: {stdout.read().decode()}")
    _, stdout, _ = c.exec_command(f"ffprobe -v quiet -print_format json -show_streams {final['output_path']} 2>&1 | head -20")
    print(f"Video info: {stdout.read().decode()[:300]}")

c.close()
print("\nDone!")
