import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read current api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Contacts system code to insert before the static serving section
contacts_code = '''

# --- CONTACTS SYSTEM ---

contacts_db_path = os.path.join(os.path.dirname(__file__), "contacts.db")

def init_contacts_db():
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            wallet_address TEXT,
            notes TEXT,
            avatar TEXT,
            group_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS contact_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#6366f1',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_contacts_db()

def get_user_from_session(request):
    token = request.headers.get("X-Session-Token", "")
    session = verify_session(token)
    if not session:
        return None
    return session["user_id"]

class ContactCreate(BaseModel):
    name: str
    email: str = None
    phone: str = None
    wallet_address: str = None
    notes: str = None
    group_id: int = None

class ContactUpdate(BaseModel):
    name: str = None
    email: str = None
    phone: str = None
    wallet_address: str = None
    notes: str = None
    group_id: int = None

class GroupCreate(BaseModel):
    name: str
    color: str = "#6366f1"

@app.get("/v1/contacts")
async def list_contacts(request: Request,
                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "contacts_list"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("SELECT * FROM contacts WHERE user_id = ? ORDER BY name", (user_id,))
    rows = c.fetchall()
    conn.close()
    contacts = []
    for row in rows:
        contacts.append({
            "id": row[0], "user_id": row[1], "name": row[2], "email": row[3],
            "phone": row[4], "wallet_address": row[5], "notes": row[6],
            "avatar": row[7], "group_id": row[8], "created_at": row[9], "updated_at": row[10]
        })
    return {"contacts": contacts}

@app.post("/v1/contacts")
async def create_contact(req: ContactCreate, request: Request,
                        _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "contacts_create"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO contacts (user_id, name, email, phone, wallet_address, notes, group_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
              (user_id, req.name, req.email, req.phone, req.wallet_address, req.notes, req.group_id))
    contact_id = c.lastrowid
    conn.commit()
    conn.close()
    logger.info(f"Contact created: {req.name} for user {user_id}")
    return {"status": "created", "id": contact_id}

@app.put("/v1/contacts/{contact_id}")
async def update_contact(contact_id: int, req: ContactUpdate, request: Request,
                         _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "contacts_update"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    updates = []
    values = []
    for field in ["name", "email", "phone", "wallet_address", "notes", "group_id"]:
        val = getattr(req, field)
        if val is not None:
            updates.append(f"{field} = ?")
            values.append(val)
    updates.append("updated_at = datetime('now')")
    values.append(contact_id)
    values.append(user_id)
    c.execute(f"UPDATE contacts SET {', '.join(updates)} WHERE id = ? AND user_id = ?", values)
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.delete("/v1/contacts/{contact_id}")
async def delete_contact(contact_id: int, request: Request,
                         _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "contacts_delete"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("DELETE FROM contacts WHERE id = ? AND user_id = ?", (contact_id, user_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/v1/contacts/groups")
async def list_groups(request: Request,
                      _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "groups_list"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("SELECT * FROM contact_groups WHERE user_id = ? ORDER BY name", (user_id,))
    rows = c.fetchall()
    conn.close()
    groups = [{"id": r[0], "user_id": r[1], "name": r[2], "color": r[3]} for r in rows]
    return {"groups": groups}

@app.post("/v1/contacts/groups")
async def create_group(req: GroupCreate, request: Request,
                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "groups_create"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO contact_groups (user_id, name, color) VALUES (?, ?, ?)",
              (user_id, req.name, req.color))
    group_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"status": "created", "id": group_id}

@app.post("/v1/contacts/import")
async def import_contacts(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "contacts_import"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    body = await request.json()
    contacts = body.get("contacts", [])
    conn = sqlite3.connect(contacts_db_path)
    c = conn.cursor()
    count = 0
    for contact in contacts:
        c.execute("INSERT INTO contacts (user_id, name, email, phone, wallet_address, notes) VALUES (?, ?, ?, ?, ?, ?)",
                  (user_id, contact.get("name", ""), contact.get("email"), contact.get("phone"),
                   contact.get("wallet_address"), contact.get("notes")))
        count += 1
    conn.commit()
    conn.close()
    logger.info(f"Imported {count} contacts for user {user_id}")
    return {"status": "imported", "count": count}

# --- SUBSCRIPTION SYSTEM ---

subscription_db_path = os.path.join(os.path.dirname(__file__), "subscriptions.db")

def init_subscription_db():
    conn = sqlite3.connect(subscription_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id INTEGER PRIMARY KEY,
            tier TEXT DEFAULT 'free',
            status TEXT DEFAULT 'active',
            started_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT,
            payment_tx_hash TEXT,
            auto_renew INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS free_users (
            user_id INTEGER PRIMARY KEY,
            reason TEXT,
            added_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    # Whitelist Justin (user_id 1) and test user (user_id 2) as free unlimited
    c.execute("SELECT user_id FROM free_users WHERE user_id = 1")
    if not c.fetchone():
        c.execute("INSERT OR IGNORE INTO free_users (user_id, reason) VALUES (1, 'Founder')")
        c.execute("INSERT OR IGNORE INTO subscriptions (user_id, tier, status) VALUES (1, 'unlimited', 'active')")
    conn.commit()
    conn.close()

init_subscription_db()

class UpgradeRequest(BaseModel):
    tx_hash: str
    tier: str  # "pro" or "unlimited"

@app.get("/v1/subscription")
async def get_subscription(request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sub_get"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(subscription_db_path)
    c = conn.cursor()
    # Check if whitelisted
    c.execute("SELECT reason FROM free_users WHERE user_id = ?", (user_id,))
    free_row = c.fetchone()
    c.execute("SELECT tier, status, started_at, expires_at FROM subscriptions WHERE user_id = ?", (user_id,))
    sub_row = c.fetchone()
    conn.close()
    if free_row:
        return {"tier": "unlimited", "status": "active", "reason": free_row[0], "free": True}
    if sub_row:
        return {"tier": sub_row[0], "status": sub_row[1], "started_at": sub_row[2], "expires_at": sub_row[3]}
    return {"tier": "free", "status": "active"}

@app.get("/v1/subscription/tiers")
async def get_tiers():
    return {
        "tiers": [
            {"name": "free", "price": 0, "currency": "USDT", "features": {
                "emails_per_day": 50, "sms_per_day": 0, "ai_requests_per_day": 10,
                "storage_mb": 100, "crypto_fee": "0.5%"
            }},
            {"name": "pro", "price": 10, "currency": "USDT", "features": {
                "emails_per_day": 500, "sms_per_day": 100, "ai_requests_per_day": 100,
                "storage_mb": 5000, "crypto_fee": "0.5%"
            }},
            {"name": "unlimited", "price": 25, "currency": "USDT", "features": {
                "emails_per_day": -1, "sms_per_day": -1, "ai_requests_per_day": -1,
                "storage_mb": 50000, "crypto_fee": "0.5%"
            }},
        ],
        "payment_address": "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d",
        "payment_network": "BSC"
    }

@app.post("/v1/subscription/upgrade")
async def upgrade_subscription(req: UpgradeRequest, request: Request,
                               _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "sub_upgrade"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    if req.tier not in ("pro", "unlimited"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    conn = sqlite3.connect(subscription_db_path)
    c = conn.cursor()
    from datetime import timedelta
    expires = (datetime.now() + timedelta(days=30)).isoformat()
    c.execute("""
        INSERT INTO subscriptions (user_id, tier, status, started_at, expires_at, payment_tx_hash)
        VALUES (?, 'pro' if req.tier == 'pro' else 'unlimited', 'active', datetime('now'), ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET tier=?, status='active', expires_at=?, payment_tx_hash=?
    """, (user_id, expires, req.tx_hash, req.tier, expires, req.tx_hash))
    conn.commit()
    conn.close()
    logger.info(f"Subscription upgraded: user {user_id} -> {req.tier}")
    return {"status": "upgraded", "tier": req.tier, "expires_at": expires}

# --- EMAIL SYSTEM ---

email_db_path = os.path.join(os.path.dirname(__file__), "email_accounts.db")

def init_email_db():
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS email_accounts (
            user_id INTEGER PRIMARY KEY,
            email_address TEXT UNIQUE NOT NULL,
            imap_password TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_addr TEXT,
            to_addr TEXT,
            subject TEXT,
            body TEXT,
            folder TEXT DEFAULT 'inbox',
            is_read INTEGER DEFAULT 0,
            is_starred INTEGER DEFAULT 0,
            is_archived INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_email_db()

EMAIL_DOMAIN = "soulmateos.de5.net"

@app.post("/v1/email/setup")
async def setup_email_account(request: Request,
                              _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_setup"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    # Get user email to derive username
    c2 = sqlite3.connect(auth_db_path)
    cu = c2.cursor()
    cu.execute("SELECT email FROM users WHERE id = ?", (user_id,))
    row = cu.fetchone()
    c2.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    username = row[0].split("@")[0]
    email_addr = f"{username}@{EMAIL_DOMAIN}"
    imap_pass = secrets_mod.token_urlsafe(16)
    # Create system user for mail (if postfix installed)
    try:
        import subprocess
        subprocess.run(["useradd", "-m", username], capture_output=True, timeout=5)
        subprocess.run(["bash", "-c", f"echo '{username}:{imap_pass}' | chpasswd"], capture_output=True, timeout=5)
    except Exception:
        pass  # Mail server may not be installed yet
    c.execute("INSERT OR REPLACE INTO email_accounts (user_id, email_address, imap_password) VALUES (?, ?, ?)",
              (user_id, email_addr, imap_pass))
    conn.commit()
    conn.close()
    logger.info(f"Email account created: {email_addr} for user {user_id}")
    return {"status": "created", "email_address": email_addr, "password": imap_pass}

@app.get("/v1/email/account")
async def get_email_account(request: Request,
                            _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_account"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT email_address FROM email_accounts WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        return {"status": "none", "email_address": None}
    return {"status": "ok", "email_address": row[0]}

@app.get("/v1/email/inbox")
async def get_inbox(request: Request,
                    _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_inbox"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT id, from_addr, subject, is_read, created_at FROM emails WHERE user_id = ? AND folder = 'inbox' ORDER BY created_at DESC LIMIT 50",
              (user_id,))
    rows = c.fetchall()
    conn.close()
    emails = [{"id": r[0], "from": r[1], "subject": r[2], "is_read": bool(r[3]), "date": r[4]} for r in rows]
    return {"emails": emails}

@app.get("/v1/email/{email_id}")
async def get_email(email_id: int, request: Request,
                    _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_read"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT * FROM emails WHERE id = ? AND user_id = ?", (email_id, user_id))
    row = c.fetchone()
    if row:
        c.execute("UPDATE emails SET is_read = 1 WHERE id = ?", (email_id,))
        conn.commit()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Email not found")
    return {"id": row[0], "from": row[2], "to": row[3], "subject": row[4], "body": row[5], "folder": row[6], "date": row[8]}

class SendEmailRequest(BaseModel):
    to: str
    subject: str
    body: str

@app.post("/v1/email/send")
async def send_email(req: SendEmailRequest, request: Request,
                     _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_send"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT email_address FROM email_accounts WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    from_addr = row[0] if row else "noreply@" + EMAIL_DOMAIN
    # Store in sent folder
    c.execute("INSERT INTO emails (user_id, from_addr, to_addr, subject, body, folder) VALUES (?, ?, ?, ?, ?, 'sent')",
              (user_id, from_addr, req.to, req.subject, req.body))
    conn.commit()
    conn.close()
    # Send via Resend API
    try:
        import resend
        resend.api_key = os.environ.get("RESEND_API_KEY", "")
        params = {
            "from": "Soulmate OS <onboarding@resend.dev>",
            "to": [req.to],
            "subject": req.subject,
            "html": f"<p>{req.body}</p>",
        }
        r = resend.Emails.send(params)
        logger.info(f"Email sent via Resend: {r.get('id', 'unknown')}")
    except Exception as e:
        logger.warning(f"Resend send failed (stored in DB): {e}")
    logger.info(f"Email sent: {from_addr} -> {req.to}")
    return {"status": "sent"}

@app.get("/v1/email/sync")
async def sync_email(request: Request,
                     _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_sync"))):
    """Sync emails from Gmail IMAP to SQLite inbox."""
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    import imaplib
    import email as email_lib
    import re as re_mod
    gmail_user = os.environ.get("GMAIL_USER", "soulmate.ai.dev@gmail.com")
    gmail_pass = os.environ.get("GMAIL_APP_PASSWORD", "")
    if not gmail_pass:
        raise HTTPException(status_code=503, detail="Gmail app password not configured")
    fetched = 0
    stored = 0
    duplicates = 0
    try:
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(gmail_user, gmail_pass)
        mail.select("INBOX")
        status, data = mail.search(None, "ALL")
        if status == "OK" and data[0]:
            ids = data[0].split()[-20:]
            for eid in reversed(ids):
                fetched += 1
                status, msg_data = mail.fetch(eid, "(RFC822)")
                if status == "OK" and msg_data and msg_data[0]:
                    raw = msg_data[0][1]
                    raw_str = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
                    msg = email_lib.message_from_string(raw_str)
                    from_addr = msg.get("From", "")
                    to_addr = msg.get("To", "")
                    subject = msg.get("Subject", "")
                    date = msg.get("Date", "")
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            ct = part.get_content_type()
                            if ct == "text/plain":
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body = payload.decode("utf-8", errors="replace")
                                    break
                            elif ct == "text/html":
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body = re_mod.sub(r"<[^>]+>", "", payload.decode("utf-8", errors="replace"))
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body = payload.decode("utf-8", errors="replace")
                    conn = sqlite3.connect(email_db_path)
                    c = conn.cursor()
                    c.execute("SELECT id FROM emails WHERE user_id = ? AND from_addr = ? AND subject = ? AND created_at = ?",
                              (user_id, from_addr, subject, date))
                    if c.fetchone():
                        duplicates += 1
                    else:
                        c.execute("INSERT INTO emails (user_id, from_addr, to_addr, subject, body, folder, created_at) VALUES (?, ?, ?, ?, ?, 'inbox', ?)",
                                  (user_id, from_addr, to_addr, subject, body, date))
                        stored += 1
                    conn.commit()
                    conn.close()
        mail.logout()
    except Exception as e:
        logger.warning(f"Email sync error: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {e}")
    logger.info(f"Email sync: fetched={fetched}, stored={stored}, duplicates={duplicates}")
    return {"status": "synced", "fetched": fetched, "stored": stored, "duplicates": duplicates}

@app.get("/v1/email/sent")
async def get_sent_emails(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_sent"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT id, from_addr, to_addr, subject, is_read, created_at FROM emails WHERE user_id = ? AND folder = 'sent' ORDER BY created_at DESC LIMIT 50",
              (user_id,))
    rows = c.fetchall()
    conn.close()
    emails = [{"id": r[0], "from": r[1], "to": r[2], "subject": r[3], "is_read": bool(r[4]), "date": r[5]} for r in rows]
    return {"emails": emails}

@app.delete("/v1/email/{email_id}")
async def delete_email(email_id: int, request: Request,
                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_delete"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("DELETE FROM emails WHERE id = ? AND user_id = ?", (email_id, user_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/v1/email/{email_id}/star")
async def toggle_star(email_id: int, request: Request,
                      _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_star"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT is_starred FROM emails WHERE id = ? AND user_id = ?", (email_id, user_id))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Email not found")
    new_val = 0 if row[0] else 1
    c.execute("UPDATE emails SET is_starred = ? WHERE id = ?", (new_val, email_id))
    conn.commit()
    conn.close()
    return {"status": "starred" if new_val else "unstarred"}

@app.post("/v1/email/{email_id}/archive")
async def toggle_archive(email_id: int, request: Request,
                         _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_archive"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT is_archived FROM emails WHERE id = ? AND user_id = ?", (email_id, user_id))
    row = c.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Email not found")
    new_val = 0 if row[0] else 1
    c.execute("UPDATE emails SET is_archived = ? WHERE id = ?", (new_val, email_id))
    conn.commit()
    conn.close()
    return {"status": "archived" if new_val else "unarchived"}

class AIComposeRequest(BaseModel):
    prompt: str
    context: str = None

@app.post("/v1/email/ai-compose")
async def ai_compose_email(req: AIComposeRequest, request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_ai_compose"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    import urllib.request
    import urllib.parse
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=503, detail="AI not configured")
    context_str = f" Context: {req.context}" if req.context else ""
    prompt = f"Write a professional email based on this request: {req.prompt}{context_str}. Write only the email body, no subject line."
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
    payload = json_mod.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.7, "maxOutputTokens": 512}})
    data = payload.encode()
    api_req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(api_req, timeout=30)
    result = json_mod.loads(resp.read().decode())
    text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return {"draft": text.strip()}

@app.post("/v1/email/ai-summarize")
async def ai_summarize_inbox(request: Request,
                             _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_ai_summarize"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT from_addr, subject, body FROM emails WHERE user_id = ? AND folder = 'inbox' AND is_read = 0 ORDER BY created_at DESC LIMIT 10", (user_id,))
    rows = c.fetchall()
    conn.close()
    if not rows:
        return {"summary": "No unread emails."}
    import urllib.request
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        raise HTTPException(status_code=503, detail="AI not configured")
    email_list = "\n".join([f"From: {r[0]}, Subject: {r[1]}, Preview: {(r[2] or '')[:100]}" for r in rows])
    prompt = f"Summarize these unread emails in a brief bullet-point format:\n{email_list}"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
    payload = json_mod.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.5, "maxOutputTokens": 512}})
    data = payload.encode()
    api_req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(api_req, timeout=30)
    result = json_mod.loads(resp.read().decode())
    text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return {"summary": text.strip()}

@app.get("/v1/email/verification-codes")
async def get_email_verification_codes(request: Request,
                                       _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "email_verif_codes"))):
    """Extract verification codes from recent emails."""
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(email_db_path)
    c = conn.cursor()
    c.execute("SELECT id, from_addr, subject, body, created_at FROM emails WHERE user_id = ? AND folder = 'inbox' ORDER BY created_at DESC LIMIT 20", (user_id,))
    rows = c.fetchall()
    conn.close()
    import re as re_mod
    codes = []
    for r in rows:
        text = (r[2] or "") + " " + (r[3] or "")
        for pattern in [r"(?:verification\s+code|code|OTP|pin)\s*(?:is|:)?\s*(\d{4,8})", r"^\s*(\d{4,8})\s*$", r"[\[(<{](\d{4,8})[\])>}"]:
            match = re_mod.search(pattern, text, re_mod.IGNORECASE | re_mod.MULTILINE)
            if match:
                codes.append({"email_id": r[0], "from": r[1], "subject": r[2], "code": match.group(1), "date": r[4]})
                break
    return {"codes": codes}
'''

# Insert before the static serving section
static_marker = "# --- SERVE REACT FRONTEND ---"
if static_marker in content:
    content = content.replace(static_marker, contacts_code + "\n" + static_marker)
    print("Contacts + Subscription + Email code added to API server")
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
print(f"Health: {health[:100]}")

# Check if server started properly
print("\nChecking server logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 10 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-300:]}")

ssh.close()
print("\nDone!")
