"""Peer sync manager — handles periodic synchronization with peer instances.

Runs as a background task that periodically:
1. Sends local learnings to the sync endpoint
2. Receives peer learnings and applies them locally
3. Discovers new peers
4. Updates peer health status
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
from typing import Any

from inc_llm.recursive_link.universal import UniversalLinkManager

logger = logging.getLogger(__name__)


class PeerSyncManager:
    """Manages periodic synchronization with peer instances."""

    def __init__(self, universal_link: UniversalLinkManager) -> None:
        self.universal = universal_link
        self.config = universal_link.config
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_sync: float = 0

    async def start(self) -> None:
        """Start the background sync loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._sync_loop())
        logger.info("Peer sync started (interval: %ds)", self.config.sync_interval_s)

    async def stop(self) -> None:
        """Stop the background sync loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Peer sync stopped")

    async def _sync_loop(self) -> None:
        """Main sync loop — runs periodically."""
        # C2: Initial delay so server starts before first sync
        await asyncio.sleep(30)
        while self._running:
            try:
                await self.sync_once()
            except Exception as e:
                logger.warning("Sync failed: %s", e)
            await asyncio.sleep(self.config.sync_interval_s)

    async def sync_once(self) -> dict[str, Any]:
        """Perform a single sync cycle."""
        if not self.config.enabled:
            return {"status": "disabled"}

        results = {"registered": False, "shared": 0, "received": 0, "peers_discovered": 0}

        try:
            await asyncio.to_thread(self._register_with_endpoint)
            results["registered"] = True
        except Exception as e:
            logger.debug("Registration failed: %s", e)

        try:
            shared = await asyncio.to_thread(self._share_learnings)
            results["shared"] = shared
        except Exception as e:
            logger.debug("Share failed: %s", e)

        try:
            received, peers = await asyncio.to_thread(self._receive_learnings)
            results["received"] = received
            results["peers_discovered"] = peers
        except Exception as e:
            logger.debug("Receive failed: %s", e)

        self._last_sync = time.time()
        logger.info("Sync complete: %s", results)
        return results

    def _register_with_endpoint(self) -> None:
        """Register this instance with the sync endpoint."""
        payload = json.dumps(self.universal.register_self()).encode()
        req = urllib.request.Request(
            f"{self.config.sync_endpoint}/register",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5)  # C2: reduced from 10s

    def _share_learnings(self) -> int:
        """Share local learnings with the sync endpoint."""
        learnings = self.universal.get_learnings_to_share(since=self._last_sync)
        if not learnings:
            return 0
        payload = json.dumps({"instance_id": self.universal.instance_id, "learnings": learnings}).encode()
        req = urllib.request.Request(
            f"{self.config.sync_endpoint}/share",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)  # C2: reduced from 30s
        return len(learnings)

    def _receive_learnings(self) -> tuple[int, int]:
        """Receive learnings from the sync endpoint."""
        params = f"?instance_id={self.universal.instance_id}&since={self._last_sync}"
        req = urllib.request.Request(f"{self.config.sync_endpoint}/receive{params}")
        resp = urllib.request.urlopen(req, timeout=10)  # C2: reduced from 30s
        data = json.loads(resp.read().decode())

        received = 0
        for learning in data.get("learnings", []):
            if self.universal.receive_learning(learning):
                received += 1

        peers_discovered = 0
        for peer in data.get("peers", []):
            self.universal.add_peer(
                peer_id=peer.get("instance_id", ""),
                peer_name=peer.get("instance_name", ""),
                endpoint=peer.get("endpoint", ""),
                metadata=peer.get("metadata"),
            )
            peers_discovered += 1

        return received, peers_discovered

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def last_sync(self) -> float:
        return self._last_sync
