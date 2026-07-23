import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read current api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Check what's already there
has_sms_profile = "sms_profiles" in content
has_voice = "voice_messages" in content

print(f"Has SMS profile: {has_sms_profile}, Has voice: {has_voice}")

# Code to insert before static serving section
new_code = '''

# --- SMS PROFILES (Identity Gate) ---

# Walkie-talkie + comms pricing: free 1 year, then 1.50 INC/month
SMS_TRIAL_DAYS = 365
SMS_PRICE_INC = 1.50
WT_TRIAL_DAYS = 365
WT_PRICE_INC = 1.50

# Founders get free for life
SMS_FOUNDERS = {1, 2}

def init_sms_profiles_db():
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS sms_profiles (
            user_id INTEGER PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            home_address TEXT NOT NULL,
            display_name_type TEXT DEFAULT 'real',
            wallet_tag TEXT,
            texting_unlocked INTEGER DEFAULT 1,
            trial_started_at TEXT DEFAULT (datetime('now')),
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS voice_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            channel TEXT DEFAULT 'general',
            from_name TEXT NOT NULL,
            audio_data TEXT NOT NULL,
            duration_sec REAL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS wt_subscriptions (
            user_id INTEGER PRIMARY KEY,
            trial_started_at TEXT DEFAULT (datetime('now')),
            subscription_status TEXT DEFAULT 'trial',
            subscription_expires_at TEXT,
            inc_paid_tx_hash TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_sms_profiles_db()

def check_sms_access(user_id):
    """Check if user has comms access. Returns (allowed, status, detail)."""
    if user_id in SMS_FOUNDERS:
        return (True, "founder", "Founder — Free communications for life")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    # Check if profile exists
    c.execute("SELECT texting_unlocked FROM sms_profiles WHERE user_id = ?", (user_id,))
    profile_row = c.fetchone()
    if not profile_row:
        conn.close()
        return (False, "incomplete", "Complete your profile to unlock communications")
    # Check trial/paid status
    c.execute("SELECT trial_started_at, subscription_status, subscription_expires_at FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        # New user with profile - start trial
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO sms_settings (user_id, subscription_status) VALUES (?, 'trial')", (user_id,))
        conn.commit()
        conn.close()
        return (True, "trial", f"Free trial active ({SMS_TRIAL_DAYS} days)")
    trial_started, sub_status, expires_at = row
    if sub_status == "paid" and expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            if datetime.now() > exp:
                return (False, "expired", f"Subscription expired. Pay {SMS_PRICE_INC} INC/month to renew.")
        except:
            pass
        return (True, "paid", f"Active until {expires_at[:10]}")
    if sub_status == "trial":
        try:
            trial_start = datetime.fromisoformat(trial_started) if trial_started else datetime.now()
            days_left = SMS_TRIAL_DAYS - (datetime.now() - trial_start).days
            if days_left > 0:
                return (True, "trial", f"Free trial: {days_left} days left")
            else:
                return (False, "expired", f"Free trial ended. Pay {SMS_PRICE_INC} INC/month for comms.")
        except:
            return (True, "trial", "Free trial active")
    return (False, "none", "No comms access")

def check_wt_access(user_id):
    """Check walkie-talkie access. Returns (allowed, status, detail)."""
    if user_id in SMS_FOUNDERS:
        return (True, "founder", "Founder — Free walkie-talkie for life")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT trial_started_at, subscription_status, subscription_expires_at FROM wt_subscriptions WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    if not row:
        c.execute("INSERT OR IGNORE INTO wt_subscriptions (user_id, subscription_status) VALUES (?, 'trial')", (user_id,))
        conn.commit()
        conn.close()
        return (True, "trial", f"Walkie-talkie free trial ({WT_TRIAL_DAYS} days)")
    trial_started, sub_status, expires_at = row
    conn.close()
    if sub_status == "paid" and expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            if datetime.now() > exp:
                return (False, "expired", f"Walkie-talkie expired. Pay {WT_PRICE_INC} INC/month.")
        except:
            pass
        return (True, "paid", f"Walkie-talkie active until {expires_at[:10]}")
    if sub_status == "trial":
        try:
            trial_start = datetime.fromisoformat(trial_started) if trial_started else datetime.now()
            days_left = WT_TRIAL_DAYS - (datetime.now() - trial_start).days
            if days_left > 0:
                return (True, "trial", f"Walkie-talkie: {days_left} days left")
            else:
                return (False, "expired", f"Walkie-talkie trial ended. Pay {WT_PRICE_INC} INC/month.")
        except:
            return (True, "trial", "Walkie-talkie trial active")
    return (False, "none", "No walkie-talkie access")

def get_display_name(user_id):
    """Get user's display name from profile."""
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT first_name, last_name, display_name_type, wallet_tag FROM sms_profiles WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return "Unknown"
    first, last, dtype, tag = row
    if dtype == "tag" and tag:
        return f"@{tag}"
    return f"{first} {last}"

class SmsProfileRequest(BaseModel):
    first_name: str
    last_name: str
    phone_number: str
    home_address: str
    display_name_type: str = "real"
    wallet_tag: str = ""

@app.post("/v1/sms/profile")
async def save_sms_profile(req: SmsProfileRequest, request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_profile"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    if not req.first_name.strip() or not req.last_name.strip():
        raise HTTPException(status_code=400, detail="First and last name required")
    if not req.phone_number.strip():
        raise HTTPException(status_code=400, detail="Phone number required")
    if not req.home_address.strip():
        raise HTTPException(status_code=400, detail="Home address required")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("""INSERT INTO sms_profiles (user_id, first_name, last_name, phone_number, home_address, display_name_type, wallet_tag, texting_unlocked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                 ON CONFLICT(user_id) DO UPDATE SET first_name=?, last_name=?, phone_number=?, home_address=?, display_name_type=?, wallet_tag=?""",
              (user_id, req.first_name, req.last_name, req.phone_number, req.home_address, req.display_name_type, req.wallet_tag,
               req.first_name, req.last_name, req.phone_number, req.home_address, req.display_name_type, req.wallet_tag))
    # Start trial if not exists
    c.execute("INSERT OR IGNORE INTO sms_settings (user_id, subscription_status) VALUES (?, 'trial')", (user_id,))
    c.execute("INSERT OR IGNORE INTO wt_subscriptions (user_id, subscription_status) VALUES (?, 'trial')", (user_id,))
    conn.commit()
    conn.close()
    logger.info(f"SMS profile created for user {user_id}: {req.first_name} {req.last_name}")
    return {"status": "saved", "display_name": get_display_name(user_id)}

@app.get("/v1/sms/profile")
async def get_sms_profile(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_get_profile"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT first_name, last_name, phone_number, display_name_type, wallet_tag, texting_unlocked FROM sms_profiles WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return {"status": "none", "profile": None}
    return {
        "status": "ok",
        "profile": {
            "first_name": row[0],
            "last_name": row[1],
            "phone_number": row[2],
            "display_name_type": row[3],
            "wallet_tag": row[4],
            "texting_unlocked": bool(row[5]),
        }
    }

# --- VOICE MESSAGES (Walkie-Talkie Async) ---

class VoiceMessageRequest(BaseModel):
    channel: str = "general"
    audio_data: str
    duration_sec: float = 0

@app.post("/v1/voice/send")
async def send_voice_message(req: VoiceMessageRequest, request: Request,
                             _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "voice_send"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    allowed, status, detail = check_wt_access(user_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=detail)
    display_name = get_display_name(user_id)
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO voice_messages (user_id, channel, from_name, audio_data, duration_sec) VALUES (?, ?, ?, ?, ?)",
              (user_id, req.channel, display_name, req.audio_data, req.duration_sec))
    msg_id = c.lastrowid
    conn.commit()
    conn.close()
    logger.info(f"Voice message from user {user_id} in channel {req.channel}")
    return {"status": "sent", "id": msg_id, "from_name": display_name}

@app.get("/v1/voice/messages")
async def get_voice_messages(request: Request, channel: str = "general",
                             _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "voice_list"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT id, from_name, duration_sec, created_at FROM voice_messages WHERE channel = ? ORDER BY created_at DESC LIMIT 50",
              (channel,))
    rows = c.fetchall()
    conn.close()
    return {"messages": [{"id": r[0], "from_name": r[1], "duration": r[2], "created_at": r[3]} for r in rows]}

@app.get("/v1/voice/{msg_id}")
async def get_voice_audio(msg_id: int, request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "voice_audio"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT audio_data FROM voice_messages WHERE id = ?", (msg_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Voice message not found")
    return {"audio_data": row[0]}

@app.delete("/v1/voice/{msg_id}")
async def delete_voice_message(msg_id: int, request: Request,
                               _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "voice_del"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("DELETE FROM voice_messages WHERE id = ? AND user_id = ?", (msg_id, user_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/v1/voice/status")
async def get_wt_status(request: Request,
                        _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "wt_status"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    allowed, status, detail = check_wt_access(user_id)
    return {
        "allowed": allowed,
        "status": status,
        "detail": detail,
        "trial_days": WT_TRIAL_DAYS,
        "price_inc": WT_PRICE_INC,
    }

class WtSubscribeRequest(BaseModel):
    tx_hash: str

@app.post("/v1/voice/subscribe")
async def wt_subscribe(req: WtSubscribeRequest, request: Request,
                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "wt_sub"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    expires = (datetime.now() + timedelta(days=30)).isoformat()
    c.execute("""INSERT INTO wt_subscriptions (user_id, subscription_status, subscription_expires_at, inc_paid_tx_hash)
                 VALUES (?, 'paid', ?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET subscription_status='paid', subscription_expires_at=?, inc_paid_tx_hash=?""",
              (user_id, expires, req.tx_hash, expires, req.tx_hash))
    conn.commit()
    conn.close()
    logger.info(f"WT subscription: user {user_id} paid, expires {expires}")
    return {"status": "subscribed", "expires_at": expires, "price_inc": WT_PRICE_INC}

# --- WEBRTC SIGNALING (Walkie-Talkie Live) ---

from fastapi import WebSocket, WebSocketDisconnect

class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}  # channel -> connections

    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        if channel not in self.active:
            self.active[channel] = []
        self.active[channel].append(websocket)
        # Notify others in channel
        for conn in self.active[channel]:
            if conn != websocket:
                try:
                    import json as _json
                    await conn.send_text(_json.dumps({"type": "user_joined", "channel": channel, "count": len(self.active[channel])}))
                except:
                    pass

    def disconnect(self, websocket: WebSocket, channel: str):
        if channel in self.active:
            self.active[channel] = [c for c in self.active[channel] if c != websocket]

    async def broadcast(self, message: str, channel: str, exclude: WebSocket = None):
        if channel in self.active:
            for conn in self.active[channel]:
                if conn != exclude:
                    try:
                        await conn.send_text(message)
                    except:
                        pass

wt_manager = ConnectionManager()

@app.websocket("/v1/voice/signal")
async def voice_signal(websocket: WebSocket):
    channel = websocket.query_params.get("channel", "general")
    await wt_manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast signaling messages to others in channel
            await wt_manager.broadcast(data, channel, exclude=websocket)
    except WebSocketDisconnect:
        wt_manager.disconnect(websocket, channel)
        # Notify others
        remaining = len(wt_manager.active.get(channel, []))
        await wt_manager.broadcast(
            json.dumps({"type": "user_left", "channel": channel, "count": remaining}),
            channel
        )
'''

# Insert before the static serving section
static_marker = "# --- SERVE REACT FRONTEND ---"
if static_marker in content:
    if has_sms_profile and has_voice:
        print("SMS profile + voice code already present, replacing...")
        # Find and replace the section
        start_marker = "\n# --- SMS PROFILES (Identity Gate) ---"
        if start_marker in content:
            start_idx = content.index(start_marker)
            end_idx = content.index(static_marker, start_idx)
            content = content[:start_idx] + new_code + "\n" + content[end_idx:]
        else:
            content = content.replace(static_marker, new_code + "\n" + static_marker)
    elif has_sms_profile:
        # Has profile but not voice - replace profile section and add voice
        start_marker = "\n# --- SMS PROFILES (Identity Gate) ---"
        if start_marker in content:
            start_idx = content.index(start_marker)
            end_idx = content.index(static_marker, start_idx)
            content = content[:start_idx] + new_code + "\n" + content[end_idx:]
        else:
            content = content.replace(static_marker, new_code + "\n" + static_marker)
        print("Replaced SMS profile section and added voice code")
    else:
        content = content.replace(static_marker, new_code + "\n" + static_marker)
        print("Added SMS profile + voice code to API server")
else:
    print("ERROR: Could not find static serving marker")
    sftp.close()
    ssh.close()
    exit(1)

# Also need to update the SMS send endpoint to prepend display name
# Find the existing send_sms function and add display name lookup
old_send_start = '''@app.post("/v1/sms/send")
async def send_sms(req: SendSMSRequest, request: Request,
                   _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_send"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check access
    allowed, status, detail = check_sms_access(user_id)'''

new_send_start = '''@app.post("/v1/sms/send")
async def send_sms(req: SendSMSRequest, request: Request,
                   _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_send"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check access
    allowed, status, detail = check_sms_access(user_id)'''

if old_send_start in content:
    # Add display name prepend after body validation
    old_body_check = '''    body = req.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is empty")
    if len(body) > 160:
        raise HTTPException(status_code=400, detail="Message too long (160 char max)")'''
    
    new_body_check = '''    body = req.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is empty")
    if len(body) > 160:
        raise HTTPException(status_code=400, detail="Message too long (160 char max)")
    
    # Prepend display name to message
    display_name = get_display_name(user_id)
    body = f"[From: {display_name}] {body}"
    if len(body) > 160:
        body = body[:160]'''
    
    if old_body_check in content:
        content = content.replace(old_body_check, new_body_check)
        print("Updated SMS send to prepend display name")
    else:
        print("WARNING: Could not find body check in send_sms to patch display name")
else:
    print("WARNING: Could not find send_sms function to patch")

# Also update SMS_TRIAL_DAYS and SMS_PRICE_INC if they exist from previous deployment
old_trial = "SMS_TRIAL_DAYS = 547"
if old_trial in content:
    content = content.replace(old_trial, "SMS_TRIAL_DAYS = 365")
    print("Updated SMS_TRIAL_DAYS from 547 to 365")

old_price = "SMS_PRICE_INC = 8"
if old_price in content:
    content = content.replace(old_price, "SMS_PRICE_INC = 1.50")
    print("Updated SMS_PRICE_INC from 8 to 1.50")

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

# Check health
print("\nChecking server health...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
health = stdout.read().decode().strip()
print(f"Health: {health[:200]}")

# Check voice status endpoint
print("\nChecking voice status endpoint...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/voice/status -H 'X-API-Token: soulmate_wallet_2024' 2>&1", timeout=10)
voice_status = stdout.read().decode().strip()
print(f"Voice status: {voice_status[:200]}")

# Check SMS profile endpoint
print("\nChecking SMS profile endpoint...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/sms/profile -H 'X-API-Token: soulmate_wallet_2024' 2>&1", timeout=10)
profile_status = stdout.read().decode().strip()
print(f"Profile: {profile_status[:200]}")

# Check server logs
print("\nChecking server logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 15 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-500:]}")

ssh.close()
print("\nDone!")
