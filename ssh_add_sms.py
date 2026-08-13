import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read current api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# SMS system code to insert before the static serving section
sms_code = '''

# --- SMS / TEXTING SYSTEM ---

sms_db_path = os.path.join(os.path.dirname(__file__), "sms.db")

# Carrier gateways for email-to-SMS (free)
CARRIER_GATEWAYS = {
    "att": "txt.att.net",
    "verizon": "vtext.com",
    "t-mobile": "tmomail.net",
    "sprint": "messaging.sprintpcs.com",
    "boost": "sms.myboostmobile.com",
    "cricket": "sms.cricketwireless.net",
    "metro": "mymetropcs.com",
    "us-cellular": "email.uscc.net",
    "google-fi": "msg.fi.google.com",
    "virgin": "vmobl.com",
    "xfinity": "vtext.com",
    "ting": "message.ting.com",
    "consumer": "mailmymobile.net",
    "rogers": "pcs.rogers.com",
    "bell": "txt.bell.ca",
    "telus": "msg.telus.com",
    "fido": "fido.ca",
    "koodo": "msg.koodomobile.com",
    "virgin-ca": "vmobile.ca",
}

def init_sms_db():
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS sms_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_number TEXT,
            to_number TEXT NOT NULL,
            body TEXT NOT NULL,
            direction TEXT DEFAULT 'out',
            carrier TEXT,
            status TEXT DEFAULT 'sent',
            telegram_chat_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS sms_settings (
            user_id INTEGER PRIMARY KEY,
            telegram_chat_id TEXT,
            telegram_username TEXT,
            preferred_method TEXT DEFAULT 'email',
            trial_started_at TEXT DEFAULT (datetime('now')),
            subscription_status TEXT DEFAULT 'trial',
            subscription_expires_at TEXT,
            inc_paid_tx_hash TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS sms_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            phone_number TEXT NOT NULL,
            contact_name TEXT,
            last_message TEXT,
            last_message_at TEXT DEFAULT (datetime('now')),
            unread INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_sms_db()

# SMS subscription: $8/month in INC, 1-year free trial
SMS_PRICE_INC = 8  # INC tokens per month
SMS_TRIAL_DAYS = 365

def check_sms_access(user_id):
    """Check if user has SMS access (trial or paid). Returns (allowed, status, detail)."""
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT trial_started_at, subscription_status, subscription_expires_at FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    
    if not row:
        # New user - start trial
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("INSERT OR IGNORE INTO sms_settings (user_id, subscription_status) VALUES (?, 'trial')", (user_id,))
        conn.commit()
        conn.close()
        return (True, "trial", f"Free trial active ({SMS_TRIAL_DAYS} days)")
    
    trial_started, sub_status, expires_at = row
    
    if sub_status == "paid" and expires_at:
        # Check if paid subscription expired
        try:
            exp = datetime.fromisoformat(expires_at)
            if datetime.now() > exp:
                return (False, "expired", "SMS subscription expired. Pay 8 INC/month to renew.")
        except:
            pass
        return (True, "paid", f"Active until {expires_at[:10]}")
    
    if sub_status == "trial":
        # Check trial expiry
        try:
            trial_start = datetime.fromisoformat(trial_started) if trial_started else datetime.now()
            days_left = SMS_TRIAL_DAYS - (datetime.now() - trial_start).days
            if days_left > 0:
                return (True, "trial", f"Free trial: {days_left} days left")
            else:
                return (False, "expired", "Free trial ended. Pay 8 INC/month for SMS.")
        except:
            return (True, "trial", "Free trial active")
    
    return (False, "none", "No SMS access")

class SendSMSRequest(BaseModel):
    to_number: str
    body: str
    carrier: str = ""
    method: str = "email"  # "email" or "telegram"

@app.post("/v1/sms/send")
async def send_sms(req: SendSMSRequest, request: Request,
                   _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_send"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check access
    allowed, status, detail = check_sms_access(user_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=detail)
    
    # Validate phone number (strip non-digits)
    to_number = ''.join(filter(str.isdigit, req.to_number))
    if len(to_number) < 10:
        raise HTTPException(status_code=400, detail="Invalid phone number (need at least 10 digits)")
    
    if len(to_number) == 10:
        to_number = "1" + to_number  # Assume US
    
    body = req.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is empty")
    if len(body) > 160:
        raise HTTPException(status_code=400, detail="Message too long (160 char max)")
    
    method = req.method
    
    if method == "email":
        # Email-to-SMS gateway (free)
        carrier = req.carrier.lower().strip()
        if carrier not in CARRIER_GATEWAYS:
            raise HTTPException(status_code=400, detail=f"Unknown carrier. Supported: {', '.join(CARRIER_GATEWAYS.keys())}")
        
        gateway = CARRIER_GATEWAYS[carrier]
        sms_email = f"{to_number}@{gateway}"
        
        # Get user's email address for from
        conn = sqlite3.connect(email_db_path)
        c = conn.cursor()
        c.execute("SELECT email_address FROM email_accounts WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
        from_addr = row[0] if row else "noreply@soulmate.os"
        
        # Send via sendmail
        try:
            import subprocess
            proc = subprocess.run(
                ["sendmail", "-t"],
                input=f"From: {from_addr}\\nTo: {sms_email}\\nSubject: \\n\\n{body}",
                capture_output=True, text=True, timeout=10
            )
            if proc.returncode != 0:
                logger.warning(f"sendmail returned {proc.returncode}: {proc.stderr}")
        except Exception as e:
            logger.error(f"SMS sendmail failed: {e}")
            # Still store the message
        
        # Store in DB
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("INSERT INTO sms_messages (user_id, to_number, body, direction, carrier, status) VALUES (?, ?, ?, 'out', ?, 'sent')",
                  (user_id, to_number, body, carrier))
        # Update conversation
        c.execute("""INSERT INTO sms_conversations (user_id, phone_number, last_message, last_message_at)
                     VALUES (?, ?, ?, datetime('now'))
                     ON CONFLICT(user_id, phone_number) DO UPDATE SET last_message=?, last_message_at=datetime('now')""",
                  (user_id, to_number, body, body))
        conn.commit()
        conn.close()
        
        logger.info(f"SMS sent via email gateway: {to_number}@{gateway}")
        return {"status": "sent", "method": "email", "gateway": f"{to_number}@{gateway}"}
    
    elif method == "telegram":
        # Telegram Bot API (free)
        telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        if not telegram_token:
            raise HTTPException(status_code=503, detail="Telegram bot not configured")
        
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("SELECT telegram_chat_id FROM sms_settings WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        chat_id = row[0] if row else None
        conn.close()
        
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat ID. Send a message to the bot first.")
        
        import urllib.request
        import urllib.parse
        url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": chat_id,
            "text": f"SMS to {to_number}:\\n{body}"
        }).encode()
        try:
            req2 = urllib.request.Request(url, data=data)
            resp = urllib.request.urlopen(req2, timeout=10)
            result = json.loads(resp.read())
            if not result.get("ok"):
                raise HTTPException(status_code=500, detail="Telegram API error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")
        
        # Store in DB
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("INSERT INTO sms_messages (user_id, to_number, body, direction, status, telegram_chat_id) VALUES (?, ?, ?, 'out', 'sent', ?)",
                  (user_id, to_number, body, chat_id))
        c.execute("""INSERT INTO sms_conversations (user_id, phone_number, last_message, last_message_at)
                     VALUES (?, ?, ?, datetime('now'))
                     ON CONFLICT(user_id, phone_number) DO UPDATE SET last_message=?, last_message_at=datetime('now')""",
                  (user_id, to_number, body, body))
        conn.commit()
        conn.close()
        
        return {"status": "sent", "method": "telegram"}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid method. Use 'email' or 'telegram'.")

@app.get("/v1/sms/conversations")
async def get_sms_conversations(request: Request,
                                _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_convos"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT id, phone_number, contact_name, last_message, last_message_at, unread FROM sms_conversations WHERE user_id = ? ORDER BY last_message_at DESC LIMIT 50",
              (user_id,))
    rows = c.fetchall()
    conn.close()
    return {"conversations": [{"id": r[0], "phone": r[1], "name": r[2], "last_message": r[3], "last_at": r[4], "unread": r[5]} for r in rows]}

@app.get("/v1/sms/messages/{phone}")
async def get_sms_messages(phone: str, request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_msgs"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    phone = ''.join(filter(str.isdigit, phone))
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT id, from_number, to_number, body, direction, status, created_at FROM sms_messages WHERE user_id = ? AND (to_number LIKE ? OR from_number LIKE ?) ORDER BY created_at ASC LIMIT 100",
              (user_id, f"%{phone}%", f"%{phone}%"))
    rows = c.fetchall()
    conn.close()
    return {"messages": [{"id": r[0], "from": r[1], "to": r[2], "body": r[3], "direction": r[4], "status": r[5], "date": r[6]} for r in rows]}

@app.get("/v1/sms/status")
async def get_sms_status(request: Request,
                         _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_status"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    allowed, status, detail = check_sms_access(user_id)
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT telegram_chat_id, telegram_username, preferred_method FROM sms_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return {
        "allowed": allowed,
        "status": status,
        "detail": detail,
        "trial_days": SMS_TRIAL_DAYS,
        "price_inc": SMS_PRICE_INC,
        "telegram_connected": bool(row and row[0]),
        "telegram_username": row[1] if row else None,
        "preferred_method": row[2] if row else "email",
        "carriers": list(CARRIER_GATEWAYS.keys()),
    }

class SMSSubscribeRequest(BaseModel):
    tx_hash: str

@app.post("/v1/sms/subscribe")
async def sms_subscribe(req: SMSSubscribeRequest, request: Request,
                        _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_sub"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    expires = (datetime.now() + timedelta(days=30)).isoformat()
    c.execute("""INSERT INTO sms_settings (user_id, subscription_status, subscription_expires_at, inc_paid_tx_hash, preferred_method)
                 VALUES (?, 'paid', ?, ?, 'email')
                 ON CONFLICT(user_id) DO UPDATE SET subscription_status='paid', subscription_expires_at=?, inc_paid_tx_hash=?""",
              (user_id, expires, req.tx_hash, expires, req.tx_hash))
    conn.commit()
    conn.close()
    logger.info(f"SMS subscription: user {user_id} paid, expires {expires}")
    return {"status": "subscribed", "expires_at": expires, "price_inc": SMS_PRICE_INC}

@app.post("/v1/sms/telegram/connect")
async def connect_telegram(request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_tg"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    # Returns bot username for user to message
    bot_username = os.environ.get("TELEGRAM_BOT_USERNAME", "SoulmateOSBot")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO sms_settings (user_id, preferred_method) VALUES (?, 'telegram')", (user_id,))
    conn.commit()
    conn.close()
    return {"bot_username": bot_username, "instructions": f"Send any message to @{bot_username} on Telegram to connect your account."}

@app.post("/v1/sms/telegram/webhook")
async def telegram_webhook(request: Request):
    """Webhook for Telegram bot updates."""
    try:
        body = await request.json()
        if "message" not in body:
            return {"ok": True}
        msg = body["message"]
        chat_id = str(msg["chat"]["id"])
        text = msg.get("text", "")
        username = msg.get("from", {}).get("username", "")
        
        # Store incoming message
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        # Find user by telegram username or create a pending connection
        c.execute("SELECT user_id FROM sms_settings WHERE telegram_username = ?", (username,))
        row = c.fetchone()
        if row:
            user_id = row[0]
            c.execute("UPDATE sms_settings SET telegram_chat_id = ? WHERE user_id = ?", (chat_id, user_id))
            c.execute("INSERT INTO sms_messages (user_id, from_number, to_number, body, direction, status, telegram_chat_id) VALUES (?, ?, ?, ?, 'in', 'received', ?)",
                      (user_id, chat_id, "telegram", text, chat_id))
        else:
            # New user - store chat_id for later linking
            c.execute("INSERT OR REPLACE INTO sms_settings (user_id, telegram_chat_id, telegram_username, preferred_method) VALUES (0, ?, ?, 'telegram')",
                      (chat_id, username))
        conn.commit()
        conn.close()
        
        # Reply via Telegram API
        telegram_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        if telegram_token:
            import urllib.request
            import urllib.parse
            reply_url = f"https://api.telegram.org/bot{telegram_token}/sendMessage"
            reply_text = "Connected to Soulmate OS! You can now send and receive messages here."
            data = urllib.parse.urlencode({"chat_id": chat_id, "text": reply_text}).encode()
            try:
                req2 = urllib.request.Request(reply_url, data=data)
                urllib.request.urlopen(req2, timeout=10)
            except:
                pass
        
        return {"ok": True}
    except Exception as e:
        logger.error(f"Telegram webhook error: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/v1/sms/carriers")
async def get_carriers():
    """Return list of supported carriers and their gateway domains."""
    return {"carriers": CARRIER_GATEWAYS}

# --- SMS VERIFICATION SYSTEM ---

import re as re_mod

def extract_code_from_text(text):
    """Extract verification code (4-8 digits) from text."""
    if not text:
        return None
    patterns = [
        r"(?:verification\s+code|code|OTP|pin|password)\s*(?:is|:)?\s*(\d{4,8})",
        r"(?:your\s+code|enter\s+(?:this\s+)?code)\s*(?:is|:)?\s*(\d{4,8})",
        r"(\d{4,8})\s*(?:is\s+your|verification|confirm)",
        r"^\s*(\d{4,8})\s*$",
        r"[\[(<{](\d{4,8})[\])>}",
        r"(\d{3})[-\s](\d{3})",
    ]
    for pattern in patterns:
        match = re_mod.search(pattern, text, re_mod.IGNORECASE | re_mod.MULTILINE)
        if match:
            if match.lastindex == 2:
                return match.group(1) + match.group(2)
            return match.group(1)
    return None

def init_verification_db():
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 0,
            code TEXT NOT NULL,
            source TEXT DEFAULT 'manual',
            sender TEXT,
            raw_message TEXT,
            service_hint TEXT,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS pending_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 0,
            service_name TEXT,
            email_used TEXT,
            phone_used TEXT,
            status TEXT DEFAULT 'waiting',
            code_received TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            completed_at TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS textbee_config (
            id INTEGER PRIMARY KEY DEFAULT 1,
            gateway_connected INTEGER DEFAULT 0,
            gateway_phone TEXT,
            gateway_last_seen TEXT,
            webhook_secret TEXT,
            UNIQUE(id)
        )
    """)
    conn.commit()
    conn.close()

init_verification_db()

@app.get("/v1/sms/verification-codes")
async def get_verification_codes(request: Request,
                                  _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_verif_codes"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT id, code, source, sender, service_hint, used, created_at FROM verification_codes WHERE user_id = ? OR user_id = 0 ORDER BY created_at DESC LIMIT 20", (user_id,))
    rows = c.fetchall()
    conn.close()
    codes = [{"id": r[0], "code": r[1], "source": r[2], "sender": r[3], "service": r[4], "used": bool(r[5]), "created_at": r[6]} for r in rows]
    return {"codes": codes}

class RelayCodeRequest(BaseModel):
    code: str
    service_hint: str = None
    sender: str = None

@app.post("/v1/sms/relay-code")
async def relay_verification_code(req: RelayCodeRequest, request: Request,
                                   _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_relay"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    code = req.code.strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO verification_codes (user_id, code, source, sender, service_hint) VALUES (?, ?, 'manual', ?, ?)",
              (user_id, code, req.sender, req.service_hint))
    conn.commit()
    conn.close()
    logger.info(f"Verification code relayed by user {user_id}: {code}")
    return {"status": "stored", "code": code}

@app.get("/v1/sms/pending-verifications")
async def get_pending_verifications(request: Request,
                                     _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_pending"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT id, service_name, email_used, phone_used, status, code_received, created_at FROM pending_verifications WHERE user_id = ? AND status = 'waiting' ORDER BY created_at DESC", (user_id,))
    rows = c.fetchall()
    conn.close()
    pending = [{"id": r[0], "service": r[1], "email": r[2], "phone": r[3], "status": r[4], "code": r[5], "created_at": r[6]} for r in rows]
    return {"pending": pending}

class PendingVerificationRequest(BaseModel):
    service_name: str
    email_used: str = None
    phone_used: str = None

@app.post("/v1/sms/pending-verifications")
async def create_pending_verification(req: PendingVerificationRequest, request: Request,
                                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sms_pending_create"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO pending_verifications (user_id, service_name, email_used, phone_used) VALUES (?, ?, ?, ?)",
              (user_id, req.service_name, req.email_used, req.phone_used))
    conn.commit()
    conn.close()
    return {"status": "created", "service": req.service_name}

# --- TEXTBEE WEBHOOK (for Android SMS gateway) ---

@app.post("/v1/sms/textbee/webhook")
async def textbee_webhook(request: Request):
    """Webhook for TextBee incoming SMS from Android gateway."""
    try:
        body = await request.json()
        # TextBee sends: {"from": "+1234567890", "to": "+1987654321", "body": "message text", "timestamp": ...}
        from_number = body.get("from", body.get("sender", ""))
        to_number = body.get("to", body.get("recipient", ""))
        text = body.get("body", body.get("message", body.get("text", "")))
        
        if not text:
            return {"ok": True}
        
        # Store in sms_messages
        conn = sqlite3.connect(sms_db_path)
        c = conn.cursor()
        c.execute("INSERT INTO sms_messages (user_id, from_number, to_number, body, direction, status) VALUES (0, ?, ?, ?, 'in', 'received')",
                  (from_number, to_number, text))
        
        # Check for verification code
        code = extract_code_from_text(text)
        if code:
            c.execute("INSERT INTO verification_codes (user_id, code, source, sender, raw_message) VALUES (0, ?, 'textbee', ?, ?)",
                      (code, from_number, text))
            logger.info(f"TextBee verification code stored: {code} from {from_number}")
        
        # Update gateway last seen
        c.execute("INSERT OR REPLACE INTO textbee_config (id, gateway_connected, gateway_phone, gateway_last_seen) VALUES (1, 1, ?, datetime('now'))",
                  (to_number,))
        
        conn.commit()
        conn.close()
        
        return {"ok": True, "code_extracted": code}
    except Exception as e:
        logger.error(f"TextBee webhook error: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/v1/sms/textbee/status")
async def textbee_status(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "textbee_status"))):
    """Check TextBee gateway connection status."""
    conn = sqlite3.connect(sms_db_path)
    c = conn.cursor()
    c.execute("SELECT gateway_connected, gateway_phone, gateway_last_seen FROM textbee_config WHERE id = 1")
    row = c.fetchone()
    conn.close()
    if not row:
        return {"connected": False, "phone": None, "last_seen": None}
    return {"connected": bool(row[0]), "phone": row[1], "last_seen": row[2]}
'''

# Insert before the static serving section
static_marker = "# --- SERVE REACT FRONTEND ---"
if static_marker in content:
    # Check if SMS code already added
    if "SMS / TEXTING SYSTEM" in content:
        # Replace existing SMS section
        import re
        # Find and replace the SMS section
        start_marker = "\n# --- SMS / TEXTING SYSTEM ---"
        if start_marker in content:
            start_idx = content.index(start_marker)
            end_idx = content.index(static_marker, start_idx)
            content = content[:start_idx] + sms_code + "\n" + content[end_idx:]
            print("SMS code replaced in API server")
        else:
            content = content.replace(static_marker, sms_code + "\n" + static_marker)
            print("SMS code added to API server")
    else:
        content = content.replace(static_marker, sms_code + "\n" + static_marker)
        print("SMS code added to API server")
else:
    print("ERROR: Could not find static serving marker")

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

# Check if SMS endpoints are available
print("\nChecking SMS carriers endpoint...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/sms/carriers 2>&1", timeout=10)
carriers = stdout.read().decode().strip()
print(f"Carriers: {carriers[:200]}")

# Check server logs
print("\nChecking server logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 15 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-500:]}")

ssh.close()
print("\nDone!")
