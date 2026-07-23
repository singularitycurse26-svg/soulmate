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
    # Add profile phone query and assigned_number to the response
    old_code = '''    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT telegram_chat_id, telegram_username, preferred_method FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return {
        "allowed": allowed,
        "status": status,
        "detail": detail,
        "trial_days": SMS_TRIAL_DAYS,
        "price_inc": SMS_PRICE_INC,
        "telegram_connected": bool(row and row[0]),'''

    new_code = '''    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT telegram_chat_id, telegram_username, preferred_method FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    profile_phone = None
    try:
        c.execute("SELECT phone_number FROM sms_profiles WHERE user_id = ?", (user_id,))
        prow = c.fetchone()
        if prow and prow[0]:
            profile_phone = prow[0]
    except:
        pass
    conn.close()
    return {
        "allowed": allowed,
        "status": status,
        "detail": detail,
        "trial_days": SMS_TRIAL_DAYS,
        "price_inc": SMS_PRICE_INC,
        "assigned_number": profile_phone,
        "telegram_connected": bool(row and row[0]),'''

    if old_code in content:
        content = content.replace(old_code, new_code, 1)
        print("Patched: added assigned_number to SMS status endpoint")
    else:
        print("ERROR: Could not find target code block")
        # Show what we have around the return
        idx = content.find('"telegram_connected": bool(row')
        if idx >= 0:
            print("Context around telegram_connected:")
            print(content[idx-200:idx+200])

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
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/sms/status -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print(f"SMS status: {stdout.read().decode().strip()[:300]}")

ssh.close()
print("\nDone!")
