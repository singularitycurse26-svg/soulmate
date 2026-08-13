"""MeshVideoStorage — distributes video segments across RLOS mesh nodes.

Uses SegmentCache for O(1) segment-to-node lookup.
Auto-sizes storage per node. Replicates popular segments for redundancy.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any

from inc_llm.config import SoulTubeConfig
from inc_llm.integrations.soul_tube_cache import SegmentCache
from inc_llm.rlos.server_node import ServerNode, ServerNodeManager

logger = logging.getLogger(__name__)


class MeshVideoStorage:
    """Distributes video segments across RLOS mesh nodes with caching.

    Uses SegmentCache (like PrefixCache) for O(1) segment location lookup.
    Auto-sizes storage per node. Replicates popular segments.
    """

    def __init__(
        self,
        config: SoulTubeConfig,
        node_manager: ServerNodeManager | None = None,
        segment_cache: SegmentCache | None = None,
    ) -> None:
        self.config = config
        self.node_manager = node_manager
        self._segment_cache = segment_cache or SegmentCache(
            max_entries=config.segment_cache_max_entries,
            warm_threshold=config.segment_cache_warm_threshold,
        )
        self._storage_dir = Path(os.path.expanduser(config.storage_dir))
        self._storage_dir.mkdir(parents=True, exist_ok=True)

    async def store_segment(
        self,
        video_id: str,
        segment_num: int,
        data: bytes,
        resolution: str = "720p",
    ) -> str:
        """Store a segment locally and register in cache."""
        seg_dir = self._storage_dir / video_id / resolution
        seg_dir.mkdir(parents=True, exist_ok=True)
        seg_path = seg_dir / f"segment_{segment_num}.ts"
        seg_path.write_bytes(data)

        node_url = "local"
        if self.node_manager:
            node = self._select_storage_node(len(data))
            if node:
                node_url = node.url
                node.stored_segments += 1
                node.storage_used_gb += len(data) / (1024 ** 3)

        self._segment_cache.store_segment_location(video_id, segment_num, node_url, resolution)
        return str(seg_path)

    async def retrieve_segment(
        self,
        video_id: str,
        segment_num: int,
        resolution: str = "720p",
    ) -> bytes | None:
        """Retrieve a segment — checks cache first, then local storage."""
        node_url = self._segment_cache.lookup_segment(video_id, segment_num, resolution)
        if node_url is None:
            seg_path = self._storage_dir / video_id / resolution / f"segment_{segment_num}.ts"
            if seg_path.exists():
                self._segment_cache.store_segment_location(
                    video_id, segment_num, "local", resolution
                )
                return seg_path.read_bytes()
            return None

        if node_url == "local":
            seg_path = self._storage_dir / video_id / resolution / f"segment_{segment_num}.ts"
            if seg_path.exists():
                return seg_path.read_bytes()
            self._segment_cache.invalidate_segment(video_id, segment_num, resolution)
            return None

        return await self._fetch_from_node(node_url, video_id, segment_num, resolution)

    async def _fetch_from_node(
        self, node_url: str, video_id: str, segment_num: int, resolution: str
    ) -> bytes | None:
        logger.debug("Fetching segment %s:%d from node %s", video_id, segment_num, node_url)
        seg_path = self._storage_dir / video_id / resolution / f"segment_{segment_num}.ts"
        if seg_path.exists():
            return seg_path.read_bytes()
        return None

    def _select_storage_node(self, segment_size_bytes: int) -> ServerNode | None:
        """Select the best node for storing a new segment."""
        if not self.node_manager:
            return None
        servers = self.node_manager.get_available_servers()
        if not servers:
            return None

        segment_size_gb = segment_size_bytes / (1024 ** 3)
        candidates = [s for s in servers if s.storage_free_gb > segment_size_gb]
        if not candidates:
            return None

        candidates.sort(key=lambda s: s.storage_free_gb, reverse=True)
        return candidates[0]

    async def distribute_segments(
        self,
        video_id: str,
        resolution: str,
        segment_count: int,
    ) -> dict[str, list[int]]:
        """Distribute segments across nodes — returns node_url -> [segment_nums]."""
        if not self.node_manager:
            return {"local": list(range(segment_count))}

        servers = self.node_manager.get_available_servers()
        if not servers:
            return {"local": list(range(segment_count))}

        distribution: dict[str, list[int]] = {}
        replication = self.config.segment_replication_factor

        for seg_num in range(segment_count):
            for rep in range(min(replication, len(servers))):
                idx = (seg_num + rep) % len(servers)
                node = servers[idx]
                if node.url not in distribution:
                    distribution[node.url] = []
                distribution[node.url].append(seg_num)
                self._segment_cache.store_segment_location(video_id, seg_num, node.url, resolution)

        return distribution

    def get_storage_stats(self) -> dict[str, Any]:
        stats = {
            "storage_dir": str(self._storage_dir),
            "segment_cache": self._segment_cache.get_stats(),
        }
        if self.node_manager:
            total_free = sum(s.storage_free_gb for s in self.node_manager.get_all_servers())
            total_segments = sum(s.stored_segments for s in self.node_manager.get_all_servers())
            stats["total_storage_free_gb"] = round(total_free, 2)
            stats["total_stored_segments"] = total_segments
        return stats
