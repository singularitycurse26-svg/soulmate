#!/usr/bin/env python3
"""Patch the VPS api_server.py to add translation endpoints, cache table, 
   preferred_language in profiles, and source_lang in message tables."""

import paramiko
import sys

HOST = "191.44.121.29"
USER = "root"
PASS = "wallmartxxxxxxxx8"
REMOTE = "/opt/incentives-wallet/api_server.py"

def main():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=USER, password=PASS, timeout=30)

    # 1. Read the current file
    print("Reading current api_server.py...")
    sftp = c.open_sftp()
    with sftp.open(REMOTE, "r") as f:
        content = f.read().decode("utf-8")

    patches = []

    # 2. Add source_lang columns to message tables via ALTER TABLE in _init_social_db
    old_init = 'CREATE TABLE IF NOT EXISTS dating_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER, from_user INTEGER, text TEXT, created_at REAL);'
    new_init = '''CREATE TABLE IF NOT EXISTS dating_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER, from_user INTEGER, text TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS translation_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, message_hash TEXT, source_lang TEXT, target_lang TEXT, translated_text TEXT, created_at REAL);
    CREATE TABLE IF NOT EXISTS user_languages (user_id INTEGER PRIMARY KEY, preferred_language TEXT DEFAULT 'en');'''
    if old_init in content:
        patches.append(("Add translation_cache + user_languages tables", old_init, new_init))
    else:
        print("WARNING: Could not find dating_messages CREATE TABLE line")

    # 3. Add source_lang to messages table via ALTER TABLE after _init_social_db() call
    old_init_call = '_init_social_db()\n\ndef _get_user_id'
    new_init_call = '''_init_social_db()

# Add source_lang columns if they don't exist
try:
    _db = _social_db()
    _db.executescript("ALTER TABLE messages ADD COLUMN source_lang TEXT DEFAULT 'en';")
    _db.commit()
    _db.close()
    print("Added source_lang to messages")
except:
    pass
try:
    _db = _social_db()
    _db.executescript("ALTER TABLE dating_messages ADD COLUMN source_lang TEXT DEFAULT 'en';")
    _db.commit()
    _db.close()
    print("Added source_lang to dating_messages")
except:
    pass

def _get_user_id'''
    if old_init_call in content:
        patches.append(("Add ALTER TABLE for source_lang columns", old_init_call, new_init_call))
    else:
        print("WARNING: Could not find _init_social_db() call")

    # 4. Update send_dm to accept and store source_lang
    old_send_dm = '''    c.execute("INSERT INTO messages (from_user, to_user, text) VALUES (?, ?, ?)", (uid, body.get("user_id"), body.get("text","")))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "to_user": body.get("user_id"), "text": body.get("text","")}'''
    new_send_dm = '''    source_lang = body.get("source_lang", "en")
    c.execute("INSERT INTO messages (from_user, to_user, text, source_lang) VALUES (?, ?, ?, ?)", (uid, body.get("user_id"), body.get("text",""), source_lang))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "to_user": body.get("user_id"), "text": body.get("text",""), "source_lang": source_lang}'''
    if old_send_dm in content:
        patches.append(("Update send_dm with source_lang", old_send_dm, new_send_dm))
    else:
        print("WARNING: Could not find send_dm INSERT")

    # 5. Update send_match_message to accept and store source_lang
    old_send_match = '''    c.execute("INSERT INTO dating_messages (match_id, from_user, text) VALUES (?, ?, ?)", (match_id, uid, body.get("text","")))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "text": body.get("text","")}'''
    new_send_match = '''    source_lang = body.get("source_lang", "en")
    c.execute("INSERT INTO dating_messages (match_id, from_user, text, source_lang) VALUES (?, ?, ?, ?)", (match_id, uid, body.get("text",""), source_lang))
    db.commit()
    mid = c.lastrowid
    db.close()
    return {"id": mid, "from_user": uid, "text": body.get("text",""), "source_lang": source_lang}'''
    if old_send_match in content:
        patches.append(("Update send_match_message with source_lang", old_send_match, new_send_match))
    else:
        print("WARNING: Could not find send_match_message INSERT")

    # 6. Add translation endpoints before the SMS section
    # Find a good insertion point - right before the SMS DB section
    old_sms_marker = 'sms_db_path = os.path.join(os.path.dirname(__file__), "sms.db")'
    new_translation_endpoints = '''# ===== TRANSLATION ENDPOINTS =====

LANG_NAMES = {
    "en": "English", "es": "Spanish", "pt": "Portuguese",
    "zh": "Chinese (Simplified)", "zh-HK": "Chinese (Traditional)", "hi": "Hindi",
    "ar": "Arabic", "fr": "French", "de": "German", "ja": "Japanese",
    "ko": "Korean", "ru": "Russian", "it": "Italian", "tr": "Turkish",
    "vi": "Vietnamese", "th": "Thai", "id": "Indonesian", "ms": "Malay",
    "nl": "Dutch", "pl": "Polish", "bn": "Bengali", "ta": "Tamil",
    "te": "Telugu", "mr": "Marathi", "gu": "Gujarati", "pa": "Punjabi",
}

def _translate_via_gemini(text, target_lang, source_lang=None):
    """Translate text using Gemini API with caching."""
    import hashlib
    db = _social_db()
    c = db.cursor()
    msg_hash = hashlib.sha256(f"{text}:{source_lang or 'auto'}:{target_lang}".encode()).hexdigest()
    # Check cache (24h expiry)
    cutoff = _time.time() - 86400
    row = c.execute("SELECT translated_text, source_lang FROM translation_cache WHERE message_hash=? AND created_at > ?", (msg_hash, cutoff)).fetchone()
    if row:
        db.close()
        return {"translated": row["translated_text"], "source_lang": row["source_lang"], "cached": True}

    # Call Gemini for translation
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    src_name = LANG_NAMES.get(source_lang, "the source language") if source_lang else "the source language"
    prompt = f"Translate the following message from {src_name} to {lang_name}. Only return the translation, nothing else. Preserve emojis and formatting.\\n\\nMessage: \\"{text}\\""

    messages = [{"role": "user", "content": prompt}]
    result = call_gemini("You are a professional translator. Translate accurately and naturally.", messages)

    if result and "text" in result:
        translated = result["text"].strip()
        # Detect source lang if not provided
        detected_source = source_lang or "auto"
        # Cache it
        c.execute("INSERT INTO translation_cache (message_hash, source_lang, target_lang, translated_text, created_at) VALUES (?, ?, ?, ?, ?)",
                  (msg_hash, detected_source, target_lang, translated, _time.time()))
        db.commit()
        db.close()
        return {"translated": translated, "source_lang": detected_source, "cached": False}

    db.close()
    return None

@app.post("/v1/translate")
async def translate_message(request: Request,
                            _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "translate"))):
    body = await request.json()
    text = body.get("text", "")
    target_lang = body.get("target_lang", "en")
    source_lang = body.get("source_lang")

    if not text or not text.strip():
        return {"translated": "", "source_lang": source_lang or "en", "cached": False}

    if source_lang and source_lang == target_lang:
        return {"translated": text, "source_lang": source_lang, "cached": False}

    result = _translate_via_gemini(text, target_lang, source_lang)
    if result:
        return result
    return {"translated": text, "source_lang": source_lang or "en", "cached": False, "error": "Translation failed"}

@app.post("/v1/translate/batch")
async def translate_batch(request: Request,
                          _rl=Depends(rate_limited(RATE_LIMIT_GENERAL, "translate_batch"))):
    body = await request.json()
    messages_list = body.get("messages", [])
    target_lang = body.get("target_lang", "en")

    translations = []
    for msg in messages_list:
        text = msg.get("text", "")
        source_lang = msg.get("source_lang")
        msg_id = msg.get("id")

        if not text or not text.strip():
            translations.append({"id": msg_id, "translated": text, "source_lang": source_lang or "en"})
            continue

        if source_lang and source_lang == target_lang:
            translations.append({"id": msg_id, "translated": text, "source_lang": source_lang})
            continue

        result = _translate_via_gemini(text, target_lang, source_lang)
        if result:
            translations.append({"id": msg_id, "translated": result["translated"], "source_lang": result["source_lang"]})
        else:
            translations.append({"id": msg_id, "translated": text, "source_lang": source_lang or "en", "error": "Translation failed"})

    return {"translations": translations}

@app.get("/v1/translate/languages")
async def get_supported_languages():
    return {"languages": [{"code": k, "name": v} for k, v in LANG_NAMES.items()]}

@app.post("/v1/user/language")
async def set_user_language(request: Request):
    body = await request.json()
    uid = _get_user_id(request)
    lang = body.get("language", "en")
    db = _social_db()
    c = db.cursor()
    c.execute("INSERT OR REPLACE INTO user_languages (user_id, preferred_language) VALUES (?, ?)", (uid, lang))
    db.commit()
    db.close()
    return {"ok": True, "language": lang}

@app.get("/v1/user/language")
async def get_user_language(request: Request):
    uid = _get_user_id(request)
    db = _social_db()
    row = db.execute("SELECT preferred_language FROM user_languages WHERE user_id=?", (uid,)).fetchone()
    db.close()
    if row:
        return {"language": row["preferred_language"]}
    return {"language": "en"}

@app.get("/v1/user/language/{user_id}")
async def get_other_user_language(user_id: int):
    db = _social_db()
    row = db.execute("SELECT preferred_language FROM user_languages WHERE user_id=?", (user_id,)).fetchone()
    db.close()
    if row:
        return {"language": row["preferred_language"]}
    return {"language": "en"}

''' + old_sms_marker

    if old_sms_marker in content:
        patches.append(("Add translation endpoints", old_sms_marker, new_translation_endpoints))
    else:
        print("WARNING: Could not find sms_db_path marker")

    # Apply all patches
    for name, old, new in patches:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  Applied: {name}")
        else:
            print(f"  SKIP (not found): {name}")

    # Write back
    print("Writing patched file...")
    with sftp.open(REMOTE, "w") as f:
        f.write(content)
    sftp.close()

    # Restart the service
    print("Restarting api_server...")
    _, o, e = c.exec_command("systemctl restart incentives-api 2>&1 || supervisorctl restart incentives-api 2>&1 || pkill -f uvicorn && sleep 1 && cd /opt/incentives-wallet && nohup python3 api_server.py > /dev/null 2>&1 &", timeout=15)
    out = o.read().decode()
    err = e.read().decode()
    if out: print(f"  stdout: {out}")
    if err: print(f"  stderr: {err}")

    # Verify it's running
    _, o, e = c.exec_command("sleep 2 && curl -s http://localhost:8000/v1/translate/languages | head -100", timeout=15)
    out = o.read().decode()
    print(f"  Verify: {out[:200]}")

    c.close()
    print("Done!")

if __name__ == "__main__":
    main()
