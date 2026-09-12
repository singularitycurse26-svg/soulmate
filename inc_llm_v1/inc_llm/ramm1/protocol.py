"""Secure peer protocol — HTTP+HMAC for the Ramm1 mesh.

Implements the peer-to-peer protocol for the Universal RAM Supply:
- POST /ramm1/peer/register — register a peer with a signed capability
- POST /ramm1/peer/heartbeat — update capacity + last_seen
- POST /ramm1/peer/run — send an inference request to a peer
- POST /ramm1/peer/capability — advertise capabilities
- POST /ramm1/peer/learning — propagate a turn learning (RLT token)

Uses HMAC-SHA256 for authentication. No new dependencies — stdlib urllib only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
import urllib.request
import urllib.error
from typing import Any

logger = logging.getLogger(__name__)


class PeerProtocol:
    """Secure peer protocol over HTTP+HMAC.

    Sends signed requests to peers and verifies incoming signatures.
    """

    def __init__(self, peer_token: str, instance_id: str = "") -> None:
        self.token = peer_token
        self.instance_id = instance_id

    def _sign(self, body: bytes, timestamp: float) -> str:
        """HMAC-sign a request body + timestamp."""
        if not self.token:
            return ""
        msg = body + str(timestamp).encode()
        return hmac.new(self.token.encode(), msg, hashlib.sha256).hexdigest()[:32]

    def _make_headers(self, body: bytes, timestamp: float) -> dict[str, str]:
        """Build signed headers for a request."""
        return {
            "Content-Type": "application/json",
            "X-Ramm1-Timestamp": str(timestamp),
            "X-Ramm1-Signature": self._sign(body, timestamp),
            "X-Ramm1-Instance": self.instance_id,
        }

    def verify_incoming(self, body: bytes, timestamp: float, signature: str, instance_id: str = "") -> bool:
        """Verify an incoming request's signature."""
        if not self.token or not signature:
            return False
        expected = self._sign(body, timestamp)
        return hmac.compare_digest(expected, signature)

    def _post(self, url: str, payload: dict[str, Any], timeout: int = 10) -> dict[str, Any]:
        """POST JSON to a peer endpoint with HMAC signing."""
        body = json.dumps(payload).encode()
        timestamp = time.time()
        headers = self._make_headers(body, timestamp)
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
            return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_body = e.read().decode()
            logger.warning("Peer protocol error %d from %s: %s", e.code, url, err_body[:200])
            return {"status": "error", "code": e.code, "error": err_body}
        except Exception as e:
            logger.warning("Peer protocol failed to %s: %s", url, e)
            return {"status": "error", "error": str(e)}

    def register(self, peer_endpoint: str, peer_record: dict[str, Any]) -> dict[str, Any]:
        """Send a registration request to a peer."""
        return self._post(f"{peer_endpoint}/ramm1/peer/register", peer_record)

    def heartbeat(self, peer_endpoint: str, capacity: dict[str, Any]) -> dict[str, Any]:
        """Send a heartbeat to a peer."""
        return self._post(f"{peer_endpoint}/ramm1/peer/heartbeat", capacity)

    def run(self, peer_endpoint: str, model: str, messages: list[dict[str, str]],
            max_tokens: int = 128, temperature: float = 0.7) -> dict[str, Any]:
        """Send an inference request to a peer."""
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "requester": self.instance_id,
        }
        return self._post(f"{peer_endpoint}/ramm1/peer/run", payload, timeout=300)

    def share_learning(self, peer_endpoint: str, learning_type: str, content: str,
                       episode_id: str = "", metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        """Propagate a learning (RLT token) to a peer."""
        payload = {
            "learning_type": learning_type,
            "content": content,
            "episode_id": episode_id,
            "source_instance": self.instance_id,
            "metadata": metadata or {},
        }
        return self._post(f"{peer_endpoint}/ramm1/peer/learning", payload)

    def capability(self, peer_endpoint: str, capability: dict[str, Any]) -> dict[str, Any]:
        """Advertise capabilities to a peer."""
        return self._post(f"{peer_endpoint}/ramm1/peer/capability", capability)
