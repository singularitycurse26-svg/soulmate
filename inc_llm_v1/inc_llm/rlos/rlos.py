"""RLOS — Recursive Link Operating System main orchestrator.

Ties together all subsystems: connection pool, model manager, prefix cache,
batch processor, server nodes, load balancer, free server connector,
code executor, and universal mesh link.

Provides a unified interface for LLM completion requests that automatically
routes through the best available server with all optimizations applied.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator

from inc_llm.config import RLOSConfig, Settings
from inc_llm.rlos.batch_processor import BatchProcessor
from inc_llm.rlos.code_executor import CodeExecutor
from inc_llm.rlos.connection_pool import ConnectionPool
from inc_llm.rlos.free_server import FreeServerConnector
from inc_llm.rlos.load_balancer import LoadBalancer
from inc_llm.rlos.model_manager import ModelManager
from inc_llm.rlos.predictive_loader import PredictiveLoader
from inc_llm.rlos.prefix_cache import PrefixCache
from inc_llm.rlos.server_node import ServerNodeManager

logger = logging.getLogger(__name__)


class RLOS:
    """Recursive Link Operating System — orchestrates Ollama server mesh."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.config: RLOSConfig = settings.rlos
        self.pool = ConnectionPool(max_connections_per_host=self.config.num_parallel)
        self.node_manager = ServerNodeManager(self.pool, self.config.health_check_interval_s)
        self.model_manager = ModelManager(self.pool, self.config)
        self.prefix_cache = PrefixCache(max_entries=self.config.prefix_cache_size)
        self.batch_processor = BatchProcessor(self.pool, self.config)
        self.load_balancer = LoadBalancer(self.node_manager)
        self.free_server_connector = FreeServerConnector(
            self.node_manager, self.config.free_servers,
        )
        self.code_executor = CodeExecutor() if self.config.enable_code_execution else None
        self.predictive_loader = PredictiveLoader(
            self.model_manager, self.pool, self.config.primary_server,
        )
        self._initialized = False
        self._health_task: asyncio.Task | None = None

    async def initialize(self) -> None:
        """Initialize RLOS — add primary server, preload models, start health checks."""
        if self._initialized:
            return

        self.node_manager.add_server(self.config.primary_server, name="primary")
        await self.node_manager.health_check(self.node_manager.get_server(self.config.primary_server))

        await self.model_manager.preload_all(self.config.primary_server)

        if self.config.free_servers:
            await self.free_server_connector.connect_all()

        self._health_task = asyncio.create_task(self.node_manager.start_health_checks())

        self._initialized = True
        logger.info("RLOS initialized with %d servers", len(self.node_manager.get_all_servers()))

    async def complete(self, model: str, messages: list[dict[str, str]],
                       max_tokens: int = 128, temperature: float = 0.7,
                       stop: list[str] | None = None,
                       priority: int = 0) -> dict[str, Any]:
        """Complete a chat request through the RLOS mesh."""
        if not self._initialized:
            await self.initialize()

        prefix_entry = self.prefix_cache.lookup(messages)

        # Check if we have a stored response for this prefix
        if prefix_entry:
            prefix_hash = prefix_entry.get("prefix_hash", "")
            cached_resp = self.prefix_cache.lookup_response(prefix_hash)
            if cached_resp:
                logger.debug("RLOS prefix response cache hit: %s", prefix_hash)
                return {"content": cached_resp, "model": model, "cached": True}

        server = self.load_balancer.select_server(model=model)
        if server is None:
            logger.warning("No servers available, falling back to primary")
            server = self.node_manager.get_server(self.config.primary_server)
            if server is None:
                return {"content": "", "model": model, "error": "No servers available"}

        server.active_requests += 1
        server.request_count += 1
        try:
            await self.model_manager.ensure_loaded(server.url, model)
            result = await self.batch_processor.submit(
                server_url=server.url, model=model, messages=messages,
                max_tokens=max_tokens, temperature=temperature,
                priority=priority,
            )

            prefix_hash = self.prefix_cache.store(messages, context_size=len(messages), model=model)
            if prefix_hash and result.get("content"):
                self.prefix_cache.store_response(prefix_hash, result["content"])
            self.model_manager.mark_used(server.url, model)
            self.predictive_loader.record_usage(model)
            self.predictive_loader.preload_predicted(model)
            return result
        except Exception as e:
            server.error_count += 1
            logger.error("RLOS complete failed on %s: %s", server.url, e)
            return {"content": "", "model": model, "error": str(e)}
        finally:
            server.active_requests = max(0, server.active_requests - 1)

    async def stream_complete(self, model: str, messages: list[dict[str, str]],
                              max_tokens: int = 128, temperature: float = 0.7,
                              stop: list[str] | None = None) -> AsyncIterator[str]:
        """Stream a chat request through the RLOS mesh."""
        if not self._initialized:
            await self.initialize()

        server = self.load_balancer.select_server(model=model)
        if server is None:
            server = self.node_manager.get_server(self.config.primary_server)
            if server is None:
                yield ""
                return

        server.active_requests += 1
        server.request_count += 1
        pc = None
        try:
            await self.model_manager.ensure_loaded(server.url, model)
            pc = await self.pool.acquire(server.url)
            body = json.dumps({
                "model": model,
                "messages": messages,
                "stream": True,
                "options": {
                    "num_predict": max_tokens,
                    "temperature": temperature,
                },
            }).encode()

            def _do_stream():
                pc.conn.request("POST", "/api/chat", body=body,
                                headers={"Content-Type": "application/json"})
                resp = pc.conn.getresponse()
                chunks: list[str] = []
                for line in resp:
                    line_str = line.decode().strip()
                    if line_str:
                        data = json.loads(line_str)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            chunks.append(content)
                        if data.get("done"):
                            break
                return chunks

            chunks = await asyncio.to_thread(_do_stream)
            for chunk in chunks:
                yield chunk

            self.prefix_cache.store(messages, context_size=len(messages), model=model)
            self.model_manager.mark_used(server.url, model)
            self.predictive_loader.record_usage(model)
            self.predictive_loader.preload_predicted(model)
        except Exception as e:
            if pc is not None:
                await self.pool.destroy(pc)
                pc = None
            server.error_count += 1
            logger.error("RLOS stream failed on %s: %s", server.url, e)
            yield ""
        finally:
            if pc is not None:
                await self.pool.release(pc)
            server.active_requests = max(0, server.active_requests - 1)

    async def embed(self, model: str, input_text: str) -> list[float]:
        """Generate embeddings through the RLOS mesh."""
        if not self._initialized:
            await self.initialize()

        server = self.load_balancer.select_server(model=model)
        if server is None:
            server = self.node_manager.get_server(self.config.primary_server)
            if server is None:
                return []

        pc = await self.pool.acquire(server.url)
        try:
            body = json.dumps({"model": model, "input": input_text}).encode()
            pc.conn.request("POST", "/api/embed", body=body,
                            headers={"Content-Type": "application/json"})
            resp = pc.conn.getresponse()
            data = json.loads(resp.read().decode())
            embeddings = data.get("embeddings", [])
            return embeddings[0] if embeddings else []
        finally:
            await self.pool.release(pc)

    async def execute_code(self, code: str) -> dict[str, Any]:
        """Execute code in the sandbox."""
        if not self.code_executor:
            return {"success": False, "error": "Code execution disabled"}
        result = await self.code_executor.execute_python(code)
        return {
            "success": result.success,
            "output": result.output,
            "error": result.error,
            "exit_code": result.exit_code,
            "execution_time_s": result.execution_time_s,
        }

    def get_stats(self) -> dict[str, Any]:
        return {
            "initialized": self._initialized,
            "connections": self.pool.get_stats(),
            "models": self.model_manager.get_stats(),
            "prefix_cache": self.prefix_cache.get_stats(),
            "batch_processor": self.batch_processor.get_stats(),
            "servers": self.node_manager.get_stats(),
            "free_servers": self.free_server_connector.get_stats(),
            "predictive_loader": self.predictive_loader.get_stats(),
            "code_executor_enabled": self.code_executor is not None,
        }

    async def close(self) -> None:
        """Shut down RLOS."""
        await self.node_manager.stop_health_checks()
        if self._health_task:
            self._health_task.cancel()
            try:
                await self._health_task
            except asyncio.CancelledError:
                pass
        await self.pool.close_all()
        if self.code_executor:
            self.code_executor.cleanup()
        logger.info("RLOS shut down")
