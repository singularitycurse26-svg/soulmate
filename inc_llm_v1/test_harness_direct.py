#!/usr/bin/env python3
"""Test harness.chat directly to see the actual Ollama error."""
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
    # Disable RAG, cache, etc. to isolate the issue
    settings.knowledge.enabled = False
    settings.cache.enabled = False
    settings.universal_link.enabled = False
    settings.universal_link.share_learnings = False
    settings.conversation_skills.enabled = False
    settings.code_skills.enabled = False
    settings.speed_skills.enabled = False
    settings.meta_learner.enabled = False
    settings.gaming_skills.enabled = False

    harness = IncLLMHarness(settings)
    await harness.initialize()

    # First, let's see what messages the harness builds
    message = "Hello, who are you?"
    harness.memory.add_turn("user", message)
    await harness.memory.maybe_compress()
    messages = harness.memory.build_messages()

    print(f"Messages count: {len(messages)}")
    for i, msg in enumerate(messages):
        print(f"  msg[{i}] role={msg['role']} len={len(msg['content'])}")
        if len(msg['content']) > 200:
            print(f"    content (first 200): {msg['content'][:200]!r}")
        else:
            print(f"    content: {msg['content']!r}")

    # Now try the actual Ollama call with these messages
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

    print(f"\nDirect Ollama call with harness messages...")
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
