"""Wakkii Links chat server — lightweight room message store + social framework.

Endpoints:
  GET  /wakkii/rooms/{roomId}/messages  → { messages: [...] }
  POST /wakkii/rooms/{roomId}/messages  → { status: "ok" }
  GET  /wakkii/rooms                    → { rooms: [...] }
  DELETE /wakkii/rooms/{roomId}/messages → { status: "ok", deleted: N }

Social:
  POST /social/users           → create/update user profile
  GET  /social/users/{userId}  → get user
  GET  /social/search?q=       → search users
  POST /social/follow          → follow user
  POST /social/unfollow        → unfollow user
  GET  /social/following/{id}  → following list
  GET  /social/followers/{id}  → followers list
  GET  /social/contacts/{id}   → contacts list
  POST /social/contacts         → add contact
  POST /social/dm              → send DM
  GET  /social/dm/{userId}     → get conversations
  GET  /social/dm/{userId}/{otherId} → get messages
"""

import json
import os
import sqlite3
import time
import hashlib
from pathlib import Path
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Wakkii Chat")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(os.environ.get("WAKKII_DATA", str(Path.home() / ".wakkii_chat")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

MAX_MESSAGES_PER_ROOM = 500
MAX_ROOM_AGE_HOURS = 24

DB_PATH = DATA_DIR / "social.db"

def init_social_db():
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                display_name TEXT,
                bio TEXT,
                avatar TEXT,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS follows (
                follower_id TEXT NOT NULL,
                following_id TEXT NOT NULL,
                created_at REAL NOT NULL,
                PRIMARY KEY (follower_id, following_id)
            );
            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                contact_user_id TEXT,
                name TEXT,
                source TEXT DEFAULT 'manual',
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS dm_messages (
                id TEXT PRIMARY KEY,
                sender_id TEXT NOT NULL,
                receiver_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_dm_sender ON dm_messages(sender_id);
            CREATE INDEX IF NOT EXISTS idx_dm_receiver ON dm_messages(receiver_id);
        """)

init_social_db()


class MessageRequest(BaseModel):
    sender: str
    text: str


def _room_path(room_id: str) -> Path:
    safe = "".join(c for c in room_id.upper() if c.isalnum())
    return DATA_DIR / f"room_{safe}.json"


def _load_room(room_id: str) -> list:
    p = _room_path(room_id)
    if not p.exists():
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_room(room_id: str, messages: list):
    p = _room_path(room_id)
    if len(messages) > MAX_MESSAGES_PER_ROOM:
        messages = messages[-MAX_MESSAGES_PER_ROOM:]
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(messages, f, ensure_ascii=False)
    except Exception:
        pass


def _cleanup_old_rooms():
    now = time.time()
    cutoff = now - (MAX_ROOM_AGE_HOURS * 3600)
    for p in DATA_DIR.glob("room_*.json"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except Exception:
            pass


@app.get("/wakkii/rooms")
async def list_rooms():
    _cleanup_old_rooms()
    rooms = []
    for p in DATA_DIR.glob("room_*.json"):
        try:
            room_id = p.stem.replace("room_", "")
            msgs = json.loads(p.read_text(encoding="utf-8"))
            rooms.append({
                "roomId": room_id,
                "messageCount": len(msgs),
                "lastActivity": msgs[-1]["timestamp"] if msgs else None,
            })
        except Exception:
            pass
    return {"rooms": rooms}


@app.get("/wakkii/rooms/{room_id}/messages")
async def get_messages(room_id: str):
    messages = _load_room(room_id)
    return {"messages": messages}


@app.post("/wakkii/rooms/{room_id}/messages")
async def post_message(room_id: str, req: MessageRequest):
    messages = _load_room(room_id)
    msg = {
        "sender": req.sender,
        "text": req.text,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    messages.append(msg)
    _save_room(room_id, messages)
    return {"status": "ok", "message": msg}


@app.delete("/wakkii/rooms/{room_id}/messages")
async def clear_messages(room_id: str):
    p = _room_path(room_id)
    count = 0
    if p.exists():
        try:
            count = len(json.loads(p.read_text(encoding="utf-8")))
            p.unlink()
        except Exception:
            pass
    return {"status": "ok", "deleted": count}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "wakkii-chat"}

# --- Social Framework ---

class UserRequest(BaseModel):
    user_id: str
    username: str = ""
    display_name: str = ""
    bio: str = ""
    avatar: str = ""

class FollowRequest(BaseModel):
    follower_id: str
    following_id: str

class ContactRequest(BaseModel):
    user_id: str
    contact_user_id: str = ""
    name: str = ""
    source: str = "manual"

class DMRequest(BaseModel):
    sender_id: str
    receiver_id: str
    text: str

@app.post("/social/users")
async def create_user(req: UserRequest):
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute(
            "INSERT OR REPLACE INTO users (user_id, username, display_name, bio, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (req.user_id, req.username, req.display_name, req.bio, req.avatar, time.time())
        )
    return {"status": "ok"}

@app.get("/social/users/{user_id}")
async def get_user(user_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return {"status": "error", "detail": "Not found"}
    return {"user_id": row[0], "username": row[1], "display_name": row[2], "bio": row[3], "avatar": row[4], "created_at": row[5]}

@app.get("/social/search")
async def search_users(q: str = Query(...)):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT user_id, username, display_name FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 50",
            (f"%{q}%", f"%{q}%")
        ).fetchall()
    return {"users": [{"user_id": r[0], "username": r[1], "display_name": r[2]} for r in rows]}

@app.post("/social/follow")
async def follow(req: FollowRequest):
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute("INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)",
                     (req.follower_id, req.following_id, time.time()))
    return {"status": "ok"}

@app.post("/social/unfollow")
async def unfollow(req: FollowRequest):
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute("DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
                     (req.follower_id, req.following_id))
    return {"status": "ok"}

@app.get("/social/following/{user_id}")
async def get_following(user_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT u.user_id, u.username, u.display_name FROM follows f JOIN users u ON f.following_id = u.user_id WHERE f.follower_id = ?",
            (user_id,)
        ).fetchall()
    return {"following": [{"user_id": r[0], "username": r[1], "display_name": r[2]} for r in rows]}

@app.get("/social/followers/{user_id}")
async def get_followers(user_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT u.user_id, u.username, u.display_name FROM follows f JOIN users u ON f.follower_id = u.user_id WHERE f.following_id = ?",
            (user_id,)
        ).fetchall()
    return {"followers": [{"user_id": r[0], "username": r[1], "display_name": r[2]} for r in rows]}

@app.get("/social/contacts/{user_id}")
async def get_contacts(user_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute("SELECT id, name, contact_user_id, source, created_at FROM contacts WHERE user_id = ?", (user_id,)).fetchall()
    return {"contacts": [{"id": r[0], "name": r[1], "contact_user_id": r[2], "source": r[3], "created_at": r[4]} for r in rows]}

@app.post("/social/contacts")
async def add_contact(req: ContactRequest):
    contact_id = hashlib.sha256(f"{req.user_id}:{req.name}:{time.time()}".encode()).hexdigest()[:16]
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute("INSERT INTO contacts (id, user_id, contact_user_id, name, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (contact_id, req.user_id, req.contact_user_id, req.name, req.source, time.time()))
    return {"status": "ok", "contact_id": contact_id}

@app.post("/social/dm")
async def send_dm(req: DMRequest):
    msg_id = hashlib.sha256(f"{req.sender_id}:{req.receiver_id}:{time.time()}".encode()).hexdigest()[:16]
    with sqlite3.connect(str(DB_PATH)) as conn:
        conn.execute("INSERT INTO dm_messages (id, sender_id, receiver_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
                     (msg_id, req.sender_id, req.receiver_id, req.text, time.time()))
    return {"status": "ok", "message_id": msg_id}

@app.get("/social/dm/{user_id}")
async def get_conversations(user_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute(
            """SELECT DISTINCT
                CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_id,
                (SELECT text FROM dm_messages m2 WHERE (m2.sender_id = ? AND m2.receiver_id = other_id) OR (m2.sender_id = other_id AND m2.receiver_id = ?) ORDER BY created_at DESC LIMIT 1) as last_msg,
                (SELECT created_at FROM dm_messages m2 WHERE (m2.sender_id = ? AND m2.receiver_id = other_id) OR (m2.sender_id = other_id AND m2.receiver_id = ?) ORDER BY created_at DESC LIMIT 1) as last_time
            FROM dm_messages WHERE sender_id = ? OR receiver_id = ?
            ORDER BY last_time DESC""",
            (user_id, user_id, user_id, user_id, user_id, user_id, user_id)
        ).fetchall()
    return {"conversations": [{"user_id": r[0], "last_message": r[1], "last_time": r[2]} for r in rows]}

@app.get("/social/dm/{user_id}/{other_id}")
async def get_dm_messages(user_id: str, other_id: str):
    with sqlite3.connect(str(DB_PATH)) as conn:
        rows = conn.execute(
            "SELECT id, sender_id, receiver_id, text, created_at FROM dm_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC",
            (user_id, other_id, other_id, user_id)
        ).fetchall()
    return {"messages": [{"id": r[0], "sender_id": r[1], "receiver_id": r[2], "text": r[3], "created_at": r[4]} for r in rows]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
