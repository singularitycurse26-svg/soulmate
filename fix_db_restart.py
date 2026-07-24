#!/usr/bin/env python3
"""Fix DB column and restart backend."""
import paramiko
import time

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Add preferred_language column using a temp script file
    sftp = c.open_sftp()
    with sftp.file("/tmp/alter_db.py", "w") as f:
        f.write("""import sqlite3
conn = sqlite3.connect('/opt/incentives-wallet/auth.db')
try:
    conn.execute("ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en'")
    conn.commit()
    print('Column added successfully')
except Exception as e:
    print('Error:', e)
conn.close()
""")
    sftp.close()

    _, stdout, stderr = c.exec_command("python3 /tmp/alter_db.py", timeout=10)
    print("DB migration:", stdout.read().decode(), stderr.read().decode())

    # Kill old backend process
    _, _, _ = c.exec_command("pkill -f api_server.py", timeout=5)
    time.sleep(2)

    # Start fresh
    _, stdout, stderr = c.exec_command(
        "cd /opt/incentives-wallet && nohup python3 api_server.py > /tmp/api_server.log 2>&1 &",
        timeout=5
    )
    time.sleep(4)

    # Verify it's running
    _, stdout, _ = c.exec_command("pgrep -f api_server.py", timeout=5)
    pid = stdout.read().decode().strip()
    print("Backend PID:", pid)

    if pid:
        # Test the login endpoint returns is_founder
        _, stdout, _ = c.exec_command(
            'curl -s -X POST http://localhost:8546/v1/auth/login -H "Content-Type: application/json" -d \'{"email":"hawpetossjustin25@gmail.com","password":"test"}\'',
            timeout=10
        )
        result = stdout.read().decode()
        print("Login test:", result[:300])

        # Test translate endpoint still works
        _, stdout, _ = c.exec_command(
            'curl -s http://localhost:8546/v1/translate/languages | head -100',
            timeout=10
        )
        print("Translate languages:", stdout.read().decode()[:100])
    else:
        # Check error log
        _, stdout, _ = c.exec_command("tail -20 /tmp/api_server.log", timeout=5)
        print("Error log:", stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()
