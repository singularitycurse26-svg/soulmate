"""Aceline Hybrid Messaging package.

Two specialized channels:
- LogChannel: high-volume, fire-and-forget, batch SQLite (for observer)
- MessageChannel: low-volume, guaranteed delivery, real-time (for messaging)
- HybridBus: unified bus combining both channels + MCP adapter + router
- UMA: Universal Messaging Adapter for Telegram/WhatsApp/WeChat/Signal
- MCPServer: standalone MCP server for external AI tools
"""

from inc_llm.messaging.log_channel import LogChannel
from inc_llm.messaging.glm_queue import GLMPriorityQueue, GLMRequest
from inc_llm.messaging.message_channel import MessageChannel, Message
from inc_llm.messaging.hybrid_bus import HybridBus
from inc_llm.messaging.uma import (
    UniversalMessagingAdapter, MessagingAdapter,
    TelegramAdapter, WhatsAppAdapter, WeChatAdapter, SignalAdapter,
)
from inc_llm.messaging.mcp_server import MCPServer

__all__ = [
    "LogChannel",
    "GLMPriorityQueue",
    "GLMRequest",
    "MessageChannel",
    "Message",
    "HybridBus",
    "UniversalMessagingAdapter",
    "MessagingAdapter",
    "TelegramAdapter",
    "WhatsAppAdapter",
    "WeChatAdapter",
    "SignalAdapter",
    "MCPServer",
]
