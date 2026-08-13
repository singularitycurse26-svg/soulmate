"""OpenAI-compatible API endpoint for incllmv2.

This makes incllmv2 accessible to ANY LLM that speaks the OpenAI API protocol.
Larger models (Fable 5, GLM 5.2, Mythos, GPT-4, Claude, etc.) can connect to
incllmv2 by setting it as their base_url with an INC API key.

Endpoints (OpenAI-compatible):
- POST /v1/chat/completions — chat completion (with memory + skills + goals)
- POST /v1/embeddings — embeddings
- GET /v1/models — list available models
- GET /v1/models/{model} — model info

When a larger model sends a chat request:
1. INC-LLM verifies the API key
2. Prefetches relevant context from all memory layers
3. Injects active goals as context
4. Generates a response with full memory enhancement
5. Stores the episode for future learning
6. Shares the learning with peer instances

The larger model gets a memory-enhanced, skill-aware, goal-tracking response
that it couldn't produce alone — because INC-LLM has persistent memory and
universal recursive linking that the larger model doesn't have.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, AsyncIterator

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "incllmv2"
    messages: list[ChatMessage]
    max_tokens: int | None = 128
    temperature: float | None = 0.7
    stream: bool = False
    top_p: float | None = None
    stop: list[str] | None = None
    user: str | None = None


class EmbeddingRequest(BaseModel):
    model: str = "incllmv2"
    input: str
    user: str | None = None


def setup_openai_compat(app, harness, api_key_manager):
    """Set up OpenAI-compatible routes on the FastAPI app."""

    @router.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [
                {"id": "incllmv2", "object": "model", "created": int(time.time()),
                 "owned_by": "incentives"},
                {"id": "incllmv2-fast", "object": "model", "created": int(time.time()),
                 "owned_by": "incentives"},
                {"id": "incllmv2-code", "object": "model", "created": int(time.time()),
                 "owned_by": "incentives"},
            ],
        }

    @router.get("/v1/models/{model_id}")
    async def get_model(model_id: str):
        return {
            "id": model_id, "object": "model", "created": int(time.time()),
            "owned_by": "incentives",
        }

    @router.post("/v1/chat/completions")
    async def chat_completions(req: ChatCompletionRequest, authorization: str = Header("")):
        api_key = _verify_api_key(authorization, api_key_manager, "chat")
        if api_key is None:
            raise HTTPException(401, "Invalid API key. Get one at /v1/api-keys/create")

        await harness.initialize()

        user_msg = ""
        for msg in reversed(req.messages):
            if msg.role == "user":
                user_msg = msg.content
                break

        if not user_msg:
            raise HTTPException(400, "No user message found")

        goal_context = harness.goals.get_goal_context() if harness.goals else ""
        if goal_context:
            user_msg_with_goals = f"{user_msg}\n\n[System Context]\n{goal_context}"
        else:
            user_msg_with_goals = user_msg

        session_id = f"api:{api_key.name}:{uuid.uuid4().hex[:8]}"

        if req.stream:
            async def generate():
                full_response = ""
                async for chunk in harness.chat_stream(
                    user_id=f"api:{api_key.name}",
                    message=user_msg_with_goals,
                    session_id=session_id,
                    is_owner=False, free_access=True,
                ):
                    full_response += chunk
                    chunk_data = {
                        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": req.model,
                        "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                    }
                    yield f"data: {json.dumps(chunk_data)}\n\n"

                final = {
                    "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": req.model,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                }
                yield f"data: {json.dumps(final)}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(generate(), media_type="text/event-stream")

        result = await harness.chat(
            user_id=f"api:{api_key.name}",
            message=user_msg_with_goals,
            session_id=session_id,
            is_owner=False, free_access=True,
        )

        if result.get("status") == "payment_required":
            raise HTTPException(402, result.get("message", "Payment required"))

        response_text = result.get("response", "")

        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": req.model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": result.get("context_used", {}).get("episodes", 0) * 50,
                "completion_tokens": len(response_text) // 4,
                "total_tokens": (result.get("context_used", {}).get("episodes", 0) * 50) + (len(response_text) // 4),
            },
            "inc_llm_metadata": {
                "episode_id": result.get("episode_id"),
                "execution_time_s": result.get("execution_time_s"),
                "context_used": result.get("context_used", {}),
                "api_key_name": api_key.name,
                "connected_model": api_key.connected_model,
            },
        }

    @router.post("/v1/embeddings")
    async def embeddings(req: EmbeddingRequest, authorization: str = Header("")):
        api_key = _verify_api_key(authorization, api_key_manager, "embed")
        if api_key is None:
            raise HTTPException(401, "Invalid API key")

        await harness.initialize()
        try:
            embedding = await harness.bus.embed(input=req.input)
        except Exception as e:
            raise HTTPException(500, f"Embedding failed: {e}")

        return {
            "object": "list",
            "data": [{
                "object": "embedding",
                "embedding": embedding,
                "index": 0,
            }],
            "model": req.model,
            "usage": {"prompt_tokens": len(req.input) // 4, "total_tokens": len(req.input) // 4},
        }

    app.include_router(router)


def _verify_api_key(authorization: str, api_key_manager, required_scope: str):
    """Extract and verify API key from Authorization header."""
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None
    return api_key_manager.verify_key(token, required_scope=required_scope)
