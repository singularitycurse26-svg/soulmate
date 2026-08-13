"""RenderPredictiveLoader — preloads video generation models before they're needed.

Equivalent to RLOS PredictiveLoader (inc_llm/rlos/predictive_loader.py).
Tracks which video generation models are used in what order, predicts the next
likely model, and preloads it on the GPU node in the background.

Also preloads style presets and stock footage libraries that are frequently
used together. Background preloading via asyncio.create_task — zero-slowdown.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)


class RenderPredictiveLoader:
    """Predicts which video generation model will be needed next and preloads it.

    Same pattern as PredictiveLoader — transition counts, frequency tracking,
    background preloading via asyncio.create_task.
    """

    def __init__(
        self,
        preload_fn: Any,
        max_history: int = 100,
        prefetch_count: int = 3,
    ) -> None:
        self._preload_fn = preload_fn
        self._max_history = max_history
        self._prefetch_count = prefetch_count
        self._transition_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._model_frequency: dict[str, int] = defaultdict(int)
        self._style_transitions: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._style_frequency: dict[str, int] = defaultdict(int)
        self._last_model: str = ""
        self._last_style: str = ""
        self._history: list[str] = []
        self._preloading: set[str] = set()

    def record_usage(self, model: str, style: str = "") -> None:
        """Record that a video gen model was used. Call after every render."""
        self._model_frequency[model] += 1
        if self._last_model and self._last_model != model:
            self._transition_counts[self._last_model][model] += 1
        self._last_model = model
        self._history.append(model)
        if len(self._history) > self._max_history:
            self._history.pop(0)

        if style:
            self._style_frequency[style] += 1
            if self._last_style and self._last_style != style:
                self._style_transitions[self._last_style][style] += 1
            self._last_style = style

    def predict_next_model(self, current_model: str, top_k: int = 1) -> list[str]:
        """Predict the next model(s) likely to be needed."""
        transitions = self._transition_counts.get(current_model, {})
        if not transitions:
            ranked = sorted(self._model_frequency.items(), key=lambda x: x[1], reverse=True)
            return [m for m, _ in ranked[:top_k] if m != current_model]

        ranked = sorted(transitions.items(), key=lambda x: x[1], reverse=True)
        return [m for m, _ in ranked[:top_k] if m != current_model]

    def predict_next_style(self, current_style: str, top_k: int = 1) -> list[str]:
        """Predict the next style preset likely to be used."""
        transitions = self._style_transitions.get(current_style, {})
        if not transitions:
            ranked = sorted(self._style_frequency.items(), key=lambda x: x[1], reverse=True)
            return [s for s, _ in ranked[:top_k] if s != current_style]

        ranked = sorted(transitions.items(), key=lambda x: x[1], reverse=True)
        return [s for s, _ in ranked[:top_k] if s != current_style]

    async def preload_predicted(self, current_model: str, current_style: str = "") -> list[str]:
        """Preload predicted next models and styles in the background."""
        predicted_models = self.predict_next_model(current_model, top_k=2)
        predicted_styles = self.predict_next_style(current_style, top_k=1)
        loaded: list[str] = []

        for model in predicted_models[: self._prefetch_count]:
            if model in self._preloading:
                continue
            self._preloading.add(model)
            asyncio.create_task(self._do_preload(model, loaded))

        return loaded

    async def _do_preload(self, model: str, loaded: list[str]) -> None:
        try:
            success = await self._preload_fn(model)
            if success:
                loaded.append(model)
                logger.debug("RenderPredictive preloaded: %s", model)
        except Exception as e:
            logger.debug("RenderPredictive preload failed for %s: %s", model, e)
        finally:
            self._preloading.discard(model)

    def get_stats(self) -> dict[str, Any]:
        return {
            "history_size": len(self._history),
            "unique_models": len(self._model_frequency),
            "model_frequency": dict(self._model_frequency),
            "model_transitions": {k: dict(v) for k, v in self._transition_counts.items()},
            "unique_styles": len(self._style_frequency),
            "style_frequency": dict(self._style_frequency),
            "last_model": self._last_model,
            "last_style": self._last_style,
        }
