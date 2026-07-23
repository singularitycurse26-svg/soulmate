import paramiko
import os
import stat
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

# Check current wallet dir
stdin, stdout, stderr = ssh.exec_command("ls -la /opt/incentives-wallet/wallet/ 2>&1")
print("Current wallet dir:")
print(stdout.read().decode())

# Upload the React build to /opt/incentives-wallet/wallet/
sftp = ssh.open_sftp()

local_dist = r"C:\Users\hawpe\CascadeProjects\soulmate\frontend\dist"
remote_dir = "/opt/incentives-wallet/wallet"

# Backup old wallet dir
stdin, stdout, stderr = ssh.exec_command(f"mv {remote_dir} {remote_dir}_backup_$(date +%s) 2>&1 && mkdir -p {remote_dir}")
stdout.read()
print(f"Backed up old wallet dir, created new {remote_dir}")

def upload_dir(local_path, remote_path):
    for item in os.listdir(local_path):
        local_item = os.path.join(local_path, item)
        remote_item = remote_path + "/" + item
        if os.path.isfile(local_item):
            print(f"  Uploading: {item} ({os.path.getsize(local_item)} bytes)")
            sftp.put(local_item, remote_item)
        elif os.path.isdir(local_item):
            try:
                sftp.mkdir(remote_item)
            except:
                pass
            upload_dir(local_item, remote_item)

print(f"\nUploading dist/ contents to {remote_dir}/")
upload_dir(local_dist, remote_dir)
print("\nUpload complete!")

# Verify
stdin, stdout, stderr = ssh.exec_command(f"ls -la {remote_dir}/ 2>&1")
print("\nRemote dir contents:")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command(f"ls -la {remote_dir}/assets/ 2>&1")
print("Assets dir:")
print(stdout.read().decode())

sftp.close()

# Restart API server to pick up new files
print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Check health
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
print(f"Health: {stdout.read().decode().strip()[:200]}")

# Check if index.html is served
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/ 2>&1 | head -5", timeout=10)
print(f"\nIndex.html served:")
print(stdout.read().decode())

ssh.close()
print("\nDone! Frontend deployed to VPS.")
