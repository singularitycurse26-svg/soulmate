"""RAMM1 OS — userspace resource allocator for the 3.5 GB RAM lock.

Reserves a real 3.5 GB of committed process memory on each participating machine
(only on machines with enough RAM; not for 4 GB boxes). The reservation is a real,
visible memory hold — the process's working set grows by 3.5 GB and the OS sees
that memory as used.

A pressure guard releases the reservation if the host gets low on RAM, then
re-reserves when pressure clears. This prevents Ramm1 from ever crashing the host.

The allocator uses a best-fit + fragmentation-aware policy (like a mini-OS memory
allocator): it tracks free blocks, coalesces, and picks the block with the least
fragmentation that can fit the request.
"""

from __future__ import annotations

import asyncio
import ctypes
import logging
import mmap
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore[assignment]


@dataclass
class AllocTicket:
    """An allocation ticket — represents a block of reserved RAM in use."""
    ticket_id: str
    model_id: str
    ram_gb: float
    node: str  # "local" or peer_id
    block_index: int
    created_at: float = field(default_factory=time.time)


@dataclass
class FreeBlock:
    """A free block in the local reservation."""
    index: int
    start_gb: float
    size_gb: float


class Ramm1OS:
    """RAMM1 OS — userspace resource allocator for the 3.5 GB RAM lock.

    Reserves a real memory region, holds it committed, and allocates blocks from it
    for model-run requests. A pressure guard releases the reservation under host
    memory pressure and re-reserves when clear.
    """

    def __init__(self, config: Any) -> None:
        self.config = config
        self._reserved_gb: float = 0.0
        self._target_gb: float = float(config.ram_reservation_gb)
        self._region: mmap.mmap | ctypes.Array | None = None
        self._region_size_bytes: int = 0
        self._lock = threading.RLock()
        self._allocated: dict[str, AllocTicket] = {}
        self._free_blocks: list[FreeBlock] = []
        self._pressure_monitor_task: asyncio.Task | None = None
        self._running: bool = False
        self._pressure_active: bool = False
        self._sized_target: float = 0.0  # actual target after tier scaling

    # ── Reservation ──

    def _compute_target_gb(self) -> float:
        """Compute the actual reservation target based on total RAM."""
        if psutil is None:
            return min(self._target_gb, 2.0)
        total_gb = psutil.virtual_memory().total / (1024 ** 3)
        if total_gb < self.config.min_total_ram_gb:
            logger.warning("Total RAM %.1f GB < min %.1f GB — Ramm1 OS refuses to install", total_gb, self.config.min_total_ram_gb)
            return 0.0
        tiers = self.config.ram_scale_tiers or {}
        if total_gb >= 16:
            return tiers.get("16+", self._target_gb)
        elif total_gb >= 12:
            return tiers.get("12-16", 3.0)
        elif total_gb >= 8:
            return tiers.get("8-12", 2.0)
        else:
            return min(1.0, self._target_gb)

    def reserve(self) -> bool:
        """Allocate + hold a real memory region of the target size.

        Uses mmap on POSIX, VirtualAlloc on Windows via ctypes. The region is
        committed (pages touched) so the OS sees it as used.
        """
        with self._lock:
            if self._region is not None:
                logger.warning("RAMM1 OS already reserved %.1f GB", self._reserved_gb)
                return True

            target = self._compute_target_gb()
            if target <= 0:
                logger.error("RAMM1 OS: target reservation is 0 — refusing to install")
                return False
            self._sized_target = target

            size_bytes = int(target * 1024 ** 3)
            logger.info("RAMM1 OS: reserving %.2f GB (%d bytes) of committed memory", target, size_bytes)

            try:
                # mmap with MAP_ANONYMOUS | MAP_PRIVATE — a real anonymous region.
                # We touch every page to commit it so the OS sees it as used.
                if sys.platform == "win32":
                    self._region = self._reserve_windows(size_bytes)
                else:
                    self._region = self._reserve_mmap(size_bytes)

                self._region_size_bytes = size_bytes
                self._reserved_gb = target
                self._free_blocks = [FreeBlock(index=0, start_gb=0.0, size_gb=target)]
                self._touch_pages(size_bytes)
                logger.info("RAMM1 OS: reserved %.2f GB successfully", target)
                return True
            except Exception as e:
                logger.error("RAMM1 OS: reservation failed: %s", e)
                self._region = None
                self._reserved_gb = 0.0
                return False

    def _reserve_mmap(self, size_bytes: int) -> mmap.mmap:
        """Reserve an anonymous mmap region (POSIX)."""
        region = mmap.mmap(-1, size_bytes, mmap.MAP_PRIVATE | mmap.MAP_ANONYMOUS, mmap.PROT_READ | mmap.PROT_WRITE)
        return region

    def _reserve_windows(self, size_bytes: int) -> "ctypes.c_void_p":
        """Reserve + commit a memory region on Windows via VirtualAlloc.

        Returns a c_void_p holding the allocated memory pointer. The memory
        stays reserved as long as the pointer is referenced.
        """
        MEM_COMMIT = 0x00001000
        MEM_RESERVE = 0x00002000
        PAGE_READWRITE = 0x04
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        ptr = kernel32.VirtualAlloc(None, ctypes.c_size_t(size_bytes), MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE)
        if not ptr:
            raise OSError(f"VirtualAlloc failed for {size_bytes} bytes (error {kernel32.GetLastError()})")
        # Hold the pointer in a c_void_p — keeps the memory alive without
        # creating a huge ctypes array (which can crash on large sizes).
        return ctypes.c_void_p(ptr)

    def _touch_pages(self, size_bytes: int) -> None:
        """Touch every page to commit it so the OS sees the memory as used.

        Writes a zero byte to each page (page size is typically 4 KB).
        On Windows with c_void_p, this is skipped (VirtualAlloc with MEM_COMMIT
        already commits the pages).
        """
        page_size = mmap.PAGESIZE if hasattr(mmap, "PAGESIZE") else 4096
        try:
            if isinstance(self._region, mmap.mmap):
                for offset in range(0, size_bytes, page_size):
                    self._region[offset:offset + 1] = b"\x00"
            # c_void_p (Windows) — VirtualAlloc with MEM_COMMIT already committed
            # the pages, so no touching needed.
        except Exception as e:
            logger.warning("RAMM1 OS: page-touching skipped (non-fatal, reservation still held): %s", e)

    def release(self) -> None:
        """Release the reservation (free the region)."""
        with self._lock:
            if self._region is None:
                return
            try:
                if isinstance(self._region, mmap.mmap):
                    self._region.close()
                elif sys.platform == "win32" and self._region is not None:
                    MEM_RELEASE = 0x8000
                    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
                    # c_void_p — get its value (the pointer) and pass as c_void_p
                    ptr_val = self._region.value if hasattr(self._region, "value") else None
                    if ptr_val:
                        kernel32.VirtualFree(ctypes.c_void_p(ptr_val), ctypes.c_size_t(0), ctypes.c_uint32(MEM_RELEASE))
            except Exception as e:
                logger.warning("RAMM1 OS: release failed: %s", e)
            self._region = None
            self._region_size_bytes = 0
            self._reserved_gb = 0.0
            self._free_blocks = []
            self._allocated.clear()
            logger.info("RAMM1 OS: reservation released")

    # ── Pressure guard ──

    async def start_pressure_monitor(self) -> None:
        """Start the background pressure monitor."""
        if self._running:
            return
        self._running = True
        self._pressure_monitor_task = asyncio.create_task(self._pressure_loop())
        logger.info("RAMM1 OS pressure monitor started (interval: %ds)", self.config.pressure_check_interval_s)

    async def stop_pressure_monitor(self) -> None:
        """Stop the background pressure monitor."""
        self._running = False
        if self._pressure_monitor_task:
            self._pressure_monitor_task.cancel()
            try:
                await self._pressure_monitor_task
            except asyncio.CancelledError:
                pass
        self._pressure_monitor_task = None
        logger.info("RAMM1 OS pressure monitor stopped")

    async def _pressure_loop(self) -> None:
        """Background loop: watch available RAM, release/re-reserve under pressure."""
        while self._running:
            try:
                if psutil is not None:
                    avail_gb = psutil.virtual_memory().available / (1024 ** 3)
                    floor = float(self.config.ram_pressure_floor_gb)
                    if avail_gb < floor and not self._pressure_active:
                        logger.warning("RAMM1 OS: pressure detected (avail %.2f GB < floor %.2f GB) — releasing reservation", avail_gb, floor)
                        self.release()
                        self._pressure_active = True
                    elif self._pressure_active and avail_gb > floor * 2:
                        logger.info("RAMM1 OS: pressure cleared (avail %.2f GB) — re-reserving", avail_gb)
                        ok = self.reserve()
                        if ok:
                            self._pressure_active = False
                        else:
                            logger.warning("RAMM1 OS: re-reservation failed — will retry next cycle")
            except Exception as e:
                logger.warning("RAMM1 OS pressure monitor error: %s", e)
            await asyncio.sleep(self.config.pressure_check_interval_s)

    # ── Allocation (best-fit + fragmentation-aware) ──

    def allocate(self, ram_gb: float, model_id: str, node: str = "local") -> AllocTicket | None:
        """Allocate a block of RAM from the local reservation.

        Uses best-fit: picks the free block with the smallest size that can fit
        the request, minimizing fragmentation.
        """
        with self._lock:
            if self._reserved_gb <= 0:
                return None
            # Find best-fit block
            best: FreeBlock | None = None
            best_waste = float("inf")
            for block in self._free_blocks:
                if block.size_gb >= ram_gb:
                    waste = block.size_gb - ram_gb
                    if waste < best_waste:
                        best_waste = waste
                        best = block
            if best is None:
                return None
            # Split the block
            ticket_id = f"alloc-{int(time.time() * 1000)}-{len(self._allocated)}"
            ticket = AllocTicket(
                ticket_id=ticket_id, model_id=model_id, ram_gb=ram_gb,
                node=node, block_index=best.index,
            )
            self._allocated[ticket_id] = ticket
            # Update free blocks: shrink or remove the block
            if best.size_gb == ram_gb:
                self._free_blocks.remove(best)
            else:
                best.start_gb += ram_gb
                best.size_gb -= ram_gb
            logger.debug("RAMM1 OS: allocated %.2f GB for %s (ticket %s)", ram_gb, model_id, ticket_id)
            return ticket

    def free(self, ticket: AllocTicket) -> None:
        """Free an allocation, returning its RAM to the free list."""
        with self._lock:
            if ticket.ticket_id not in self._allocated:
                return
            del self._allocated[ticket.ticket_id]
            # Coalesce: add the freed block back and merge adjacent blocks
            self._free_blocks.append(FreeBlock(
                index=ticket.block_index, start_gb=0.0, size_gb=ticket.ram_gb,
            ))
            self._coalesce()
            logger.debug("RAMM1 OS: freed ticket %s (%.2f GB)", ticket.ticket_id, ticket.ram_gb)

    def _coalesce(self) -> None:
        """Merge adjacent free blocks to reduce fragmentation."""
        if len(self._free_blocks) <= 1:
            return
        # Sort by start_gb
        self._free_blocks.sort(key=lambda b: b.start_gb)
        merged: list[FreeBlock] = [self._free_blocks[0]]
        for block in self._free_blocks[1:]:
            last = merged[-1]
            if abs((last.start_gb + last.size_gb) - block.start_gb) < 0.001:
                # Adjacent — merge
                last.size_gb += block.size_gb
            else:
                merged.append(block)
        self._free_blocks = merged

    # ── Status ──

    def get_local_status(self) -> dict[str, Any]:
        """Get the local reservation status."""
        with self._lock:
            used_gb = sum(t.ram_gb for t in self._allocated.values())
            free_gb = sum(b.size_gb for b in self._free_blocks)
            avail_gb = psutil.virtual_memory().available / (1024 ** 3) if psutil else 0.0
            total_gb = psutil.virtual_memory().total / (1024 ** 3) if psutil else 0.0
            return {
                "reserved_gb": round(self._reserved_gb, 3),
                "target_gb": round(self._sized_target or self._target_gb, 3),
                "used_gb": round(used_gb, 3),
                "free_gb": round(free_gb, 3),
                "allocations": len(self._allocated),
                "pressure_active": self._pressure_active,
                "host_available_gb": round(avail_gb, 3),
                "host_total_gb": round(total_gb, 3),
                "can_install": total_gb >= float(self.config.min_total_ram_gb) if psutil else False,
            }

    def get_free_gb(self) -> float:
        """Get the free RAM in the local reservation."""
        with self._lock:
            return sum(b.size_gb for b in self._free_blocks)

    def get_reserved_gb(self) -> float:
        """Get the reserved RAM in GB."""
        with self._lock:
            return self._reserved_gb

    def can_fit(self, ram_gb: float) -> bool:
        """Check if a request can fit in the local free reservation."""
        with self._lock:
            return self.get_free_gb() >= ram_gb

    async def close(self) -> None:
        """Shut down RAMM1 OS — stop monitor and release reservation."""
        await self.stop_pressure_monitor()
        self.release()
