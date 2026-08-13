import paramiko
import os
import posixpath

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"
LOCAL_DIST = r"C:\Users\hawpe\CascadeProjects\soulmate\frontend\dist"
REMOTE_DIST = "/opt/incentives-wallet/wallet"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PASS, timeout=30)

sftp = c.open_sftp()

# Ensure remote dir exists
_, o, _ = c.exec_command(f"mkdir -p {REMOTE_DIST}/assets {REMOTE_DIST}/locales", timeout=10)
o.read()

uploaded = 0
for root, dirs, files in os.walk(LOCAL_DIST):
    rel = os.path.relpath(root, LOCAL_DIST).replace("\\", "/")
    remote_dir = REMOTE_DIST if rel == "." else f"{REMOTE_DIST}/{rel}"
    try:
        sftp.stat(remote_dir)
    except:
        try:
            sftp.mkdir(remote_dir)
        except:
            pass

    for f in files:
        local_path = os.path.join(root, f)
        remote_path = f"{remote_dir}/{f}"
        sftp.put(local_path, remote_path)
        uploaded += 1
        print(f"  Uploaded: {remote_path}")

sftp.close()
print(f"\nUploaded {uploaded} files to {REMOTE_DIST}")

# Verify
_, o, _ = c.exec_command(f"cat {REMOTE_DIST}/index.html | head -25", timeout=10)
print("\n=== index.html on server ===")
print(o.read().decode())

_, o, _ = c.exec_command(f"cat {REMOTE_DIST}/locales/en/common.json | head -20", timeout=10)
print("\n=== common.json on server ===")
print(o.read().decode())

# Test via curl
_, o, _ = c.exec_command("curl -s http://localhost:8546/ | head -25", timeout=10)
print("\n=== curl test ===")
print(o.read().decode())

c.close()
print("Deploy complete!")
