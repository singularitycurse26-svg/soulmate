import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

if "assigned_number" in content:
    print("assigned_number already patched, skipping...")
else:
    # Find the sms status endpoint and add assigned_number to the response
    # The status endpoint returns a JSON with status, detail, etc.
    # We need to add assigned_number from the user's profile phone_number
    
    # Find the sms status endpoint return
    old_status = '"telegram_connected": telegram_connected,'
    new_status = '"telegram_connected": telegram_connected, "assigned_number": profile_phone if profile_phone else None,'
    
    if old_status in content:
        content = content.replace(old_status, new_status, 1)
        print("Added assigned_number to SMS status response")
        
        # Also need to make sure profile_phone is available in that endpoint
        # Check if profile_phone is already queried
        if "profile_phone" not in content:
            # Add profile phone query before the status response
            old_status2 = '"telegram_connected": telegram_connected,'
            new_status2 = '''profile_phone = None
        try:
            c2 = conn.cursor()
            c2.execute("SELECT phone_number FROM sms_profiles WHERE session_token = ?", (session_token,))
            prow = c2.fetchone()
            if prow:
                profile_phone = prow[0]
        except:
            pass
        "telegram_connected": telegram_connected,'''
            content = content.replace(old_status2, new_status2, 1)
            print("Added profile_phone query to SMS status endpoint")
    else:
        print("WARNING: Could not find telegram_connected in status response")
        # Try alternate approach - find the return statement in sms_status
        if '"status":' in content and 'def sms_status' in content:
            print("Trying alternate approach...")
        else:
            print("Could not patch - manual intervention needed")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test
stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/sms/status -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print(f"SMS status: {stdout.read().decode().strip()[:300]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

ssh.close()
print("\nDone!")
