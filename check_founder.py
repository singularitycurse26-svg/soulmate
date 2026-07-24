#!/usr/bin/env python3
"""Check founder account and verify backend translation features on VPS."""
import paramiko

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # Check founder account in DB
    cmd = """cd /opt/incentives-wallet && python3 << 'PYEOF'
import sqlite3
db = sqlite3.connect("social.db")
cur = db.cursor()

# Check users table schema
cur.execute("PRAGMA table_info(users)")
cols = [r[1] for r in cur.fetchall()]
print("Users columns:", cols)

# Find founder account
cur.execute("SELECT * FROM users WHERE email = 'hawpetossjustin25@gmail.com'")
rows = cur.fetchall()
print("Founder account:", rows)

# Check all tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", tables)

# Check if translation_cache table exists
if "translation_cache" in tables:
    cur.execute("PRAGMA table_info(translation_cache)")
    print("translation_cache cols:", [r[1] for r in cur.fetchall()])
else:
    print("WARNING: translation_cache table NOT found")

# Check if user_languages table exists
if "user_languages" in tables:
    cur.execute("SELECT * FROM user_languages")
    print("user_languages data:", cur.fetchall())
else:
    print("WARNING: user_languages table NOT found")

# Check messages table for source_lang column
cur.execute("PRAGMA table_info(messages)")
msg_cols = [r[1] for r in cur.fetchall()]
print("messages columns:", msg_cols)
print("Has source_lang:", "source_lang" in msg_cols)

# Check dating_messages table for source_lang column
cur.execute("PRAGMA table_info(dating_messages)")
dm_cols = [r[1] for r in cur.fetchall()]
print("dating_messages columns:", dm_cols)
print("Has source_lang:", "source_lang" in dm_cols)

# Check wallet info for founder
cur.execute("SELECT wallet_address, wallet_key_encrypted FROM users WHERE email = 'hawpetossjustin25@gmail.com'")
wallet = cur.fetchall()
print("Founder wallet:", wallet)

db.close()
PYEOF
"""
    _, stdout, stderr = c.exec_command(cmd, timeout=20)
    out = stdout.read().decode()
    err = stderr.read().decode()
    print("STDOUT:", out)
    if err:
        print("STDERR:", err)

    # Check if translation endpoints are in api_server.py
    cmd2 = "grep -n 'translate' /opt/incentives-wallet/api_server.py | head -20"
    _, stdout2, _ = c.exec_command(cmd2, timeout=10)
    print("\nTranslation endpoints in api_server.py:")
    print(stdout2.read().decode())

    # Check if backend is running
    cmd3 = "ps aux | grep api_server | grep -v grep"
    _, stdout3, _ = c.exec_command(cmd3, timeout=10)
    print("Backend process:")
    print(stdout3.read().decode())

    # Check API is responding
    cmd4 = "curl -s http://localhost:8546/v1/translate/languages | head -200"
    _, stdout4, _ = c.exec_command(cmd4, timeout=10)
    print("Translate languages endpoint:")
    print(stdout4.read().decode())

    c.close()

if __name__ == "__main__":
    main()
