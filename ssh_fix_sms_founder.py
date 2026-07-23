import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read current api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Patch 1: Add SMS founder whitelist (user_id 1 = Justin, same as subscription system)
old_check = '''def check_sms_access(user_id):
    """Check if user has SMS access (trial or paid). Returns (allowed, status, detail)."""
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT trial_started_at, subscription_status, subscription_expires_at FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()'''

new_check = '''# SMS founders get free lifetime access (same as subscription whitelist)
SMS_FOUNDERS = {1, 2}  # user_id 1 = Justin (Founder), 2 = test user

def check_sms_access(user_id):
    """Check if user has SMS access (trial or paid). Returns (allowed, status, detail)."""
    # Founder whitelist - free for life
    if user_id in SMS_FOUNDERS:
        return (True, "founder", "Founder — Free texting for life")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT trial_started_at, subscription_status, subscription_expires_at FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()'''

if old_check in content:
    content = content.replace(old_check, new_check)
    print("Patched check_sms_access with founder whitelist")
else:
    print("ERROR: Could not find check_sms_access function")
    # Try to find it with different whitespace
    if "def check_sms_access" in content:
        print("Found check_sms_access but pattern didn't match exactly")
    sftp.close()
    ssh.close()
    exit(1)

# Write back
with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)
print("API server updated on VPS")

sftp.close()

# Restart
print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
stdin, stdout, stderr = ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Check SMS status endpoint
print("\nChecking SMS status...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/sms/status -H 'X-API-Token: soulmate_wallet_2024' 2>&1", timeout=10)
status = stdout.read().decode().strip()
print(f"Status: {status[:300]}")

# Check logs
print("\nChecking server logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 10 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-300:]}")

ssh.close()
print("\nDone!")
