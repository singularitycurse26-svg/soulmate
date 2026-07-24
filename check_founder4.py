#!/usr/bin/env python3
"""Check founder account details in auth.db."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Get all users from auth.db
    cmd1 = """python3 -c "
import sqlite3
db = sqlite3.connect('/opt/incentives-wallet/auth.db')
cur = db.cursor()
cur.execute('SELECT id, email, wallet_address, wallet_key_encrypted FROM users')
for r in cur.fetchall():
    print(r)
db.close()
" """
    _, stdout, stderr = c.exec_command(cmd1, timeout=15)
    print("All users in auth.db:")
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("ERR:", err)

    # Check how founder is determined in api_server.py
    cmd2 = "grep -n 'founder\\|FOUNDER\\|is_founder' /opt/incentives-wallet/api_server.py | head -20"
    _, stdout, _ = c.exec_command(cmd2, timeout=10)
    print("\nFounder logic in api_server.py:")
    print(stdout.read().decode())

    # Check social.db for source_lang columns
    cmd3 = """python3 -c "
import sqlite3
db = sqlite3.connect('/opt/incentives-wallet/social.db')
cur = db.cursor()
cur.execute('PRAGMA table_info(messages)')
print('messages cols:', [r[1] for r in cur.fetchall()])
cur.execute('PRAGMA table_info(dating_messages)')
print('dating_messages cols:', [r[1] for r in cur.fetchall()])
cur.execute('PRAGMA table_info(translation_cache)')
print('translation_cache cols:', [r[1] for r in cur.fetchall()])
cur.execute('SELECT * FROM user_languages')
print('user_languages:', cur.fetchall())
db.close()
" """
    _, stdout, _ = c.exec_command(cmd3, timeout=15)
    print("\nSocial DB schema:")
    print(stdout.read().decode())

    c.close()

if __name__ == "__main__":
    main()
