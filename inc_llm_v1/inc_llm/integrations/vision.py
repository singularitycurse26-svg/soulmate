"""Vision integration using Ollama vision models — CPU-friendly image understanding.

Supports moondream2 (1.9B params, CPU-friendly) and llava (larger, fallback).
Images are sent to the Ollama API as base64-encoded data alongside a text prompt.

The Ollama API supports images via the 'images' field in the chat request:
{
  "model": "moondream2",
  "messages": [{"role": "user", "content": "Describe this image", "images": ["base64..."]}]
}

No GPU required — moondream2 runs on CPU. Works with any image format Ollama supports.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_VISION_MODEL = "moondream2"
FALLBACK_VISION_MODEL = "llava"

VISION_PROMPTS = {
    "describe": "Describe this image in detail. What do you see?",
    "analyze": "Analyze this image. What are the key elements, colors, composition, and mood?",
    "extract_text": "Extract all text visible in this image. Return only the text, preserving layout.",
    "identify_objects": "List all objects you can identify in this image. Be specific.",
    "count": "Count the number of distinct objects in this image. List each one.",
    "summarize": "Provide a brief one-sentence summary of this image.",
    "code_from_image": "If this image contains code, transcribe it exactly. If not, describe what you see.",
    "diagram_explain": "If this image is a diagram or chart, explain what it shows step by step.",
}


class VisionIntegration:
    """Image understanding via Ollama vision models — CPU-friendly, no GPU required."""

    def __init__(
        self,
        ollama_host: str = "localhost",
        ollama_port: int = 11434,
        default_model: str = DEFAULT_VISION_MODEL,
        fallback_model: str = FALLBACK_VISION_MODEL,
        max_image_size_mb: float = 10.0,
        auto_pull_models: bool = True,
    ) -> None:
        self.ollama_host = ollama_host
        self.ollama_port = ollama_port
        self.base_url = f"http://{ollama_host}:{ollama_port}"
        self.default_model = default_model
        self.fallback_model = fallback_model
        self.max_image_size_mb = max_image_size_mb
        self.auto_pull_models = auto_pull_models
        self._stats = {
            "total_analyzed": 0,
            "total_errors": 0,
            "by_model": {},
            "by_task": {},
            "total_time_s": 0.0,
        }

    async def analyze(
        self,
        image_path: str | None = None,
        image_base64: str | None = None,
        prompt: str = "describe",
        model: str = "",
        custom_prompt: str = "",
    ) -> dict[str, Any]:
        """Analyze an image with a vision model.

        Args:
            image_path: Path to image file (mutually exclusive with image_base64)
            image_base64: Base64-encoded image data
            prompt: Preset prompt type (describe, analyze, extract_text, etc.)
            model: Vision model to use (defaults to moondream2)
            custom_prompt: Custom prompt text (overrides preset)
        """
        import time as _time
        t0 = _time.time()
        model = model or self.default_model

        if custom_prompt:
            prompt_text = custom_prompt
        else:
            prompt_text = VISION_PROMPTS.get(prompt, VISION_PROMPTS["describe"])

        if image_path:
            img_b64 = await self._load_and_encode_image(image_path)
        elif image_base64:
            img_b64 = image_base64
        else:
            return {"status": "error", "error": "Either image_path or image_base64 must be provided"}

        try:
            result = await self._query_vision_model(model, prompt_text, img_b64)

            if not result.get("success") and model != self.fallback_model:
                logger.info("Falling back to %s", self.fallback_model)
                if self.auto_pull_models:
                    await self._ensure_model_available(self.fallback_model)
                result = await self._query_vision_model(self.fallback_model, prompt_text, img_b64)
                model = self.fallback_model

            elapsed = _time.time() - t0
            self._stats["total_analyzed"] += 1
            self._stats["total_time_s"] += elapsed
            self._stats["by_model"][model] = self._stats["by_model"].get(model, 0) + 1
            self._stats["by_task"][prompt] = self._stats["by_task"].get(prompt, 0) + 1

            if result.get("success"):
                return {
                    "status": "ok",
                    "model": model,
                    "prompt_type": prompt,
                    "description": result.get("response", ""),
                    "analysis_time_s": round(elapsed, 2),
                }
            else:
                self._stats["total_errors"] += 1
                return {"status": "error", "error": result.get("error", "Unknown"), "model": model}

        except Exception as e:
            self._stats["total_errors"] += 1
            logger.warning("Vision analysis failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def describe(self, image_path: str | None = None, image_base64: str | None = None) -> dict[str, Any]:
        """Convenience method — describe an image."""
        return await self.analyze(image_path=image_path, image_base64=image_base64, prompt="describe")

    async def extract_text(self, image_path: str | None = None, image_base64: str | None = None) -> dict[str, Any]:
        """Convenience method — extract text from an image (OCR-like)."""
        return await self.analyze(image_path=image_path, image_base64=image_base64, prompt="extract_text")

    async def identify_objects(self, image_path: str | None = None, image_base64: str | None = None) -> dict[str, Any]:
        """Convenience method — identify objects in an image."""
        return await self.analyze(image_path=image_path, image_base64=image_base64, prompt="identify_objects")

    async def _load_and_encode_image(self, image_path: str) -> str:
        """Load an image file and return base64-encoded data."""
        path = Path(os.path.expanduser(image_path))
        if not path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")

        size_mb = path.stat().st_size / (1024 * 1024)
        if size_mb > self.max_image_size_mb:
            raise ValueError(f"Image too large: {size_mb:.1f}MB (max {self.max_image_size_mb}MB)")

        def _read():
            return path.read_bytes()

        data = await asyncio.to_thread(_read)
        return base64.b64encode(data).decode("ascii")

    async def _query_vision_model(self, model: str, prompt: str, image_b64: str) -> dict[str, Any]:
        """Query an Ollama vision model with an image and prompt."""
        import aiohttp

        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                    "images": [image_b64],
                }
            ],
            "stream": False,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=120),
                    ssl=False,
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        return {"success": False, "error": f"Ollama API status {resp.status}: {text[:200]}"}

                    data = await resp.json()
                    message = data.get("message", {})
                    response_text = message.get("content", "")
                    return {"success": True, "response": response_text}

        except aiohttp.ClientConnectorError:
            return {"success": False, "error": f"Cannot connect to Ollama at {self.base_url}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _ensure_model_available(self, model: str) -> None:
        """Check if a model is available, pull if not."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/api/tags",
                    timeout=aiohttp.ClientTimeout(total=10),
                    ssl=False,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        models = [m.get("name", "") for m in data.get("models", [])]
                        if model not in models and f"{model}:latest" not in models:
                            logger.info("Pulling vision model: %s", model)
                            await self._pull_model(model)
        except Exception:
            pass

    async def _pull_model(self, model: str) -> None:
        """Pull a model from Ollama registry."""
        import aiohttp

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/api/pull",
                    json={"name": model},
                    timeout=aiohttp.ClientTimeout(total=600),
                    ssl=False,
                ) as resp:
                    async for _line in resp.content:
                        pass
            logger.info("Pulled model: %s", model)
        except Exception as e:
            logger.warning("Failed to pull model %s: %s", model, e)

    def list_available_prompts(self) -> dict[str, str]:
        """List all available preset prompt types."""
        return dict(VISION_PROMPTS)

    def get_stats(self) -> dict[str, Any]:
        avg_time = (
            self._stats["total_time_s"] / self._stats["total_analyzed"]
            if self._stats["total_analyzed"] > 0
            else 0.0
        )
        return {
            **self._stats,
            "avg_analysis_time_s": round(avg_time, 2),
            "default_model": self.default_model,
            "fallback_model": self.fallback_model,
            "available_prompts": list(VISION_PROMPTS.keys()),
        }
