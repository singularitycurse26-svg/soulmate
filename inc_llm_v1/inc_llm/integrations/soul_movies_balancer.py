"""RenderLoadBalancer — routes scene rendering to the best GPU node on RLOS mesh.

Equivalent to RLOS LoadBalancer (inc_llm/rlos/load_balancer.py).
Weighted scoring considers: GPU availability, VRAM free, current render jobs,
node health, video model availability, free server priority.

Falls back to clip-based assembly mode if no GPU nodes available.
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.rlos.server_node import ServerNode, ServerNodeManager, ServerStatus

logger = logging.getLogger(__name__)


class RenderLoadBalancer:
    """Weighted load balancer for GPU scene rendering on RLOS mesh.

    Same scoring pattern as LoadBalancer — health score + bonuses.
    Falls back to least-connections if scores are tied.
    """

    def __init__(self, node_manager: ServerNodeManager) -> None:
        self.node_manager = node_manager

    def select_gpu_node(
        self,
        scene_prompt: str = "",
        prefer_free: bool = False,
        min_vram_gb: float = 4.0,
    ) -> ServerNode | None:
        """Select the best GPU node for scene rendering.

        Scoring:
        - Base: health_score() from ServerNode (status, load, latency)
        - +0.2 if node has video models loaded
        - +0.15 if prefer_free and node is free
        - +0.1 per GB of free VRAM (capped at +0.3)
        - -0.2 per render load factor (busy GPUs penalized)
        """
        servers = self.node_manager.get_available_servers()
        gpu_servers = [s for s in servers if s.has_gpu_available and s.vram_free_gb >= min_vram_gb]

        if not gpu_servers:
            logger.warning(
                "No GPU nodes available for rendering (min_vram=%.1fGB, prompt=%s)",
                min_vram_gb, scene_prompt[:50],
            )
            return None

        scored: list[tuple[float, ServerNode]] = []
        for server in gpu_servers:
            score = server.health_score()

            if server.video_models:
                score += 0.2

            if prefer_free and server.is_free:
                score += 0.15

            vram_bonus = min(0.3, server.vram_free_gb * 0.1)
            score += vram_bonus

            render_penalty = server.render_load_factor * 0.2
            score -= render_penalty

            scored.append((score, server))

        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        logger.debug(
            "Selected GPU node %s (score: %.3f, vram_free: %.1fGB, render_load: %.2f)",
            best.url, scored[0][0], best.vram_free_gb, best.render_load_factor,
        )
        return best

    def select_least_render_load(self, min_vram_gb: float = 4.0) -> ServerNode | None:
        """Select GPU node with least render jobs — fallback selection."""
        servers = self.node_manager.get_available_servers()
        gpu_servers = [s for s in servers if s.has_gpu_available and s.vram_free_gb >= min_vram_gb]
        if not gpu_servers:
            return None
        gpu_servers.sort(key=lambda s: s.active_render_jobs)
        return gpu_servers[0]

    def get_gpu_stats(self) -> dict[str, Any]:
        servers = self.node_manager.get_all_servers()
        gpu_servers = [s for s in servers if s.gpu_available]
        return {
            "total_gpu_nodes": len(gpu_servers),
            "available_gpu_nodes": sum(1 for s in gpu_servers if s.has_gpu_available),
            "total_vram_gb": sum(s.vram_total_gb for s in gpu_servers),
            "free_vram_gb": round(sum(s.vram_free_gb for s in gpu_servers), 2),
            "active_render_jobs": sum(s.active_render_jobs for s in gpu_servers),
            "max_render_jobs": sum(s.max_render_jobs for s in gpu_servers),
        }
