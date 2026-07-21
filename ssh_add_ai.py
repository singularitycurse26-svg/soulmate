import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("191.44.121.29", username="root", password="wallmartxxxxxxxx8", timeout=15)

sftp = ssh.open_sftp()

# Read current api_server.py
with sftp.file("/opt/incentives-wallet/api_server.py", "r") as f:
    content = f.read().decode()

# AI assistant code to insert before static serving
ai_code = '''

# --- AI ASSISTANT (Soulmate AI) ---

ai_db_path = os.path.join(os.path.dirname(__file__), "ai_assistant.db")

def init_ai_db():
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            content TEXT NOT NULL,
            keywords TEXT,
            importance REAL DEFAULT 0.5,
            created_at TEXT DEFAULT (datetime('now')),
            last_accessed TEXT,
            access_count INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS memory_links (
            source_id INTEGER NOT NULL,
            target_id INTEGER NOT NULL,
            relation_type TEXT DEFAULT 'related_to',
            weight REAL DEFAULT 0.5,
            PRIMARY KEY (source_id, target_id),
            FOREIGN KEY (source_id) REFERENCES memories(id),
            FOREIGN KEY (target_id) REFERENCES memories(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            tools_used TEXT,
            model_used TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS ai_settings (
            user_id INTEGER PRIMARY KEY,
            model_preference TEXT DEFAULT 'auto',
            personality TEXT DEFAULT 'casual',
            memory_retention TEXT DEFAULT 'balanced',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_ai_db()

import re
import json as json_mod
import urllib.request
import urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "qwen2.5:3b"

# --- Memory Functions ---

def extract_keywords(text, max_keywords=8):
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
                  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
                  'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
                  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
                  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'but',
                  'and', 'or', 'if', 'because', 'as', 'until', 'while', 'of', 'at',
                  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
                  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up',
                  'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
                  'then', 'once', 'here', 'there', 'my', 'your', 'his', 'her', 'its',
                  'our', 'their', 'me', 'him', 'us', 'them', 'am'}
    words = re.findall(r'\\b[a-zA-Z]{3,}\\b', text.lower())
    keywords = [w for w in words if w not in stop_words]
    # Dedupe preserving order
    seen = set()
    unique = []
    for w in keywords:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique[:max_keywords]

def store_memory(user_id, mem_type, content, keywords=None, importance=0.5):
    if keywords is None:
        keywords = extract_keywords(content)
    kw_str = ",".join(keywords)
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO memories (user_id, type, content, keywords, importance) VALUES (?, ?, ?, ?, ?)",
              (user_id, mem_type, content, kw_str, importance))
    mem_id = c.lastrowid
    # Link to top 3 related memories
    c.execute("""
        SELECT id, keywords FROM memories WHERE user_id = ? AND id != ?
        ORDER BY last_accessed DESC LIMIT 20
    """, (user_id, mem_id))
    existing = c.fetchall()
    links = []
    for eid, ekw in existing:
        if ekw:
            ekw_set = set(ekw.split(","))
            overlap = len(set(keywords) & ekw_set)
            if overlap > 0:
                links.append((eid, overlap))
    links.sort(key=lambda x: x[1], reverse=True)
    for eid, overlap in links[:3]:
        weight = min(overlap / max(len(keywords), 1), 1.0)
        c.execute("INSERT OR IGNORE INTO memory_links (source_id, target_id, relation_type, weight) VALUES (?, ?, 'related_to', ?)",
                  (mem_id, eid, weight))
    conn.commit()
    conn.close()
    logger.info(f"Memory stored: type={mem_type}, id={mem_id}, keywords={kw_str[:50]}")
    return mem_id

def retrieve_memories(user_id, query, limit=8):
    keywords = extract_keywords(query)
    if not keywords:
        # Fall back to recent memories
        conn = sqlite3.connect(ai_db_path)
        c = conn.cursor()
        c.execute("SELECT id, type, content, keywords, importance, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", (user_id, limit))
        rows = c.fetchall()
        conn.close()
        return [{"id": r[0], "type": r[1], "content": r[2], "importance": r[3], "created_at": r[5]} for r in rows]

    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    conditions = []
    params = [user_id]
    for kw in keywords:
        conditions.append("keywords LIKE ?")
        params.append(f"%{kw}%")
    where_clause = " OR ".join(conditions)
    params.append(limit)
    c.execute(f"""
        SELECT id, type, content, keywords, importance, created_at, last_accessed
        FROM memories WHERE user_id = ? AND ({where_clause})
        ORDER BY importance DESC, created_at DESC LIMIT ?
    """, params)
    rows = c.fetchall()
    # Update access count + last_accessed
    for r in rows:
        c.execute("UPDATE memories SET access_count = access_count + 1, last_accessed = datetime('now') WHERE id = ?", (r[0],))
    conn.commit()
    conn.close()
    return [{"id": r[0], "type": r[1], "content": r[2], "importance": r[4], "created_at": r[5]} for r in rows]

def decay_memories(user_id):
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    # Decay: reduce importance by 1% for memories not accessed in 24h
    c.execute("""
        UPDATE memories SET importance = MAX(0.05, importance * 0.99)
        WHERE user_id = ? AND (last_accessed IS NULL OR last_accessed < datetime('now', '-1 day'))
    """, (user_id,))
    # Archive very low importance
    c.execute("DELETE FROM memories WHERE user_id = ? AND importance < 0.05", (user_id,))
    conn.commit()
    conn.close()

def consolidate_memories(user_id):
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("SELECT id, content, keywords FROM memories WHERE user_id = ? AND type = 'conversation_summary' ORDER BY created_at DESC LIMIT 50", (user_id,))
    rows = c.fetchall()
    conn.close()
    # Simple consolidation: merge memories with >60% keyword overlap
    merged = 0
    for i in range(len(rows)):
        for j in range(i+1, len(rows)):
            id1, content1, kw1 = rows[i]
            id2, content2, kw2 = rows[j]
            if not kw1 or not kw2:
                continue
            set1 = set(kw1.split(","))
            set2 = set(kw2.split(","))
            overlap = len(set1 & set2) / max(len(set1 | set2), 1)
            if overlap > 0.6:
                conn = sqlite3.connect(ai_db_path)
                cc = conn.cursor()
                merged_content = content1 + " | " + content2
                merged_kw = ",".join(set1 | set2)
                cc.execute("UPDATE memories SET content = ?, keywords = ?, importance = MIN(1.0, importance + 0.1) WHERE id = ?", (merged_content, merged_kw, id1))
                cc.execute("DELETE FROM memories WHERE id = ?", (id2,))
                cc.execute("DELETE FROM memory_links WHERE source_id = ? OR target_id = ?", (id2, id2))
                conn.commit()
                conn.close()
                merged += 1
                break
    logger.info(f"Consolidated {merged} memories for user {user_id}")
    return merged

def store_conversation(user_id, role, content, tools_used=None, model_used=None):
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("INSERT INTO conversations (user_id, role, content, tools_used, model_used) VALUES (?, ?, ?, ?, ?)",
              (user_id, role, content, json_mod.dumps(tools_used) if tools_used else None, model_used))
    conv_id = c.lastrowid
    conn.commit()
    conn.close()
    return conv_id

def get_conversation_history(user_id, limit=20):
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("SELECT role, content, tools_used, model_used, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", (user_id, limit))
    rows = c.fetchall()
    conn.close()
    return [{"role": r[0], "content": r[1], "tools_used": json_mod.loads(r[2]) if r[2] else None, "model": r[3], "date": r[4]} for r in reversed(rows)]

# --- Tool System ---

TOOL_DEFINITIONS = [
    {"name": "check_balance", "description": "Check wallet token balances", "parameters": {"type": "object", "properties": {}}},
    {"name": "list_contacts", "description": "List user's contacts", "parameters": {"type": "object", "properties": {}}},
    {"name": "create_contact", "description": "Add a new contact", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "email": {"type": "string"}, "phone": {"type": "string"}}, "required": ["name"]}},
    {"name": "send_email", "description": "Send an email", "parameters": {"type": "object", "properties": {"to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}}, "required": ["to", "subject", "body"]}},
    {"name": "read_inbox", "description": "Get recent emails", "parameters": {"type": "object", "properties": {}}},
    {"name": "get_subscription", "description": "Check current subscription plan", "parameters": {"type": "object", "properties": {}}},
    {"name": "set_reminder", "description": "Store a reminder in memory", "parameters": {"type": "object", "properties": {"reminder": {"type": "string"}}, "required": ["reminder"]}},
]

def execute_tool(tool_name, args, user_id, session_token):
    try:
        if tool_name == "check_balance":
            conn = sqlite3.connect(auth_db_path)
            c = conn.cursor()
            c.execute("SELECT wallet_address FROM users WHERE id = ?", (user_id,))
            row = c.fetchone()
            conn.close()
            if not row or not row[0]:
                return {"error": "No wallet address found"}
            addr = row[0]
            import requests as req_mod
            resp = req_mod.get(f"http://localhost:8546/v1/balance/{addr}", timeout=10)
            return resp.json()
        elif tool_name == "list_contacts":
            conn = sqlite3.connect(contacts_db_path)
            c = conn.cursor()
            c.execute("SELECT name, email, phone, wallet_address FROM contacts WHERE user_id = ? ORDER BY name", (user_id,))
            rows = c.fetchall()
            conn.close()
            return {"contacts": [{"name": r[0], "email": r[1], "phone": r[2], "wallet": r[3]} for r in rows]}
        elif tool_name == "create_contact":
            conn = sqlite3.connect(contacts_db_path)
            c = conn.cursor()
            c.execute("INSERT INTO contacts (user_id, name, email, phone) VALUES (?, ?, ?, ?)",
                      (user_id, args.get("name", ""), args.get("email"), args.get("phone")))
            conn.commit()
            conn.close()
            return {"status": "created", "name": args.get("name")}
        elif tool_name == "send_email":
            conn = sqlite3.connect(email_db_path)
            c = conn.cursor()
            c.execute("SELECT email_address FROM email_accounts WHERE user_id = ?", (user_id,))
            row = c.fetchone()
            from_addr = row[0] if row else None
            if not from_addr:
                return {"error": "Email account not set up. Ask user to set up email first."}
            c.execute("INSERT INTO emails (user_id, from_addr, to_addr, subject, body, folder) VALUES (?, ?, ?, ?, ?, 'sent')",
                      (user_id, from_addr, args["to"], args["subject"], args["body"]))
            conn.commit()
            conn.close()
            try:
                import subprocess
                subprocess.run(["sendmail", "-t"], input=f"From: {from_addr}\\nTo: {args['to']}\\nSubject: {args['subject']}\\n\\n{args['body']}",
                              capture_output=True, text=True, timeout=10)
            except Exception:
                pass
            return {"status": "sent", "to": args["to"], "subject": args["subject"]}
        elif tool_name == "read_inbox":
            conn = sqlite3.connect(email_db_path)
            c = conn.cursor()
            c.execute("SELECT id, from_addr, subject, is_read, created_at FROM emails WHERE user_id = ? AND folder = 'inbox' ORDER BY created_at DESC LIMIT 10", (user_id,))
            rows = c.fetchall()
            conn.close()
            return {"emails": [{"id": r[0], "from": r[1], "subject": r[2], "read": bool(r[3]), "date": r[4]} for r in rows]}
        elif tool_name == "get_subscription":
            conn = sqlite3.connect(subscription_db_path)
            c = conn.cursor()
            c.execute("SELECT tier, status FROM subscriptions WHERE user_id = ?", (user_id,))
            row = c.fetchone()
            conn.close()
            return {"tier": row[0] if row else "free", "status": row[1] if row else "active"}
        elif tool_name == "set_reminder":
            store_memory(user_id, "reminder", args["reminder"], importance=0.8)
            return {"status": "stored", "reminder": args["reminder"]}
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        return {"error": str(e)}

# --- LLM Functions ---

def call_gemini(system_prompt, messages):
    if not GEMINI_API_KEY:
        return None
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024},
            "tools": [{"function_declarations": [{"name": t["name"], "description": t["description"], "parameters": t["parameters"]} for t in TOOL_DEFINITIONS]}],
        }
        data = json_mod.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=30)
        result = json_mod.loads(resp.read().decode())
        # Check for function call
        candidates = result.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            for part in parts:
                if "functionCall" in part:
                    return {"tool_call": part["functionCall"], "raw": result}
            text = parts[0].get("text", "") if parts else ""
            return {"text": text, "raw": result}
        return None
    except urllib.error.HTTPError as e:
        logger.warning(f"Gemini API error: {e.code}")
        return None
    except Exception as e:
        logger.warning(f"Gemini error: {e}")
        return None

def call_ollama(system_prompt, messages):
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "stream": False,
            "options": {"temperature": 0.7, "num_predict": 1024},
            "tools": [{"type": "function", "function": {"name": t["name"], "description": t["description"], "parameters": t["parameters"]}} for t in TOOL_DEFINITIONS],
        }
        data = json_mod.dumps(payload).encode()
        req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=60)
        result = json_mod.loads(resp.read().decode())
        msg = result.get("message", {})
        if msg.get("tool_calls"):
            return {"tool_call": msg["tool_calls"][0], "raw": result}
        return {"text": msg.get("content", ""), "raw": result}
    except Exception as e:
        logger.warning(f"Ollama error: {e}")
        return None

def build_system_prompt(user_id, memories):
    memory_text = ""
    if memories:
        memory_text = "\\n\\nMemories about this user:\\n"
        for m in memories[:8]:
            memory_text += f"- [{m['type']}] {m['content']}\\n"
    return f"""You are Soulmate, the AI assistant for Soulmate OS — a personal communication platform with email, contacts, crypto wallet, and games. You live on the user's own server.

You have persistent memory through RecursiveLink. You remember past conversations, user preferences, and important facts across sessions.

You can take actions by calling tools. When the user asks you to do something (send email, check balance, add contact, etc.), use the appropriate tool.

Be warm, concise, and proactive. If you notice something actionable, mention it naturally. You are not a generic chatbot — you are THIS user's personal AI, running on their server, with access to their digital life.

Keep responses short and natural — like texting a smart friend. Don't use bullet points unless asked. Don't over-explain.{memory_text}"""

def parse_tool_call_gemini(fc):
    name = fc.get("name", "")
    args = fc.get("args", {})
    return name, args

def parse_tool_call_ollama(tc):
    func = tc.get("function", tc)
    name = func.get("name", "")
    args = func.get("arguments", func.get("args", {}))
    if isinstance(args, str):
        args = json_mod.loads(args)
    return name, args

# --- AI API Endpoints ---

class ChatRequest(BaseModel):
    message: str

@app.post("/v1/ai/chat")
async def ai_chat(req: ChatRequest, request: Request,
                  _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_chat"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")

    # Decay memories occasionally
    if hash(user_id) % 10 == 0:
        decay_memories(user_id)

    # Retrieve relevant memories
    memories = retrieve_memories(user_id, req.message)

    # Get conversation history (last 10 messages)
    history = get_conversation_history(user_id, limit=10)
    messages = [{"role": h["role"], "content": h["content"]} for h in history]
    messages.append({"role": "user", "content": req.message})

    # Store user message
    store_conversation(user_id, "user", req.message)

    # Build system prompt
    system_prompt = build_system_prompt(user_id, memories)

    # Try Gemini first, then Ollama
    tools_used = []
    model_used = None
    response_text = None

    result = call_gemini(system_prompt, messages)
    if result and "tool_call" in result:
        model_used = "gemini"
        name, args = parse_tool_call_gemini(result["tool_call"])
        tool_result = execute_tool(name, args, user_id, request.headers.get("X-Session-Token", ""))
        tools_used.append({"tool": name, "args": args, "result": tool_result})
        # Feed tool result back and get final response
        messages.append({"role": "assistant", "content": f"[Used tool: {name}]"})
        messages.append({"role": "user", "content": f"Tool result: {json_mod.dumps(tool_result)}. Now respond to the user naturally."})
        result2 = call_gemini(system_prompt, messages)
        if result2 and "text" in result2:
            response_text = result2["text"]
        else:
            response_text = f"Done! I {name.replace('_', ' ')} for you."
    elif result and "text" in result:
        model_used = "gemini"
        response_text = result["text"]

    # Fallback to Ollama
    if not response_text:
        result = call_ollama(system_prompt, messages)
        if result and "tool_call" in result:
            model_used = "ollama"
            name, args = parse_tool_call_ollama(result["tool_call"])
            tool_result = execute_tool(name, args, user_id, request.headers.get("X-Session-Token", ""))
            tools_used.append({"tool": name, "args": args, "result": tool_result})
            messages.append({"role": "assistant", "content": f"[Used tool: {name}]"})
            messages.append({"role": "user", "content": f"Tool result: {json_mod.dumps(tool_result)}. Now respond to the user naturally."})
            result2 = call_ollama(system_prompt, messages)
            if result2 and "text" in result2:
                response_text = result2["text"]
            else:
                response_text = f"Done! I {name.replace('_', ' ')} for you."
        elif result and "text" in result:
            model_used = "ollama"
            response_text = result["text"]

    if not response_text:
        response_text = "I'm having trouble right now. Both my cloud and local models are unavailable. Please try again in a moment."
        model_used = "none"

    # Store assistant response
    store_conversation(user_id, "assistant", response_text, tools_used, model_used)

    # Store memory: summarize the exchange
    summary = f"User: {req.message[:100]} | AI: {response_text[:100]}"
    store_memory(user_id, "conversation_summary", summary, importance=0.6)

    return {
        "response": response_text,
        "tools_used": tools_used,
        "model": model_used,
        "memories_used": len(memories),
    }

@app.get("/v1/ai/history")
async def ai_history(request: Request,
                     _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_history"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    history = get_conversation_history(user_id, limit=50)
    return {"history": history}

@app.get("/v1/ai/memory")
async def ai_memory_list(request: Request,
                         _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_memory"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("SELECT id, type, content, keywords, importance, created_at, last_accessed, access_count FROM memories WHERE user_id = ? ORDER BY importance DESC, created_at DESC", (user_id,))
    rows = c.fetchall()
    conn.close()
    memories = [{"id": r[0], "type": r[1], "content": r[2], "keywords": r[3], "importance": r[4], "created_at": r[5], "last_accessed": r[6], "access_count": r[7]} for r in rows]
    return {"memories": memories, "count": len(memories)}

@app.delete("/v1/ai/memory/{memory_id}")
async def ai_memory_delete(memory_id: int, request: Request,
                           _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_memory_del"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("DELETE FROM memories WHERE id = ? AND user_id = ?", (memory_id, user_id))
    c.execute("DELETE FROM memory_links WHERE source_id = ? OR target_id = ?", (memory_id, memory_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.post("/v1/ai/memory/clear")
async def ai_memory_clear(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_memory_clear"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("DELETE FROM memories WHERE user_id = ?", (user_id,))
    c.execute("DELETE FROM memory_links WHERE source_id IN (SELECT id FROM memories WHERE user_id = ?)", (user_id,))
    conn.commit()
    conn.close()
    return {"status": "cleared"}

@app.post("/v1/ai/memory/consolidate")
async def ai_memory_consolidate(request: Request,
                                _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_memory_consolidate"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    merged = consolidate_memories(user_id)
    return {"status": "consolidated", "merged": merged}

@app.post("/v1/ai/memory")
async def ai_memory_store(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_memory_store"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    body = await request.json()
    mem_type = body.get("type", "fact")
    content = body.get("content", "")
    importance = body.get("importance", 0.5)
    if not content:
        raise HTTPException(status_code=400, detail="Content required")
    mem_id = store_memory(user_id, mem_type, content, importance=importance)
    return {"status": "stored", "id": mem_id}

@app.get("/v1/ai/settings")
async def ai_settings_get(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_settings_get"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    c.execute("SELECT model_preference, personality, memory_retention FROM ai_settings WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"model_preference": row[0], "personality": row[1], "memory_retention": row[2]}
    return {"model_preference": "auto", "personality": "casual", "memory_retention": "balanced"}

class SettingsUpdate(BaseModel):
    model_preference: str = None
    personality: str = None
    memory_retention: str = None

@app.post("/v1/ai/settings")
async def ai_settings_update(req: SettingsUpdate, request: Request,
                             _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "ai_settings_set"))):
    user_id = get_user_from_session(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    conn = sqlite3.connect(ai_db_path)
    c = conn.cursor()
    updates = []
    values = []
    for field in ["model_preference", "personality", "memory_retention"]:
        val = getattr(req, field)
        if val is not None:
            updates.append(f"{field} = ?")
            values.append(val)
    if updates:
        values.append(user_id)
        c.execute(f"INSERT INTO ai_settings (user_id, {', '.join([f for f in ['model_preference', 'personality', 'memory_retention'] if getattr(req, f) is not None])}) VALUES (?, {', '.join(['?' for _ in updates])}) ON CONFLICT(user_id) DO UPDATE SET {', '.join(updates)}", values)
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.get("/v1/ai/tools")
async def ai_tools_list():
    return {"tools": TOOL_DEFINITIONS}
'''

# Insert before static serving marker
static_marker = "# --- SERVE REACT FRONTEND ---"
if static_marker in content:
    content = content.replace(static_marker, ai_code + "\n" + static_marker)
    print("AI assistant code added to API server")
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

# Check if AI endpoints are registered
print("\nChecking AI endpoints...")
stdin, stdout, stderr = ssh.exec_command("curl -s http://localhost:8546/v1/ai/tools 2>&1", timeout=10)
tools = stdout.read().decode().strip()
print(f"AI tools: {tools[:200]}")

# Check server logs for errors
print("\nServer logs...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u incentives-wallet --no-pager -n 15 2>&1", timeout=10)
logs = stdout.read().decode().strip()
print(f"Logs: {logs[-400:]}")

ssh.close()
print("\nDone! AI assistant backend deployed.")
