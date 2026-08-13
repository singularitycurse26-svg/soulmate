"""Predictive loader — preloads models based on usage patterns.

Tracks which models are requested and in what order, then preloads
the most likely next model before it's actually requested. This
eliminates the cold-start latency for model switching.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class PredictiveLoader:
    """Predicts which model will be needed next and preloads it."""

    def __init__(self, model_manager: Any, pool: Any, server_url: str) -> None:
        self.model_manager = model_manager
        self.pool = pool
        self.server_url = server_url
        self._transition_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._model_frequency: dict[str, int] = defaultdict(int)
        self._last_model: str = ""
        self._history: list[str] = []
        self._max_history = 100
        self._preloading: set[str] = set()

    def record_usage(self, model: str) -> None:
        """Record that a model was used. Call after every request."""
        self._model_frequency[model] += 1
        if self._last_model and self._last_model != model:
            self._transition_counts[self._last_model][model] += 1
        self._last_model = model
        self._history.append(model)
        if len(self._history) > self._max_history:
            self._history.pop(0)

    def predict_next(self, current_model: str, top_k: int = 1) -> list[str]:
        """Predict the next model(s) likely to be needed."""
        transitions = self._transition_counts.get(current_model, {})
        if not transitions:
            ranked = sorted(self._model_frequency.items(), key=lambda x: x[1], reverse=True)
            return [m for m, _ in ranked[:top_k] if m != current_model]

        ranked = sorted(transitions.items(), key=lambda x: x[1], reverse=True)
        return [m for m, _ in ranked[:top_k] if m != current_model]

    async def preload_predicted(self, current_model: str) -> list[str]:
        """Preload predicted next models in the background."""
        predicted = self.predict_next(current_model, top_k=2)
        loaded: list[str] = []
        for model in predicted:
            if model in self._preloading:
                continue
            self._preloading.add(model)
            asyncio.create_task(self._do_preload(model, loaded))
        return loaded

    async def _do_preload(self, model: str, loaded: list[str]) -> None:
        try:
            success = await self.model_manager.preload_model(self.server_url, model)
            if success:
                loaded.append(model)
                logger.debug("Predictive preloaded: %s", model)
        except Exception as e:
            logger.debug("Predictive preload failed for %s: %s", model, e)
        finally:
            self._preloading.discard(model)

    def get_stats(self) -> dict[str, Any]:
        return {
            "history_size": len(self._history),
            "unique_models": len(self._model_frequency),
            "model_frequency": dict(self._model_frequency),
            "transitions": {k: dict(v) for k, v in self._transition_counts.items()},
            "last_model": self._last_model,
        }
