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

    cmd = """cd /opt/incentives-wallet && python3 << 'PYEOF'
import sqlite3, os, glob

# Find all .db files
db_files = glob.glob("*.db") + glob.glob("/opt/incentives-wallet/*.db")
print("DB files:", db_files)

for dbf in db_files:
    try:
        db = sqlite3.connect(dbf)
        cur = db.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in cur.fetchall()]
        print("\n" + dbf + " tables: " + str(tables))
        
        # Look for users table
        if "users" in tables:
            cur.execute("PRAGMA table_info(users)")
            cols = [r[1] for r in cur.fetchall()]
            print("  users columns: " + str(cols))
            
            cur.execute("SELECT email, is_founder, wallet_address FROM users WHERE email = 'hawpetossjustin25@gmail.com'")
            rows = cur.fetchall()
            print("  Founder account: " + str(rows))
            
            # Also check all founder accounts
            cur.execute("SELECT email, is_founder, wallet_address FROM users WHERE is_founder = 1")
            founders = cur.fetchall()
            print("  All founders: " + str(founders))
        
        db.close()
    except Exception as e:
        print("  Error with " + dbf + ": " + str(e))

PYEOF
"""
    _, stdout, stderr = c.exec_command(cmd, timeout=20)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("STDOUT:", out)
    if err:
        print("STDERR:", err)

    c.close()

if __name__ == "__main__":
    main()
