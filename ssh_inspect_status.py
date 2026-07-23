import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Find the sms status endpoint
idx = content.find("def sms_status")
if idx >= 0:
    snippet = content[idx:idx+800]
    print("=== SMS STATUS ENDPOINT ===")
    print(snippet)
else:
    print("Could not find sms_status function")
    # Try alternate names
    for name in ["def get_sms_status", "async def sms_status", "async def get_sms_status", "/v1/sms/status"]:
        idx2 = content.find(name)
        if idx2 >= 0:
            print(f"Found '{name}' at position {idx2}")
            print(content[idx2:idx2+800])
            break

sftp.close()
ssh.close()
