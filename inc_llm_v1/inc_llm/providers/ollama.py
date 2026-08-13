"""Ollama provider — connects to a local Ollama server."""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.request
import urllib.error
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
        self.num_thread = getattr(config, "num_thread", 0)
        self.num_batch = getattr(config, "num_batch", 512)
        self.num_gpu = getattr(config, "num_gpu", 0)
        self.mmap = getattr(config, "mmap", True)

    async def complete(self, model: str, messages: list[dict[str, str]],
                       max_tokens: int = 128, temperature: float = 0.7,
                       stop: list[str] | None = None) -> dict[str, str]:
        # Trim messages to fit within num_ctx (leave room for max_tokens response)
        messages = self._trim_messages(messages, max_tokens or self.num_predict)

        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens or self.num_predict,
                "temperature": temperature or self.temperature,
                "num_ctx": self.num_ctx,
                "num_thread": self.num_thread,
                "num_batch": self.num_batch,
                "num_gpu": self.num_gpu,
                "mmap": self.mmap,
            },
            "keep_alive": f"{self.keep_alive_s}s",
        }).encode()

        def _do_request():
            req = urllib.request.Request(
                f"{self.base_url}/api/chat",
                data=body,
                headers={"Content-Type": "application/json"},
            )
            try:
                resp = urllib.request.urlopen(req, timeout=self.timeout_s)
                return json.loads(resp.read().decode())
            except urllib.error.HTTPError as e:
                err_body = e.read().decode()
                import sys
                print(f"OLLAMA ERROR {e.code}: {err_body[:500]}", file=sys.stderr, flush=True)
                print(f"OLLAMA model={model}, messages={len(messages)}, body_size={len(body)}", file=sys.stderr, flush=True)
                for i, msg in enumerate(messages):
                    print(f"  msg[{i}] role={msg['role']} len={len(msg['content'])} content={msg['content'][:100]!r}", file=sys.stderr, flush=True)
                logger.error("Ollama API error %d: %s", e.code, err_body[:500])
                raise

        data = await asyncio.to_thread(_do_request)
        content = data.get("message", {}).get("content", "")
        return {"content": content, "model": data.get("model", model), "raw": data}

    def _trim_messages(self, messages: list[dict[str, str]], max_tokens: int) -> list[dict[str, str]]:
        """Trim messages to fit within num_ctx, leaving room for the response."""
        budget = self.num_ctx - max_tokens
        total_tokens = sum(max(1, len(m["content"]) // 4) for m in messages)
        if total_tokens <= budget:
            return messages

        # Keep system prompt (first msg) and last user message; trim middle
        system = messages[0] if messages and messages[0]["role"] == "system" else None
        rest = messages[1:] if system else messages[:]

        # Always keep the last message (user's current input)
        if not rest:
            return messages
        last = rest[-1]
        middle = rest[:-1]

        system_tokens = max(1, len(system["content"]) // 4) if system else 0
        last_tokens = max(1, len(last["content"]) // 4)
        middle_budget = budget - system_tokens - last_tokens

        if middle_budget <= 0:
            # System prompt + last message already exceeds budget — trim system prompt
            if system:
                max_system_chars = max(200, budget - last_tokens) * 4
                system = {**system, "content": system["content"][:max_system_chars]}
            return ([system, last] if system else [last])

        # Keep as many middle messages as fit, prioritizing most recent
        kept_middle = []
        used = 0
        for msg in reversed(middle):
            msg_tokens = max(1, len(msg["content"]) // 4)
            if used + msg_tokens > middle_budget:
                break
            kept_middle.insert(0, msg)
            used += msg_tokens

        result = []
        if system:
            result.append(system)
        result.extend(kept_middle)
        result.append(last)
        return result

    async def stream_complete(self, model: str, messages: list[dict[str, str]],
                              max_tokens: int = 128, temperature: float = 0.7,
                              stop: list[str] | None = None) -> AsyncIterator[str]:
        # Trim messages to fit within num_ctx (leave room for max_tokens response)
        messages = self._trim_messages(messages, max_tokens or self.num_predict)

        body = json.dumps({
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "num_predict": max_tokens or self.num_predict,
                "temperature": temperature or self.temperature,
                "num_ctx": self.num_ctx,
                "num_thread": self.num_thread,
                "num_batch": self.num_batch,
                "num_gpu": self.num_gpu,
                "mmap": self.mmap,
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
