import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

lines = content.split('\n')
for i in range(3565, min(3585, len(lines))):
    print(f"{i+1}: {lines[i]}")

sftp.close()
ssh.close()
