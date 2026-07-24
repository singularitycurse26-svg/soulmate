#!/usr/bin/env python3
"""Verify is_founder in login response and check founder account wallet."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Check the patched login function
    _, stdout, _ = c.exec_command("sed -n '688,700p' /opt/incentives-wallet/api_server.py", timeout=10)
    print("Login function (lines 688-700):")
    print(stdout.read().decode())

    # Check FOUNDER_EMAILS and FOUNDER_IDS
    _, stdout, _ = c.exec_command("grep -n 'FOUNDER_EMAILS\\|FOUNDER_IDS' /opt/incentives-wallet/api_server.py", timeout=10)
    print("Founder constants:")
    print(stdout.read().decode())

    # Check the auth.db users table now has preferred_language
    sftp = c.open_sftp()
    with sftp.file("/tmp/check_db.py", "w") as f:
        f.write("""import sqlite3
conn = sqlite3.connect('/opt/incentives-wallet/auth.db')
cur = conn.cursor()
cur.execute('PRAGMA table_info(users)')
cols = [r[1] for r in cur.fetchall()]
print('Users columns:', cols)
cur.execute('SELECT id, email, wallet_address, preferred_language FROM users')
for r in cur.fetchall():
    print(r)
conn.close()
""")
    sftp.close()

    _, stdout, _ = c.exec_command("python3 /tmp/check_db.py", timeout=10)
    print("\nDB state:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()
