"""INC-LLM-v1 FastAPI server.

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
"""

from __future__ import annotations

import json
import logging
import logging.config
import time
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness
from inc_llm.openai_compat import setup_openai_compat

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

app = FastAPI(title="INC-LLM-v1", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings = Settings.from_env()
harness = IncLLMHarness(settings)
setup_openai_compat(app, harness, harness.api_keys)


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class PasswordRequest(BaseModel):
    password: str


class RegisterRequest(BaseModel):
    email: str


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


@app.on_event("startup")
async def startup():
    await harness.initialize()
    logger.info("INC-LLM-v1 server started")


@app.on_event("shutdown")
async def shutdown():
    await harness.close()


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
    result = await harness.register_user(req.email)
    return result


@app.post("/v1/chat")
async def chat(req: ChatRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
    if user_info is None:
        raise HTTPException(401, "Invalid or missing token")
    result = await harness.chat(
        user_id=user_info["user_id"], message=req.message,
        session_id=req.session_id, is_owner=user_info["is_owner"],
        free_access=user_info["free_access"],
    )
    return result


@app.post("/v1/chat/stream")
async def chat_stream(req: ChatRequest, authorization: str = Header("")):
    user_info = _get_user(authorization)
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


def _get_user(authorization: str) -> dict[str, Any] | None:
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None
    return harness.auth.verify_token(token)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8547)
