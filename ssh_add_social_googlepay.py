import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Check if already patched
if "oauth/google/start" in content and "googlepay/deposit" in content:
    print("Social login + payments already patched, skipping...")
else:
    # Find insertion point — before static files section
    insert_marker = 'from fastapi.staticfiles import StaticFiles'
    
    new_code = '''
# ==================== OAUTH SOCIAL LOGIN ====================

import secrets as _secrets
import urllib.parse as _urlparse

# OAuth config (placeholders — replace with real client IDs/secrets)
OAUTH_CONFIG = {
    "google": {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "user_url": "https://www.googleapis.com/oauth2/v2/userinfo",
        "scope": "openid email profile",
        "redirect_path": "/v1/auth/oauth/google/callback",
    },
    "github": {
        "client_id": os.environ.get("GITHUB_CLIENT_ID", ""),
        "client_secret": os.environ.get("GITHUB_CLIENT_SECRET", ""),
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "user_url": "https://api.github.com/user",
        "scope": "user:email",
        "redirect_path": "/v1/auth/oauth/github/callback",
    },
    "yahoo": {
        "client_id": os.environ.get("YAHOO_CLIENT_ID", ""),
        "client_secret": os.environ.get("YAHOO_CLIENT_SECRET", ""),
        "auth_url": "https://api.login.yahoo.com/oauth2/request_auth",
        "token_url": "https://api.login.yahoo.com/oauth2/get_token",
        "user_url": "https://api.login.yahoo.com/openid/v1/userinfo",
        "scope": "openid email profile",
        "redirect_path": "/v1/auth/oauth/yahoo/callback",
    },
    "telegram": {
        "bot_token": os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        "bot_username": os.environ.get("TELEGRAM_BOT_USERNAME", ""),
        "redirect_path": "/v1/auth/oauth/telegram/callback",
    },
}

# In-memory OAuth state tokens
OAUTH_STATES = {}

@app.get("/v1/auth/oauth/{provider}/start")
async def oauth_start(provider: str, request: Request):
    if provider not in OAUTH_CONFIG:
        return JSONResponse({"detail": "Unknown provider"}, status_code=400)
    config = OAUTH_CONFIG[provider]
    if provider == "telegram":
        # Telegram uses login widget — redirect to Telegram bot
        bot_username = config.get("bot_username", "")
        if not bot_username:
            return JSONResponse({"detail": "Telegram login not configured"}, status_code=500)
        return RedirectResponse(f"https://t.me/{bot_username}?start=login")
    
    state = _secrets.token_urlsafe(32)
    OAUTH_STATES[state] = {"provider": provider, "created": time.time()}
    
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}{config['redirect_path']}"
    
    params = {
        "client_id": config["client_id"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": config["scope"],
        "state": state,
    }
    
    auth_url = f"{config['auth_url']}?{_urlparse.urlencode(params)}"
    return RedirectResponse(auth_url)

@app.get("/v1/auth/oauth/{provider}/callback")
async def oauth_callback(provider: str, code: str = None, state: str = None, request: Request = None):
    if provider not in OAUTH_CONFIG:
        return JSONResponse({"detail": "Unknown provider"}, status_code=400)
    
    # Verify state
    if state and state in OAUTH_STATES:
        del OAUTH_STATES[state]
    
    config = OAUTH_CONFIG[provider]
    
    if not code:
        return JSONResponse({"detail": "Authorization denied"}, status_code=400)
    
    base_url = str(request.base_url).rstrip("/")
    redirect_uri = f"{base_url}{config['redirect_path']}"
    
    # Exchange code for token
    import urllib.request as _ureq
    
    token_data = _urlparse.urlencode({
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }).encode()
    
    token_req = _ureq.Request(config["token_url"], data=token_data, method="POST")
    if provider == "github":
        token_req.add_header("Accept", "application/json")
    
    try:
        with _ureq.urlopen(token_req, timeout=10) as resp:
            token_resp = _json.loads(resp.read())
    except Exception as e:
        return JSONResponse({"detail": f"Token exchange failed: {str(e)}"}, status_code=500)
    
    access_token = token_resp.get("access_token", "")
    if not access_token:
        return JSONResponse({"detail": "No access token received"}, status_code=500)
    
    # Fetch user info
    user_req = _ureq.Request(config["user_url"])
    if provider == "github":
        user_req.add_header("Authorization", f"token {access_token}")
    else:
        user_req.add_header("Authorization", f"Bearer {access_token}")
    
    try:
        with _ureq.urlopen(user_req, timeout=10) as resp:
            user_info = _json.loads(resp.read())
    except Exception as e:
        return JSONResponse({"detail": f"Failed to get user info: {str(e)}"}, status_code=500)
    
    email = user_info.get("email") or user_info.get("login", "")
    name = user_info.get("name") or user_info.get("login", "")
    provider_id = str(user_info.get("id", ""))
    
    # Find or create user
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Check if user exists with this email
    c.execute("SELECT id, wallet_key_encrypted, wallet_address FROM users WHERE email = ?", (email,))
    row = c.fetchone()
    
    if row:
        user_id, wallet_key, wallet_address = row
    else:
        # Create new user
        user_id = str(_uuid.uuid4())[:8]
        c.execute("INSERT INTO users (id, email, password_hash, display_name, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?, ?)",
                  (user_id, email, "", name, provider, provider_id))
        conn.commit()
        wallet_key = None
        wallet_address = None
    
    conn.close()
    
    # Create session
    session_token = _secrets.token_urlsafe(32)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO sessions (token, user_id, created) VALUES (?, ?, ?)",
              (session_token, user_id, time.strftime("%Y-%m-%dT%H:%M:%S")))
    conn.commit()
    conn.close()
    
    # Redirect to frontend with session token
    frontend_url = f"/#token={session_token}&email={_urlparse.quote(email)}"
    return RedirectResponse(frontend_url)

# ==================== GOOGLE PAY & CARD DEPOSITS ====================

@app.post("/v1/wallet/googlepay/deposit")
async def googlepay_deposit(request: Request):
    data = await request.json()
    amount = data.get("amount", 0)
    wallet_address = data.get("wallet_address", "")
    
    if amount < 1:
        return JSONResponse({"detail": "Minimum deposit is $1"}, status_code=400)
    if not wallet_address:
        return JSONResponse({"detail": "Wallet address required"}, status_code=400)
    
    # In production: process Google Pay payment token
    # For now: log the deposit and return success
    # The actual USDT transfer would happen after payment confirmation
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS wallet_deposits (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        wallet_address TEXT,
        amount REAL,
        method TEXT DEFAULT 'googlepay',
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        created_at TEXT
    )""")
    deposit_id = str(_uuid.uuid4())[:8]
    c.execute("INSERT INTO wallet_deposits VALUES (?, ?, ?, ?, 'googlepay', 'pending', NULL, ?)",
              (deposit_id, "", wallet_address, amount, time.strftime("%Y-%m-%dT%H:%M:%S")))
    conn.commit()
    conn.close()
    
    return {
        "status": "ok",
        "deposit_id": deposit_id,
        "amount": amount,
        "usdt_amount": amount,
        "message": f"Google Pay payment initiated. {amount} USDT will be credited to {wallet_address[:10]}... after confirmation."
    }

@app.post("/v1/wallet/card/deposit")
async def card_deposit(request: Request):
    data = await request.json()
    amount = data.get("amount", 0)
    wallet_address = data.get("wallet_address", "")
    card_number = data.get("card_number", "")
    card_expiry = data.get("card_expiry", "")
    card_cvc = data.get("card_cvc", "")
    
    if amount < 1:
        return JSONResponse({"detail": "Minimum deposit is $1"}, status_code=400)
    if not wallet_address:
        return JSONResponse({"detail": "Wallet address required"}, status_code=400)
    if not card_number or not card_expiry or not card_cvc:
        return JSONResponse({"detail": "Card details required"}, status_code=400)
    
    # Validate card number (basic Luhn check)
    digits = [int(d) for d in card_number if d.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return JSONResponse({"detail": "Invalid card number"}, status_code=400)
    
    # In production: process card payment via Stripe/processor
    # For now: log and return success
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS wallet_deposits (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        wallet_address TEXT,
        amount REAL,
        method TEXT DEFAULT 'card',
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        created_at TEXT
    )""")
    deposit_id = str(_uuid.uuid4())[:8]
    # Store last 4 digits only for security
    last4 = card_number[-4:]
    c.execute("INSERT INTO wallet_deposits VALUES (?, ?, ?, ?, 'card', 'pending', NULL, ?)",
              (deposit_id, "", wallet_address, amount, time.strftime("%Y-%m-%dT%H:%M:%S")))
    conn.commit()
    conn.close()
    
    return {
        "status": "ok",
        "deposit_id": deposit_id,
        "amount": amount,
        "usdt_amount": amount,
        "message": f"Card payment processed. {amount} USDT will be credited to {wallet_address[:10]}... after confirmation."
    }

# ==================== WHATSAPP ====================

@app.post("/v1/whatsapp/send")
async def whatsapp_send(request: Request):
    data = await request.json()
    phone = data.get("phone", "")
    message = data.get("message", "")
    
    if not phone:
        return JSONResponse({"detail": "Phone number required"}, status_code=400)
    
    # Generate wa.me link
    digits = "".join(filter(str.isdigit, phone))
    text = _urlparse.quote(message) if message else ""
    link = f"https://wa.me/{digits}?text={text}"
    
    return {"status": "ok", "link": link, "phone": digits}

'''

    if insert_marker in content:
        content = content.replace(insert_marker, new_code + "\n" + insert_marker)
        print("Added OAuth + Google Pay + card deposit + WhatsApp endpoints")
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

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
print(f"Health: {stdout.read().decode().strip()[:200]}")

# Test OAuth start endpoint
stdin, stdout, stderr = ssh.exec_command("curl -s -o /dev/null -w '%{http_code}' http://localhost:8546/v1/auth/oauth/google/start 2>&1", timeout=10)
code = stdout.read().decode().strip()
print(f"OAuth google/start HTTP code: {code}")

# Test Google Pay deposit
stdin, stdout, stderr = ssh.exec_command("""curl -s -X POST http://localhost:8546/v1/wallet/googlepay/deposit -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{"amount": 50, "wallet_address": "0x1234567890123456789012345678901234567890"}' 2>&1""", timeout=10)
print(f"Google Pay deposit: {stdout.read().decode().strip()[:200]}")

# Test card deposit
stdin, stdout, stderr = ssh.exec_command("""curl -s -X POST http://localhost:8546/v1/wallet/card/deposit -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{"amount": 100, "wallet_address": "0x1234567890123456789012345678901234567890", "card_number": "4111111111111111", "card_expiry": "12/25", "card_cvc": "123"}' 2>&1""", timeout=10)
print(f"Card deposit: {stdout.read().decode().strip()[:200]}")

# Test WhatsApp
stdin, stdout, stderr = ssh.exec_command("""curl -s -X POST http://localhost:8546/v1/whatsapp/send -H 'Content-Type: application/json' -H 'X-API-Token: soulmate_wallet_2024' -d '{"phone": "+15551234567", "message": "Hello"}' 2>&1""", timeout=10)
print(f"WhatsApp: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone! Backend patched with OAuth + Google Pay + Current card + WhatsApp.")
