"""Ramm1 router — RAM-aware RLOS routing extension.

Extends RLOS routing with RAM-awareness: when a model-run request arrives, the
router asks the UniversalRAMPool where it can be served (local, a peer, or
insufficient). Falls back to local Ollama if no pool capacity.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncIterator

from inc_llm.ramm1.manifest import ModelManifest
from inc_llm.ramm1.pool import UniversalRAMPool
from inc_llm.ramm1.protocol import PeerProtocol

logger = logging.getLogger(__name__)


class Ramm1Router:
    """RAM-aware router — decides where a model-run request is served.

    Uses the UniversalRAMPool to find capacity (local or peer), then routes the
    request. Falls back to local Ollama if no pool capacity is available.
    """

    def __init__(
        self,
        pool: UniversalRAMPool,
        manifest: ModelManifest,
        protocol: PeerProtocol | None = None,
        rlos: Any | None = None,
    ) -> None:
        self.pool = pool
        self.manifest = manifest
        self.protocol = protocol
        self.rlos = rlos  # existing RLOS instance for local fallback

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 128,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Route a completion request to the best available node.

        1. Check the pool for capacity (local first, then peers).
        2. If local → run via RLOS or the local Ollama provider.
        3. If peer → send via the peer protocol.
        4. If insufficient → return a clear error.
        """
        footprint = self.manifest.get_footprint_gb(model)
        plan = self.pool.find_capacity(footprint, model_id=model)

        if plan["node"] == "local":
            return await self._run_local(model, messages, max_tokens, temperature)

        if plan["node"] == "peer" and self.protocol:
            peer_id = plan.get("peer_id", "")
            endpoint = plan.get("endpoint", "")
            if endpoint:
                return await self._run_peer(endpoint, model, messages, max_tokens, temperature, peer_id)

        if plan["node"] == "insufficient":
            return {
                "content": "",
                "model": model,
                "error": "insufficient_pool_ram",
                "deficit_gb": plan.get("deficit_gb", 0),
                "pool_free_gb": self.pool.get_pool_free_gb(),
            }

        # Fallback to local even if no plan
        return await self._run_local(model, messages, max_tokens, temperature)

    async def _run_local(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
    ) -> dict[str, Any]:
        """Run inference locally via RLOS or the bus."""
        if self.rlos:
            try:
                result = await self.rlos.complete(
                    model=model, messages=messages,
                    max_tokens=max_tokens, temperature=temperature,
                )
                result.setdefault("route", "local")
                return result
            except Exception as e:
                logger.warning("Ramm1 local RLOS run failed: %s — falling back", e)
        return {"content": "", "model": model, "error": f"local_run_failed: {e}"}

    async def _run_peer(
        self,
        endpoint: str,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int,
        temperature: float,
        peer_id: str = "",
    ) -> dict[str, Any]:
        """Run inference on a peer via the peer protocol."""
        if not self.protocol:
            return {"content": "", "model": model, "error": "no_protocol"}
        import asyncio
        try:
            result = await asyncio.to_thread(
                self.protocol.run, endpoint, model, messages, max_tokens, temperature,
            )
            result.setdefault("route", "peer")
            result.setdefault("peer_id", peer_id)
            return result
        except Exception as e:
            logger.warning("Ramm1 peer run failed: %s", e)
            return {"content": "", "model": model, "error": f"peer_run_failed: {e}"}

    async def stream_complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        max_tokens: int = 128,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """Stream a completion. Currently routes to local RLOS streaming only."""
        if self.rlos:
            async for chunk in self.rlos.stream_complete(
                model=model, messages=messages,
                max_tokens=max_tokens, temperature=temperature,
            ):
                yield chunk
        else:
            yield ""

    def get_status(self) -> dict[str, Any]:
        """Get the router status."""
        return {
            "pool": self.pool.get_status(),
            "rlos_available": self.rlos is not None,
            "protocol_available": self.protocol is not None,
        }
