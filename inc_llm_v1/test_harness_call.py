#!/usr/bin/env python3
"""Call harness.chat directly to reproduce the 400 error."""
import asyncio
import os
import sys

sys.path.insert(0, ".")

os.environ["INC_LLM_SECRET_PASSWORD"] = "soulmate"
os.environ["INC_LLM_RLOS_ENABLED"] = "false"

from inc_llm.config import Settings
from inc_llm.harness import IncLLMHarness

async def main():
    settings = Settings.from_env()
    harness = IncLLMHarness(settings)
    await harness.initialize()

    print("Calling harness.chat directly...")
    result = await harness.chat(
        user_id="founder",
        message="Hello, who are you?",
        session_id=None,
        is_owner=True,
        free_access=True,
    )
    print(f"Result keys: {list(result.keys())}")
    print(f"Status: {result.get('status')}")
    print(f"Response: {str(result.get('response', ''))[:300]}")

asyncio.run(main())
