"""StreamLoadBalancer — routes HLS segment requests to the best streaming node.

Equivalent to RLOS LoadBalancer (inc_llm/rlos/load_balancer.py).
Weighted scoring considers: does node have the segment? (big bonus),
node health, current streaming load, bandwidth available, P2P proximity.

Key to fast streaming — always picks the node that already has the segment
AND has the bandwidth to serve it.
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.rlos.server_node import ServerNode, ServerNodeManager

logger = logging.getLogger(__name__)


class StreamLoadBalancer:
    """Weighted load balancer for HLS segment streaming on RLOS mesh.

    Same scoring pattern as LoadBalancer — health score + bonuses.
    Adds bandwidth and segment-availability scoring factors.
    """

    def __init__(
        self,
        node_manager: ServerNodeManager,
        segment_cache: Any = None,
    ) -> None:
        self.node_manager = node_manager
        self._segment_cache = segment_cache

    def select_streaming_node(
        self,
        video_id: str,
        segment_num: int,
        resolution: str = "720p",
        prefer_p2p: bool = False,
    ) -> ServerNode | None:
        """Select the best node for streaming a specific segment.

        Scoring:
        - Base: health_score() from ServerNode
        - +0.2 if node has the segment (via SegmentCache lookup)
        - +0.15 if node has high bandwidth (>50 Mbps)
        - +0.1 if node has low streaming load
        - +0.1 if prefer_p2p and node is free
        - -0.3 if node has no storage capacity
        """
        servers = self.node_manager.get_available_servers()

        if not servers:
            logger.warning("No available servers for streaming %s:%d", video_id, segment_num)
            return None

        known_node_url = None
        if self._segment_cache:
            known_node_url = self._segment_cache.lookup_segment(video_id, segment_num, resolution)

        scored: list[tuple[float, ServerNode]] = []
        for server in servers:
            score = server.health_score()

            if known_node_url and server.url == known_node_url:
                score += 0.2

            if server.bandwidth_available_mbps > 50:
                score += 0.15
            elif server.bandwidth_available_mbps > 10:
                score += 0.05

            if server.active_requests < server.max_parallel * 0.5:
                score += 0.1

            if prefer_p2p and server.is_free:
                score += 0.1

            if server.storage_free_gb < 0.1 and server.stored_segments == 0:
                score -= 0.3

            scored.append((score, server))

        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        logger.debug(
            "Selected streaming node %s (score: %.3f, bw: %.1fMbps) for %s:%d",
            best.url, scored[0][0], best.bandwidth_available_mbps,
            video_id, segment_num,
        )
        return best

    def select_least_connections(self) -> ServerNode | None:
        """Select server with least active connections — fallback."""
        servers = self.node_manager.get_available_servers()
        if not servers:
            return None
        servers.sort(key=lambda s: s.active_requests)
        return servers[0]

    def get_streaming_stats(self) -> dict[str, Any]:
        servers = self.node_manager.get_all_servers()
        return {
            "total_nodes": len(servers),
            "available_nodes": sum(1 for s in servers if s.is_available),
            "total_bandwidth_mbps": round(
                sum(s.bandwidth_available_mbps for s in servers), 1
            ),
            "total_stored_segments": sum(s.stored_segments for s in servers),
            "total_storage_free_gb": round(
                sum(s.storage_free_gb for s in servers), 2
            ),
        }
