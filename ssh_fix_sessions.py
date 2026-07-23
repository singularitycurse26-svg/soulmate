import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Add sessions table creation before querying it
old_code = """    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS saved_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        card_hash TEXT,
        last4 TEXT,
        expiry TEXT,
        label TEXT,
        created_at TEXT
    )""")
    
    # Get user from session
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))"""

new_code = """    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS saved_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        card_hash TEXT,
        last4 TEXT,
        expiry TEXT,
        label TEXT,
        created_at TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        created TEXT
    )""")
    
    # Get user from session
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))"""

if old_code in content:
    content = content.replace(old_code, new_code, 1)
    print("Fixed: added sessions table creation in get_saved_cards")
else:
    print("WARNING: couldn't find the target code to patch")

# Also fix the save_card and delete_card endpoints
old_code2 = """    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    card_id = str(_uuid.uuid4())[:8]"""

new_code2 = """    c.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        created TEXT
    )""")
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    card_id = str(_uuid.uuid4())[:8]"""

if old_code2 in content:
    content = content.replace(old_code2, new_code2, 1)
    print("Fixed: added sessions table creation in save_card")

# Fix delete endpoint too
old_code3 = """    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    c.execute("DELETE FROM saved_cards WHERE id = ? AND user_id = ?", (card_id, user_id))"""

new_code3 = """    c.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        created TEXT
    )""")
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    c.execute("DELETE FROM saved_cards WHERE id = ? AND user_id = ?", (card_id, user_id))"""

if old_code3 in content:
    content = content.replace(old_code3, new_code3, 1)
    print("Fixed: added sessions table creation in delete_card")

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
    'curl -s http://localhost:8546/v1/wallet/cards -H "X-Session-Token: test" 2>&1',
    timeout=10
)
print(f"GET /v1/wallet/cards: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command(
    'curl -s http://localhost:8546/v1/health 2>&1',
    timeout=10
)
print(f"Health: {stdout.read().decode().strip()[:100]}")

ssh.close()
print("\nDone!")
