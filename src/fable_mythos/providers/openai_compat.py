"""OpenAI-compatible API provider.

Works with any endpoint that implements the OpenAI chat completions API:
OpenAI, OpenRouter, LM Studio, vLLM, llama-cpp-python server, etc.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

import httpx

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider:
    """Provider for any OpenAI-compatible API endpoint."""

    def __init__(
        self,
        base_url: str = "https://api.openai.com/v1",
        api_key: str = "",
        timeout_s: float = 60.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout_s = timeout_s
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(self.timeout_s, connect=10.0),
            )
        return self._client

    async def complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> dict[str, str]:
        payload: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False,
        }
        if stop:
            payload["stop"] = stop

        response = await self.client.post("/chat/completions", json=payload)
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"content": content}

    async def stream_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> AsyncIterator[str]:
        payload: dict = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True,
        }
        if stop:
            payload["stop"] = stop

        async with self.client.stream("POST", "/chat/completions", json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str.strip() == "[DONE]":
                    break
                import json

                try:
                    chunk = json.loads(data_str)
                    content = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue

    async def embed(
        self,
        *,
        model: str,
        input: str,
    ) -> list[float]:
        payload = {"model": model, "input": input}
        response = await self.client.post("/embeddings", json=payload)
        response.raise_for_status()
        data = response.json()
        return data.get("data", [{}])[0].get("embedding", [])

    async def list_models(self) -> list[str]:
        response = await self.client.get("/models")
        response.raise_for_status()
        data = response.json()
        return [m["id"] for m in data.get("data", [])]

    async def healthcheck(self) -> tuple[bool, str]:
        try:
            response = await self.client.get("/models", timeout=5.0)
            if response.status_code == 200:
                count = len(response.json().get("data", []))
                return True, f"OpenAI-compatible API reachable, {count} models"
            return False, f"API returned status {response.status_code}"
        except Exception as e:
            return False, f"API not reachable: {e}"

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()
