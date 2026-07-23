import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# Check if already patched
if "game_rooms" in content and "GAME_ROOMS" in content:
    print("Game server already patched, skipping...")
else:
    # 1. Add game room tables to init_db
    old_init = 'c.execute("""CREATE TABLE IF NOT EXISTS tags ('
    new_init = '''# Game rooms and tournament tables
    c.execute("""CREATE TABLE IF NOT EXISTS game_rooms (
        id TEXT PRIMARY KEY,
        game_type TEXT NOT NULL,
        max_players INTEGER DEFAULT 6,
        status TEXT DEFAULT 'waiting',
        created_at TEXT,
        current_state TEXT
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS game_players (
        room_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        is_ai INTEGER DEFAULT 0,
        seat INTEGER,
        joined_at TEXT,
        PRIMARY KEY (room_id, player_id)
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS tournament_scores (
        player_id TEXT NOT NULL,
        quarter TEXT NOT NULL,
        game_type TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        PRIMARY KEY (player_id, quarter, game_type)
    )""")
    c.execute("""CREATE TABLE IF NOT EXISTS tags ('''
    
    if old_init in content:
        content = content.replace(old_init, new_init)
        print("Added game room tables to init_db")
    else:
        print("WARNING: Could not find init_db tags table creation")

    # 2. Add game room endpoints before the static files section
    # Find a good insertion point - after the last API endpoint
    insert_marker = '# --- Static file serving / SPA fallback ---'
    
    game_endpoints = '''
# ==================== GAME ROOMS & MULTIPLAYER ====================

import uuid as _uuid
import json as _json

GAME_ROOMS = {}  # In-memory game rooms for WebSocket connections

class GameRoom:
    def __init__(self, room_id, game_type, max_players):
        self.id = room_id
        self.game_type = game_type
        self.max_players = max_players
        self.players = {}  # player_id -> {name, ws, is_ai, seat}
        self.status = "waiting"
        self.state = {}
        self.deck = []
        self.created_at = time.time()

    def to_dict(self):
        return {
            "id": self.id,
            "game_type": self.game_type,
            "max_players": self.max_players,
            "player_count": len(self.players),
            "status": self.status,
            "players": [{"name": p["name"], "is_ai": p["is_ai"], "seat": p["seat"]} for p in self.players.values()]
        }

@app.post("/v1/games/rooms/create")
async def create_game_room(request: Request):
    data = await request.json()
    game_type = data.get("game_type", "blackjack")
    max_players = data.get("max_players", 6)
    room_id = str(_uuid.uuid4())[:8]
    room = GameRoom(room_id, game_type, max_players)
    GAME_ROOMS[room_id] = room
    # Save to DB
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO game_rooms VALUES (?, ?, ?, ?, ?, ?)",
              (room_id, game_type, max_players, "waiting", time.strftime("%Y-%m-%dT%H:%M:%S"), "{}"))
    conn.commit()
    conn.close()
    return {"status": "created", "room_id": room_id, "room": room.to_dict()}

@app.get("/v1/games/rooms/list")
async def list_game_rooms(game_type: str = None):
    rooms = []
    for rid, room in GAME_ROOMS.items():
        if game_type and room.game_type != game_type:
            continue
        if room.status != "full":
            rooms.append(room.to_dict())
    return {"rooms": rooms}

@app.post("/v1/games/rooms/{room_id}/join")
async def join_game_room(room_id: str, request: Request):
    if room_id not in GAME_ROOMS:
        return JSONResponse({"detail": "Room not found"}, status_code=404)
    room = GAME_ROOMS[room_id]
    if len(room.players) >= room.max_players:
        return JSONResponse({"detail": "Room is full"}, status_code=400)
    data = await request.json()
    player_id = data.get("player_id", str(_uuid.uuid4())[:8])
    player_name = data.get("player_name", "Player")
    seat = len(room.players)
    room.players[player_id] = {"name": player_name, "ws": None, "is_ai": False, "seat": seat}
    # Save to DB
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO game_players VALUES (?, ?, ?, 0, ?, ?)",
              (room_id, player_id, player_name, seat, time.strftime("%Y-%m-%dT%H:%M:%S")))
    conn.commit()
    conn.close()
    return {"status": "joined", "room": room.to_dict(), "player_id": player_id}

@app.post("/v1/games/rooms/{room_id}/leave")
async def leave_game_room(room_id: str, request: Request):
    if room_id not in GAME_ROOMS:
        return JSONResponse({"detail": "Room not found"}, status_code=404)
    data = await request.json()
    player_id = data.get("player_id")
    if player_id in GAME_ROOMS[room_id].players:
        del GAME_ROOMS[room_id].players[player_id]
    return {"status": "left"}

@app.websocket("/v1/games/ws/{room_id}")
async def game_websocket(websocket: WebSocket, room_id: str):
    await websocket.accept()
    if room_id not in GAME_ROOMS:
        await websocket.send_json({"type": "error", "message": "Room not found"})
        await websocket.close()
        return
    room = GAME_ROOMS[room_id]
    player_id = None
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "join":
                player_id = data.get("player_id", str(_uuid.uuid4())[:8])
                player_name = data.get("player_name", "Player")
                seat = len(room.players)
                room.players[player_id] = {"name": player_name, "ws": websocket, "is_ai": False, "seat": seat}
                # Broadcast join
                for p in room.players.values():
                    if p["ws"] and p["ws"] != websocket:
                        try:
                            await p["ws"].send_json({"type": "player_joined", "room": room.to_dict()})
                        except:
                            pass
                await websocket.send_json({"type": "joined", "room": room.to_dict(), "player_id": player_id})
            elif msg_type == "action":
                action = data.get("action")
                # Broadcast action to all players
                for p in room.players.values():
                    if p["ws"]:
                        try:
                            await p["ws"].send_json({"type": "action", "player_id": player_id, "action": action, "data": data.get("data", {})})
                        except:
                            pass
            elif msg_type == "state_update":
                room.state = data.get("state", {})
                for p in room.players.values():
                    if p["ws"] and p["ws"] != websocket:
                        try:
                            await p["ws"].send_json({"type": "state_update", "state": room.state})
                        except:
                            pass
            elif msg_type == "chat":
                msg = data.get("message", "")
                for p in room.players.values():
                    if p["ws"]:
                        try:
                            await p["ws"].send_json({"type": "chat", "player_id": player_id, "message": msg})
                        except:
                            pass
    except WebSocketDisconnect:
        if player_id and player_id in room.players:
            del room.players[player_id]
            for p in room.players.values():
                if p["ws"]:
                    try:
                        await p["ws"].send_json({"type": "player_left", "player_id": player_id, "room": room.to_dict()})
                    except:
                        pass

# ==================== BLACKJACK API ====================

@app.post("/v1/games/blackjack/start")
async def blackjack_start(request: Request):
    data = await request.json()
    mode = data.get("mode", "vs-dealer")
    bet_amount = data.get("bet_amount", 50)
    session_id = str(_uuid.uuid4())[:8]
    return {"status": "ok", "session_id": session_id, "mode": mode, "bet_amount": bet_amount}

@app.post("/v1/games/blackjack/action")
async def blackjack_action(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    action = data.get("action")
    return {"status": "ok", "session_id": session_id, "action": action}

# ==================== TEXAS HOLD'EM API ====================

@app.post("/v1/games/holdem/start")
async def holdem_start(request: Request):
    data = await request.json()
    mode = data.get("mode", "heads-up")
    bet_amount = data.get("bet_amount", 50)
    session_id = str(_uuid.uuid4())[:8]
    return {"status": "ok", "session_id": session_id, "mode": mode, "bet_amount": bet_amount}

@app.post("/v1/games/holdem/action")
async def holdem_action(request: Request):
    data = await request.json()
    session_id = data.get("session_id")
    action = data.get("action")
    amount = data.get("amount", 0)
    return {"status": "ok", "session_id": session_id, "action": action, "amount": amount}

# ==================== TOURNAMENT SCORE TRACKING ====================

@app.post("/v1/games/tournament/score")
async def update_tournament_score(request: Request):
    data = await request.json()
    player_id = data.get("player_id")
    game_type = data.get("game_type")
    score = data.get("score", 0)
    quarter = time.strftime("%Y-Q") + str((time.localtime().tm_mon - 1) // 3 + 1)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""INSERT OR REPLACE INTO tournament_scores VALUES (?, ?, ?, ?)""",
              (player_id, quarter, game_type, score))
    conn.commit()
    conn.close()
    return {"status": "ok", "quarter": quarter}

'''

    if insert_marker in content:
        content = content.replace(insert_marker, game_endpoints + "\n" + insert_marker)
        print("Added game room + blackjack + holdem + tournament endpoints")
    else:
        # Try to append before the last function
        print("WARNING: Could not find static file marker, appending to end")
        content = content + "\n" + game_endpoints

# Write updated file
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

# Test game rooms endpoint
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/games/rooms/list 2>&1", timeout=10)
print(f"Rooms: {stdout.read().decode().strip()[:200]}")

ssh.close()
print("\nDone! Backend game server patched.")
