"""incllmv2 FastAPI server.

Exposes the INC-LLM harness as a REST API with:
- POST /v1/chat — chat with the LLM
- POST /v1/chat/stream — streaming chat
- POST /v1/auth/password — authenticate with secret password
- POST /v1/auth/register — register a new user
- GET /v1/subscription/status — check subscription status
- GET /v1/subscription/pay — get payment instructions
- POST /v1/subscription/confirm — confirm a payment
- POST /v1/learn — trigger skill learning
- GET /v1/stats — system statistics
- GET /v1/health — health check
- POST /v1/sync/register — peer registration endpoint
- POST /v1/sync/share — receive shared learnings
- GET /v1/sync/receive — get learnings to receive
- GET /v1/rlos/stats — RLOS statistics
- GET /v1/mesh/stats — universal mesh link statistics
- GET /v1/usage — usage statistics
- GET /v1/usage/export — export usage data (JSON/CSV)
- POST /v1/internet/search — internet/Wikipedia search
- GET /v1/trading/price — get crypto price
- POST /v1/telegram/pair — generate pairing code
- POST /v1/voice/tts — text-to-speech
- POST /v1/voice/stt — speech-to-text
- GET /v1/tools — list available tools
"""

from __future__ import annotations

import asyncio
import json
import logging
import logging.config
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse, HTMLResponse
from pydantic import BaseModel

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness
from inc_llm.openai_compat import setup_openai_compat
from inc_llm.integrations.soul_movies_api import router as soul_movies_router, init_soul_movies_api
from inc_llm.integrations.soul_tube_api import router as soul_tube_router, init_soul_tube_api
from inc_llm.integrations.soulmate_os_web import router as soulmate_os_router

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="incllmv2", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(soulmate_os_router)
app.include_router(soul_movies_router)
app.include_router(soul_tube_router)

_rate_limit_store: dict[str, list[float]] = {}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Simple rate limiting middleware — 60 req/min per IP."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    times = _rate_limit_store.get(client_ip, [])
    times = [t for t in times if now - t < 60]
    if len(times) >= 60 and request.url.path not in ("/v1/health", "/docs", "/openapi.json"):
        return PlainTextResponse("Rate limit exceeded", status_code=429)
    times.append(now)
    _rate_limit_store[client_ip] = times
    return await call_next(request)

settings = Settings.from_env()
harness = IncLLMHarness(settings)
setup_openai_compat(app, harness, harness.api_keys)

# === LLM Process Manager — auto-starts other LLM servers ===
import subprocess as _subproc
import sys as _sys
import os as _os

_LLM_SERVERS = {
    "trill": {"module": "trill_llm.server.server", "port": 8548, "proc": None, "env_key": "TRILL_OLLAMA_MODEL"},
    "singularity": {"module": "singularity_llm.server.server", "port": 8549, "proc": None, "env_key": "SINGULARITY_OLLAMA_MODEL"},
    "splitbit": {"module": "splitbit_llm.server.server", "port": 8550, "proc": None, "env_key": "SPLITBIT_OLLAMA_MODEL"},
}


def _ensure_llm_running(name: str) -> bool:
    """Start an LLM server if not already running. Returns True if reachable."""
    info = _LLM_SERVERS.get(name)
    if not info:
        return False
    port = info["port"]
    # Check if already reachable
    import urllib.request as _urllib
    try:
        req = _urllib.Request(f"http://localhost:{port}/v1/health", method="GET")
        _urllib.urlopen(req, timeout=2)
        return True
    except Exception:
        pass
    # Start the server — pass Ollama URL and model so it uses the same Ollama instance
    if info["proc"] is not None and info["proc"].poll() is None:
        return True  # Still starting
    try:
        # Inherit current environment + pass Ollama config
        child_env = {**_os.environ}
        child_env["OLLAMA_BASE_URL"] = getattr(settings, 'ollama', type('obj', (), {'base_url': 'http://localhost:11434'})()).base_url
        # Use the same model that incllmv2 uses for base role
        base_model = getattr(settings, 'models', type('obj', (), {'base': 'qwen2.5:0.5b'})()).base
        child_env[info["env_key"]] = base_model

        proc = _subproc.Popen(
            [_sys.executable, "-m", info["module"].rsplit(".", 1)[0]],
            stdout=_subproc.DEVNULL,
            stderr=_subproc.DEVNULL,
            env=child_env,
        )
        info["proc"] = proc
        logger.info("Started %s LLM server on port %d (PID %d) with Ollama model %s",
                    name, port, proc.pid, base_model)
        return True
    except Exception as e:
        logger.warning("Failed to start %s LLM: %s", name, e)
        return False


@app.post("/v1/llm/start")
async def llm_start(request: Request):
    """Start a specific LLM server. Body: {"model": "trill|singularity|splitbit"}"""
    body = await request.json()
    model = body.get("model", "")
    if model not in _LLM_SERVERS:
        raise HTTPException(400, f"Unknown model: {model}. Available: {list(_LLM_SERVERS.keys())}")
    ok = _ensure_llm_running(model)
    return {"status": "ok" if ok else "error", "model": model, "port": _LLM_SERVERS[model]["port"]}


@app.get("/v1/llm/status")
async def llm_status():
    """Check which LLM servers are running and their Ollama backend status."""
    import urllib.request as _urllib
    # Check if Ollama itself is running
    ollama_ok = False
    ollama_models: list[str] = []
    try:
        req = _urllib.Request(f"{settings.ollama.base_url}/api/tags", method="GET")
        resp = _urllib.urlopen(req, timeout=3)
        ollama_data = json.loads(resp.read().decode())
        ollama_ok = True
        ollama_models = [m.get("name", "") for m in ollama_data.get("models", [])]
    except Exception:
        pass

    statuses = {}
    for name, info in _LLM_SERVERS.items():
        try:
            req = _urllib.Request(f"http://localhost:{info['port']}/v1/health", method="GET")
            resp = _urllib.urlopen(req, timeout=2)
            statuses[name] = {
                "running": True,
                "port": info["port"],
                "ollama_backend": ollama_ok,
                "ollama_model": getattr(settings, 'models', type('obj', (), {'base': ''})()).base,
            }
        except Exception:
            statuses[name] = {
                "running": False,
                "port": info["port"],
                "ollama_backend": ollama_ok,
            }
    return {
        "models": statuses,
        "ollama_running": ollama_ok,
        "ollama_url": settings.ollama.base_url,
        "ollama_models": ollama_models,
        "rlos_enabled": settings.rlos.enabled,
    }


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    model: str = "incllmv2"


class PasswordRequest(BaseModel):
    password: str


class RegisterRequest(BaseModel):
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    email: str
    password: str


class WalletSaveRequest(BaseModel):
    wallet_key_encrypted: str
    wallet_address: str


class PaymentConfirmRequest(BaseModel):
    method: str = "soulmate_wallet"
    tx_hash: str = ""
    amount: float = 0
    currency: str = "USD"
    deposit_id: str = ""
    token: str = "USDT"


class GoalRequest(BaseModel):
    title: str
    description: str
    priority: str = "medium"
    deadline: float | None = None
    tags: list[str] | None = None


class GoalActionRequest(BaseModel):
    goal_id: str
    context: str = ""


class APIKeyRequest(BaseModel):
    name: str
    scopes: list[str] | None = None
    connected_model: str = ""
    rate_limit: int = 60


class InternetSearchRequest(BaseModel):
    query: str
    source: str = "wikipedia"


class TradingPriceRequest(BaseModel):
    symbol: str
    platform: str | None = None


class TradingBuyRequest(BaseModel):
    symbol: str
    amount: float
    platform: str | None = None
    order_type: str = "market"
    price: float = 0


class TradingSellRequest(BaseModel):
    symbol: str
    amount: float
    platform: str | None = None
    order_type: str = "market"
    price: float = 0


class TradingCancelRequest(BaseModel):
    order_id: str
    platform: str | None = None


class TradingAlertRequest(BaseModel):
    symbol: str
    condition: str
    target: float
    platform: str | None = None


class TradingApiKeyRequest(BaseModel):
    platform: str
    api_key: str
    api_secret: str
    passphrase: str = ""


class TradingAutoStartRequest(BaseModel):
    symbols: list[str] | None = None
    interval_s: int | None = None
    platform: str | None = None


class WalletUnlockRequest(BaseModel):
    password: str


class WalletSendRequest(BaseModel):
    to_address: str
    amount: float
    token: str = "USDT"


class TelegramPairRequest(BaseModel):
    inc_llm_user_id: str


class VoiceTTSRequest(BaseModel):
    text: str


class VoiceSTTRequest(BaseModel):
    audio_path: str


@app.on_event("startup")
async def startup():
    await harness.initialize()
    # C4: Non-blocking init for SoulMovies/SoulTube
    if harness.soul_movies:
        asyncio.create_task(_init_soul_movies())
    if harness.soul_tube:
        asyncio.create_task(_init_soul_tube())
    logger.info("incllmv2 server started")

async def _init_soul_movies():
    try:
        init_soul_movies_api(harness.soul_movies)
        logger.info("SoulMovies API initialized")
    except Exception as e:
        logger.warning("SoulMovies init failed: %s", e)

async def _init_soul_tube():
    try:
        init_soul_tube_api(harness.soul_tube)
        logger.info("SoulTube API initialized")
    except Exception as e:
        logger.warning("SoulTube init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    await harness.close()


@app.get("/chat")
async def chat_ui():
    return HTMLResponse("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>incllmv2 — SplitBit Token OS</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
#header { background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 12px 20px; border-bottom: 1px solid #333; display: flex; align-items: center; gap: 12px; }
#header h1 { font-size: 18px; background: linear-gradient(90deg, #00d4ff, #7b2ff7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
#sb-badge { font-size: 11px; padding: 3px 8px; border-radius: 10px; background: rgba(0,212,255,0.15); color: #00d4ff; border: 1px solid rgba(0,212,255,0.3); }
#stats-btn { margin-left: auto; padding: 6px 14px; border-radius: 6px; background: #1a1a2e; color: #888; border: 1px solid #333; cursor: pointer; font-size: 12px; }
#stats-btn:hover { color: #00d4ff; border-color: #00d4ff; }
#chat { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.msg { max-width: 75%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
.msg.user { align-self: flex-end; background: linear-gradient(135deg, #1e3a5f, #1a2a4f); border: 1px solid #2a4a6f; }
.msg.assistant { align-self: flex-start; background: #1a1a2e; border: 1px solid #2a2a3e; }
.msg .meta { font-size: 10px; color: #555; margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; }
.msg .meta span { padding: 1px 6px; border-radius: 8px; background: rgba(255,255,255,0.05); }
.msg .meta .sb { color: #00d4ff; }
.msg .meta .cache { color: #00ff88; }
.msg .meta .fmt { color: #ff9d00; }
#input-bar { padding: 12px 20px; background: #111; border-top: 1px solid #222; display: flex; gap: 10px; }
#msg-input { flex: 1; padding: 12px 16px; border-radius: 8px; background: #1a1a2e; color: #e0e0e0; border: 1px solid #333; font-size: 14px; outline: none; }
#msg-input:focus { border-color: #00d4ff; }
#send-btn { padding: 12px 24px; border-radius: 8px; background: linear-gradient(135deg, #00d4ff, #7b2ff7); color: #fff; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
#send-btn:hover { opacity: 0.9; }
#send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
#stats-panel { position: fixed; top: 0; right: -420px; width: 400px; height: 100vh; background: #111; border-left: 1px solid #333; padding: 20px; overflow-y: auto; transition: right 0.3s; z-index: 100; }
#stats-panel.open { right: 0; }
#stats-panel h2 { font-size: 16px; margin-bottom: 12px; color: #00d4ff; }
#stats-panel pre { font-size: 11px; color: #aaa; white-space: pre-wrap; line-height: 1.4; }
#stats-close { position: absolute; top: 16px; right: 16px; cursor: pointer; color: #555; font-size: 20px; }
.typing { color: #555; font-style: italic; padding: 8px 16px; }
#login-overlay { position: fixed; inset: 0; background: #0a0a0f; display: flex; align-items: center; justify-content: center; z-index: 200; }
#login-box { background: #1a1a2e; padding: 40px; border-radius: 16px; border: 1px solid #333; max-width: 400px; width: 90%; }
#login-box h2 { color: #00d4ff; margin-bottom: 8px; font-size: 22px; }
#login-box p { color: #666; font-size: 13px; margin-bottom: 20px; }
#login-box input { width: 100%; padding: 12px 16px; border-radius: 8px; background: #0a0a0f; color: #e0e0e0; border: 1px solid #333; font-size: 14px; outline: none; margin-bottom: 12px; }
#login-box input:focus { border-color: #00d4ff; }
#login-box button { width: 100%; padding: 12px; border-radius: 8px; background: linear-gradient(135deg, #00d4ff, #7b2ff7); color: #fff; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
#login-box button:hover { opacity: 0.9; }
#login-error { color: #ff4466; font-size: 12px; margin-top: 8px; display: none; }
</style>
</head>
<body>
<div id="login-overlay">
  <div id="login-box">
    <h2>incllmv2</h2>
    <p>Enter your secret password to access the SplitBit Token OS</p>
    <input id="pw-input" type="password" placeholder="Secret password..." onkeydown="if(event.key==='Enter')doLogin()">
    <button onclick="doLogin()">Unlock</button>
    <div id="login-error">Invalid password. Try again.</div>
  </div>
</div>
<div id="header">
  <h1>incllmv2</h1>
  <span id="sb-badge">SplitBit Token OS</span>
  <button id="stats-btn" onclick="toggleStats()">Stats</button>
</div>
<div id="chat"></div>
<div id="input-bar">
  <input id="msg-input" placeholder="Talk to incllmv2..." onkeydown="if(event.key==='Enter')send()" disabled>
  <button id="send-btn" onclick="send()" disabled>Send</button>
</div>
<div id="stats-panel">
  <span id="stats-close" onclick="toggleStats()">&times;</span>
  <h2>SplitBit Accelerator Stats</h2>
  <pre id="stats-content">Loading...</pre>
</div>
<script>
let sessionId = null;
let busy = false;
let authToken = null;

async function doLogin() {
  const pw = document.getElementById('pw-input').value.trim();
  if (!pw) return;
  try {
    const res = await fetch('/v1/auth/password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: pw})
    });
    if (!res.ok) { document.getElementById('login-error').style.display = 'block'; return; }
    const data = await res.json();
    authToken = data.token;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('msg-input').focus();
  } catch(e) {
    document.getElementById('login-error').textContent = 'Error: ' + e.message;
    document.getElementById('login-error').style.display = 'block';
  }
}

async function send() {
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg || busy) return;
  busy = true;
  document.getElementById('send-btn').disabled = true;
  input.value = '';

  addMsg('user', msg);
  const typing = addTyping();

  try {
    const res = await fetch('/v1/chat', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken},
      body: JSON.stringify({message: msg, session_id: sessionId})
    });
    if (res.status === 401) { typing.remove(); addMsg('assistant', 'Session expired. Please refresh and login again.'); return; }
    const data = await res.json();
    typing.remove();

    if (data.session_id) sessionId = data.session_id;
    const meta = buildMeta(data);
    addMsg('assistant', data.response, meta);
  } catch(e) {
    typing.remove();
    addMsg('assistant', 'Error: ' + e.message + '\\n\\nMake sure Ollama is running (ollama serve) with a model pulled (ollama pull qwen2.5:0.5b)');
  }
  busy = false;
  document.getElementById('send-btn').disabled = false;
  input.focus();
}

function buildMeta(data) {
  const parts = [];
  if (data.cached) parts.push('<span class="cache">CACHED</span>');
  if (data.execution_time_s) parts.push('<span>' + data.execution_time_s + 's</span>');
  const ctx = data.context_used;
  if (ctx && ctx.splitbit) {
    const sb = ctx.splitbit;
    if (sb.format) parts.push('<span class="fmt">' + sb.format.format + '</span>');
    if (sb.cache_hit) parts.push('<span class="cache">SB-CACHE</span>');
    if (sb.prompt_compression) parts.push('<span class="sb">' + sb.prompt_compression.compression_ratio + 'x</span>');
    if (sb.link_injection) parts.push('<span class="sb">LINK</span>');
  }
  return parts.length ? '<div class="meta">' + parts.join('') + '</div>' : '';
}

function addMsg(role, text, meta='') {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = escapeHtml(text) + meta;
  document.getElementById('chat').appendChild(div);
  document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'typing';
  div.textContent = 'incllmv2 is thinking...';
  document.getElementById('chat').appendChild(div);
  document.getElementById('chat').scrollTop = document.getElementById('chat').scrollHeight;
  return div;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function toggleStats() {
  const panel = document.getElementById('stats-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) loadStats();
}

async function loadStats() {
  try {
    const res = await fetch('/v1/stats', {headers: {'Authorization': 'Bearer ' + authToken}});
    const data = await res.json();
    const sb = data.splitbit_accelerator;
    let html = '';
    if (sb) {
      html += '=== SplitBit Accelerator ===\\n';
      html += 'Accelerations: ' + sb.total_accelerations + '\\n';
      html += 'Time saved: ' + sb.total_time_saved_ms + 'ms\\n\\n';
      if (sb.os) {
        html += '--- Token OS ---\\n';
        html += 'Tier: ' + sb.os.tier + '\\n';
        html += 'Format: ' + sb.os.quant_format + '\\n';
        html += 'Compression: ' + sb.os.compression_ratio + 'x\\n';
        html += 'Contexts: ' + sb.os.allocated_contexts + ' active, ' + sb.os.persisted_contexts + ' persisted\\n';
        html += 'Links: ' + sb.os.context_links + '\\n';
        html += 'Peers: ' + sb.os.peers + '\\n';
        html += 'Learnings: ' + sb.os.total_learnings + '\\n\\n';
      }
      if (sb.conversation_cache) {
        html += '--- Conversation Cache ---\\n';
        html += 'Size: ' + sb.conversation_cache.cache_size + '\\n';
        html += 'Hits: ' + sb.conversation_cache.hits + '\\n';
        html += 'Misses: ' + sb.conversation_cache.misses + '\\n';
        html += 'Hit rate: ' + (sb.conversation_cache.hit_rate * 100).toFixed(1) + '%\\n\\n';
      }
      if (sb.format_switcher) {
        html += '--- Format Switcher ---\\n';
        html += 'Current: ' + sb.format_switcher.current_format + '\\n';
        html += 'Switches: ' + sb.format_switcher.total_switches + '\\n\\n';
      }
      if (sb.universal_learning) {
        html += '--- Universal Learning ---\\n';
        html += 'Shared: ' + sb.universal_learning.patterns_shared + '\\n';
        html += 'Received: ' + sb.universal_learning.patterns_received + '\\n';
        html += 'Applied: ' + sb.universal_learning.patterns_applied + '\\n';
        html += 'Tokens tracked: ' + sb.universal_learning.unique_tokens_tracked + '\\n';
      }
    } else {
      html = 'SplitBit stats not available';
    }
    document.getElementById('stats-content').textContent = html;
  } catch(e) {
    document.getElementById('stats-content').textContent = 'Error loading stats: ' + e.message;
  }
}
</script>
</body>
</html>""")


@app.get("/v1/health")
async def health():
    hc = await harness.bus.healthcheck()
    return {"status": "ok", "instance_id": harness.universal_link.instance_id, "provider": hc}


@app.post("/v1/auth/password")
async def auth_password(req: PasswordRequest):
    result = await harness.verify_password(req.password)
    if result["status"] != "ok":
        raise HTTPException(401, result.get("message", "Invalid password"))
    return result


@app.post("/v1/auth/register")
async def auth_register(req: RegisterRequest):
    result = harness.auth.register_user(req.email)
    return result


class SignupLoginRequest(BaseModel):
    email: str
    password: str


@app.post("/v1/auth/signup")
async def auth_signup(req: SignupLoginRequest):
    result = harness.auth.signup_user(req.email, req.password)
    if result["status"] == "created":
        harness.subscription.start_trial(result["user_id"])
    return result


@app.post("/v1/auth/auto")
async def auth_auto():
    """Auto-authenticate as founder — no password needed for local access."""
    result = harness.auth.authenticate_password(settings.auth.secret_password)
    if result.get("status") == "ok":
        return result
    raise HTTPException(401, "Auto-auth not configured")


@app.post("/v1/auth/login")
async def auth_login(req: SignupLoginRequest):
    result = harness.auth.login_user(req.email, req.password)
    return result


@app.get("/v1/auth/session")
async def auth_session(x_session_token: str = Header("", alias="X-Session-Token")):
    if not x_session_token:
        raise HTTPException(401, "No session token")
    info = harness.auth.get_session_info(x_session_token)
    if info["status"] == "invalid":
        raise HTTPException(401, "Invalid session")
    return info


@app.post("/v1/chat")
async def chat(req: ChatRequest, authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    message = req.message
    if req.model and req.model != "incllmv2":
        personality_prefixes = {
            "trill": "[Trill LLM] ",
            "singularity": "[Singularity LLM] ",
            "splitbit": "[SplitBit LLM] ",
        }
        prefix = personality_prefixes.get(req.model, "")
        if prefix:
            message = f"{prefix}{message}"
    result = await harness.chat(
        user_id=user_info["user_id"], message=message,
        session_id=req.session_id, is_owner=user_info["is_owner"],
        free_access=user_info["free_access"],
    )
    if req.model and req.model != "incllmv2":
        result["model"] = req.model
    return result


@app.post("/v1/chat/stream")
async def chat_stream(req: ChatRequest, authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")

    async def generate():
        async for chunk in harness.chat_stream(
            user_id=user_info["user_id"], message=req.message,
            session_id=req.session_id, is_owner=user_info["is_owner"],
            free_access=user_info["free_access"],
        ):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.get("/v1/subscription/status")
async def subscription_status(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return harness.subscription.get_status(user_info["user_id"])


@app.get("/v1/subscription/pay")
async def subscription_pay(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.get_payment_instructions(user_info["user_id"])


@app.post("/v1/subscription/deposit")
async def subscription_deposit(authorization: str = Header(""), token: str = "USDT"):
    """Create a deposit request routed to the founder's Soulmate OS wallet."""
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.process_payment(user_info["user_id"], token)


@app.post("/v1/subscription/verify")
async def subscription_verify(deposit_id: str, authorization: str = Header("")):
    """Verify a payment status via Soulmate OS API."""
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.verify_payment(deposit_id)


@app.post("/v1/subscription/confirm")
async def subscription_confirm(req: PaymentConfirmRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return harness.subscription.confirm_payment(
        user_info["user_id"], req.method, req.tx_hash, req.amount, req.deposit_id,
    )


@app.post("/v1/learn")
async def learn(authorization: str = Header(""), session_id: str | None = None):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.learn(session_id)


@app.post("/v1/goals/create")
async def create_goal(req: GoalRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.create_goal(req.title, req.description, req.priority, req.deadline, req.tags)


@app.post("/v1/goals/plan")
async def plan_goal(req: GoalActionRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.plan_goal(req.goal_id)


@app.post("/v1/goals/execute-step")
async def execute_goal_step(req: GoalActionRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.execute_goal_step(req.goal_id, req.context)


@app.post("/v1/goals/execute")
async def execute_goal(req: GoalActionRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.execute_goal(req.goal_id, req.context)


@app.get("/v1/goals/list")
async def list_goals(status: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return {"goals": harness.list_goals(status=status)}


@app.post("/v1/api-keys/create")
async def create_api_key(req: APIKeyRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not user_info.get("is_owner"):
        raise HTTPException(403, "Only the owner can create API keys")
    return harness.create_api_key(req.name, req.scopes, req.connected_model, req.rate_limit)


@app.get("/v1/api-keys/list")
async def list_api_keys(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not user_info.get("is_owner"):
        raise HTTPException(403, "Only the owner can list API keys")
    return {"keys": harness.list_api_keys()}


@app.get("/v1/stats")
async def stats():
    return await harness.get_stats()


@app.get("/v1/rlt/stats")
async def rlt_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not harness.rlt:
        return {"status": "disabled", "message": "RLT system is not enabled"}
    return harness.rlt.get_stats()


@app.post("/v1/sync/register")
async def sync_register(payload: dict):
    harness.universal_link.add_peer(
        peer_id=payload.get("instance_id", ""),
        peer_name=payload.get("instance_name", ""),
        metadata=payload.get("metadata"),
    )
    return {"status": "ok", "instance_id": harness.universal_link.instance_id}


@app.post("/v1/sync/share")
async def sync_share(payload: dict):
    received = 0
    for learning in payload.get("learnings", []):
        if harness.universal_link.receive_learning(learning):
            received += 1
    return {"status": "ok", "received": received}


@app.get("/v1/sync/receive")
async def sync_receive(instance_id: str = "", since: float = 0):
    learnings = harness.universal_link.get_learnings_to_share(since=since)
    peers = [{"instance_id": harness.universal_link.instance_id,
              "instance_name": settings.universal_link.instance_name}]
    return {"learnings": learnings, "peers": peers}


def _get_user(authorization: str = "", x_session_token: str = "") -> dict[str, Any] | None:
    token = authorization.replace("Bearer ", "").strip()
    if not token and x_session_token:
        token = x_session_token.strip()
    if not token:
        # Auto-authenticate as founder for local access — no password needed
        result = harness.auth.authenticate_password(settings.auth.secret_password)
        if result.get("status") == "ok":
            return {"user_id": result["user_id"], "is_owner": True,
                    "free_access": True, "is_founder": True}
        return None
    return harness.auth.verify_token(token)


@app.get("/v1/rlos/stats")
async def rlos_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if harness.rlos:
        return harness.rlos.get_stats()
    return {"status": "disabled"}


@app.get("/v1/mesh/stats")
async def mesh_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if harness.mesh_link:
        return harness.mesh_link.get_stats()
    return {"status": "disabled"}


@app.get("/v1/usage")
async def usage_stats(user_id: str = "", authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    uid = user_id or user_info["user_id"]
    return harness.usage.get_user_usage(uid)


@app.get("/v1/usage/export")
async def usage_export(format: str = "json", user_id: str = "", authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    uid = user_id or user_info["user_id"]
    if format == "csv":
        return PlainTextResponse(harness.usage.export_csv(uid), media_type="text/csv")
    return PlainTextResponse(harness.usage.export_json(uid), media_type="application/json")


@app.post("/v1/internet/search")
async def internet_search(req: InternetSearchRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if req.source == "web":
        return await harness.internet.search_web(req.query)
    return await harness.internet.search_wikipedia(req.query)


@app.get("/v1/trading/price")
async def trading_price(symbol: str, platform: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading.get_price(symbol, platform)


@app.get("/v1/trading/orderbook")
async def trading_orderbook(symbol: str, platform: str | None = None,
                            depth: int = 20, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading.get_orderbook(symbol, platform, depth)


@app.get("/v1/trading/candles")
async def trading_candles(symbol: str, timeframe: str = "1h", limit: int = 100,
                          platform: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading.get_candles(symbol, timeframe, limit, platform)


@app.get("/v1/trading/stats")
async def trading_24h(symbol: str, platform: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading.get_24h_stats(symbol, platform)


@app.get("/v1/trading/portfolio")
async def trading_portfolio(platform: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_get_portfolio(platform)


@app.post("/v1/trading/buy")
async def trading_buy(req: TradingBuyRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_buy(req.symbol, req.amount, req.platform, req.order_type, req.price)


@app.post("/v1/trading/sell")
async def trading_sell(req: TradingSellRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_sell(req.symbol, req.amount, req.platform, req.order_type, req.price)


@app.post("/v1/trading/cancel")
async def trading_cancel(req: TradingCancelRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_cancel_order(req.order_id, req.platform)


@app.get("/v1/trading/orders")
async def trading_orders(status: str = "open", platform: str | None = None,
                         authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_get_orders(status, platform)


@app.get("/v1/trading/history")
async def trading_history(limit: int = 50, platform: str | None = None,
                          authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_get_history(limit, platform)


@app.post("/v1/trading/alert")
async def trading_set_alert(req: TradingAlertRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_set_alert(req.symbol, req.condition, req.target, req.platform)


@app.get("/v1/trading/alerts")
async def trading_check_alerts(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    triggered = await harness.trading.check_price_alerts()
    return {"status": "ok", "triggered": triggered}


@app.post("/v1/trading/setup-api-key")
async def trading_setup_api_key(req: TradingApiKeyRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_setup_api_key(req.platform, req.api_key, req.api_secret, req.passphrase)


@app.get("/v1/trading/test-connection")
async def trading_test_connection(platform: str | None = None, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_test_connection(platform)


@app.post("/v1/trading/auto/start")
async def trading_auto_start(req: TradingAutoStartRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_auto_start(req.symbols, req.interval_s, req.platform)


@app.post("/v1/trading/auto/stop")
async def trading_auto_stop(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_auto_stop()


@app.post("/v1/trading/auto/analyze")
async def trading_auto_analyze(symbol: str, platform: str | None = None,
                               authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.trading_auto_analyze(symbol, platform)


@app.post("/v1/telegram/pair")
async def telegram_pair(req: TelegramPairRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    code = harness.telegram.generate_pairing_code(req.inc_llm_user_id)
    return {"status": "ok", "pairing_code": code}


@app.post("/v1/voice/tts")
async def voice_tts(req: VoiceTTSRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.voice.synthesize(req.text)


@app.post("/v1/voice/stt")
async def voice_stt(req: VoiceSTTRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.voice.transcribe(req.audio_path)


# Hidden founder wallet endpoints — not in API docs, not in OpenAPI schema
# Uses non-obvious path pattern. If anyone asks about a wallet on incllmv2,
# the system denies it.

@app.post("/v1/system/unlock", include_in_schema=False)
async def system_unlock(req: WalletUnlockRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return harness.unlock_founder_wallet(req.password)


@app.post("/v1/system/lock", include_in_schema=False)
async def system_lock(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return harness.lock_founder_wallet()


@app.get("/v1/system/balance", include_in_schema=False)
async def system_balance(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.get_founder_wallet_balance()


@app.post("/v1/system/transfer", include_in_schema=False)
async def system_transfer(req: WalletSendRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return await harness.send_from_founder_wallet(req.to_address, req.amount, req.token)


@app.get("/v1/system/history", include_in_schema=False)
async def system_history(limit: int = 50, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return {"status": "ok", "transactions": harness.get_founder_wallet_history(limit)}


@app.get("/v1/tools")
async def list_tools():
    return {"tools": harness.tools.list_tools()}


# === Soulmate OS AI Assistant endpoints ===
# These mirror the /v1/ai/* paths the frontend AIPage expects,
# so incllmv2 can serve as the AI assistant inside Soulmate OS.

class AIChatRequest(BaseModel):
    message: str
    model: str = "incllmv2"


class AIMemoryRequest(BaseModel):
    type: str = "fact"
    content: str
    importance: float = 0.5


@app.post("/v1/ai/chat")
async def ai_chat(req: AIChatRequest, authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Chat endpoint compatible with Soulmate OS frontend AIPage.
    
    Accepts a 'model' field to route to different LLM personalities:
    - incllmv2 (default): standard assistant
    - trill: fast, uncensored, self-improving
    - singularity: analytical, precision-focused
    - splitbit: split-bit compressed, efficient
    """
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    
    # Prepend personality prefix for non-default models
    message = req.message
    if req.model and req.model != "incllmv2":
        personality_prefixes = {
            "trill": "[Trill LLM] ",
            "singularity": "[Singularity LLM] ",
            "splitbit": "[SplitBit LLM] ",
        }
        prefix = personality_prefixes.get(req.model, "")
        if prefix:
            message = f"{prefix}{message}"
    
    result = await harness.chat(
        user_id=user_info["user_id"], message=message,
        session_id=None, is_owner=user_info["is_owner"],
        free_access=user_info["free_access"],
    )
    return {
        "response": result.get("response", ""),
        "model": req.model if req.model != "incllmv2" else result.get("model", "incllmv2"),
        "tools_used": [],
        "status": result.get("status", "ok"),
    }


@app.get("/v1/ai/history")
async def ai_history(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Return recent episodic memory as chat history for the frontend."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    episodes = harness.memory.episodic.get_recent(limit=50)
    history = []
    for ep in episodes:
        history.append({
            "role": "user",
            "content": ep.task_description,
            "model": "incllmv2",
            "date": str(ep.timestamp),
        })
        history.append({
            "role": "assistant",
            "content": ep.key_result,
            "model": "incllmv2",
            "date": str(ep.timestamp),
        })
    return {"history": history}


@app.get("/v1/ai/memory")
async def ai_get_memories(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Return knowledge graph fact nodes as memories for the frontend."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    fact_nodes = harness.memory.graph.get_nodes_by_type("fact")
    memories = []
    for i, node in enumerate(fact_nodes):
        meta = node.metadata or {}
        memories.append({
            "id": i,
            "node_id": node.id,
            "type": meta.get("memory_type", "fact"),
            "content": node.content,
            "importance": meta.get("importance", 0.5),
            "access_count": meta.get("access_count", 0),
        })
    return {"memories": memories}


@app.post("/v1/ai/memory")
async def ai_store_memory(req: AIMemoryRequest, authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Store a new memory as a knowledge graph fact node."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    import time as _time
    fact_id = f"fact:user_{int(_time.time() * 1000)}"
    harness.memory.register_fact(
        fact_id, req.content,
        metadata={"memory_type": req.type, "importance": req.importance, "access_count": 0},
    )
    return {"status": "ok", "id": fact_id}


@app.delete("/v1/ai/memory/{memory_id}")
async def ai_delete_memory(memory_id: str, authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Delete a memory node from the knowledge graph."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    import sqlite3 as _sqlite3
    with _sqlite3.connect(str(harness.memory.graph.db_path)) as conn:
        conn.execute("DELETE FROM nodes WHERE id = ?", (memory_id,))
        conn.execute("DELETE FROM edges WHERE source_id = ? OR target_id = ?", (memory_id, memory_id))
    return {"status": "ok"}


@app.post("/v1/ai/memory/clear")
async def ai_clear_memories(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Clear all fact nodes from the knowledge graph."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    import sqlite3 as _sqlite3
    with _sqlite3.connect(str(harness.memory.graph.db_path)) as conn:
        conn.execute("DELETE FROM nodes WHERE node_type = 'fact'")
        conn.execute(
            "DELETE FROM edges WHERE source_id NOT IN (SELECT id FROM nodes) "
            "OR target_id NOT IN (SELECT id FROM nodes)"
        )
    return {"status": "ok"}


@app.post("/v1/ai/memory/consolidate")
async def ai_consolidate_memories(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Trigger memory consolidation — compress working memory and cleanup old episodes."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    compressed = await harness.memory.maybe_compress()
    cleaned = harness.memory.episodic.cleanup_old()
    return {"status": "ok", "compressed": compressed, "episodes_cleaned": cleaned}


@app.get("/v1/ai/settings")
async def ai_get_settings(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Return current AI settings for the frontend."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return {
        "model": harness.settings.models.base,
        "max_tokens": harness.settings.ollama.max_tokens,
        "temperature": 0.7,
        "memory_enabled": True,
        "cache_enabled": harness.cache is not None,
        "rlos_enabled": harness.rlos is not None,
    }


@app.post("/v1/ai/settings")
async def ai_update_settings(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """Update AI settings (placeholder — settings are config-driven)."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return {"status": "ok"}


@app.get("/v1/ai/tools")
async def ai_list_tools(authorization: str = Header(""), x_session_token: str = Header("", alias="X-Session-Token")):
    """List available tools for the frontend."""
    user_info = _get_user(authorization, x_session_token)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    return {"tools": harness.tools.list_tools()}


# === YouTube Video Understanding ===

class YouTubeAnalyzeRequest(BaseModel):
    url: str
    user_id: str = "youtube_user"


@app.post("/v1/youtube/analyze")
async def youtube_analyze(req: YouTubeAnalyzeRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "youtube"):
        raise HTTPException(503, "YouTube integration not available")
    return await harness.youtube.analyze_video(req.url, req.user_id)


@app.get("/v1/youtube/stats")
async def youtube_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "youtube"):
        raise HTTPException(503, "YouTube integration not available")
    return harness.youtube.get_stats()


# === Plan Mode ===

class PlanRequest(BaseModel):
    request: str
    context: str = ""
    user_id: str = "planner"


@app.post("/v1/planning/plan")
async def create_plan(req: PlanRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "planner"):
        raise HTTPException(503, "Planning not available")
    return await harness.planner.plan(req.request, req.user_id, req.context)


@app.get("/v1/planning/plans")
async def list_plans(status: str = "", authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "planner"):
        raise HTTPException(503, "Planning not available")
    return {"plans": harness.planner.list_plans(status or None)}


@app.get("/v1/planning/plan/{plan_id}")
async def get_plan(plan_id: str, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "planner"):
        raise HTTPException(503, "Planning not available")
    plan = harness.planner.get_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return {"plan": plan}


class PlanReviseRequest(BaseModel):
    feedback: str


@app.post("/v1/planning/plan/{plan_id}/revise")
async def revise_plan(plan_id: str, req: PlanReviseRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "planner"):
        raise HTTPException(503, "Planning not available")
    return await harness.planner.revise_plan(plan_id, req.feedback)


# === Autonomous Execution ===

class ExecutePlanRequest(BaseModel):
    plan_id: str
    mode: str = "foreground"
    user_id: str = "executor"


@app.post("/v1/execution/execute")
async def execute_plan(req: ExecutePlanRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "execution_engine"):
        raise HTTPException(503, "Execution engine not available")
    plan = harness.planner.get_plan(req.plan_id) if hasattr(harness, "planner") else None
    if not plan:
        raise HTTPException(404, "Plan not found")
    return await harness.execution_engine.execute_plan(req.plan_id, plan, req.mode, req.user_id)


@app.get("/v1/execution/progress/{plan_id}")
async def execution_progress(plan_id: str, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "execution_engine"):
        raise HTTPException(503, "Execution engine not available")
    return harness.execution_engine.get_progress(plan_id)


@app.post("/v1/execution/pause/{plan_id}")
async def execution_pause(plan_id: str, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "execution_engine"):
        raise HTTPException(503, "Execution engine not available")
    return await harness.execution_engine.pause_execution(plan_id)


@app.post("/v1/execution/cancel/{plan_id}")
async def execution_cancel(plan_id: str, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "execution_engine"):
        raise HTTPException(503, "Execution engine not available")
    return await harness.execution_engine.cancel_execution(plan_id)


@app.get("/v1/execution/stats")
async def execution_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "execution_engine"):
        raise HTTPException(503, "Execution engine not available")
    return harness.execution_engine.get_stats()


# === Free Server Slots ===

@app.get("/v1/slots/stats")
async def slots_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "slot_manager"):
        raise HTTPException(503, "Slot manager not available")
    return harness.slot_manager.get_stats()


# === Self-Evolving System ===

@app.get("/v1/evolution/status")
async def evolution_status(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "self_evolver"):
        raise HTTPException(503, "Self-evolver not available")
    return harness.self_evolver.get_status()


@app.post("/v1/evolution/cycle")
async def evolution_cycle(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "self_evolver"):
        raise HTTPException(503, "Self-evolver not available")
    return await harness.self_evolver.run_cycle()


@app.get("/v1/evolution/benchmarks")
async def evolution_benchmarks(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "benchmark_tracker"):
        raise HTTPException(503, "Benchmark tracker not available")
    return harness.benchmark_tracker.get_stats()


# === Image Generation ===

class ImageGenRequest(BaseModel):
    prompt: str
    model: str = ""
    width: int = 0
    height: int = 0
    seed: int | None = None
    return_base64: bool = False


@app.post("/v1/image/generate")
async def image_generate(req: ImageGenRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "image_gen"):
        raise HTTPException(503, "Image generation not available")
    return await harness.image_gen.generate(
        prompt=req.prompt, model=req.model, width=req.width, height=req.height,
        seed=req.seed, return_base64=req.return_base64,
    )


@app.get("/v1/image/list")
async def image_list(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "image_gen"):
        raise HTTPException(503, "Image generation not available")
    return {"images": harness.image_gen.list_generated_images()}


@app.get("/v1/image/stats")
async def image_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "image_gen"):
        raise HTTPException(503, "Image generation not available")
    return harness.image_gen.get_stats()


# === Vision ===

class VisionRequest(BaseModel):
    image_path: str | None = None
    image_base64: str | None = None
    prompt: str = "describe"
    model: str = ""
    custom_prompt: str = ""


@app.post("/v1/vision/analyze")
async def vision_analyze(req: VisionRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "vision"):
        raise HTTPException(503, "Vision not available")
    return await harness.vision.analyze(
        image_path=req.image_path, image_base64=req.image_base64,
        prompt=req.prompt, model=req.model, custom_prompt=req.custom_prompt,
    )


@app.get("/v1/vision/stats")
async def vision_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "vision"):
        raise HTTPException(503, "Vision not available")
    return harness.vision.get_stats()


# === Sub-Harnesses ===

@app.get("/v1/sub-harness/stats")
async def sub_harness_stats(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "sub_harness_manager"):
        raise HTTPException(503, "Sub-harness manager not available")
    return harness.sub_harness_manager.get_stats()


@app.get("/v1/sub-harness/list")
async def sub_harness_list(authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    if not hasattr(harness, "sub_harness_manager"):
        raise HTTPException(503, "Sub-harness manager not available")
    return {"harnesses": harness.sub_harness_manager.list_harnesses()}


# === Reverse proxy — forward unhandled /v1/* to main Soulmate OS backend ===
# This lets the incllmv2 server serve the full Soulmate OS frontend by proxying
# any endpoint it doesn't handle itself (wallet, contacts, games, email, SMS,
# social, marketplace, dating, etc.) to the main Soulmate OS backend.

import os as _os
import httpx

_SOULMATE_BACKEND_URL = _os.environ.get(
    "SOULMATE_BACKEND_URL",
    getattr(settings.payment, "soulmate_api_url", "https://191.44.121.29.sslip.io"),
)

# Headers that must not be forwarded as-is (hop-by-hop or added by the proxy)
_HOP_HEADERS = frozenset({
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host",
})


@app.middleware("http")
async def reverse_proxy_middleware(request: Request, call_next):
    """Proxy unhandled /v1/* requests to the main Soulmate OS backend.

    First tries to handle the request locally. If the local server returns 404
    for a /v1/* path, forward it to the main backend.
    """
    path = request.url.path

    # Only proxy /v1/* paths (not /docs, /openapi.json, /assets, /locales, etc.)
    if not path.startswith("/v1/"):
        return await call_next(request)

    # Try local handling first
    response = await call_next(request)

    # If local server returned 404, proxy to main backend
    if response.status_code == 404 and path.startswith("/v1/"):
        # Don't proxy paths that incllmv2 should handle but are genuinely missing
        _NATIVE_PREFIXES = (
            "/v1/ai/", "/v1/auth/password", "/v1/auth/register",
            "/v1/chat", "/v1/subscription/", "/v1/goals/",
            "/v1/api-keys/", "/v1/sync/", "/v1/rlos/", "/v1/mesh/",
            "/v1/usage", "/v1/internet/", "/v1/trading/", "/v1/telegram/",
            "/v1/voice/", "/v1/tools", "/v1/planning/", "/v1/execution/",
            "/v1/slots/", "/v1/evolution/", "/v1/image/", "/v1/vision/",
            "/v1/sub-harness/", "/v1/youtube/", "/v1/soulmovies/",
            "/v1/soultube/", "/v1/qr", "/v1/stats", "/v1/health", "/v1/learn",
            "/v1/system/", "/v1/rlt/",
        )
        for prefix in _NATIVE_PREFIXES:
            if path == prefix.rstrip("/") or path.startswith(prefix):
                return response  # Return the 404 — these are incllmv2's own paths

        # Proxy to main backend
        target_url = f"{_SOULMATE_BACKEND_URL}{path}"
        if request.url.query:
            target_url += f"?{request.url.query}"

        fwd_headers = {}
        for k, v in request.headers.items():
            if k.lower() not in _HOP_HEADERS:
                fwd_headers[k] = v

        body = await request.body()

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.request(
                    method=request.method,
                    url=target_url,
                    headers=fwd_headers,
                    content=body if body else None,
                )
        except httpx.ConnectError:
            from fastapi.responses import JSONResponse as _JR
            return _JR(
                status_code=502,
                content={"detail": f"Cannot reach Soulmate OS backend at {_SOULMATE_BACKEND_URL}"},
            )
        except httpx.TimeoutException:
            from fastapi.responses import JSONResponse as _JR
            return _JR(
                status_code=504,
                content={"detail": "Soulmate OS backend timed out"},
            )

        resp_headers = {}
        for k, v in resp.headers.items():
            if k.lower() not in _HOP_HEADERS and k.lower() != "content-encoding":
                resp_headers[k] = v

        from fastapi.responses import Response as _Response
        return _Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=resp_headers,
            media_type=resp.headers.get("content-type", "application/json"),
        )

    return response


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8547)
