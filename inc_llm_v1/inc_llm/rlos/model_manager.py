"""Model manager — preloads and manages models on Ollama servers.

Tracks which models are loaded on which servers, sends preload requests
at startup, and provides model-to-server routing hints.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from inc_llm.rlos.connection_pool import ConnectionPool

logger = logging.getLogger(__name__)


@dataclass
class ModelState:
    name: str
    server: str
    loaded: bool = False
    last_used: float = 0.0
    load_count: int = 0
    size_gb: float = 0.0


class ModelManager:
    """Manages model preloading and lifecycle across Ollama servers."""

    def __init__(self, pool: ConnectionPool, config: Any) -> None:
        self.pool = pool
        self.config = config
        self._models: dict[str, ModelState] = {}
        self._preload_models: list[str] = config.preload_models
        self._keep_alive: str = config.keep_alive

    async def preload_all(self, server_url: str) -> dict[str, bool]:
        """Preload all configured models on a server."""
        results: dict[str, bool] = {}
        for model_name in self._preload_models:
            success = await self.preload_model(server_url, model_name)
            results[model_name] = success
        logger.info("Preload complete for %s: %s", server_url, results)
        return results

    async def preload_model(self, server_url: str, model_name: str) -> bool:
        """Preload a single model on a server."""
        pc = None
        try:
            pc = await self.pool.acquire(server_url)
            body = json.dumps({
                "model": model_name,
                "prompt": " ",
                "keep_alive": self._keep_alive,
                "options": {"num_predict": 1},
            }).encode()

            def _do_preload():
                pc.conn.request("POST", "/api/generate", body=body,
                                headers={"Content-Type": "application/json"})
                resp = pc.conn.getresponse()
                resp.read()
                return resp.status

            status = await asyncio.to_thread(_do_preload)
            if status == 200:
                state = ModelState(
                    name=model_name, server=server_url, loaded=True,
                    last_used=time.time(), load_count=1,
                )
                self._models[f"{server_url}:{model_name}"] = state
                logger.info("Preloaded model %s on %s", model_name, server_url)
                return True
            else:
                logger.warning("Preload failed for %s on %s: HTTP %d", model_name, server_url, status)
                return False
        except Exception as e:
            if pc is not None:
                await self.pool.destroy(pc)
                pc = None
            logger.warning("Preload error for %s on %s: %s", model_name, server_url, e)
            return False
        finally:
            if pc is not None:
                await self.pool.release(pc)

    async def ensure_loaded(self, server_url: str, model_name: str) -> bool:
        """Ensure a model is loaded on a server, preload if needed."""
        key = f"{server_url}:{model_name}"
        state = self._models.get(key)
        if state and state.loaded:
            state.last_used = time.time()
            return True
        return await self.preload_model(server_url, model_name)

    def mark_used(self, server_url: str, model_name: str) -> None:
        key = f"{server_url}:{model_name}"
        state = self._models.get(key)
        if state:
            state.last_used = time.time()
            state.load_count += 1

    def get_loaded_models(self, server_url: str | None = None) -> list[ModelState]:
        if server_url:
            return [m for m in self._models.values() if m.server == server_url and m.loaded]
        return [m for m in self._models.values() if m.loaded]

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_models": len(self._models),
            "loaded": sum(1 for m in self._models.values() if m.loaded),
            "models": [
                {"name": m.name, "server": m.server, "loaded": m.loaded,
                 "load_count": m.load_count, "last_used": m.last_used}
                for m in self._models.values()
            ],
        }
