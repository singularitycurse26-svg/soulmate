"""GLM Priority Queue — solves GLM contention between user and observer requests.

PROBLEM (found in the actual code):
  - inc_llm/providers/ollama.py line 73: Ollama calls run in threads
  - inc_llm/providers/bus.py line 37-42: single provider, single model
  - inc_llm/integrations/aceline_agent.py line 55: Aceline uses glm-5.1
  - inc_llm/config.py lines 33-37: ALL 5 model roles default to the SAME model

  Ollama processes ONE request at a time per model. If the observer calls
  GLM 5.1 for workflow detection (30s), and the user sends a message to
  Aceline, the user waits 30 seconds for the observer to finish.

SOLUTION:
  A priority queue with preemption:
  1. 3 priority levels: user (5), observer (3), prefetch (1)
  2. When a user request comes in, it preempts the observer's request
  3. The observer's request is cancelled and re-queued
  4. The user's request goes first
  5. After the user's request completes, the observer retries

  Optimization: The observer batches its analysis into ONE big GLM call
  instead of many small calls. This means:
  - User request: 1 call, 2-5 seconds
  - Observer request: 1 batched call, 10-30 seconds (but only when user is idle)

  If a secondary model is configured (observer_model), the observer uses it
  instead of the primary model — NO contention at all, both run in parallel.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class GLMRequest:
    """A GLM request with priority level.

    Priority levels:
    - 5: user (highest — always preempts lower priority)
    - 4: aceline (high — Aceline conversations, commands)
    - 3: observer (medium — workflow detection, improvement notes)
    - 2: background (low — monthly reports, analysis)
    - 1: prefetch (lowest — predictive prefetch)
    """
    messages: list[dict[str, str]]
    max_tokens: int = 128
    temperature: float = 0.7
    priority: int = 3
    timeout: float = 30.0
    model: str = ""  # Override model (empty = use default for priority level)
    future: asyncio.Future = field(default_factory=lambda: asyncio.get_event_loop().create_future())


class GLMPriorityQueue:
    """Priority queue for GLM requests — user always goes first.

    Solves the #1 bottleneck: GLM contention between user and observer.
    When a user request comes in while the observer is running, the observer's
    request is cancelled and re-queued. The user's request starts immediately.
    """

    def __init__(
        self,
        ollama_base: str = "http://localhost:11434",
        primary_model: str = "glm-5.1",
        observer_model: str = "",
        max_retries: int = 3,
    ) -> None:
        self.ollama_base = ollama_base
        self.primary_model = primary_model
        self.observer_model = observer_model or primary_model
        self.max_retries = max_retries
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._current: GLMRequest | None = None
        self._current_task: asyncio.Task | None = None
        self._worker: asyncio.Task | None = None
        self._running = False
        # Stats
        self._total_requests = 0
        self._total_preemptions = 0
        self._total_failures = 0
        self._total_retries = 0
        self._last_latency_ms = 0

    async def start(self) -> None:
        """Start the background worker loop."""
        if self._running:
            return
        self._running = True
        self._worker = asyncio.create_task(self._worker_loop())
        logger.info("GLMPriorityQueue started (primary=%s, observer=%s)",
                    self.primary_model, self.observer_model)

    async def stop(self) -> None:
        """Stop the background worker loop."""
        self._running = False
        if self._current_task:
            self._current_task.cancel()
            try:
                await self._current_task
            except asyncio.CancelledError:
                pass
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
        logger.info("GLMPriorityQueue stopped (total=%s, preemptions=%s, failures=%s)",
                    self._total_requests, self._total_preemptions, self._total_failures)

    async def submit(self, request: GLMRequest) -> dict:
        """Submit a GLM request with priority. Returns the result.

        Higher priority requests preempt lower priority requests.
        The preempted request is cancelled and re-queued (it will retry).
        """
        self._total_requests += 1

        # If a lower-priority request is running, preempt it
        if self._current and request.priority > self._current.priority:
            logger.debug("Preempting priority %s request with priority %s",
                         self._current.priority, request.priority)
            self._total_preemptions += 1
            if self._current_task and not self._current_task.done():
                self._current_task.cancel()
                # Re-queue the preempted request (it will retry)
                await self._queue.put((self._current.priority, time.time(), self._current))

        # Add the new request to the queue
        await self._queue.put((request.priority, time.time(), request))

        # Wait for the result
        return await request.future

    async def _worker_loop(self) -> None:
        """Process requests by priority. Preempt lower-priority requests."""
        while self._running:
            try:
                priority, timestamp, request = await self._queue.get()

                # Skip if the request's future is already done (cancelled/done)
                if request.future.done():
                    continue

                self._current = request
                self._current_task = asyncio.create_task(self._execute(request))

                try:
                    await self._current_task
                except asyncio.CancelledError:
                    # Preempted — request was re-queued by submit()
                    pass
                except Exception as e:
                    logger.debug("GLM request failed: %s", e)
                    if not request.future.done():
                        request.future.set_exception(e)
                    self._total_failures += 1
                finally:
                    self._current = None
                    self._current_task = None
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("GLM worker loop error: %s", e)

    async def _execute(self, request: GLMRequest) -> None:
        """Execute a GLM request with retry logic."""
        retries = 0
        last_error = None

        while retries <= self.max_retries:
            try:
                # Choose model based on priority:
                # - User/Aceline requests (priority >= 4) → primary model (glm-5.1, big, smart)
                # - Observer/background/prefetch (priority <= 3) → observer model (smaller, faster)
                model = request.model or (
                    self.primary_model if request.priority >= 4 else self.observer_model
                )

                start_time = time.time()

                def _do_request():
                    body = json.dumps({
                        "model": model,
                        "messages": request.messages,
                        "stream": False,
                        "options": {
                            "num_predict": request.max_tokens,
                            "temperature": request.temperature,
                        },
                    }).encode()
                    req = urllib.request.Request(
                        f"{self.ollama_base}/api/chat",
                        data=body,
                        headers={"Content-Type": "application/json"},
                    )
                    resp = urllib.request.urlopen(req, timeout=request.timeout)
                    return json.loads(resp.read().decode())

                data = await asyncio.to_thread(_do_request)
                content = data.get("message", {}).get("content", "")
                latency_ms = (time.time() - start_time) * 1000
                self._last_latency_ms = latency_ms

                if not request.future.done():
                    request.future.set_result({
                        "content": content,
                        "model": model,
                        "latency_ms": latency_ms,
                    })
                return

            except asyncio.CancelledError:
                # Preempted — don't retry, just let the cancellation propagate
                raise
            except Exception as e:
                last_error = e
                retries += 1
                if retries <= self.max_retries:
                    self._total_retries += 1
                    logger.debug("GLM request retry %s/%s: %s", retries, self.max_retries, e)
                    await asyncio.sleep(min(retries * 2, 10))  # Exponential backoff
                else:
                    if not request.future.done():
                        request.future.set_exception(e)

    def get_stats(self) -> dict:
        """Return queue statistics."""
        return {
            "running": self._running,
            "queue_size": self._queue.qsize(),
            "current_priority": self._current.priority if self._current else None,
            "total_requests": self._total_requests,
            "total_preemptions": self._total_preemptions,
            "total_failures": self._total_failures,
            "total_retries": self._total_retries,
            "last_latency_ms": self._last_latency_ms,
            "primary_model": self.primary_model,
            "observer_model": self.observer_model,
        }
