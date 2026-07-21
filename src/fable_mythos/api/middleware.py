"""FastAPI middleware — request ID, logging, rate limiting, CORS."""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Injects a unique request ID into every request and response."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs each request with method, path, status, and duration."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "%s %s %d %.1fms request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            getattr(request.state, "request_id", "unknown"),
        )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter.

    Tracks requests per API key or IP within a sliding window.
    """

    def __init__(self, app: Any, max_requests: int = 60, window_s: int = 60, key_source: str = "api_key") -> None:
        super().__init__(app)
        self.max_requests = max_requests
        self.window_s = window_s
        self.key_source = key_source
        self._requests: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        # Skip health endpoints
        if request.url.path in ("/healthz", "/readyz"):
            return await call_next(request)

        # Determine key
        if self.key_source == "api_key":
            key = request.headers.get("authorization", request.client.host if request.client else "unknown")
        else:
            key = request.client.host if request.client else "unknown"

        now = time.time()
        # Clean old entries
        self._requests[key] = [t for t in self._requests[key] if now - t < self.window_s]

        if len(self._requests[key]) >= self.max_requests:
            return Response(
                content='{"detail": "Rate limit exceeded"}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(self.window_s)},
            )

        self._requests[key].append(now)
        return await call_next(request)
