"""Ollama provider — connects to a local Ollama server."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.request
from typing import AsyncIterator

from inc_llm.providers.base import ModelProvider

logger = logging.getLogger(__name__)


class OllamaProvider(ModelProvider):
    """Ollama-based model provider."""

    def __init__(self, config) -> None:
        self.base_url = config.base_url
        self.timeout_s = config.timeout_s
        self.num_predict = getattr(config, "num_predict", 128)
        self.num_ctx = getattr(config, "num_ctx", 2048)
        self.temperature = getattr(config, "temperature", 0.7)
        self.keep_alive_s = getattr(config, "keep_alive_s", 300)

    async def complete(self, model: str, messages: list[dict[str, str]],
                       max_tokens: int = 128, temperature: float = 0.7,
                       stop: list[str] | None = None) -> dict[str, str]:
        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens or self.num_predict,
                "temperature": temperature or self.temperature,
                "num_ctx": self.num_ctx,
            },
            "keep_alive": f"{self.keep_alive_s}s",
        }).encode()

        def _do_request():
            req = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            resp = urllib.request.urlopen(req, timeout=self.timeout_s)
            return json.loads(resp.read().decode())

        data = await asyncio.to_thread(_do_request)
        content = data.get("message", {}).get("content", "")
        return {"content": content, "model": data.get("model", model), "raw": data}

    async def stream_complete(self, model: str, messages: list[dict[str, str]],
                              max_tokens: int = 128, temperature: float = 0.7,
                              stop: list[str] | None = None) -> AsyncIterator[str]:
        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "num_predict": max_tokens or self.num_predict,
                "temperature": temperature or self.temperature,
                "num_ctx": self.num_ctx,
            },
            "keep_alive": f"{self.keep_alive_s}s",
        }).encode()

        def _do_stream():
            req = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            resp = urllib.request.urlopen(req, timeout=self.timeout_s)
            for line in resp:
                line_str = line.decode().strip()
                if line_str:
                    data = json.loads(line_str)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break

        import threading
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        def _run_stream():
            try:
                for chunk in _do_stream():
                    asyncio.run_coroutine_threadsafe(queue.put(chunk), loop)
                asyncio.run_coroutine_threadsafe(queue.put(None), loop)
            except Exception as e:
                asyncio.run_coroutine_threadsafe(queue.put(e), loop)

        thread = threading.Thread(target=_run_stream, daemon=True)
        thread.start()

        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                raise item
            yield item

    async def embed(self, model: str, input: str) -> list[float]:
        body = json.dumps({"model": model, "input": input}).encode()

        def _do_embed():
            req = urllib.request.Request(
                f"{self.base_url}/api/embed",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            resp = urllib.request.urlopen(req, timeout=self.timeout_s)
            return json.loads(resp.read().decode())

        data = await asyncio.to_thread(_do_embed)
        embeddings = data.get("embeddings", [])
        return embeddings[0] if embeddings else []

    async def healthcheck(self) -> tuple[bool, str]:
        def _check():
            try:
                req = urllib.request.Request(f"{self.base_url}/api/tags")
                resp = urllib.request.urlopen(req, timeout=5)
                data = json.loads(resp.read().decode())
                models = [m.get("name", "") for m in data.get("models", [])]
                return True, f"Ollama running with {len(models)} models"
            except Exception as e:
                return False, str(e)

        return await asyncio.to_thread(_check)

    async def list_models(self) -> list[str]:
        def _list():
            req = urllib.request.Request(f"{self.base_url}/api/tags")
            resp = urllib.request.urlopen(req, timeout=5)
            data = json.loads(resp.read().decode())
            return [m.get("name", "") for m in data.get("models", [])]

        return await asyncio.to_thread(_list)
