#!/usr/bin/env python3
"""Test harness.chat with full pipeline (RAG, cache enabled) to reproduce 400 error."""
import asyncio
import json
import os
import sys
import urllib.request
import urllib.error

sys.path.insert(0, ".")

os.environ["INC_LLM_SECRET_PASSWORD"] = "soulmate"
os.environ["INC_LLM_RLOS_ENABLED"] = "false"

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness

async def main():
    settings = Settings.from_env()
    # Keep RAG and cache enabled (same as server)
    harness = IncLLMHarness(settings)
    await harness.initialize()

    print(f"RAG enabled: {harness.rag is not None}")
    print(f"Cache enabled: {harness.cache is not None}")

    # Simulate what the /v1/ai/chat endpoint does
    message = "Hello, who are you?"

    # Check RAG retrieval
    if harness.rag:
        try:
            rag_results = await harness.rag.retrieve(message)
            rag_text = harness.rag.format_for_context(rag_results)
            print(f"RAG results: {len(rag_results)} items")
            print(f"RAG text length: {len(rag_text)} chars")
            if rag_text:
                message = f"{message}\n\n[Knowledge Context]\n{rag_text}"
                print(f"Modified message length: {len(message)} chars")
        except Exception as e:
            print(f"RAG retrieval failed: {e}")

    # Check cache embed
    if harness.cache:
        try:
            query_embedding = await harness.bus.embed(input=message)
            print(f"Embedding length: {len(query_embedding)}")
        except Exception as e:
            print(f"Embed failed: {e}")
            # This might be the issue — embed model might not exist

    # Now build messages and check
    harness.memory.add_turn("user", message)
    await harness.memory.maybe_compress()
    messages = harness.memory.build_messages()

    print(f"\nMessages count: {len(messages)}")
    total_chars = sum(len(m['content']) for m in messages)
    print(f"Total chars: {total_chars}, estimated tokens: {total_chars // 4}")
    for i, msg in enumerate(messages):
        print(f"  msg[{i}] role={msg['role']} len={len(msg['content'])}")

    # Try the actual Ollama call
    body = json.dumps({
        "model": settings.models.base,
        "messages": messages,
        "stream": False,
        "options": {
            "num_predict": settings.ollama.max_tokens,
            "temperature": 0.7,
            "num_ctx": settings.ollama.num_ctx,
        },
        "keep_alive": "300s",
    }).encode()

    print(f"\nDirect Ollama call...")
    print(f"Body size: {len(body)} bytes")

    req = urllib.request.Request(
        f"{settings.ollama.base_url}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        data = json.loads(resp.read().decode())
        print(f"Success! Response: {data.get('message', {}).get('content', '')[:200]}")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"HTTP {e.code}: {err_body[:500]}")

asyncio.run(main())
