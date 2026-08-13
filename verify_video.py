import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Test the download endpoint
_, stdout, _ = ssh.exec_command("curl -s -o /dev/null -w '%{http_code} %{size_download} %{content_type}' http://localhost:8546/v1/soulmovies/download/4bdb323c-ec1")
print(f"Download endpoint: {stdout.read().decode()}")

# Test thumbnail
_, stdout, _ = ssh.exec_command("curl -s -o /dev/null -w '%{http_code} %{size_download}' http://localhost:8546/v1/soulmovies/download/4bdb323c-ec1 --max-time 5")
print(f"Download test: {stdout.read().decode()}")

# Check the video file properties
_, stdout, _ = ssh.exec_command("ffprobe -v quiet -print_format json -show_streams /opt/incentives-wallet/videos/4bdb323c-ec1.mp4 2>&1 | head -30")
print(f"\nVideo properties:\n{stdout.read().decode()}")

# List all generated videos
_, stdout, _ = ssh.exec_command("ls -la /opt/incentives-wallet/videos/*.mp4 2>/dev/null")
print(f"\nAll videos:\n{stdout.read().decode()}")

# Check thumbnail
_, stdout, _ = ssh.exec_command("ls -la /opt/incentives-wallet/videos/thumbnails/ 2>/dev/null")
print(f"\nThumbnails:\n{stdout.read().decode()}")

# Test from external URL (via Caddy/sslip)
_, stdout, _ = ssh.exec_command("curl -s -o /dev/null -w '%{http_code}' 'https://191.44.121.29.sslip.io/v1/soulmovies/download/4bdb323c-ec1' --max-time 10 -k")
print(f"\nExternal download test: {stdout.read().decode()}")

# Check Caddy config for API proxying
_, stdout, _ = ssh.exec_command("grep -A5 'v1/soulmovies' /etc/caddy/Caddyfile 2>/dev/null || grep -A5 'reverse_proxy' /etc/caddy/Caddyfile 2>/dev/null | head -20")
print(f"\nCaddy config:\n{stdout.read().decode()}")

ssh.close()
