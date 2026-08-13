"""Image generation integration using Pollinations.ai — free, no API key required.

Generates images from text prompts using the Pollinations.ai URL-based API.
Simply constructs a URL with the prompt and optional parameters, then downloads
the generated image. No GPU required — generation happens on Pollinations servers.

Endpoint: https://image.pollinations.ai/prompt/{encoded_prompt}?width=W&height=H&seed=S&model=M&nologo=true

Supported models: flux, flux-realism, flux-anime, flux-3d, any-dark, turbo
Default model: flux (best quality, free)
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import time
import urllib.parse
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"

AVAILABLE_MODELS = [
    "flux",
    "flux-realism",
    "flux-anime",
    "flux-3d",
    "any-dark",
    "turbo",
]

DEFAULT_MODEL = "flux"
DEFAULT_WIDTH = 1024
DEFAULT_HEIGHT = 1024


class ImageGenerationIntegration:
    """Image generation via Pollinations.ai — free, no API key, no GPU required."""

    def __init__(
        self,
        output_dir: str = "~/.inc_llm/images",
        default_model: str = DEFAULT_MODEL,
        default_width: int = DEFAULT_WIDTH,
        default_height: int = DEFAULT_HEIGHT,
        timeout_s: int = 60,
    ) -> None:
        self.output_dir = Path(os.path.expanduser(output_dir))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.default_model = default_model
        self.default_width = default_width
        self.default_height = default_height
        self.timeout_s = timeout_s
        self._stats = {
            "total_generated": 0,
            "total_errors": 0,
            "total_time_s": 0.0,
            "by_model": {},
        }

    async def generate(
        self,
        prompt: str,
        model: str = "",
        width: int = 0,
        height: int = 0,
        seed: int | None = None,
        nologo: bool = True,
        save_to_disk: bool = True,
        return_base64: bool = False,
    ) -> dict[str, Any]:
        """Generate an image from a text prompt."""
        t0 = time.time()
        model = model or self.default_model
        width = width or self.default_width
        height = height or self.default_height

        encoded_prompt = urllib.parse.quote(prompt, safe="")
        params = []
        params.append(f"width={width}")
        params.append(f"height={height}")
        params.append(f"model={model}")
        if seed is not None:
            params.append(f"seed={seed}")
        if nologo:
            params.append("nologo=true")

        url = f"{POLLINATIONS_BASE}/{encoded_prompt}?{'&'.join(params)}"

        try:
            image_data = await self._download_image(url)

            result: dict[str, Any] = {
                "status": "ok",
                "prompt": prompt,
                "model": model,
                "width": width,
                "height": height,
                "url": url,
                "size_bytes": len(image_data),
                "generation_time_s": round(time.time() - t0, 2),
            }

            if save_to_disk:
                filename = self._generate_filename(prompt, model)
                filepath = self.output_dir / filename
                await asyncio.to_thread(filepath.write_bytes, image_data)
                result["filepath"] = str(filepath)
                result["filename"] = filename

            if return_base64:
                result["base64"] = base64.b64encode(image_data).decode("ascii")

            self._stats["total_generated"] += 1
            self._stats["total_time_s"] += (time.time() - t0)
            model_key = model
            self._stats["by_model"][model_key] = self._stats["by_model"].get(model_key, 0) + 1

            return result

        except Exception as e:
            self._stats["total_errors"] += 1
            logger.warning("Image generation failed: %s", e)
            return {"status": "error", "error": str(e), "prompt": prompt, "url": url}

    async def generate_batch(
        self,
        prompts: list[str],
        model: str = "",
        width: int = 0,
        height: int = 0,
    ) -> list[dict[str, Any]]:
        """Generate multiple images in parallel."""
        tasks = [
            self.generate(prompt, model=model, width=width, height=height)
            for prompt in prompts
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)

    async def _download_image(self, url: str) -> bytes:
        """Download image from URL using aiohttp."""
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=self.timeout_s),
                ssl=False,
            ) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Pollinations API returned status {resp.status}")
                return await resp.read()

    @staticmethod
    def _generate_filename(prompt: str, model: str) -> str:
        """Generate a unique filename from prompt and model."""
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()[:12]
        timestamp = int(time.time())
        return f"{prompt_hash}_{model}_{timestamp}.png"

    def list_generated_images(self) -> list[dict[str, Any]]:
        """List all generated images in the output directory."""
        images = []
        for filepath in sorted(self.output_dir.iterdir()):
            if filepath.is_file() and filepath.suffix in (".png", ".jpg", ".jpeg", ".webp"):
                stat = filepath.stat()
                images.append({
                    "filename": filepath.name,
                    "filepath": str(filepath),
                    "size_bytes": stat.st_size,
                    "created_at": stat.st_ctime,
                })
        return images

    def get_stats(self) -> dict[str, Any]:
        avg_time = (
            self._stats["total_time_s"] / self._stats["total_generated"]
            if self._stats["total_generated"] > 0
            else 0.0
        )
        return {
            **self._stats,
            "avg_generation_time_s": round(avg_time, 2),
            "output_dir": str(self.output_dir),
            "available_models": AVAILABLE_MODELS,
        }
