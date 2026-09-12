"""Adaptive model selector — picks the right model/quant/ctx for the hardware.

Uses the existing HardwareDetector tier (mobile/minimal/light/standard/full/
maximum/datacenter/supercomputer) + the model manifest to pick the best local
model that fits in the available RAM. Also decides whether a requested model
fits locally, in the pool, or nowhere.
"""

from __future__ import annotations

import logging
from typing import Any

from inc_llm.ramm1.manifest import ModelManifest
from inc_llm.ramm1.pool import UniversalRAMPool

logger = logging.getLogger(__name__)

try:
    from inc_llm.hardware_detector import HardwareDetector, HardwareTier
except ImportError:
    HardwareDetector = None  # type: ignore[assignment]
    HardwareTier = None  # type: ignore[assignment]


# Default model preferences per hardware tier (best → fallback).
# These are models commonly available in the user's Ollama install.
TIER_MODEL_PREFERENCES: dict[str, list[str]] = {
    "mobile": ["smollm2:360m", "qwen2.5:0.5b"],
    "minimal": ["qwen2.5:0.5b", "qwen3:1.7b", "smollm2:360m"],
    "light": ["qwen3:1.7b", "qwen2.5-coder:3b", "qwen2.5:0.5b"],
    "standard": ["qwen2.5-coder:3b", "qwen3:1.7b", "incentives-incllmv2:latest"],
    "full": ["qwen2.5-coder:7b", "qwen2.5-coder:3b", "glm4:9b-chat-q2_K"],
    "maximum": ["qwen2.5-coder:7b", "glm4:9b-chat-q2_K", "llama3:latest"],
    "datacenter": ["glm4:9b-chat-q2_K", "qwen2.5-coder:7b", "llama3:latest"],
    "supercomputer": ["glm4:9b-chat-q2_K", "llama3:latest", "qwen2.5-coder:7b"],
}


class AdaptiveModelSelector:
    """Picks the right model/quant/ctx for the hardware + available RAM.

    Uses the HardwareDetector tier + the model manifest to pick the best local
    model that fits in the available RAM. Also decides whether a requested model
    fits locally, in the pool, or nowhere.
    """

    def __init__(
        self,
        hardware_detector: Any | None = None,
        manifest: ModelManifest | None = None,
        pool: UniversalRAMPool | None = None,
        installed_models: list[str] | None = None,
    ) -> None:
        self.hw = hardware_detector
        self.manifest = manifest or ModelManifest()
        self.pool = pool
        self._installed: list[str] = installed_models or []

    def set_installed_models(self, models: list[str]) -> None:
        """Update the list of locally installed Ollama models."""
        self._installed = list(models)

    def get_tier(self) -> str:
        """Get the current hardware tier as a string."""
        if self.hw is None or not hasattr(self.hw, "info") or self.hw.info is None:
            return "standard"
        try:
            return self.hw.info.tier.value
        except Exception:
            return "standard"

    def select_local(self) -> dict[str, Any]:
        """Select the best local model that fits in the available RAM.

        Returns {model, quant, ctx, ram_footprint_gb, tier, fits_local}.
        """
        tier = self.get_tier()
        preferences = TIER_MODEL_PREFERENCES.get(tier, TIER_MODEL_PREFERENCES["standard"])

        # Filter to installed models
        installed_set = set(self._installed)
        candidates = [m for m in preferences if m in installed_set]
        if not candidates and self._installed:
            # Fall back to any installed model, smallest first
            candidates = list(self._installed)

        local_free = self.pool.os.get_free_gb() if self.pool else 999.0

        for model_id in candidates:
            footprint = self.manifest.get_footprint_gb(model_id)
            if footprint <= local_free:
                entry = self.manifest.get(model_id) or {}
                return {
                    "model": model_id,
                    "quant": entry.get("quant", "Q4_K_M"),
                    "ctx": entry.get("ctx", 4096),
                    "ram_footprint_gb": footprint,
                    "tier": tier,
                    "fits_local": True,
                }

        # No model fits — return the smallest candidate with fits_local=False
        if candidates:
            model_id = candidates[0]
            footprint = self.manifest.get_footprint_gb(model_id)
            return {
                "model": model_id,
                "quant": self.manifest.get(model_id, {}).get("quant", "Q4_K_M"),
                "ctx": self.manifest.get(model_id, {}).get("ctx", 4096),
                "ram_footprint_gb": footprint,
                "tier": tier,
                "fits_local": footprint <= local_free,
            }

        return {"model": "", "quant": "", "ctx": 0, "ram_footprint_gb": 0, "tier": tier, "fits_local": False}

    def select_for_run(self, model_id: str) -> dict[str, Any]:
        """Decide where a model-run request should be served.

        Returns {model, ram_footprint_gb, route, node, peer_id?, deficit_gb?}.
        - route="local" if it fits in local free RAM.
        - route="peer" if it fits in a peer.
        - route="insufficient" if nowhere fits.
        """
        footprint = self.manifest.get_footprint_gb(model_id)
        if not self.pool:
            return {"model": model_id, "ram_footprint_gb": footprint, "route": "local", "node": "local"}

        plan = self.pool.find_capacity(footprint, model_id=model_id)
        result: dict[str, Any] = {
            "model": model_id,
            "ram_footprint_gb": footprint,
            "route": plan["node"],
            "node": plan["node"],
        }
        if plan["node"] == "peer":
            result["peer_id"] = plan.get("peer_id", "")
            result["endpoint"] = plan.get("endpoint", "")
        elif plan["node"] == "insufficient":
            result["deficit_gb"] = plan.get("deficit_gb", 0)
        return result

    def get_status(self) -> dict[str, Any]:
        """Get the selector status."""
        local = self.select_local()
        return {
            "tier": self.get_tier(),
            "installed_models": self._installed,
            "selected_local": local,
            "pool_free_gb": self.pool.get_pool_free_gb() if self.pool else 0,
        }
