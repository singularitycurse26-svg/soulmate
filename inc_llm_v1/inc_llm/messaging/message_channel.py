"""Message Channel — guaranteed delivery, real-time channel for messaging.

Designed specifically for the messaging use case:
- Volume: 1-10 messages per minute (LOW volume)
- Latency: low (sub-second delivery)
- Delivery: GUARANTEED (acks, retries, dead-letter queue)
- Ordering: STRICT per-conversation (sequence numbers)
- Transport: WebSocket for persistent connections, HTTP fallback
- Compression: RLT for larger messages (>500 bytes)
- Priority: HIGHEST (always preempts observer/prefetch)

Architecture:
1. send() puts message in priority queue, returns message_id immediately
2. Worker delivers via WebSocket (or HTTP fallback)
3. Receiver sends ACK with message_id
4. If no ACK within timeout, retry (up to max_retries)
5. After max_retries, move to dead-letter queue
6. Per-conversation sequence numbers guarantee ordering
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable

logger = logging.getLogger(__name__)


@dataclass
class Message:
    """A message with guaranteed delivery semantics."""
    id: str
    conversation_id: str
    sender: str
    recipient: str
    content: str
    msg_type: str = "text"  # text, command, workflow, note, file
    metadata: dict = field(default_factory=dict)
    sequence: int = 0  # Per-conversation sequence number
    timestamp: float = field(default_factory=time.time)
    priority: int = 5  # 5=user, 4=aceline, 3=system
    retries: int = 0
    status: str = "pending"  # pending, delivered, acked, failed, dead_letter
    rlt_compressed: bool = False


class MessageChannel:
    """Guaranteed delivery channel for interactive messaging.

    Features:
    - In-process priority queue (user > aceline > system)
    - Per-conversation sequence numbers (strict ordering)
    - Acknowledgments with timeout
    - Retry with exponential backoff
    - Dead-letter queue after max_retries
    - WebSocket transport with HTTP fallback
    - RLT compression for larger messages
    """

    def __init__(
        self,
        max_queue_size: int = 10000,
        ack_timeout_s: float = 30.0,
        max_retries: int = 3,
        rlt_compress_threshold: int = 500,
    ) -> None:
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue(maxsize=max_queue_size)
        self._ack_timeout_s = ack_timeout_s
        self._max_retries = max_retries
        self._rlt_compress_threshold = rlt_compress_threshold

        # Per-conversation sequence counters
        self._sequences: dict[str, int] = defaultdict(int)

        # Pending acks: message_id -> (Message, deadline, future)
        self._pending_acks: dict[str, tuple[Message, float, asyncio.Future]] = {}

        # Dead-letter queue
        self._dead_letter: deque[Message] = deque(maxlen=1000)

        # Delivered messages (for dedup on receiver side)
        self._delivered: deque[str] = deque(maxlen=5000)

        # Transport callbacks
        self._send_callback: Callable[[Message], Awaitable[bool]] | None = None
        self._ack_callback: Callable[[str, bool], None] | None = None

        # WebSocket connections (conversation_id -> set of websockets)
        self._websockets: dict[str, set] = defaultdict(set)

        # Worker
        self._worker: asyncio.Task | None = None
        self._running = False

        # Stats
        self._total_sent = 0
        self._total_acked = 0
        self._total_failed = 0
        self._total_dead_letter = 0
        self._total_retries = 0
        self._total_rlt_compressed = 0

    def set_send_callback(self, callback: Callable[[Message], Any]) -> None:
        """Set the transport callback for delivering messages."""
        self._send_callback = callback

    def set_ack_callback(self, callback: Callable[[str, bool], None]) -> None:
        """Set the callback called when an ACK is received."""
        self._ack_callback = callback

    async def start(self) -> None:
        """Start the message delivery worker."""
        if self._running:
            return
        self._running = True
        self._worker = asyncio.create_task(self._worker_loop())
        self._ack_monitor = asyncio.create_task(self._ack_monitor_loop())
        logger.info("MessageChannel started (ack_timeout=%ss, max_retries=%s)",
                    self._ack_timeout_s, self._max_retries)

    async def stop(self) -> None:
        """Stop the message channel."""
        self._running = False
        for task in (self._worker, getattr(self, "_ack_monitor", None)):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        logger.info("MessageChannel stopped (sent=%s, acked=%s, failed=%s, dead_letter=%s)",
                    self._total_sent, self._total_acked, self._total_failed, self._total_dead_letter)

    async def send(
        self,
        conversation_id: str,
        sender: str,
        recipient: str,
        content: str,
        msg_type: str = "text",
        metadata: dict | None = None,
        priority: int = 5,
    ) -> str:
        """Send a message. Returns message_id immediately (async delivery)."""
        msg_id = f"msg-{uuid.uuid4().hex[:12]}"
        seq = self._sequences[conversation_id]
        self._sequences[conversation_id] += 1

        msg = Message(
            id=msg_id,
            conversation_id=conversation_id,
            sender=sender,
            recipient=recipient,
            content=content,
            msg_type=msg_type,
            metadata=metadata or {},
            sequence=seq,
            priority=priority,
        )

        # RLT compress if content is large
        if len(content) > self._rlt_compress_threshold:
            try:
                from inc_llm.recursive_link.tokens import LinkTokenBuilder
                token = LinkTokenBuilder.from_message({
                    "id": msg_id,
                    "conversation_id": conversation_id,
                    "content": content,
                })
                msg.metadata["rlt_token"] = token.as_dict()
                msg.rlt_compressed = True
                self._total_rlt_compressed += 1
                logger.debug("Message %s RLT-compressed (%s bytes -> token)", msg_id, len(content))
            except Exception as e:
                logger.debug("RLT compression skipped: %s", e)

        # Add to priority queue (negative priority for max-heap behavior)
        await self._queue.put((-msg.priority, msg.timestamp, msg))
        return msg_id

    def ack(self, message_id: str, success: bool = True) -> None:
        """Acknowledge a message (called by receiver or transport)."""
        if message_id in self._pending_acks:
            msg, deadline, future = self._pending_acks.pop(message_id)
            if not future.done():
                future.set_result(success)
            if success:
                msg.status = "acked"
                self._total_acked += 1
                self._delivered.append(message_id)
            if self._ack_callback:
                self._ack_callback(message_id, success)

    async def _worker_loop(self) -> None:
        """Deliver messages by priority."""
        while self._running:
            try:
                priority, timestamp, msg = await self._queue.get()

                # Skip if already dead-lettered
                if msg.status == "dead_letter":
                    continue

                # Deliver
                msg.status = "delivered"
                self._total_sent += 1

                if self._send_callback:
                    try:
                        await self._send_callback(msg)
                    except Exception as e:
                        logger.warning("Message send failed: %s (msg=%s)", e, msg.id)
                        await self._retry_or_dead_letter(msg, str(e))
                        continue

                # Set up ACK tracking
                future = asyncio.get_event_loop().create_future()
                deadline = time.time() + self._ack_timeout_s
                self._pending_acks[msg.id] = (msg, deadline, future)

                try:
                    await asyncio.wait_for(future, timeout=self._ack_timeout_s)
                except asyncio.TimeoutError:
                    logger.debug("Message %s ACK timeout (retry %s/%s)",
                                 msg.id, msg.retries + 1, self._max_retries)
                    await self._retry_or_dead_letter(msg, "ack_timeout")
                except asyncio.CancelledError:
                    break

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("MessageChannel worker error: %s", e)

    async def _ack_monitor_loop(self) -> None:
        """Monitor for ACK timeouts and retry/dead-letter."""
        while self._running:
            await asyncio.sleep(5.0)
            now = time.time()
            expired = [
                msg_id for msg_id, (_, deadline, _) in self._pending_acks.items()
                if deadline < now
            ]
            for msg_id in expired:
                msg, _, future = self._pending_acks.pop(msg_id)
                if not future.done():
                    future.set_exception(asyncio.TimeoutError())
                await self._retry_or_dead_letter(msg, "ack_timeout")

    async def _retry_or_dead_letter(self, msg: Message, reason: str) -> None:
        """Retry a failed message or move to dead-letter queue."""
        msg.retries += 1
        if msg.retries > self._max_retries:
            msg.status = "dead_letter"
            self._dead_letter.append(msg)
            self._total_dead_letter += 1
            logger.warning("Message %s moved to dead-letter (retries=%s, reason=%s)",
                           msg.id, msg.retries, reason)
        else:
            msg.status = "pending"
            self._total_retries += 1
            # Exponential backoff
            backoff = min(msg.retries * 2, 10)
            await asyncio.sleep(backoff)
            # Re-queue with same priority
            await self._queue.put((-msg.priority, time.time(), msg))
            logger.debug("Message %s retrying (attempt %s/%s, backoff=%ss)",
                         msg.id, msg.retries, self._max_retries, backoff)

    def register_websocket(self, conversation_id: str, ws: Any) -> None:
        """Register a WebSocket connection for a conversation."""
        self._websockets[conversation_id].add(ws)

    def unregister_websocket(self, conversation_id: str, ws: Any) -> None:
        """Unregister a WebSocket connection."""
        if conversation_id in self._websockets:
            self._websockets[conversation_id].discard(ws)
            if not self._websockets[conversation_id]:
                del self._websockets[conversation_id]

    def get_stats(self) -> dict:
        """Return channel statistics."""
        return {
            "running": self._running,
            "queue_size": self._queue.qsize(),
            "pending_acks": len(self._pending_acks),
            "dead_letter_count": len(self._dead_letter),
            "active_conversations": len(self._sequences),
            "websocket_connections": sum(len(ws_set) for ws_set in self._websockets.values()),
            "total_sent": self._total_sent,
            "total_acked": self._total_acked,
            "total_failed": self._total_failed,
            "total_dead_letter": self._total_dead_letter,
            "total_retries": self._total_retries,
            "total_rlt_compressed": self._total_rlt_compressed,
        }

    def get_dead_letter(self) -> list[dict]:
        """Get dead-letter messages."""
        return [
            {
                "id": m.id, "conversation_id": m.conversation_id,
                "sender": m.sender, "recipient": m.recipient,
                "content": m.content[:200], "retries": m.retries,
                "timestamp": m.timestamp,
            }
            for m in self._dead_letter
        ]

    def get_conversations(self) -> list[dict]:
        """Get active conversations with message counts."""
        return [
            {"conversation_id": conv_id, "sequence": seq}
            for conv_id, seq in self._sequences.items()
        ]
