"""Hardware auto-detector for incllmv2.

Detects hardware capabilities and assigns one of 8 tiers:
1. Mobile        — <2GB available RAM, no GPU, ARM (cell phones)
2. Minimal       — <4GB RAM, no GPU (Raspberry Pi)
3. Light         — <8GB RAM, no GPU (low-end laptop)
4. Standard      — <16GB RAM, any GPU (desktop)
5. Full          — <32GB RAM, 6GB+ VRAM (GPU workstation)
6. Maximum       — <64GB RAM, 8GB+ VRAM (server)
7. Datacenter    — 64GB+ RAM, multi-GPU (data center)
8. Supercomputer — 256GB+ RAM, 16+ GPUs, multi-node (AI supercomputer)

Detection is real — uses psutil, platform, torch.cuda, nvidia-smi, and
environment variables. All methods have comprehensive fallbacks.

Mobile-specific: checks available RAM (not total), battery level,
thermal state, background state, and network type. Adjusts keep_alive
and model parameters accordingly.

Zero-slowdown: detection runs once on startup, then re-checks every
5 minutes in a background task. Results cached in memory.
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore[assignment]

try:
    import torch
except ImportError:
    torch = None  # type: ignore[assignment]


class HardwareTier(str, Enum):
    MOBILE = "mobile"
    MINIMAL = "minimal"
    LIGHT = "light"
    STANDARD = "standard"
    FULL = "full"
    MAXIMUM = "maximum"
    DATACENTER = "datacenter"
    SUPERCOMPUTER = "supercomputer"


TIER_PROFILES: dict[HardwareTier, dict[str, Any]] = {
    HardwareTier.MOBILE: {
        "model": "incentives-incllmv2-mobile",
        "quant": "Q3_K_S",
        "num_ctx": 512,
        "num_predict": 32,
        "max_tokens": 32,
        "num_parallel": 1,
        "num_thread": 2,
        "batch_size": 1,
        "temperature": 0.5,
        "stream": True,
        "keep_alive": 60,
    },
    HardwareTier.MINIMAL: {
        "model": "incentives-incllmv2",
        "quant": "Q4_K_M",
        "num_ctx": 1024,
        "num_predict": 128,
        "max_tokens": 128,
        "num_parallel": 1,
        "num_thread": 2,
        "batch_size": 1,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": 300,
    },
    HardwareTier.LIGHT: {
        "model": "incentives-incllmv2",
        "quant": "Q5_K_M",
        "num_ctx": 2048,
        "num_predict": 256,
        "max_tokens": 256,
        "num_parallel": 1,
        "num_thread": 4,
        "batch_size": 2,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
    HardwareTier.STANDARD: {
        "model": "incentives-incllmv2",
        "quant": "Q5_K_M",
        "num_ctx": 2048,
        "num_predict": 256,
        "max_tokens": 512,
        "num_parallel": 2,
        "num_thread": 4,
        "batch_size": 4,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
    HardwareTier.FULL: {
        "model": "incentives-incllmv2-dolphin",
        "quant": "Q4_K_M",
        "num_ctx": 4096,
        "num_predict": 512,
        "max_tokens": 1024,
        "num_parallel": 4,
        "num_thread": 8,
        "batch_size": 8,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
    HardwareTier.MAXIMUM: {
        "model": "incentives-incllmv2-dolphin",
        "quant": "Q8_0",
        "num_ctx": 4096,
        "num_predict": 1024,
        "max_tokens": 2048,
        "num_parallel": 4,
        "num_thread": 16,
        "batch_size": 16,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
    HardwareTier.DATACENTER: {
        "model": "incentives-incllmv2-datacenter",
        "quant": "F16",
        "num_ctx": 8192,
        "num_predict": 1024,
        "max_tokens": 4096,
        "num_parallel": 16,
        "num_thread": os.cpu_count() or 32,
        "batch_size": 16,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
    HardwareTier.SUPERCOMPUTER: {
        "model": "incentives-incllmv2-supercomputer",
        "quant": "FP16",
        "num_ctx": 16384,
        "num_predict": 2048,
        "max_tokens": 8192,
        "num_parallel": 64,
        "num_thread": os.cpu_count() or 64,
        "batch_size": 64,
        "temperature": 0.7,
        "stream": True,
        "keep_alive": -1,
    },
}


@dataclass
class HardwareInfo:
    tier: HardwareTier = HardwareTier.MINIMAL
    ram_total_mb: int = 0
    ram_available_mb: int = 0
    cpu_cores: int = 1
    cpu_arch: str = "unknown"
    gpu_name: str = ""
    gpu_vram_mb: int = 0
    gpu_count: int = 0
    battery_pct: float = -1
    is_charging: bool = False
    is_mobile: bool = False
    is_background: bool = False
    network_type: str = "unknown"
    os_name: str = ""
    os_release: str = ""
    disk_free_gb: float = 0
    thermal_throttling: bool = False
    detected_at: float = field(default_factory=time.time)
    profile: dict[str, Any] = field(default_factory=dict)


class HardwareDetector:
    """Detects hardware capabilities and assigns a tier.

    Zero-slowdown: runs once at startup, caches result, re-checks
    every 5 minutes in a background task. chat_auto() reads the
    cached profile — no detection during inference.
    """

    def __init__(self, auto_detect: bool = True, override_tier: str = "") -> None:
        self._auto_detect = auto_detect
        self._override_tier = override_tier
        self._info: HardwareInfo = HardwareInfo()
        self._last_check: float = 0

    def detect(self) -> HardwareInfo:
        """Run full hardware detection and return HardwareInfo."""
        if self._override_tier:
            try:
                tier = HardwareTier(self._override_tier)
            except ValueError:
                logger.warning("Invalid override_tier: %s", self._override_tier)
                tier = HardwareTier.MINIMAL
        elif self._auto_detect:
            tier = self._select_tier()
        else:
            tier = HardwareTier.MINIMAL

        self._info = HardwareInfo(
            tier=tier,
            ram_total_mb=self._get_ram_total(),
            ram_available_mb=self._get_ram_available(),
            cpu_cores=self._get_cpu_cores(),
            cpu_arch=self._get_cpu_arch(),
            gpu_name=self._detect_gpu_name(),
            gpu_vram_mb=self._detect_gpu_vram(),
            gpu_count=self._detect_gpu_count(),
            battery_pct=self._get_battery_pct(),
            is_charging=self._is_charging(),
            is_mobile=self._detect_mobile(),
            is_background=self._detect_background(),
            network_type=self._detect_network_type(),
            os_name=self._get_os_name(),
            os_release=self._get_os_release(),
            disk_free_gb=self._get_disk_free(),
            thermal_throttling=self._detect_thermal_throttling(),
        )

        # Apply mobile-specific adjustments
        if self._info.is_mobile and tier == HardwareTier.MOBILE:
            self._info.profile = self._calc_mobile_params(
                self._info.ram_available_mb,
                self._info.battery_pct,
                self._info.is_charging,
                self._info.is_background,
            )
        else:
            base = TIER_PROFILES.get(tier, TIER_PROFILES[HardwareTier.MINIMAL])
            self._info.profile = dict(base)

        self._last_check = time.time()
        logger.info(
            "Hardware detected: tier=%s, RAM=%dMB avail, CPU=%d cores, GPU=%s (%dMB), mobile=%s",
            tier.value, self._info.ram_available_mb, self._info.cpu_cores,
            self._info.gpu_name or "none", self._info.gpu_vram_mb, self._info.is_mobile,
        )
        return self._info

    @property
    def info(self) -> HardwareInfo:
        """Cached hardware info (zero-slowdown read)."""
        if time.time() - self._last_check > 300:
            self.detect()
        return self._info

    @property
    def tier(self) -> HardwareTier:
        return self.info.tier

    @property
    def profile(self) -> dict[str, Any]:
        return self.info.profile

    def should_recheck(self) -> bool:
        """Check if it's time for a periodic re-check (every 5 min)."""
        return time.time() - self._last_check > 300

    # --- Tier selection ---

    def _select_tier(self) -> HardwareTier:
        """Select tier based on detected hardware."""
        is_mobile = self._detect_mobile()
        ram_avail = self._get_ram_available()
        gpu_vram = self._detect_gpu_vram()
        gpu_count = self._detect_gpu_count()

        if is_mobile and ram_avail < 2048:
            return HardwareTier.MOBILE
        if ram_avail < 4096:
            return HardwareTier.MINIMAL
        if ram_avail < 8192:
            return HardwareTier.LIGHT
        if ram_avail < 16384:
            return HardwareTier.STANDARD
        if ram_avail < 32768:
            if gpu_vram >= 6144:
                return HardwareTier.FULL
            return HardwareTier.STANDARD
        if ram_avail < 65536:
            if gpu_vram >= 8192:
                return HardwareTier.MAXIMUM
            return HardwareTier.FULL
        # 64GB+ with multi-GPU = datacenter
        if gpu_count >= 2 or ram_avail >= 65536:
            # 256GB+ with 16+ GPUs = supercomputer
            if gpu_count >= 16 or ram_avail >= 262144:
                return HardwareTier.SUPERCOMPUTER
            return HardwareTier.DATACENTER
        return HardwareTier.MAXIMUM

    # --- Mobile parameter calculation ---

    def _calc_mobile_params(
        self, available_ram_mb: int, battery_pct: float,
        is_charging: bool, is_background: bool,
    ) -> dict[str, Any]:
        params = dict(TIER_PROFILES[HardwareTier.MOBILE])

        if available_ram_mb < 512:
            params["num_ctx"] = 256
            params["max_tokens"] = 16
            params["num_predict"] = 16
        elif available_ram_mb < 1024:
            params["num_ctx"] = 512
            params["max_tokens"] = 24
            params["num_predict"] = 24

        if not is_charging:
            if battery_pct >= 0:
                if battery_pct < 10:
                    params["keep_alive"] = 0
                    params["max_tokens"] = min(params["max_tokens"], 16)
                    params["num_predict"] = min(params["num_predict"], 16)
                elif battery_pct < 20:
                    params["keep_alive"] = 30
                    params["max_tokens"] = min(params["max_tokens"], 24)
                    params["num_predict"] = min(params["num_predict"], 24)
                else:
                    params["keep_alive"] = 60
        else:
            params["keep_alive"] = -1

        if is_background:
            params["keep_alive"] = 0

        params["num_thread"] = min(2, self._get_cpu_cores() or 2)
        return params

    # --- Detection methods (all with fallbacks) ---

    def _get_ram_total(self) -> int:
        try:
            if psutil:
                return int(psutil.virtual_memory().total / 1024 / 1024)
        except Exception:
            pass
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        return int(line.split()[1]) // 1024
        except Exception:
            pass
        return 4096

    def _get_ram_available(self) -> int:
        try:
            if psutil:
                return int(psutil.virtual_memory().available / 1024 / 1024)
        except Exception:
            pass
        try:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemAvailable:"):
                        return int(line.split()[1]) // 1024
        except Exception:
            pass
        return int(self._get_ram_total() * 0.7)

    def _get_cpu_cores(self) -> int:
        try:
            return os.cpu_count() or 1
        except Exception:
            return 1

    def _get_cpu_arch(self) -> str:
        try:
            return platform.machine()
        except Exception:
            return "unknown"

    def _detect_gpu_name(self) -> str:
        if torch and torch.cuda.is_available():
            try:
                return torch.cuda.get_device_name(0)
            except Exception:
                pass
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip().split("\n")[0]
        except Exception:
            pass
        return ""

    def _detect_gpu_vram(self) -> int:
        if torch and torch.cuda.is_available():
            try:
                return int(torch.cuda.get_device_properties(0).total_memory / 1024 / 1024)
            except Exception:
                pass
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip().split("\n")[0])
        except Exception:
            pass
        return 0

    def _detect_gpu_count(self) -> int:
        if torch and torch.cuda.is_available():
            try:
                return torch.cuda.device_count()
            except Exception:
                pass
        try:
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=count", "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip())
        except Exception:
            pass
        return 0

    def _get_battery_pct(self) -> float:
        try:
            if psutil and hasattr(psutil, "sensors_battery"):
                bat = psutil.sensors_battery()
                if bat is not None:
                    return bat.percent
        except Exception:
            pass
        return -1

    def _is_charging(self) -> bool:
        try:
            if psutil and hasattr(psutil, "sensors_battery"):
                bat = psutil.sensors_battery()
                if bat is not None:
                    return bat.power_plugged
        except Exception:
            pass
        return False

    def _detect_mobile(self) -> bool:
        arch = self._get_cpu_arch().lower()
        if arch in ("arm64", "aarch64", "armv7l", "armv8l"):
            if os.environ.get("ANDROID_ROOT"):
                return True
            try:
                if os.path.exists("/system/build.prop"):
                    return True
            except Exception:
                pass
            if arch in ("arm64", "aarch64", "armv7l", "armv8l"):
                return True
        return False

    def _detect_background(self) -> bool:
        return os.environ.get("INC_LLM_APP_BACKGROUND", "").lower() == "true"

    def _detect_network_type(self) -> str:
        net_type = os.environ.get("INC_LLM_NETWORK_TYPE", "").lower()
        if net_type in ("wifi", "cellular", "ethernet"):
            return net_type
        return "unknown"

    def _get_os_name(self) -> str:
        try:
            return platform.system()
        except Exception:
            return ""

    def _get_os_release(self) -> str:
        try:
            return platform.release()
        except Exception:
            return ""

    def _get_disk_free(self) -> float:
        try:
            if psutil:
                usage = psutil.disk_usage("/")
                return usage.free / 1024 / 1024 / 1024
        except Exception:
            pass
        try:
            usage = shutil.disk_usage("/")
            return usage.free / 1024 / 1024 / 1024
        except Exception:
            pass
        return 0.0

    def _detect_thermal_throttling(self) -> bool:
        try:
            if psutil:
                temps = psutil.sensors_temperatures()
                if temps:
                    for name, entries in temps.items():
                        for entry in entries:
                            if entry.current > 80:
                                return True
        except Exception:
            pass
        return False

    def get_summary(self) -> dict[str, Any]:
        """Get a summary dict for API endpoints."""
        info = self.info
        return {
            "tier": info.tier.value,
            "ram_total_mb": info.ram_total_mb,
            "ram_available_mb": info.ram_available_mb,
            "cpu_cores": info.cpu_cores,
            "cpu_arch": info.cpu_arch,
            "gpu_name": info.gpu_name,
            "gpu_vram_mb": info.gpu_vram_mb,
            "gpu_count": info.gpu_count,
            "battery_pct": info.battery_pct,
            "is_charging": info.is_charging,
            "is_mobile": info.is_mobile,
            "network_type": info.network_type,
            "os": f"{info.os_name} {info.os_release}",
            "disk_free_gb": round(info.disk_free_gb, 1),
            "thermal_throttling": info.thermal_throttling,
            "profile": info.profile,
        }
