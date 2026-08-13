"""Free server connector — discovers and connects to free Ollama instances.

Maintains a registry of free/community Ollama servers that can be used
for load distribution. Free servers are periodically validated and
removed if they become unavailable.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from inc_llm.rlos.server_node import ServerNodeManager

logger = logging.getLogger(__name__)

DEFAULT_FREE_SERVERS: list[str] = [
    # Community Ollama instances (placeholders — real URLs would be configured)
]


class FreeServerConnector:
    """Discovers and manages free Ollama server connections."""

    def __init__(self, node_manager: ServerNodeManager, free_servers: list[str] | None = None) -> None:
        self.node_manager = node_manager
        self._free_server_urls = free_servers or DEFAULT_FREE_SERVERS
        self._running = False

    async def connect_all(self) -> int:
        """Connect to all configured free servers."""
        connected = 0
        for url in self._free_server_urls:
            try:
                self.node_manager.add_server(url=url, name=f"free-{url}", is_free=True)
                connected += 1
            except Exception as e:
                logger.warning("Failed to connect to free server %s: %s", url, e)
        logger.info("Connected to %d free servers", connected)
        return connected

    async def add_free_server(self, url: str) -> bool:
        """Add a new free server."""
        try:
            self.node_manager.add_server(url=url, name=f"free-{url}", is_free=True)
            if url not in self._free_server_urls:
                self._free_server_urls.append(url)
            logger.info("Added free server: %s", url)
            return True
        except Exception as e:
            logger.warning("Failed to add free server %s: %s", url, e)
            return False

    async def remove_free_server(self, url: str) -> bool:
        """Remove a free server."""
        if url in self._free_server_urls:
            self._free_server_urls.remove(url)
        return self.node_manager.remove_server(url)

    def get_free_servers(self) -> list[str]:
        return list(self._free_server_urls)

    def get_stats(self) -> dict[str, Any]:
        free_nodes = [s for s in self.node_manager.get_all_servers() if s.is_free]
        return {
            "total_free_servers": len(free_nodes),
            "healthy_free": sum(1 for s in free_nodes if s.status.value == "healthy"),
            "urls": self._free_server_urls,
        }


@dataclass
class FreeServerSlot:
    """A managed free server slot for execution support."""
    slot_id: int
    name: str
    purpose: str
    server_url: str = ""
    is_free: bool = True
    is_active: bool = False
    health_status: str = "unknown"
    assigned_at: float = 0.0


SLOT_PURPOSES = [
    "execution_primary_1",
    "execution_primary_2",
    "execution_primary_3",
    "execution_primary_4",
    "execution_primary_5",
    "reserved_1",
    "reserved_2",
    "reserved_3",
    "reserved_4",
    "reserved_5",
]


class FreeServerSlotManager:
    """Manages RLOS free server slots for execution support.

    10 slots total: 5 for execution, 5 reserved for future use.
    Execution slots are used by the ExecutionEngine for running commands.
    Reserved slots can be assigned to specific purposes on demand.
    """

    def __init__(
        self,
        free_server_url: str = "",
        node_manager: Any = None,
        total_slots: int = 10,
        execution_slots: int = 5,
    ) -> None:
        self.free_server_url = free_server_url
        self.node_manager = node_manager
        self.total_slots = total_slots
        self.execution_slots_count = execution_slots

        self._slots: dict[int, FreeServerSlot] = {}
        for i in range(total_slots):
            purpose = SLOT_PURPOSES[i] if i < len(SLOT_PURPOSES) else f"slot_{i}"
            self._slots[i] = FreeServerSlot(
                slot_id=i,
                name=f"slot-{i}",
                purpose=purpose,
            )

    def get_slot(self, slot_id: int) -> FreeServerSlot | None:
        return self._slots.get(slot_id)

    def get_slots_by_purpose(self, purpose: str) -> list[FreeServerSlot]:
        return [s for s in self._slots.values() if purpose in s.purpose]

    def get_execution_slots(self) -> list[FreeServerSlot]:
        return [s for s in self._slots.values() if "execution" in s.purpose]

    def get_reserved_slots(self) -> list[FreeServerSlot]:
        return [s for s in self._slots.values() if "reserved" in s.purpose]

    def assign_reserved_slot(self, slot_id: int, purpose: str, name: str = "") -> bool:
        """Assign a reserved slot to a specific purpose."""
        slot = self._slots.get(slot_id)
        if not slot or "reserved" not in slot.purpose:
            return False
        if not slot.is_free:
            return False
        slot.purpose = purpose
        slot.name = name or slot.name
        slot.is_free = False
        slot.is_active = True
        slot.assigned_at = time.time()
        return True

    def release_slot(self, slot_id: int) -> bool:
        """Release a slot back to free pool."""
        slot = self._slots.get(slot_id)
        if not slot:
            return False
        slot.is_free = True
        slot.is_active = False
        slot.server_url = ""
        slot.health_status = "unknown"
        original_purpose = SLOT_PURPOSES[slot_id] if slot_id < len(SLOT_PURPOSES) else f"slot_{slot_id}"
        slot.purpose = original_purpose
        return True

    async def health_check_slots(self) -> dict[str, Any]:
        """Check health of all active slots."""
        healthy = 0
        unhealthy = 0
        for slot in self._slots.values():
            if slot.is_active and slot.server_url:
                try:
                    import aiohttp
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"{slot.server_url}/api/tags",
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False,
                        ) as resp:
                            if resp.status == 200:
                                slot.health_status = "healthy"
                                healthy += 1
                            else:
                                slot.health_status = "unhealthy"
                                unhealthy += 1
                except Exception:
                    slot.health_status = "unreachable"
                    unhealthy += 1
            else:
                if not slot.is_active:
                    slot.health_status = "inactive"

        return {"healthy": healthy, "unhealthy": unhealthy, "total_active": healthy + unhealthy}

    def get_stats(self) -> dict[str, Any]:
        return {
            "total_slots": self.total_slots,
            "free_slots": sum(1 for s in self._slots.values() if s.is_free),
            "active_slots": sum(1 for s in self._slots.values() if s.is_active),
            "execution_slots": len(self.get_execution_slots()),
            "reserved_slots": len(self.get_reserved_slots()),
            "slots": [
                {
                    "slot_id": s.slot_id,
                    "name": s.name,
                    "purpose": s.purpose,
                    "is_free": s.is_free,
                    "is_active": s.is_active,
                    "health_status": s.health_status,
                }
                for s in self._slots.values()
            ],
        }

