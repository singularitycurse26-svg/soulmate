"""Model manifest — registry of model IDs → RAM footprint metadata.

Maps model IDs to {size_gb, quant, ctx, kv_cache_gb, ram_footprint_gb} so RAMM1 OS
can decide whether a model fits locally, in the pool, or nowhere. Includes the
installed Ollama models + a few external big-model entries (13B/70B footprints)
for the API-run feature.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


# Default manifest — covers common Ollama models + external big models.
# ram_footprint_gb = model weights + KV cache at the listed ctx.
DEFAULT_MANIFEST: dict[str, dict[str, Any]] = {
    # ── Small models (fit in < 1 GB) ──
    "qwen2.5:0.5b": {"size_gb": 0.4, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.1, "ram_footprint_gb": 0.5},
    "qwen3:1.7b": {"size_gb": 1.1, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 0.2, "ram_footprint_gb": 1.3},
    "smollm2:360m": {"size_gb": 0.3, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.1, "ram_footprint_gb": 0.4},
    # ── Medium models (fit in 1-3 GB) ──
    "qwen2.5-coder:3b": {"size_gb": 2.0, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 0.3, "ram_footprint_gb": 2.3},
    "hf.co/LiquidAI/LFM2.5-2.6B-GGUF:Q4_K_M": {"size_gb": 1.7, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 0.3, "ram_footprint_gb": 2.0},
    "dolphin-mistral:latest": {"size_gb": 4.1, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 0.5, "ram_footprint_gb": 4.6},
    "llama3:latest": {"size_gb": 4.7, "quant": "Q4_K_M", "ctx": 8192, "kv_cache_gb": 1.0, "ram_footprint_gb": 5.7},
    # ── Large models (need 5-10 GB) ──
    "qwen2.5-coder:7b": {"size_gb": 4.7, "quant": "Q4_K_M", "ctx": 8192, "kv_cache_gb": 1.0, "ram_footprint_gb": 5.7},
    "glm4:9b-chat-q2_K": {"size_gb": 3.5, "quant": "Q2_K", "ctx": 8192, "kv_cache_gb": 1.0, "ram_footprint_gb": 4.5},
    # ── Incentives Inc. custom models ──
    "incentives-incllmv2:latest": {"size_gb": 1.1, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.2, "ram_footprint_gb": 1.3},
    "incentives-inc-llm-v1:latest": {"size_gb": 1.1, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.2, "ram_footprint_gb": 1.3},
    "incentives-inc-llm-v1-finetuned:latest": {"size_gb": 1.1, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.2, "ram_footprint_gb": 1.3},
    "incentives-inc-llm-v1-dolphin:latest": {"size_gb": 1.1, "quant": "Q4_K_M", "ctx": 2048, "kv_cache_gb": 0.2, "ram_footprint_gb": 1.3},
    # ── External big models (for /v1/ramm1/run — not installed locally) ──
    "external:13b-q4": {"size_gb": 7.8, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 1.0, "ram_footprint_gb": 8.8, "external": True},
    "external:13b-q5": {"size_gb": 9.2, "quant": "Q5_K_M", "ctx": 4096, "kv_cache_gb": 1.0, "ram_footprint_gb": 10.2, "external": True},
    "external:34b-q4": {"size_gb": 20.0, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 2.0, "ram_footprint_gb": 22.0, "external": True},
    "external:70b-q4": {"size_gb": 40.0, "quant": "Q4_K_M", "ctx": 4096, "kv_cache_gb": 4.0, "ram_footprint_gb": 44.0, "external": True},
}


class ModelManifest:
    """Registry of model IDs → RAM footprint metadata.

    Loads from a JSON file (if present) or falls back to DEFAULT_MANIFEST.
    Can be updated at runtime when new models are installed or discovered.
    """

    def __init__(self, manifest_path: str = "") -> None:
        self.path = Path(os.path.expanduser(manifest_path)) if manifest_path else None
        self._entries: dict[str, dict[str, Any]] = dict(DEFAULT_MANIFEST)
        if self.path and self.path.exists():
            try:
                with open(self.path) as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    self._entries.update(data)
                logger.info("Loaded %d manifest entries from %s", len(data) if isinstance(data, dict) else 0, self.path)
            except Exception as e:
                logger.warning("Failed to load manifest from %s: %s", self.path, e)

    def get(self, model_id: str) -> dict[str, Any] | None:
        """Get manifest entry for a model ID. Returns None if unknown."""
        return self._entries.get(model_id)

    def get_footprint_gb(self, model_id: str) -> float:
        """Get the RAM footprint in GB for a model. Falls back to a heuristic estimate."""
        entry = self._entries.get(model_id)
        if entry:
            return float(entry.get("ram_footprint_gb", 1.0))
        # Heuristic: if unknown, assume 2 GB (small model). Caller can override.
        logger.debug("Unknown model %s — estimating 2 GB footprint", model_id)
        return 2.0

    def is_external(self, model_id: str) -> bool:
        """Check if a model is an external big model (not installed locally)."""
        entry = self._entries.get(model_id)
        return bool(entry and entry.get("external", False))

    def list_models(self) -> list[dict[str, Any]]:
        """List all manifest entries."""
        return [
            {"id": mid, **meta}
            for mid, meta in self._entries.items()
        ]

    def list_local_models(self) -> list[str]:
        """List model IDs that are not external."""
        return [mid for mid, meta in self._entries.items() if not meta.get("external", False)]

    def list_external_models(self) -> list[str]:
        """List model IDs that are external big models."""
        return [mid for mid, meta in self._entries.items() if meta.get("external", False)]

    def add(self, model_id: str, entry: dict[str, Any]) -> None:
        """Add or update a manifest entry."""
        self._entries[model_id] = entry

    def save(self) -> None:
        """Save the manifest to the configured path."""
        if not self.path:
            return
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.path, "w") as f:
                json.dump(self._entries, f, indent=2)
            logger.info("Saved %d manifest entries to %s", len(self._entries), self.path)
        except Exception as e:
            logger.warning("Failed to save manifest to %s: %s", self.path, e)

    def update_from_ollama(self, ollama_models: list[dict[str, Any]]) -> int:
        """Update the manifest from Ollama's /api/tags response.

        Adds any installed models not already in the manifest, estimating
        their footprint from the model size.
        """
        added = 0
        for m in ollama_models:
            name = m.get("name", "")
            if not name or name in self._entries:
                continue
            size_bytes = m.get("size", 0) or m.get("details", {}).get("parameter_size", 0)
            size_gb = size_bytes / (1024 ** 3) if size_bytes > 1024 ** 3 else max(0.5, size_bytes / (1024 ** 3))
            # Estimate KV cache as ~25% of model size for ctx 4096
            kv_cache_gb = max(0.1, size_gb * 0.25)
            self._entries[name] = {
                "size_gb": round(size_gb, 2),
                "quant": "Q4_K_M",
                "ctx": 4096,
                "kv_cache_gb": round(kv_cache_gb, 2),
                "ram_footprint_gb": round(size_gb + kv_cache_gb, 2),
            }
            added += 1
        if added:
            logger.info("Added %d models from Ollama to manifest", added)
        return added
