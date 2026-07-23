import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

if "wallet/cards" in content and "saved_cards" in content:
    print("Saved cards endpoints already patched, skipping...")
else:
    insert_marker = "from fastapi.staticfiles import StaticFiles"
    
    new_code = '''
# ==================== SAVED CARDS ====================

import hashlib as _hashlib

@app.get("/v1/wallet/cards")
async def get_saved_cards(request: Request):
    session_token = request.headers.get("X-Session-Token", "")
    if not session_token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB_PATH)
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
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"cards": []})
    user_id = row[0]
    
    c.execute("SELECT id, last4, expiry, label FROM saved_cards WHERE user_id = ?", (user_id,))
    cards = [{"id": r[0], "last4": r[1], "expiry": r[2], "label": r[3]} for r in c.fetchall()]
    conn.close()
    
    return {"cards": cards}

@app.post("/v1/wallet/cards/save")
async def save_card_endpoint(request: Request):
    data = await request.json()
    card_number = data.get("card_number", "")
    card_expiry = data.get("card_expiry", "")
    card_cvc = data.get("card_cvc", "")
    label = data.get("label", "Current Card")
    
    session_token = request.headers.get("X-Session-Token", "")
    if not session_token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    
    if not card_number or not card_expiry:
        return JSONResponse({"detail": "Card details required"}, status_code=400)
    
    conn = sqlite3.connect(DB_PATH)
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
    
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    card_id = str(_uuid.uuid4())[:8]
    card_hash = _hashlib.sha256(card_number.encode()).hexdigest()[:16]
    last4 = card_number[-4:]
    
    c.execute("INSERT INTO saved_cards VALUES (?, ?, ?, ?, ?, ?, ?)",
              (card_id, user_id, card_hash, last4, card_expiry, label,
               _time.strftime("%Y-%m-%dT%H:%M:%S")))
    conn.commit()
    conn.close()
    
    return {"status": "ok", "card_id": card_id, "last4": last4, "expiry": card_expiry}

@app.delete("/v1/wallet/cards/{card_id}")
async def delete_card_endpoint(card_id: str, request: Request):
    session_token = request.headers.get("X-Session-Token", "")
    if not session_token:
        return JSONResponse({"detail": "Authentication required"}, status_code=401)
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT user_id FROM sessions WHERE token = ?", (session_token,))
    row = c.fetchone()
    if not row:
        return JSONResponse({"detail": "Invalid session"}, status_code=401)
    user_id = row[0]
    
    c.execute("DELETE FROM saved_cards WHERE id = ? AND user_id = ?", (card_id, user_id))
    conn.commit()
    conn.close()
    
    return {"status": "ok", "deleted": card_id}

'''

    if insert_marker in content:
        content = content.replace(insert_marker, new_code + "\n" + insert_marker)
        print("Added saved cards endpoints")
    else:
        content = content + "\n" + new_code
        print("WARNING: Appended at end (static marker not found)")

with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
    f.write(content)

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

# Test endpoints
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

stdin, stdout, stderr = ssh.exec_command(
    'curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit '
    '-H "Content-Type: application/json" '
    '-d \'{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}\' 2>&1',
    timeout=10
)
print(f"Google Pay: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone! Backend patched with saved cards endpoints.")
