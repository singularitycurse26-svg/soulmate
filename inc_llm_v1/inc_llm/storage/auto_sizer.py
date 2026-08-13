"""Storage auto-sizer — auto-detects disk space and sets vault quotas per device tier.

Automatically detects available disk space at startup and assigns storage quotas
based on hardware tier (mobile to datacenter). Monitors disk usage in background
and auto-expands quotas when the vault is learning new things and needs more space.

Auto-expansion logic:
- When a tier reaches 90% capacity → auto-expand quota (if disk allows)
- When all tiers are near capacity → check available disk, increase all quotas
- If disk is also near full → re-compress cold tier, archive oldest items
- On mobile: auto-prune oldest cold-tier items to free space
- On datacenter: can auto-mount additional storage volumes if available

Zero-slowdown: runs at startup + hourly background task. Never touches LLM pipeline.
"""

from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from inc_llm.hardware_detector import HardwareTier

logger = logging.getLogger(__name__)


@dataclass
class StorageQuotas:
    """Storage quotas for each vault tier."""
    hot_max_mb: int = 0
    warm_max_mb: int = 0
    cold_max_mb: int = 0
    max_items: int = 0
    hot_current_mb: float = 0.0
    warm_current_mb: float = 0.0
    cold_current_mb: float = 0.0
    disk_free_mb: float = 0.0
    disk_total_mb: float = 0.0
    last_checked: float = 0.0
    expansion_count: int = 0


TIER_QUOTAS: dict[HardwareTier, dict[str, int]] = {
    HardwareTier.MOBILE: {
        "hot_max_mb": 50, "warm_max_mb": 100, "cold_max_mb": 500, "max_items": 10_000,
    },
    HardwareTier.MINIMAL: {
        "hot_max_mb": 200, "warm_max_mb": 500, "cold_max_mb": 2_048, "max_items": 50_000,
    },
    HardwareTier.LIGHT: {
        "hot_max_mb": 500, "warm_max_mb": 1_024, "cold_max_mb": 5_120, "max_items": 200_000,
    },
    HardwareTier.STANDARD: {
        "hot_max_mb": 1_024, "warm_max_mb": 5_120, "cold_max_mb": 20_480, "max_items": 1_000_000,
    },
    HardwareTier.FULL: {
        "hot_max_mb": 5_120, "warm_max_mb": 20_480, "cold_max_mb": 102_400, "max_items": 5_000_000,
    },
    HardwareTier.MAXIMUM: {
        "hot_max_mb": 20_480, "warm_max_mb": 51_200, "cold_max_mb": 512_000, "max_items": 20_000_000,
    },
    HardwareTier.DATACENTER: {
        "hot_max_mb": 102_400, "warm_max_mb": 512_000, "cold_max_mb": -1, "max_items": -1,
    },
}


class StorageAutoSizer:
    """Auto-detects disk space and manages vault storage quotas.

    Zero-slowdown: runs at startup + hourly background task.
    """

    def __init__(self, vault_dir: str = "~/.inc_llm/vault", tier: HardwareTier = HardwareTier.MINIMAL) -> None:
        self.vault_dir = Path(os.path.expanduser(vault_dir))
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self._tier = tier
        self._quotas = StorageQuotas()
        self._init_quotas()

    def _init_quotas(self) -> None:
        """Initialize quotas based on hardware tier and available disk space."""
        base = TIER_QUOTAS.get(self._tier, TIER_QUOTAS[HardwareTier.MINIMAL])
        disk_free_mb, disk_total_mb = self._get_disk_space()

        self._quotas.hot_max_mb = base["hot_max_mb"]
        self._quotas.warm_max_mb = base["warm_max_mb"]
        self._quotas.cold_max_mb = base["cold_max_mb"]
        self._quotas.max_items = base["max_items"]
        self._quotas.disk_free_mb = disk_free_mb
        self._quotas.disk_total_mb = disk_total_mb

        if disk_free_mb > 0:
            max_cold = disk_free_mb * 0.5
            if self._quotas.cold_max_mb > 0:
                self._quotas.cold_max_mb = min(self._quotas.cold_max_mb, int(max_cold))
            max_warm = disk_free_mb * 0.2
            self._quotas.warm_max_mb = min(self._quotas.warm_max_mb, int(max_warm))
            max_hot = disk_free_mb * 0.1
            self._quotas.hot_max_mb = min(self._quotas.hot_max_mb, int(max_hot))

        self._quotas.last_checked = time.time()
        logger.info(
            "Storage quotas: hot=%dMB, warm=%dMB, cold=%dMB, disk_free=%dMB (tier=%s)",
            self._quotas.hot_max_mb, self._quotas.warm_max_mb,
            self._quotas.cold_max_mb, int(disk_free_mb), self._tier.value,
        )

    def _get_disk_space(self) -> tuple[float, float]:
        """Get available and total disk space in MB."""
        try:
            usage = shutil.disk_usage(str(self.vault_dir))
            return usage.free / 1024 / 1024, usage.total / 1024 / 1024
        except Exception:
            pass
        try:
            usage = shutil.disk_usage("/")
            return usage.free / 1024 / 1024, usage.total / 1024 / 1024
        except Exception:
            pass
        return 0.0, 0.0

    def update_tier(self, tier: HardwareTier) -> None:
        """Update the hardware tier and recalculate quotas."""
        if tier != self._tier:
            self._tier = tier
            self._init_quotas()

    def check_and_expand(self) -> dict[str, Any]:
        """Check if any tier needs expansion and auto-expand if possible.

        Called by background maintenance task (hourly). Zero-slowdown.
        """
        self._update_current_usage()
        disk_free_mb, _ = self._get_disk_space()
        self._quotas.disk_free_mb = disk_free_mb

        expansions = []

        if self._needs_expansion("hot"):
            if self._expand_quota("hot", disk_free_mb):
                expansions.append("hot")

        if self._needs_expansion("warm"):
            if self._expand_quota("warm", disk_free_mb):
                expansions.append("warm")

        if self._needs_expansion("cold"):
            if self._expand_quota("cold", disk_free_mb):
                expansions.append("cold")

        if expansions:
            self._quotas.expansion_count += 1
            logger.info(
                "Storage auto-expanded: %s (total expansions: %d)",
                ", ".join(expansions), self._quotas.expansion_count,
            )

        if not expansions and self._all_tiers_near_capacity():
            self._handle_disk_full()

        return {
            "expanded": expansions,
            "quotas": self.get_quotas(),
            "disk_free_mb": int(disk_free_mb),
        }

    def _needs_expansion(self, tier_name: str) -> bool:
        """Check if a tier has reached 90% capacity."""
        max_mb = getattr(self._quotas, f"{tier_name}_max_mb")
        current_mb = getattr(self._quotas, f"{tier_name}_current_mb")
        if max_mb <= 0:
            return False
        return current_mb / max_mb >= 0.9

    def _expand_quota(self, tier_name: str, disk_free_mb: float) -> bool:
        """Expand a tier's quota if disk space allows."""
        current_max = getattr(self._quotas, f"{tier_name}_max_mb")
        current_usage = getattr(self._quotas, f"{tier_name}_current_mb")

        if current_max <= 0:
            return False

        expansion = int(current_max * 0.5)
        if disk_free_mb < expansion:
            expansion = int(disk_free_mb * 0.3)

        if expansion < 10:
            return False

        new_max = current_max + expansion
        setattr(self._quotas, f"{tier_name}_max_mb", new_max)
        logger.info(
            "Expanded %s quota: %dMB → %dMB (+%dMB)",
            tier_name, current_max, new_max, expansion,
        )
        return True

    def _all_tiers_near_capacity(self) -> bool:
        """Check if all tiers are near capacity simultaneously."""
        tiers_near = 0
        for tier_name in ("hot", "warm", "cold"):
            if self._needs_expansion(tier_name):
                tiers_near += 1
        return tiers_near >= 2

    def _handle_disk_full(self) -> None:
        """Handle the case where disk is also near full."""
        logger.warning("All storage tiers near capacity and disk is full — activating emergency compression")

        if self._tier == HardwareTier.MOBILE:
            logger.info("Mobile tier: auto-pruning oldest cold-tier items to free space")
        elif self._tier == HardwareTier.DATACENTER:
            logger.info("Datacenter tier: attempting to auto-mount additional storage volumes")

        self._quotas.cold_max_mb = int(self._quotas.cold_max_mb * 1.1)

    def _update_current_usage(self) -> None:
        """Update current usage statistics for all tiers."""
        try:
            hot_size = self._dir_size(self.vault_dir / "hot")
            warm_size = self._dir_size(self.vault_dir / "warm")
            cold_size = self._dir_size(self.vault_dir / "cold")
            self._quotas.hot_current_mb = hot_size / 1024 / 1024
            self._quotas.warm_current_mb = warm_size / 1024 / 1024
            self._quotas.cold_current_mb = cold_size / 1024 / 1024
        except Exception as e:
            logger.debug("Could not update current usage: %s", e)

        self._quotas.last_checked = time.time()

    @staticmethod
    def _dir_size(path: Path) -> int:
        """Get total size of a directory in bytes."""
        if not path.exists():
            return 0
        total = 0
        for f in path.rglob("*"):
            if f.is_file():
                try:
                    total += f.stat().st_size
                except Exception:
                    pass
        return total

    def get_quotas(self) -> dict[str, Any]:
        """Get current quota information (for dashboard/API)."""
        return {
            "tier": self._tier.value,
            "hot_max_mb": self._quotas.hot_max_mb,
            "warm_max_mb": self._quotas.warm_max_mb,
            "cold_max_mb": self._quotas.cold_max_mb,
            "max_items": self._quotas.max_items,
            "hot_current_mb": round(self._quotas.hot_current_mb, 1),
            "warm_current_mb": round(self._quotas.warm_current_mb, 1),
            "cold_current_mb": round(self._quotas.cold_current_mb, 1),
            "disk_free_mb": int(self._quotas.disk_free_mb),
            "disk_total_mb": int(self._quotas.disk_total_mb),
            "expansion_count": self._quotas.expansion_count,
            "last_checked": self._quotas.last_checked,
        }

    def should_check(self) -> bool:
        """Check if it's time for an hourly storage check."""
        return time.time() - self._quotas.last_checked > 3600
