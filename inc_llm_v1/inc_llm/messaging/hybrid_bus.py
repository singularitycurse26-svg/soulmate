"""Hybrid Bus — combines LogChannel and MessageChannel with routing.

The HybridBus is the unified entry point for all messaging:
- Activity events → LogChannel (fire-and-forget, batch SQLite)
- Interactive messages → MessageChannel (guaranteed delivery, real-time)
- MCP adapter integration
- Priority routing (user > aceline > observer > prefetch)

This replaces the old "one-size-fits-all" approach where the same transport
was used for both high-volume logging and low-latency messaging.
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.messaging.log_channel import LogChannel
from inc_llm.messaging.message_channel import MessageChannel, Message

logger = logging.getLogger(__name__)


class HybridBus:
    """Unified messaging bus combining LogChannel and MessageChannel.

    Routes traffic to the appropriate channel based on type:
    - Activity events (navigation, clicks, commands) → LogChannel
    - Interactive messages (chat, commands, workflows) → MessageChannel
    """

    def __init__(
        self,
        log_channel: LogChannel | None = None,
        message_channel: MessageChannel | None = None,
    ) -> None:
        self.log_channel = log_channel
        self.message_channel = message_channel
        self._running = False

    async def start(self) -> None:
        """Start both channels."""
        if self._running:
            return
        self._running = True
        if self.log_channel:
            await self.log_channel.start()
        if self.message_channel:
            await self.message_channel.start()
        logger.info("HybridBus started (log=%s, message=%s)",
                    bool(self.log_channel), bool(self.message_channel))

    async def stop(self) -> None:
        """Stop both channels."""
        self._running = False
        if self.log_channel:
            await self.log_channel.stop()
        if self.message_channel:
            await self.message_channel.stop()
        logger.info("HybridBus stopped")

    # ── Log Channel (fire-and-forget) ──

    async def log_event(self, event: dict) -> dict:
        """Log an activity event — fire-and-forget."""
        if not self.log_channel:
            return {"status": "disabled"}
        return await self.log_channel.ingest([event])

    async def log_events(self, events: list[dict]) -> dict:
        """Log a batch of activity events — fire-and-forget."""
        if not self.log_channel:
            return {"status": "disabled"}
        return await self.log_channel.ingest(events)

    # ── Message Channel (guaranteed delivery) ──

    async def send_message(
        self,
        conversation_id: str,
        sender: str,
        recipient: str,
        content: str,
        msg_type: str = "text",
        metadata: dict | None = None,
        priority: int = 5,
    ) -> str:
        """Send an interactive message — guaranteed delivery."""
        if not self.message_channel:
            return ""
        return await self.message_channel.send(
            conversation_id, sender, recipient, content,
            msg_type, metadata, priority,
        )

    def ack_message(self, message_id: str, success: bool = True) -> None:
        """Acknowledge a message."""
        if self.message_channel:
            self.message_channel.ack(message_id, success)

    # ── Stats ──

    def get_stats(self) -> dict:
        """Get combined statistics from both channels."""
        return {
            "log_channel": self.log_channel.get_stats() if self.log_channel else None,
            "message_channel": self.message_channel.get_stats() if self.message_channel else None,
        }
