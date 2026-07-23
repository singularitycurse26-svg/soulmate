import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Fix route conflict: rename /v1/voice/{msg_id} to /v1/voice/audio/{msg_id}
old = '@app.get("/v1/voice/{msg_id}")\nasync def get_voice_audio(msg_id: int, request: Request,'
new = '@app.get("/v1/voice/audio/{msg_id}")\nasync def get_voice_audio(msg_id: int, request: Request,'

if old in content:
    content = content.replace(old, new)
    print("Fixed voice route: /v1/voice/{msg_id} -> /v1/voice/audio/{msg_id}")
else:
    print("Route already fixed or not found")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:8546/v1/voice/status -H "X-API-Token: soulmate_wallet_2024" 2>&1', timeout=10)
print(f"Voice status: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command('curl -s http://localhost:8546/v1/sms/carriers 2>&1', timeout=10)
print(f"Carriers: {stdout.read().decode().strip()[:100]}")

ssh.close()
print("\nDone!")
