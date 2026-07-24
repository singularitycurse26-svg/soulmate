#!/usr/bin/env python3
"""Find the users table and founder account on VPS."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # First find all .db files
    cmd1 = "find /opt/incentives-wallet -name '*.db' -type f"
    _, stdout, _ = c.exec_command(cmd1, timeout=10)
    db_files = stdout.read().decode().strip().split('\n')
    print("DB files:", db_files)

    # For each db file, check tables and look for users
    for dbf in db_files:
        if not dbf.strip():
            continue
        cmd = 'python3 -c "import sqlite3; db=sqlite3.connect(\\"' + dbf + '\\"); cur=db.cursor(); cur.execute(\\"SELECT name FROM sqlite_master WHERE type=\\x27table\\x27\\"); print(\\"' + dbf + ':\\", [r[0] for r in cur.fetchall()])"'
        _, stdout, stderr = c.exec_command(cmd, timeout=10)
        out = stdout.read().decode().strip()
        err = stderr.read().decode().strip()
        if out:
            print(out)
        if err:
            print("  ERR:", err)

    # Check the main auth db - try incentives.db
    for dbf in db_files:
        if not dbf.strip():
            continue
        cmd2 = 'python3 -c "import sqlite3; db=sqlite3.connect(\\"' + dbf + '\\"); cur=db.cursor(); cur.execute(\\"SELECT name FROM sqlite_master WHERE type=\\x27table\\x27 AND name=\\x27users\\x27\\"); r=cur.fetchone(); print(\\"' + dbf + ' has users table:\\", r is not None)"'
        _, stdout, _ = c.exec_command(cmd2, timeout=10)
        out = stdout.read().decode().strip()
        if out and "True" in out:
            print("\nFound users table in:", dbf)
            # Get columns
            cmd3 = 'python3 -c "import sqlite3; db=sqlite3.connect(\\"' + dbf + '\\"); cur=db.cursor(); cur.execute(\\"PRAGMA table_info(users)\\"); print([r[1] for r in cur.fetchall()])"'
            _, stdout, _ = c.exec_command(cmd3, timeout=10)
            print("Columns:", stdout.read().decode().strip())

            # Get founder account
            cmd4 = "python3 -c \"import sqlite3; db=sqlite3.connect('" + dbf + "'); cur=db.cursor(); cur.execute(\\\"SELECT email, is_founder, wallet_address FROM users WHERE email='hawpetossjustin25@gmail.com'\\\"); print(cur.fetchall())\""
            _, stdout, _ = c.exec_command(cmd4, timeout=10)
            print("Founder account:", stdout.read().decode().strip())

            # Get all founders
            cmd5 = "python3 -c \"import sqlite3; db=sqlite3.connect('" + dbf + "'); cur=db.cursor(); cur.execute(\\\"SELECT email, is_founder, wallet_address FROM users WHERE is_founder=1\\\"); print(cur.fetchall())\""
            _, stdout, _ = c.exec_command(cmd5, timeout=10)
            print("All founders:", stdout.read().decode().strip())

    c.close()

if __name__ == "__main__":
    main()
