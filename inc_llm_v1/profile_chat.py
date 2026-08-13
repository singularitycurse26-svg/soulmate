#!/usr/bin/env python3
"""Profile harness.chat to find the bottleneck."""
import asyncio
import os
import sys
import time

sys.path.insert(0, ".")

os.environ["INC_LLM_SECRET_PASSWORD"] = "soulmate"
os.environ["INC_LLM_RLOS_ENABLED"] = "false"

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness

async def main():
    settings = Settings.from_env()
    harness = IncLLMHarness(settings)
    await harness.initialize()

    message = "What is the capital of France? One word."

    # Profile each step
    t0 = time.time()
    context = await harness.memory.prefetch_context(message)
    t1 = time.time()
    print(f"prefetch_context: {t1-t0:.2f}s (eps={len(context['episodes'])}, skills={len(context['skills'])}, facts={len(context['facts'])})")

    # RAG
    if harness.rag:
        try:
            rag_results = await harness.rag.retrieve(message)
            rag_text = harness.rag.format_for_context(rag_results)
            t2 = time.time()
            print(f"rag.retrieve: {t2-t1:.2f}s (results={len(rag_results)}, text={len(rag_text)} chars)")
        except Exception as e:
            t2 = time.time()
            print(f"rag.retrieve: {t2-t1:.2f}s (FAILED: {e})")
    else:
        t2 = t1

    # Memory add turn + compress
    harness.memory.add_turn("user", message)
    await harness.memory.maybe_compress()
    messages = harness.memory.build_messages()
    t3 = time.time()
    total_chars = sum(len(m['content']) for m in messages)
    print(f"build_messages: {t3-t2:.2f}s ({len(messages)} msgs, {total_chars} chars, ~{total_chars//4} tokens)")

    # Cache lookup
    if harness.cache:
        try:
            query_embedding = await harness.bus.embed(input=message)
            cached = await harness.cache.lookup(message, query_embedding=query_embedding)
            t4 = time.time()
            print(f"cache.lookup: {t4-t3:.2f}s (cached={cached is not None})")
        except Exception as e:
            t4 = time.time()
            print(f"cache.lookup: {t4-t3:.2f}s (FAILED: {e})")
    else:
        t4 = t3

    # Model call
    max_tokens = settings.ollama.max_tokens
    response = await harness.bus.complete(role="base", messages=messages, max_tokens=max_tokens, temperature=0.7)
    t5 = time.time()
    print(f"model.complete: {t5-t4:.2f}s (response={response.get('content', '')[:80]})")

    # Memory sync
    harness.memory.add_turn("assistant", response.get("content", ""))
    episode_id = await harness.memory.sync_after_turn(
        session_id="test", query=message, result=response.get("content", ""),
        success=True, execution_time_s=t5-t4,
    )
    t6 = time.time()
    print(f"sync_after_turn: {t6-t5:.2f}s (episode_id={episode_id})")

    print(f"\nTOTAL: {t6-t0:.2f}s")

asyncio.run(main())
