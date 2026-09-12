"""Universal RAM Supply — pools local + peer RAM reservations.

Tracks the local reservation (from Ramm1OS) + each peer's reserved/used/free.
Provides pool_total, pool_free, and find_capacity(ram_gb) to decide where a
model-run request should be routed (local, a specific peer, or insufficient).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from inc_llm.ramm1.os import Ramm1OS

logger = logging.getLogger(__name__)


@dataclass
class PeerCapacity:
    """A peer's advertised RAM capacity."""
    peer_id: str
    endpoint: str = ""
    reserved_gb: float = 0.0
    used_gb: float = 0.0
    free_gb: float = 0.0
    models: list[str] = field(default_factory=list)
    gpu: bool = False
    vram_gb: float = 0.0
    last_seen: float = field(default_factory=time.time)
    consent: bool = False


class UniversalRAMPool:
    """Universal RAM Supply — pools local + peer RAM reservations.

    The local 3.5 GB (from Ramm1OS) is registered as the local node. Each peer
    contributes its own 3.5 GB. The pool tracks total + free across all nodes.
    """

    def __init__(self, ramm1_os: Ramm1OS) -> None:
        self.os = ramm1_os
        self._peers: dict[str, PeerCapacity] = {}
        self._lock = threading.RLock()

    def add_peer(self, peer: PeerCapacity) -> None:
        """Add or update a peer's capacity advertisement."""
        with self._lock:
            self._peers[peer.peer_id] = peer
        logger.info("Pool: added peer %s (reserved %.2f GB, free %.2f GB)", peer.peer_id, peer.reserved_gb, peer.free_gb)

    def remove_peer(self, peer_id: str) -> None:
        """Remove a peer from the pool."""
        with self._lock:
            self._peers.pop(peer_id, None)
        logger.info("Pool: removed peer %s", peer_id)

    def update_peer(self, peer_id: str, **kwargs: Any) -> None:
        """Update a peer's capacity fields."""
        with self._lock:
            peer = self._peers.get(peer_id)
            if peer:
                for k, v in kwargs.items():
                    if hasattr(peer, k):
                        setattr(peer, k, v)
                peer.last_seen = time.time()

    def get_peer(self, peer_id: str) -> PeerCapacity | None:
        with self._lock:
            return self._peers.get(peer_id)

    def list_peers(self) -> list[PeerCapacity]:
        with self._lock:
            return list(self._peers.values())

    def get_pool_total_gb(self) -> float:
        """Total RAM in the pool (local + all peers)."""
        with self._lock:
            local = self.os.get_reserved_gb()
            peers = sum(p.reserved_gb for p in self._peers.values())
            return round(local + peers, 3)

    def get_pool_free_gb(self) -> float:
        """Free RAM in the pool (local + all peers)."""
        with self._lock:
            local_free = self.os.get_free_gb()
            peers_free = sum(p.free_gb for p in self._peers.values())
            return round(local_free + peers_free, 3)

    def get_pool_used_gb(self) -> float:
        """Used RAM in the pool."""
        return round(self.get_pool_total_gb() - self.get_pool_free_gb(), 3)

    def find_capacity(self, ram_gb: float, model_id: str = "") -> dict[str, Any]:
        """Find where a model-run request can be served.

        Returns a routing plan:
        - {"node": "local"} if the local reservation can fit it.
        - {"node": "peer", "peer_id": "..."} if a peer can fit it.
        - {"node": "insufficient", "deficit_gb": ...} if nowhere can fit it.

        Prefers local for privacy (no prompt leaves the machine), then the peer
        with the most free RAM that has the model loaded (if model_id is given).
        """
        with self._lock:
            # Try local first
            if self.os.can_fit(ram_gb):
                return {"node": "local", "free_gb": self.os.get_free_gb()}

            # Try peers — prefer ones with the model loaded, then most free RAM
            candidates: list[PeerCapacity] = []
            for peer in self._peers.values():
                if not peer.consent:
                    continue
                if peer.free_gb >= ram_gb:
                    candidates.append(peer)
            if not candidates:
                total_free = self.os.get_free_gb() + sum(p.free_gb for p in self._peers.values())
                return {"node": "insufficient", "deficit_gb": round(ram_gb - total_free, 3)}

            # Prefer peers with the model loaded
            if model_id:
                with_model = [p for p in candidates if model_id in p.models]
                if with_model:
                    candidates = with_model

            # Pick the peer with the most free RAM
            best = max(candidates, key=lambda p: p.free_gb)
            return {"node": "peer", "peer_id": best.peer_id, "endpoint": best.endpoint, "free_gb": best.free_gb}

    def get_status(self) -> dict[str, Any]:
        """Get the full pool status."""
        with self._lock:
            local_status = self.os.get_local_status()
            return {
                "local": local_status,
                "peers": [
                    {
                        "peer_id": p.peer_id,
                        "endpoint": p.endpoint,
                        "reserved_gb": round(p.reserved_gb, 3),
                        "used_gb": round(p.used_gb, 3),
                        "free_gb": round(p.free_gb, 3),
                        "models": p.models,
                        "gpu": p.gpu,
                        "vram_gb": p.vram_gb,
                        "consent": p.consent,
                        "last_seen": p.last_seen,
                    }
                    for p in self._peers.values()
                ],
                "pool_total_gb": self.get_pool_total_gb(),
                "pool_free_gb": self.get_pool_free_gb(),
                "pool_used_gb": self.get_pool_used_gb(),
                "peer_count": len(self._peers),
            }
