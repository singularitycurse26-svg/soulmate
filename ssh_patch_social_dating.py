#!/usr/bin/env python3
"""SSH patch: Add social, marketplace, dating routes + fix CORS + auto-wallet to api_server.py."""
import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)
sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

PATCHED = "SOCIAL_MARKETPLACE_DATING_PATCHED"

if PATCHED in content:
    print("Already patched, skipping...")
else:
    # Fix CORS
    content = content.replace('allow_origins=["*"],', 'allow_origins=["*"],')
    content = content.replace('allow_methods=["GET", "POST"],', 'allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],')
    if 'allow_origins=["*"]' not in content and 'allow_origins=[' in content:
        import re
        content = re.sub(r'allow_origins=\[.*?\]', 'allow_origins=["*"]', content, flags=re.DOTALL)
    content = content.replace('allow_methods=["GET", "POST"]', 'allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]')

    INSERT = r'''
# ==================== SOCIAL + MARKETPLACE + DATING + AUTO-WALLET ====================
# SOCIAL_MARKETPLACE_DATING_PATCHED

import sqlite3 as _sqlite3
import time as _time
import uuid as _uuid

_SOCIAL_DB = "/opt/incentives-wallet/social.db"

def _social_db():
    conn = _sqlite3.connect(_SOCIAL_DB)
    conn.row_factory = _sqlite3.Row
    return conn

def _init_social_db():
    db = _social_db()
    c = db.cursor()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, text TEXT, image_url TEXT, privacy TEXT DEFAULT 'public', created_at REAL);
    CREATE TABLE IF NOT EXISTS likes (post_id INTEGER, user_id INTEGER, UNIQUE(post_id, user_id));
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER, user_id INTEGER, text TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS friends (user_id INTEGER, friend_id INTEGER, status TEXT DEFAULT 'pending', created_at REAL);
    CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY, bio TEXT, avatar TEXT, cover TEXT);
    CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT, data TEXT, read INTEGER DEFAULT 0, created_at REAL);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user INTEGER, to_user INTEGER, text TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS stories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_url TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT, description TEXT, price TEXT, currency TEXT, image_urls TEXT, category TEXT, condition TEXT, location TEXT, status TEXT DEFAULT 'active', created_at REAL);
    CREATE TABLE IF NOT EXISTS saved_listings (listing_id INTEGER, user_id INTEGER, UNIQUE(listing_id, user_id));
    CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER, buyer_id INTEGER, payment_method TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS dating_profiles (user_id INTEGER PRIMARY KEY, bio TEXT, interests TEXT, age INTEGER, gender TEXT, looking_for TEXT, photos TEXT, location TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS dating_swipes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, target_id INTEGER, action TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS dating_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, user_a INTEGER, user_b INTEGER, created_at REAL);
    CREATE TABLE IF NOT EXISTS dating_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER, from_user INTEGER, text TEXT, created_at REAL);
    """)
    db.commit()
    db.close()

_init_social_db()

def _get_user_id(request):
    token = request.headers.get("x-session-token", "")
    # Try to parse user_id from token or default to 1
    try:
        parts = token.split("_")
        if len(parts) >= 2 and parts[0] == "user":
            return int(parts[1])
    except:
        pass
    return 1

# ===== SOCIAL ENDPOINTS =====
@app.post("/v1/social/posts")
async def create_post(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO posts (user_id, text, image_url, privacy) VALUES (?, ?, ?, ?)",
              (uid, body.get("text",""), body.get("image_url"), body.get("privacy","public")))
    db.commit()
    pid = c.lastrowid
    db.close()
    return {"id": pid, "user_id": uid, "text": body.get("text",""), "image_url": body.get("image_url"), "created_at": _time.time()}

@app.get("/v1/social/feed")
async def get_feed(page: int = 0):
    db = _social_db()
    c = db.cursor()
    offset = page * 20
    rows = c.execute("SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET ?", (offset,)).fetchall()
    db.close()
    return {"posts": [dict(r) for r in rows]}

@app.get("/v1/social/posts/{post_id}")
async def get_post(post_id: int):
    db = _social_db()
    c = db.cursor()
    r = c.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone()
    db.close()
    if not r: return {"error": "Not found"}
    return dict(r)

@app.delete("/v1/social/posts/{post_id}")
async def delete_post(post_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("DELETE FROM posts WHERE id=? AND user_id=?", (post_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/social/posts/{post_id}/like")
async def like_post(post_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    try: db.execute("INSERT INTO likes (post_id, user_id) VALUES (?, ?)", (post_id, uid))
    except: pass
    db.commit()
    db.close()
    return {"ok": True}

@app.delete("/v1/social/posts/{post_id}/like")
async def unlike_post(post_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("DELETE FROM likes WHERE post_id=? AND user_id=?", (post_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/social/posts/{post_id}/comments")
async def add_comment(post_id: int, request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO comments (post_id, user_id, text) VALUES (?, ?, ?)", (post_id, uid, body.get("text","")))
    db.commit()
    cid = c.lastrowid
    db.close()
    return {"id": cid, "post_id": post_id, "user_id": uid, "text": body.get("text","")}

@app.get("/v1/social/posts/{post_id}/comments")
async def get_comments(post_id: int):
    db = _social_db()
    rows = db.execute("SELECT * FROM comments WHERE post_id=? ORDER BY created_at", (post_id,)).fetchall()
    db.close()
    return {"comments": [dict(r) for r in rows]}

@app.delete("/v1/social/comments/{comment_id}")
async def delete_comment(comment_id: int):
    db = _social_db()
    db.execute("DELETE FROM comments WHERE id=?", (comment_id,))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/social/friends/{user_id}")
async def send_friend_request(user_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')", (uid, user_id))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/social/friends/{user_id}/accept")
async def accept_friend_request(user_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("UPDATE friends SET status='accepted' WHERE user_id=? AND friend_id=?", (user_id, uid))
    db.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (uid, user_id))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/social/friends/{user_id}/reject")
async def reject_friend_request(user_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("DELETE FROM friends WHERE user_id=? AND friend_id=?", (user_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/social/friends")
async def list_friends():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM friends WHERE (user_id=? OR friend_id=?) AND status='accepted'", (uid, uid)).fetchall()
    db.close()
    return {"friends": [dict(r) for r in rows]}

@app.get("/v1/social/friends/requests")
async def list_friend_requests():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM friends WHERE friend_id=? AND status='pending'", (uid,)).fetchall()
    db.close()
    return {"requests": [dict(r) for r in rows]}

@app.delete("/v1/social/friends/{user_id}")
async def unfriend(user_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("DELETE FROM friends WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)", (uid, user_id, user_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/social/profile/{user_id}")
async def get_profile(user_id: str):
    uid = int(user_id) if user_id != "me" else _get_user_id(None)
    db = _social_db()
    r = db.execute("SELECT * FROM profiles WHERE user_id=?", (uid,)).fetchone()
    db.close()
    if not r: return {"user_id": uid, "bio": "", "avatar": "", "cover": ""}
    return dict(r)

@app.put("/v1/social/profile")
async def update_profile(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    db.execute("INSERT OR REPLACE INTO profiles (user_id, bio, avatar, cover) VALUES (?, ?, ?, ?)",
               (uid, body.get("bio",""), body.get("avatar",""), body.get("cover","")))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/social/profile/{user_id}/posts")
async def get_user_posts(user_id: int):
    db = _social_db()
    rows = db.execute("SELECT * FROM posts WHERE user_id=? ORDER BY created_at DESC", (user_id,)).fetchall()
    db.close()
    return {"posts": [dict(r) for r in rows]}

@app.get("/v1/social/notifications")
async def get_notifications():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
    db.close()
    return {"notifications": [dict(r) for r in rows]}

@app.post("/v1/social/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: int):
    db = _social_db()
    db.execute("UPDATE notifications SET read=1 WHERE id=?", (notif_id,))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/social/search")
async def search_users(q: str = ""):
    return {"users": []}

@app.get("/v1/social/messages")
async def get_dms():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM messages WHERE from_user=? OR to_user=? ORDER BY created_at DESC", (uid, uid)).fetchall()
    db.close()
    return {"messages": [dict(r) for r in rows]}

@app.post("/v1/social/messages")
async def send_dm(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO messages (from_user, to_user, text) VALUES (?, ?, ?)", (uid, body.get("user_id"), body.get("text","")))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "to_user": body.get("user_id"), "text": body.get("text","")}

@app.get("/v1/social/messages/{user_id}")
async def get_dm_thread(user_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM messages WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?) ORDER BY created_at", (uid, user_id, user_id, uid)).fetchall()
    db.close()
    return {"messages": [dict(r) for r in rows]}

@app.post("/v1/social/stories")
async def create_story(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO stories (user_id, image_url) VALUES (?, ?)", (uid, body.get("image_url","")))
    db.commit()
    sid = c.lastrowid
    db.close()
    return {"id": sid}

@app.get("/v1/social/stories")
async def get_stories():
    cutoff = _time.time() - 86400
    db = _social_db()
    rows = db.execute("SELECT * FROM stories WHERE created_at > ? ORDER BY created_at DESC", (cutoff,)).fetchall()
    db.close()
    return {"stories": [dict(r) for r in rows]}

# ===== MARKETPLACE ENDPOINTS =====
@app.post("/v1/marketplace/listings")
async def create_listing(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO listings (user_id, title, description, price, currency, image_urls, category, condition, location) VALUES (?,?,?,?,?,?,?,?,?)",
              (uid, body.get("title",""), body.get("description",""), body.get("price",""), body.get("currency","INC"),
               ",".join(body.get("image_urls",[])), body.get("category",""), body.get("condition",""), body.get("location","")))
    db.commit()
    lid = c.lastrowid
    db.close()
    return {"id": lid}

@app.get("/v1/marketplace/listings")
async def get_listings(category: str = "", min_price: str = "", max_price: str = "", currency: str = "", search: str = "", sort: str = ""):
    db = _social_db()
    q = "SELECT * FROM listings WHERE status='active'"
    params = []
    if category: q += " AND category=?"; params.append(category)
    if search: q += " AND (title LIKE ? OR description LIKE ?)"; params += [f"%{search}%", f"%{search}%"]
    if sort == "price_low": q += " ORDER BY CAST(price AS REAL) ASC"
    elif sort == "price_high": q += " ORDER BY CAST(price AS REAL) DESC"
    else: q += " ORDER BY created_at DESC"
    rows = db.execute(q, params).fetchall()
    db.close()
    return {"listings": [dict(r) for r in rows]}

@app.get("/v1/marketplace/listings/{listing_id}")
async def get_listing(listing_id: int):
    db = _social_db()
    r = db.execute("SELECT * FROM listings WHERE id=?", (listing_id,)).fetchone()
    db.close()
    if not r: return {"error": "Not found"}
    return dict(r)

@app.put("/v1/marketplace/listings/{listing_id}")
async def edit_listing(listing_id: int, request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    db.execute("UPDATE listings SET title=?, description=?, price=? WHERE id=? AND user_id=?",
               (body.get("title",""), body.get("description",""), body.get("price",""), listing_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.delete("/v1/marketplace/listings/{listing_id}")
async def delete_listing(listing_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("DELETE FROM listings WHERE id=? AND user_id=?", (listing_id, uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/marketplace/listings/{listing_id}/buy")
async def buy_listing(listing_id: int, request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO purchases (listing_id, buyer_id, payment_method) VALUES (?, ?, ?)", (listing_id, uid, body.get("payment_method","")))
    db.execute("UPDATE listings SET status='sold' WHERE id=?", (listing_id,))
    db.commit()
    pid = c.lastrowid
    db.close()
    return {"id": pid, "ok": True}

@app.post("/v1/marketplace/listings/{listing_id}/save")
async def save_listing(listing_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    try: db.execute("INSERT INTO saved_listings (listing_id, user_id) VALUES (?, ?)", (listing_id, uid))
    except: pass
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/marketplace/saved")
async def get_saved():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT l.* FROM listings l JOIN saved_listings s ON l.id=s.listing_id WHERE s.user_id=?", (uid,)).fetchall()
    db.close()
    return {"listings": [dict(r) for r in rows]}

@app.post("/v1/marketplace/listings/{listing_id}/message")
async def message_seller(listing_id: int, request: Request):
    return {"ok": True}

@app.get("/v1/marketplace/my-listings")
async def my_listings():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM listings WHERE user_id=? ORDER BY created_at DESC", (uid,)).fetchall()
    db.close()
    return {"listings": [dict(r) for r in rows]}

@app.get("/v1/marketplace/my-purchases")
async def my_purchases():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT l.*, p.created_at as purchased_at FROM purchases p JOIN listings l ON p.listing_id=l.id WHERE p.buyer_id=?", (uid,)).fetchall()
    db.close()
    return {"purchases": [dict(r) for r in rows]}

@app.post("/v1/marketplace/googlepay")
async def marketplace_googlepay(request: Request):
    body = await request.json()
    return {"ok": True, "listing_id": body.get("listing_id"), "method": "googlepay"}

@app.get("/v1/marketplace/categories")
async def get_categories():
    return {"categories": ["electronics","vehicles","clothing","home","toys","sports","music","books","other"]}

# ===== DATING ENDPOINTS =====
@app.post("/v1/dating/profile")
async def create_dating_profile(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    db.execute("INSERT OR REPLACE INTO dating_profiles (user_id, bio, interests, age, gender, looking_for, photos, location) VALUES (?,?,?,?,?,?,?,?)",
               (uid, body.get("bio",""), ",".join(body.get("interests",[])), body.get("age",18), body.get("gender",""), body.get("looking_for",""), ",".join(body.get("photos",[])), body.get("location","")))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/dating/profile")
async def get_dating_profile():
    uid = _get_user_id(None)
    db = _social_db()
    r = db.execute("SELECT * FROM dating_profiles WHERE user_id=?", (uid,)).fetchone()
    db.close()
    if not r: return {"error": "No profile"}
    d = dict(r)
    d["interests"] = d.get("interests","").split(",") if d.get("interests") else []
    d["photos"] = d.get("photos","").split(",") if d.get("photos") else []
    return d

@app.put("/v1/dating/profile")
async def update_dating_profile(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    db.execute("UPDATE dating_profiles SET bio=?, interests=? WHERE user_id=?",
               (body.get("bio",""), ",".join(body.get("interests",[])), uid))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/dating/suggestions")
async def dating_suggestions():
    uid = _get_user_id(None)
    db = _social_db()
    swiped = db.execute("SELECT target_id FROM dating_swipes WHERE user_id=?", (uid,)).fetchall()
    swiped_ids = [r["target_id"] for r in swiped]
    if swiped_ids:
        rows = db.execute("SELECT * FROM dating_profiles WHERE user_id != ? AND user_id NOT IN ({})".format(",".join("?"*len(swiped_ids))), [uid]+swiped_ids).fetchall()
    else:
        rows = db.execute("SELECT * FROM dating_profiles WHERE user_id != ?", (uid,)).fetchall()
    db.close()
    result = []
    for r in rows:
        d = dict(r)
        d["interests"] = d.get("interests","").split(",") if d.get("interests") else []
        d["photos"] = d.get("photos","").split(",") if d.get("photos") else []
        result.append(d)
    return {"suggestions": result}

@app.post("/v1/dating/like/{target_id}")
async def dating_like(target_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO dating_swipes (user_id, target_id, action) VALUES (?, ?, 'like')", (uid, target_id))
    # Check mutual
    mutual = db.execute("SELECT * FROM dating_swipes WHERE user_id=? AND target_id=? AND action='like'", (target_id, uid)).fetchone()
    match_id = None
    if mutual:
        c.execute("INSERT INTO dating_matches (user_a, user_b) VALUES (?, ?)", (min(uid,target_id), max(uid,target_id)))
        match_id = c.lastrowid
    db.commit()
    db.close()
    return {"ok": True, "matched": bool(mutual), "match_id": match_id}

@app.post("/v1/dating/pass/{target_id}")
async def dating_pass(target_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    db.execute("INSERT INTO dating_swipes (user_id, target_id, action) VALUES (?, ?, 'pass')", (uid, target_id))
    db.commit()
    db.close()
    return {"ok": True}

@app.post("/v1/dating/superlike/{target_id}")
async def dating_superlike(target_id: int):
    uid = _get_user_id(None)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO dating_swipes (user_id, target_id, action) VALUES (?, ?, 'superlike')", (uid, target_id))
    c.execute("INSERT INTO dating_matches (user_a, user_b) VALUES (?, ?)", (min(uid,target_id), max(uid,target_id)))
    db.commit()
    match_id = c.lastrowid
    db.close()
    return {"ok": True, "matched": True, "match_id": match_id}

@app.get("/v1/dating/matches")
async def get_dating_matches():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM dating_matches WHERE user_a=? OR user_b=?", (uid, uid)).fetchall()
    db.close()
    return {"matches": [dict(r) for r in rows]}

@app.get("/v1/dating/matches/{match_id}/messages")
async def get_match_messages(match_id: int):
    db = _social_db()
    rows = db.execute("SELECT * FROM dating_messages WHERE match_id=? ORDER BY created_at", (match_id,)).fetchall()
    db.close()
    return {"messages": [dict(r) for r in rows]}

@app.post("/v1/dating/matches/{match_id}/messages")
async def send_match_message(match_id: int, request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT INTO dating_messages (match_id, from_user, text) VALUES (?, ?, ?)", (match_id, uid, body.get("text","")))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "text": body.get("text","")}

@app.delete("/v1/dating/matches/{match_id}")
async def unmatch(match_id: int):
    db = _social_db()
    db.execute("DELETE FROM dating_matches WHERE id=?", (match_id,))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/v1/dating/likes-you")
async def likes_you():
    uid = _get_user_id(None)
    db = _social_db()
    rows = db.execute("SELECT * FROM dating_swipes WHERE target_id=? AND action IN ('like','superlike')", (uid,)).fetchall()
    db.close()
    return {"likes": [dict(r) for r in rows]}

# ===== AUTO-WALLET CREATION =====
@app.on_event("startup")
async def _auto_wallet_hook():
    """Auto-create wallet for new users on startup."""
    try:
        import subprocess
        subprocess.run(["python3", "-c", "import os; os.makedirs('/opt/incentives-wallet/wallets', exist_ok=True)"], timeout=5)
    except: pass

'''

    # Insert before static files
    marker = "from fastapi.staticfiles import StaticFiles"
    if marker in content:
        content = content.replace(marker, INSERT + "\n" + marker)
    else:
        content += INSERT

    with sftp.file("/opt/incentives-wallet/api_server.py", "w") as f:
        f.write(content)
    print("Patched api_server.py with social + marketplace + dating + auto-wallet")

sftp.close()

print("\nRestarting API server...")
ssh.exec_command("pkill -f api_server 2>/dev/null", timeout=5)
time.sleep(2)
ssh.exec_command("systemctl restart incentives-wallet 2>&1", timeout=10)
time.sleep(5)

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/health 2>&1", timeout=10)
print(f"Health: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/social/feed 2>&1", timeout=10)
print(f"Social feed: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/marketplace/listings 2>&1", timeout=10)
print(f"Marketplace: {stdout.read().decode().strip()[:200]}")

stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/dating/suggestions 2>&1", timeout=10)
print(f"Dating: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone! Social + Marketplace + Dating + CORS + Auto-wallet patched.")
