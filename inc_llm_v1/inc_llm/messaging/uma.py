"""Universal Messaging Adapter (UMA) — one interface for all messaging apps.

PROBLEM:
  Telegram, WhatsApp, WeChat, and Signal all have completely different APIs:
  - Telegram: Bot API (HTTP REST)
  - WhatsApp: whatsapp-web.js (Node.js, QR-based, browser bridge)
  - WeChat: Wechaty (Node.js, QR-based, browser bridge)
  - Signal: signal-cli (Java CLI, phone-based)

  An AI agent that wants to send a message shouldn't need to know which app
  the recipient uses or how that app's API works.

SOLUTION:
  UMA provides one common interface:
    uma.send("telegram", "@user", "Hello")
    uma.send("whatsapp", "+1234567890", "Hello")
    uma.send("wechat", "user_id", "Hello")
    uma.send("signal", "+1234567890", "Hello")
    uma.send("auto", "@user", "Hello")  # Picks best available

  Each adapter is isolated behind a common contract. The AI calls one
  unified messaging tool (via MCP) without knowing app-specific APIs.

  Adapters communicate through JSON over stdin/stdout where subprocesses
  are needed (browser bridges, signal-cli).
"""

from __future__ import annotations

import asyncio
import json
import logging
import subprocess
import time
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class MessagingApp:
    """Represents a connected messaging app."""
    name: str
    display_name: str
    enabled: bool = False
    connected: bool = False
    status: str = "disconnected"  # disconnected, connecting, connected, error
    requires_qr: bool = False
    qr_code: str = ""
    phone_number: str = ""
    capabilities: list = field(default_factory=lambda: ["send", "receive", "chats"])
    last_error: str = ""


class MessagingAdapter(ABC):
    """Abstract base class for messaging adapters."""

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def connect(self, credentials: dict) -> dict: ...

    @abstractmethod
    async def disconnect(self) -> dict: ...

    @abstractmethod
    async def send(self, recipient: str, content: str, conversation_id: str = "") -> dict: ...

    @abstractmethod
    async def receive(self, conversation_id: str = "", limit: int = 50) -> list[dict]: ...

    @abstractmethod
    async def list_chats(self) -> list[dict]: ...

    @abstractmethod
    def get_status(self) -> MessagingApp: ...


# ── Telegram Adapter ───────────────────────────────────────────────────

class TelegramAdapter(MessagingAdapter):
    """Telegram adapter — uses the Bot API (HTTP REST, no subprocess needed).

    Wraps the existing TelegramIntegration if available, or uses the Bot API
    directly. This is the most reliable adapter since Telegram has a clean
    HTTP API with no browser bridge required.
    """

    def __init__(self, bot_token: str = "") -> None:
        self._bot_token = bot_token
        self._api_base = "https://api.telegram.org/bot"
        self._connected = False
        self._bot_info: dict = {}
        self._chats: dict[str, dict] = {}
        self._messages: list[dict] = []
        self._last_update_id = 0

    @property
    def name(self) -> str:
        return "telegram"

    async def connect(self, credentials: dict) -> dict:
        token = credentials.get("bot_token", self._bot_token)
        if not token:
            return {"status": "error", "message": "Bot token required"}
        self._bot_token = token
        try:
            info = await asyncio.to_thread(self._api_call, "getMe")
            if info.get("ok"):
                self._bot_info = info.get("result", {})
                self._connected = True
                logger.info("Telegram connected: @%s", self._bot_info.get("username", ""))
                return {"status": "connected", "bot": self._bot_info}
            return {"status": "error", "message": info.get("description", "Unknown error")}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def disconnect(self) -> dict:
        self._connected = False
        return {"status": "disconnected"}

    async def send(self, recipient: str, content: str, conversation_id: str = "") -> dict:
        if not self._connected:
            return {"status": "error", "message": "Not connected"}
        try:
            result = await asyncio.to_thread(
                self._api_call, "sendMessage",
                chat_id=recipient, text=content,
            )
            if result.get("ok"):
                msg = result.get("result", {})
                self._messages.append({
                    "id": str(msg.get("message_id", "")),
                    "app": "telegram",
                    "sender": "bot",
                    "recipient": recipient,
                    "content": content,
                    "timestamp": msg.get("date", time.time()),
                    "conversation_id": str(recipient),
                })
                return {"status": "sent", "message_id": str(msg.get("message_id", ""))}
            return {"status": "error", "message": result.get("description", "Send failed")}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def receive(self, conversation_id: str = "", limit: int = 50) -> list[dict]:
        if not self._connected:
            return []
        try:
            result = await asyncio.to_thread(
                self._api_call, "getUpdates",
                offset=self._last_update_id + 1, limit=limit,
            )
            messages = []
            if result.get("ok"):
                for update in result.get("result", []):
                    self._last_update_id = max(self._last_update_id, update.get("update_id", 0))
                    msg = update.get("message", {})
                    if not msg:
                        continue
                    chat_id = str(msg.get("chat", {}).get("id", ""))
                    if conversation_id and chat_id != conversation_id:
                        continue
                    entry = {
                        "id": str(msg.get("message_id", "")),
                        "app": "telegram",
                        "sender": msg.get("from", {}).get("username", str(msg.get("from", {}).get("id", ""))),
                        "recipient": "bot",
                        "content": msg.get("text", ""),
                        "timestamp": msg.get("date", time.time()),
                        "conversation_id": chat_id,
                    }
                    messages.append(entry)
                    self._messages.append(entry)
                    # Track chat
                    self._chats[chat_id] = {
                        "id": chat_id,
                        "app": "telegram",
                        "name": msg.get("chat", {}).get("title", msg.get("from", {}).get("username", chat_id)),
                        "last_message": entry,
                    }
            return messages
        except Exception as e:
            logger.warning("Telegram receive failed: %s", e)
            return []

    async def list_chats(self) -> list[dict]:
        return list(self._chats.values())

    def get_status(self) -> MessagingApp:
        return MessagingApp(
            name="telegram",
            display_name="Telegram",
            enabled=bool(self._bot_token),
            connected=self._connected,
            status="connected" if self._connected else "disconnected",
            requires_qr=False,
        )

    def _api_call(self, method: str, **params) -> dict:
        """Call Telegram Bot API (runs in thread)."""
        url = f"{self._api_base}{self._bot_token}/{method}"
        data = json.dumps(params).encode() if params else None
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read().decode())


# ── WhatsApp Adapter (whatsapp-web.js bridge) ──────────────────────────

class WhatsAppAdapter(MessagingAdapter):
    """WhatsApp adapter — uses whatsapp-web.js via a Node.js subprocess bridge.

    Requires:
    - Node.js installed
    - npm install whatsapp-web.js qrcode-terminal
    - Bridge script at configured path

    The bridge communicates via JSON over stdin/stdout.
    QR code is displayed for phone pairing on first connect.
    """

    def __init__(self, bridge_path: str = "~/.inc_llm/whatsapp_bridge") -> None:
        self._bridge_path = bridge_path
        self._process: asyncio.subprocess.Process | None = None
        self._connected = False
        self._qr_code = ""
        self._chats: dict[str, dict] = {}
        self._messages: list[dict] = []

    @property
    def name(self) -> str:
        return "whatsapp"

    async def connect(self, credentials: dict) -> dict:
        import os
        bridge_script = os.path.expanduser(f"{self._bridge_path}/bridge.js")
        if not os.path.exists(bridge_script):
            return {
                "status": "error",
                "message": f"Bridge script not found at {bridge_script}. Run setup first.",
                "requires_setup": True,
            }
        try:
            self._process = await asyncio.create_subprocess_exec(
                "node", bridge_script,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            # Wait for QR code or ready signal
            await asyncio.sleep(2)
            return {
                "status": "connecting",
                "message": "Bridge started. Scan QR code with WhatsApp phone app.",
                "requires_qr": True,
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def disconnect(self) -> dict:
        if self._process:
            self._process.terminate()
            await self._process.wait()
            self._process = None
        self._connected = False
        return {"status": "disconnected"}

    async def send(self, recipient: str, content: str, conversation_id: str = "") -> dict:
        if not self._process or not self._connected:
            return {"status": "error", "message": "Not connected"}
        return await self._bridge_call("send", {"to": recipient, "content": content})

    async def receive(self, conversation_id: str = "", limit: int = 50) -> list[dict]:
        if not self._process or not self._connected:
            return []
        result = await self._bridge_call("receive", {"conversation_id": conversation_id, "limit": limit})
        return result.get("messages", [])

    async def list_chats(self) -> list[dict]:
        if not self._process or not self._connected:
            return []
        result = await self._bridge_call("list_chats", {})
        return result.get("chats", [])

    def get_status(self) -> MessagingApp:
        return MessagingApp(
            name="whatsapp",
            display_name="WhatsApp",
            enabled=True,
            connected=self._connected,
            status="connected" if self._connected else ("connecting" if self._process else "disconnected"),
            requires_qr=True,
            qr_code=self._qr_code,
        )

    async def _bridge_call(self, action: str, params: dict) -> dict:
        """Send a command to the bridge subprocess and get response."""
        if not self._process or not self._process.stdin:
            return {"error": "Bridge not running"}
        cmd = json.dumps({"action": action, **params}) + "\n"
        self._process.stdin.write(cmd.encode())
        await self._process.stdin.drain()
        # Read response (simplified — real impl would have proper framing)
        line = await self._process.stdout.readline()
        return json.loads(line.decode().strip())


# ── WeChat Adapter (Wechaty bridge) ────────────────────────────────────

class WeChatAdapter(MessagingAdapter):
    """WeChat adapter — uses Wechaty via a Node.js subprocess bridge.

    Requires:
    - Node.js installed
    - npm install wechaty qrcode-terminal
    - Bridge script at configured path

    Similar to WhatsApp — QR code pairing, JSON over stdin/stdout.
    """

    def __init__(self, bridge_path: str = "~/.inc_llm/wechat_bridge") -> None:
        self._bridge_path = bridge_path
        self._process: asyncio.subprocess.Process | None = None
        self._connected = False
        self._qr_code = ""
        self._chats: dict[str, dict] = {}
        self._messages: list[dict] = []

    @property
    def name(self) -> str:
        return "wechat"

    async def connect(self, credentials: dict) -> dict:
        import os
        bridge_script = os.path.expanduser(f"{self._bridge_path}/bridge.js")
        if not os.path.exists(bridge_script):
            return {
                "status": "error",
                "message": f"Bridge script not found at {bridge_script}. Run setup first.",
                "requires_setup": True,
            }
        try:
            self._process = await asyncio.create_subprocess_exec(
                "node", bridge_script,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.sleep(2)
            return {
                "status": "connecting",
                "message": "Bridge started. Scan QR code with WeChat phone app.",
                "requires_qr": True,
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def disconnect(self) -> dict:
        if self._process:
            self._process.terminate()
            await self._process.wait()
            self._process = None
        self._connected = False
        return {"status": "disconnected"}

    async def send(self, recipient: str, content: str, conversation_id: str = "") -> dict:
        if not self._process or not self._connected:
            return {"status": "error", "message": "Not connected"}
        return await self._bridge_call("send", {"to": recipient, "content": content})

    async def receive(self, conversation_id: str = "", limit: int = 50) -> list[dict]:
        if not self._process or not self._connected:
            return []
        result = await self._bridge_call("receive", {"conversation_id": conversation_id, "limit": limit})
        return result.get("messages", [])

    async def list_chats(self) -> list[dict]:
        if not self._process or not self._connected:
            return []
        result = await self._bridge_call("list_chats", {})
        return result.get("chats", [])

    def get_status(self) -> MessagingApp:
        return MessagingApp(
            name="wechat",
            display_name="WeChat",
            enabled=True,
            connected=self._connected,
            status="connected" if self._connected else ("connecting" if self._process else "disconnected"),
            requires_qr=True,
            qr_code=self._qr_code,
        )

    async def _bridge_call(self, action: str, params: dict) -> dict:
        if not self._process or not self._process.stdin:
            return {"error": "Bridge not running"}
        cmd = json.dumps({"action": action, **params}) + "\n"
        self._process.stdin.write(cmd.encode())
        await self._process.stdin.drain()
        line = await self._process.stdout.readline()
        return json.loads(line.decode().strip())


# ── Signal Adapter (signal-cli) ─────────────────────────────────────────

class SignalAdapter(MessagingAdapter):
    """Signal adapter — uses signal-cli (Java CLI, no browser bridge needed).

    Requires:
    - Java installed
    - signal-cli installed and configured
    - Phone number registered with signal-cli

    This is the most reliable browser-free adapter after Telegram.
    signal-cli communicates via subprocess calls.
    """

    def __init__(self, phone_number: str = "", cli_path: str = "signal-cli") -> None:
        self._phone_number = phone_number
        self._cli_path = cli_path
        self._connected = False
        self._chats: dict[str, dict] = {}
        self._messages: list[dict] = []

    @property
    def name(self) -> str:
        return "signal"

    async def connect(self, credentials: dict) -> dict:
        phone = credentials.get("phone_number", self._phone_number)
        if not phone:
            return {"status": "error", "message": "Phone number required"}
        self._phone_number = phone
        # Check if signal-cli is available
        try:
            result = await asyncio.create_subprocess_exec(
                self._cli_path, "--version",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await result.wait()
            if result.returncode == 0:
                self._connected = True
                logger.info("Signal connected via signal-cli (phone: %s)", phone)
                return {"status": "connected", "phone": phone}
            return {"status": "error", "message": "signal-cli not found or not configured"}
        except Exception as e:
            return {"status": "error", "message": f"signal-cli error: {e}"}

    async def disconnect(self) -> dict:
        self._connected = False
        return {"status": "disconnected"}

    async def send(self, recipient: str, content: str, conversation_id: str = "") -> dict:
        if not self._connected:
            return {"status": "error", "message": "Not connected"}
        try:
            result = await asyncio.create_subprocess_exec(
                self._cli_path, "-u", self._phone_number, "send",
                "-m", content, recipient,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await result.wait()
            if result.returncode == 0:
                msg = {
                    "id": f"sig-{time.time_ns()}",
                    "app": "signal",
                    "sender": self._phone_number,
                    "recipient": recipient,
                    "content": content,
                    "timestamp": time.time(),
                    "conversation_id": recipient,
                }
                self._messages.append(msg)
                return {"status": "sent", "message_id": msg["id"]}
            stderr = await result.stderr.read()
            return {"status": "error", "message": stderr.decode().strip()}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def receive(self, conversation_id: str = "", limit: int = 50) -> list[dict]:
        if not self._connected:
            return []
        try:
            result = await asyncio.create_subprocess_exec(
                self._cli_path, "-u", self._phone_number, "receive", "-t", "-n", str(limit),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await result.communicate()
            # Parse signal-cli JSON output
            messages = []
            for line in stdout.decode().strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    msg = {
                        "id": str(data.get("timestamp", "")),
                        "app": "signal",
                        "sender": data.get("envelope", {}).get("sourceNumber", ""),
                        "recipient": self._phone_number,
                        "content": data.get("envelope", {}).get("dataMessage", {}).get("message", ""),
                        "timestamp": data.get("timestamp", time.time()) / 1000,
                        "conversation_id": data.get("envelope", {}).get("sourceNumber", ""),
                    }
                    if conversation_id and msg["conversation_id"] != conversation_id:
                        continue
                    messages.append(msg)
                    self._messages.append(msg)
                except json.JSONDecodeError:
                    continue
            return messages
        except Exception as e:
            logger.warning("Signal receive failed: %s", e)
            return []

    async def list_chats(self) -> list[dict]:
        # Signal doesn't have a direct "list chats" — derive from received messages
        return list(self._chats.values())

    def get_status(self) -> MessagingApp:
        return MessagingApp(
            name="signal",
            display_name="Signal",
            enabled=bool(self._phone_number),
            connected=self._connected,
            status="connected" if self._connected else "disconnected",
            requires_qr=False,
            phone_number=self._phone_number,
        )


# ── Universal Messaging Adapter ─────────────────────────────────────────

class UniversalMessagingAdapter:
    """One interface for all messaging apps.

    Routes outbound and inbound messages to the correct adapter.
    Normalizes message IDs, conversation IDs, timestamps, attachments, status.
    """

    def __init__(self, config=None) -> None:
        self._adapters: dict[str, MessagingAdapter] = {}
        self._config = config

        # Initialize adapters (all disabled by default until configured)
        self._adapters["telegram"] = TelegramAdapter(
            bot_token=getattr(config, "telegram_bot_token", "") if config else "",
        )
        self._adapters["whatsapp"] = WhatsAppAdapter(
            bridge_path=getattr(config, "whatsapp_bridge_path", "~/.inc_llm/whatsapp_bridge") if config else "~/.inc_llm/whatsapp_bridge",
        )
        self._adapters["wechat"] = WeChatAdapter(
            bridge_path=getattr(config, "wechat_bridge_path", "~/.inc_llm/wechat_bridge") if config else "~/.inc_llm/wechat_bridge",
        )
        self._adapters["signal"] = SignalAdapter(
            phone_number=getattr(config, "signal_phone_number", "") if config else "",
            cli_path=getattr(config, "signal_cli_path", "signal-cli") if config else "signal-cli",
        )

    async def connect(self, app: str, credentials: dict) -> dict:
        """Connect to a messaging app."""
        adapter = self._adapters.get(app)
        if not adapter:
            return {"status": "error", "message": f"Unknown app: {app}"}
        return await adapter.connect(credentials)

    async def disconnect(self, app: str) -> dict:
        """Disconnect from a messaging app."""
        adapter = self._adapters.get(app)
        if not adapter:
            return {"status": "error", "message": f"Unknown app: {app}"}
        return await adapter.disconnect()

    async def send(self, app: str, recipient: str, content: str, conversation_id: str = "") -> dict:
        """Send a message to a recipient on the specified app.

        If app is "auto", picks the best available connected app.
        """
        if app == "auto":
            # Pick first connected app
            for name, adapter in self._adapters.items():
                status = adapter.get_status()
                if status.connected:
                    return await adapter.send(recipient, content, conversation_id)
            return {"status": "error", "message": "No apps connected"}

        adapter = self._adapters.get(app)
        if not adapter:
            return {"status": "error", "message": f"Unknown app: {app}"}
        return await adapter.send(recipient, content, conversation_id)

    async def receive(self, app: str = "all", conversation_id: str = "", limit: int = 50) -> dict:
        """Receive messages from one or all apps."""
        results = {}
        apps = [app] if app != "all" else list(self._adapters.keys())
        for name in apps:
            adapter = self._adapters.get(name)
            if adapter and adapter.get_status().connected:
                results[name] = await adapter.receive(conversation_id, limit)
            else:
                results[name] = []
        return results

    async def list_chats(self, app: str = "all") -> dict:
        """List active chats from one or all apps."""
        results = {}
        apps = [app] if app != "all" else list(self._adapters.keys())
        for name in apps:
            adapter = self._adapters.get(name)
            if adapter and adapter.get_status().connected:
                results[name] = await adapter.list_chats()
            else:
                results[name] = []
        return results

    def list_apps(self) -> list[dict]:
        """List all apps and their status."""
        return [
            {
                "name": adapter.get_status().name,
                "display_name": adapter.get_status().display_name,
                "enabled": adapter.get_status().enabled,
                "connected": adapter.get_status().connected,
                "status": adapter.get_status().status,
                "requires_qr": adapter.get_status().requires_qr,
                "phone_number": adapter.get_status().phone_number,
                "capabilities": adapter.get_status().capabilities,
                "last_error": adapter.get_status().last_error,
            }
            for adapter in self._adapters.values()
        ]

    def get_stats(self) -> dict:
        """Get UMA statistics."""
        return {
            "apps": self.list_apps(),
            "total_apps": len(self._adapters),
            "connected_apps": sum(1 for a in self._adapters.values() if a.get_status().connected),
        }
