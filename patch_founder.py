#!/usr/bin/env python3
"""Patch api_server.py on VPS to:
1. Add FOUNDER_EMAILS set with hawpetossjustin25@gmail.com
2. Return is_founder in login response
3. Add user ID 3 to SMS_FOUNDERS
4. Add preferred_language column to users table
"""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

PATCH_SCRIPT = r"""#!/usr/bin/env python3
import re

FILE = "/opt/incentives-wallet/api_server.py"
with open(FILE, "r") as f:
    content = f.read()

# 1. Add FOUNDER_EMAILS near the top (after imports)
if "FOUNDER_EMAILS" not in content:
    # Find a good insertion point - after the last import or constant
    insert_point = content.find("SMS_FOUNDERS = {1, 2}")
    if insert_point > 0:
        # Find the line before SMS_FOUNDERS
        line_start = content.rfind("\n", 0, insert_point) + 1
        # Find what's before it
        prev_line_start = content.rfind("\n", 0, line_start - 1) + 1
        # Insert FOUNDER_EMAILS before SMS_FOUNDERS
        founder_block = '# Founder accounts — get all features free\nFOUNDER_EMAILS = {"hawpetossjustin25@gmail.com", "test@test.com", "test@soulmate.os"}\nFOUNDER_IDS = {1, 2, 3}\n\n'
        content = content[:insert_point] + founder_block + content[insert_point:]
        print("Added FOUNDER_EMAILS and FOUNDER_IDS")

# 2. Update SMS_FOUNDERS to include user ID 3
content = content.replace("SMS_FOUNDERS = {1, 2}  # user_id 1 = Justin (Founder), 2 = test user",
                          "SMS_FOUNDERS = {1, 2, 3}  # user_id 1 = Justin (Founder), 2 = test, 3 = hawpetossjustin25")
content = content.replace("SMS_FOUNDERS = {1, 2}\n",
                          "SMS_FOUNDERS = {1, 2, 3}\n")
print("Updated SMS_FOUNDERS to include ID 3")

# 3. Add is_founder to login response
old_login_return = 'return {"status": "ok", "user_id": user_id, "session_token": token}'
new_login_return = 'is_founder = user_id in FOUNDER_IDS or req.email.lower().strip() in FOUNDER_EMAILS\n    return {"status": "ok", "user_id": user_id, "session_token": token, "is_founder": is_founder}'
if old_login_return in content:
    content = content.replace(old_login_return, new_login_return)
    print("Added is_founder to login response")
else:
    print("WARNING: Could not find login return statement to patch")

# 4. Add preferred_language column to users table
# Find the users table creation
if "preferred_language" not in content:
    # Add to the CREATE TABLE users or ALTER TABLE
    old_create = 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, wallet_key_encrypted TEXT, wallet_address TEXT, created_at TEXT, last_login TEXT)'
    new_create = 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, wallet_key_encrypted TEXT, wallet_address TEXT, created_at TEXT, last_login TEXT, preferred_language TEXT DEFAULT "en")'
    if old_create in content:
        content = content.replace(old_create, new_create)
        print("Added preferred_language to CREATE TABLE users")
    else:
        # Try ALTER TABLE approach
        # Add after the users table creation area
        alter_stmt = '\ntry:\n    conn = sqlite3.connect(auth_db_path)\n    conn.execute("ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT \'en\'")\n    conn.commit()\n    conn.close()\nexcept:\n    pass\n'
        # Insert after auth_db_path is defined
        idx = content.find("auth_db_path")
        if idx > 0:
            line_end = content.find("\n", idx)
            content = content[:line_end+1] + alter_stmt + content[line_end+1:]
            print("Added ALTER TABLE for preferred_language")

with open(FILE, "w") as f:
    f.write(content)
print("Done patching api_server.py")
"""

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Upload and run the patch script
    sftp = c.open_sftp()
    with sftp.file("/tmp/patch_founder.py", "w") as f:
        f.write(PATCH_SCRIPT)
    sftp.close()

    _, stdout, stderr = c.exec_command("python3 /tmp/patch_founder.py", timeout=20)
    print("Patch output:")
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("Errors:", err)

    # Verify the changes
    _, stdout, _ = c.exec_command("grep -n 'FOUNDER_EMAILS\\|FOUNDER_IDS\\|is_founder\\|SMS_FOUNDERS\\|preferred_language' /opt/incentives-wallet/api_server.py | head -20", timeout=10)
    print("\nVerification:")
    print(stdout.read().decode())

    # Add preferred_language column to existing auth.db
    alter_cmd = """python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/incentives-wallet/auth.db')
try:
    conn.execute(\"ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en'\")
    conn.commit()
    print('Column added')
except Exception as e:
    print('Error:', e)
conn.close()
" """
    _, stdout, stderr = c.exec_command(alter_cmd, timeout=10)
    print("DB migration:")
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("DB stderr:", err)

    # Restart the backend
    _, stdout, stderr = c.exec_command("kill $(pgrep -f api_server.py); sleep 2; cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &", timeout=10)
    import time
    time.sleep(3)

    # Verify it's running
    _, stdout, _ = c.exec_command("pgrep -f api_server.py", timeout=5)
    pid = stdout.read().decode().strip()
    print("Backend PID:", pid)

    # Test login returns is_founder
    _, stdout, _ = c.exec_command(
        'curl -s -X POST http://localhost:8546/v1/auth/login -H "Content-Type: application/json" -d \'{"email":"hawpetossjustin25@gmail.com","password":"test"}\'',
        timeout=10
    )
    print("Login test:", stdout.read().decode()[:200])

    c.close()

if __name__ == "__main__":
    main()
