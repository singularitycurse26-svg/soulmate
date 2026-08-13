import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('191.44.121.29', username='root', password='wallmartxxxxxxxx8', timeout=15)

# Check generation progress
_, stdout, _ = c.exec_command("curl -s http://localhost:8546/v1/soulmovies/status/66815550-89f")
print(f"Status: {stdout.read().decode()}")

# Count images downloaded
_, stdout, _ = c.exec_command("grep -c 'Image downloaded' /tmp/api_server.log")
print(f"Images downloaded: {stdout.read().decode().strip()}")

# Count image download attempts
_, stdout, _ = c.exec_command("grep -c 'Downloading AI image' /tmp/api_server.log")
print(f"Image download attempts: {stdout.read().decode().strip()}")

# Show recent log entries
_, stdout, _ = c.exec_command("grep 'Tier 2' /tmp/api_server.log | tail -10")
print(f"\nRecent Tier 2 logs:\n{stdout.read().decode()}")

# Check temp directory for scene files
_, stdout, _ = c.exec_command("ls /opt/incentives-wallet/videos/66815550-89f/ 2>/dev/null | head -20")
print(f"Scene files:\n{stdout.read().decode()}")

_, stdout, _ = c.exec_command("ls /opt/incentives-wallet/videos/66815550-89f/ 2>/dev/null | wc -l")
print(f"Total scene files: {stdout.read().decode().strip()}")

c.close()
