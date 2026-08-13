"""Load balancer — routes requests to the best available server.

Uses a weighted scoring algorithm that considers:
- Server health status
- Current load (active requests / max parallel)
- Average latency
- Model availability (preferred if model already loaded)
- Free server priority (free servers get bonus score)
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.rlos.server_node import ServerNode, ServerNodeManager, ServerStatus

logger = logging.getLogger(__name__)


class LoadBalancer:
    """Weighted load balancer for RLOS server mesh."""

    def __init__(self, node_manager: ServerNodeManager) -> None:
        self.node_manager = node_manager

    def select_server(self, model: str = "", prefer_free: bool = False) -> ServerNode | None:
        """Select the best server for a request."""
        servers = self.node_manager.get_available_servers()
        if not servers:
            logger.warning("No available servers for request (model=%s)", model)
            return None

        scored: list[tuple[float, ServerNode]] = []
        for server in servers:
            score = server.health_score()
            if model and model in server.models:
                score += 0.2
            if prefer_free and server.is_free:
                score += 0.15
            scored.append((score, server))

        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        logger.debug("Selected server %s (score: %.3f) for model=%s", best.url, scored[0][0], model)
        return best

    def select_round_robin(self, model: str = "") -> ServerNode | None:
        """Simple round-robin selection among available servers."""
        servers = self.node_manager.get_available_servers()
        if not servers:
            return None

        if model:
            with_model = [s for s in servers if model in s.models]
            if with_model:
                servers = with_model

        servers.sort(key=lambda s: s.request_count)
        return servers[0]

    def select_least_connections(self, model: str = "") -> ServerNode | None:
        """Select server with least active connections."""
        servers = self.node_manager.get_available_servers()
        if not servers:
            return None

        if model:
            with_model = [s for s in servers if model in s.models]
            if with_model:
                servers = with_model

        servers.sort(key=lambda s: s.active_requests)
        return servers[0]
