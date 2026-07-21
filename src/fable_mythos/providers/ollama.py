"""Ollama local model provider.

Real integration with Ollama's HTTP API (http://127.0.0.1:11434).
Supports completions, streaming, embeddings, model listing, and health checks.
Zero API keys, zero cloud — 100% local.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import httpx

from fable_mythos.config import OllamaConfig

logger = logging.getLogger(__name__)


class OllamaProvider:
    """Ollama local model provider — communicates with Ollama's REST API."""

    def __init__(self, config: OllamaConfig | None = None) -> None:
        self.config = config or OllamaConfig()
        self._client: httpx.AsyncClient | None = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Lazy-init the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=httpx.Timeout(self.config.timeout_s, connect=10.0),
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
        """Generate a chat completion via Ollama's /api/chat endpoint.

        Args:
            model: Ollama model name (e.g. "qwen2.5:14b")
            messages: List of {"role": ..., "content": ...} dicts
            max_tokens: Maximum tokens to generate (mapped to Ollama's num_predict)
            temperature: Sampling temperature (0.0 = deterministic, 1.0 = creative)
            stop: Optional stop sequences

        Returns:
            Dict with "content" key containing the generated text.

        Raises:
            httpx.HTTPStatusError: If Ollama returns an error status.
            httpx.ConnectError: If Ollama is not running.
        """
        payload: dict = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }
        if stop:
            payload["options"]["stop"] = stop

        try:
            response = await self.client.post("/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()
            content = data.get("message", {}).get("content", "")
            if not content:
                logger.warning("Ollama returned empty content for model=%s", model)
            return {"content": content}
        except httpx.ConnectError as e:
            logger.error("Cannot connect to Ollama at %s: %s", self.config.base_url, e)
            raise ConnectionError(
                f"Ollama is not running at {self.config.base_url}. "
                "Start it with: ollama serve"
            ) from e
        except httpx.HTTPStatusError as e:
            logger.error("Ollama API error for model=%s: %s %s", model, e.response.status_code, e.response.text)
            raise

    async def stream_complete(
        self,
        *,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        temperature: float = 0.2,
        stop: list[str] | None = None,
    ) -> AsyncIterator[str]:
        """Stream a chat completion via Ollama's /api/chat endpoint.

        Yields text chunks as they arrive from the model.
        """
        payload: dict = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "num_predict": max_tokens,
                "temperature": temperature,
            },
        }
        if stop:
            payload["options"]["stop"] = stop

        try:
            async with self.client.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        logger.debug("Skipping unparseable stream line: %s", line[:100])
                        continue

                    if chunk.get("done"):
                        break

                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content

        except httpx.ConnectError as e:
            raise ConnectionError(
                f"Ollama is not running at {self.config.base_url}. "
                "Start it with: ollama serve"
            ) from e

    async def embed(
        self,
        *,
        model: str,
        input: str,
    ) -> list[float]:
        """Generate an embedding vector via Ollama's /api/embeddings endpoint.

        Args:
            model: Embedding model name (e.g. "nomic-embed-text")
            input: Text to embed

        Returns:
            Embedding vector as a list of floats.
        """
        payload = {"model": model, "prompt": input}

        try:
            response = await self.client.post("/api/embeddings", json=payload)
            response.raise_for_status()
            data = response.json()
            embedding = data.get("embedding", [])
            if not embedding:
                logger.warning("Ollama returned empty embedding for model=%s", model)
            return embedding
        except httpx.ConnectError as e:
            raise ConnectionError(
                f"Ollama is not running at {self.config.base_url}. "
                "Start it with: ollama serve"
            ) from e
        except httpx.HTTPStatusError as e:
            logger.error("Ollama embedding error for model=%s: %s", model, e.response.text)
            raise

    async def list_models(self) -> list[str]:
        """List all locally available Ollama models.

        Returns:
            List of model names.
        """
        try:
            response = await self.client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            models = [m["name"] for m in data.get("models", [])]
            return models
        except httpx.ConnectError as e:
            raise ConnectionError(
                f"Ollama is not running at {self.config.base_url}. "
                "Start it with: ollama serve"
            ) from e

    async def healthcheck(self) -> tuple[bool, str]:
        """Check if Ollama is running and reachable.

        Returns:
            Tuple of (is_healthy, status_message).
        """
        try:
            response = await self.client.get("/api/tags", timeout=5.0)
            if response.status_code == 200:
                model_count = len(response.json().get("models", []))
                return True, f"Ollama reachable, {model_count} models available"
            return False, f"Ollama returned status {response.status_code}"
        except httpx.ConnectError:
            return False, f"Ollama not reachable at {self.config.base_url}"
        except Exception as e:
            return False, f"Ollama healthcheck error: {e}"

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
