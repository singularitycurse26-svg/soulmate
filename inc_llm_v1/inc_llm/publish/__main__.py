"""CLI entry point for publishing INC-LLM-v1 to HuggingFace Hub.

Usage:
    set HF_TOKEN=your_token
    python -m inc_llm.publish
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys

from inc_llm.config import Settings
from inc_llm.publish.hf_publish import HuggingFacePublisher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    settings = Settings.from_env()
    publisher = HuggingFacePublisher(settings.publish)

    if not publisher.check_token():
        logger.error("No HF_TOKEN environment variable set.")
        sys.exit(1)

    source_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logger.info("Publishing INC-LLM-v1 to HuggingFace Hub...")
    result = await publisher.publish_all(source_dir)

    model_result = result.get("model", {})
    knowledge_result = result.get("knowledge", {})
    sdist_result = result.get("sdist", {})

    if model_result.get("status") == "ok":
        logger.info("Model published: %s", model_result.get("url"))
    else:
        logger.error("Model publish failed: %s", model_result.get("error"))

    if knowledge_result.get("status") == "ok":
        logger.info("Knowledge dataset published: %s (%d domains)",
                     knowledge_result.get("url"), knowledge_result.get("domains"))
    else:
        logger.error("Knowledge publish failed: %s", knowledge_result.get("error"))

    if sdist_result.get("status") == "ok":
        logger.info("Source distribution published: %s", sdist_result.get("url"))
        logger.info("Install with: pip install https://huggingface.co/hermescures1/inc-llm-v1/resolve/main/inc-llm-v1-1.0.0.tar.gz")
    else:
        logger.error("Source distribution publish failed: %s", sdist_result.get("error"))


if __name__ == "__main__":
    asyncio.run(main())
