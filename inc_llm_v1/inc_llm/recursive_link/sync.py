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

    # ── WebSocket support (Phase 4 extension) ──
    # The existing periodic sync (every 300s) remains for background learning.
    # WebSocket support enables real-time, interactive messaging between peers.
    # Interactive messaging does NOT depend on the 300-second periodic sync cycle.

    _websocket_connections: set = set()  # type: ignore[assignment]

    async def handle_websocket(self, ws: Any) -> None:
        """Handle a WebSocket connection for real-time peer messaging.

        This runs for the lifetime of the WebSocket connection.
        Messages received from peers are passed to receive_message().
        Messages to send are forwarded through the WebSocket.
        """
        self._websocket_connections.add(ws)
        logger.info("Peer WebSocket connected (total: %s)", len(self._websocket_connections))
        try:
            while self._running:
                try:
                    data = await ws.receive_json()
                except Exception:
                    break
                if not data:
                    continue
                # Route to receive_message (handles both messages and learnings)
                self.universal.receive_message(data)
        except Exception as e:
            logger.debug("WebSocket handler error: %s", e)
        finally:
            self._websocket_connections.discard(ws)
            logger.info("Peer WebSocket disconnected (total: %s)", len(self._websocket_connections))

    async def send_via_websocket(self, message: dict) -> bool:
        """Send a message to all connected peers via WebSocket.

        Returns True if sent to at least one peer.
        """
        if not self._websocket_connections:
            return False
        sent = 0
        dead = []
        for ws in self._websocket_connections:
            try:
                await ws.send_json(message)
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._websocket_connections.discard(ws)
        return sent > 0

    def get_websocket_stats(self) -> dict:
        """Get WebSocket connection statistics."""
        return {
            "active_connections": len(self._websocket_connections),
            "periodic_sync_running": self._running,
            "last_periodic_sync": self._last_sync,
        }
