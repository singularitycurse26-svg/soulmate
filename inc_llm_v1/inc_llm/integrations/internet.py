"""Internet integration — Wikipedia and web search access.

Provides rate-limited internet access for the LLM to look up real-time
information. Uses Wikipedia API for factual queries and falls back to
a simple web fetch for other URLs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
import urllib.parse
from typing import Any

from inc_llm.config import InternetConfig

logger = logging.getLogger(__name__)


class InternetIntegration:
    """Internet/Wikipedia access with rate limiting and caching."""

    def __init__(self, config: InternetConfig) -> None:
        self.config = config
        self._request_times: list[float] = []
        self._cache: dict[str, tuple[float, Any]] = {}

    def _check_rate_limit(self) -> bool:
        """Enforce rate limit per minute."""
        now = time.time()
        self._request_times = [t for t in self._request_times if now - t < 60]
        if len(self._request_times) >= self.config.rate_limit_per_min:
            return False
        self._request_times.append(now)
        return True

    def _get_cached(self, key: str) -> Any | None:
        if key in self._cache:
            ts, val = self._cache[key]
            if time.time() - ts < self.config.cache_ttl_s:
                return val
            del self._cache[key]
        return None

    def _set_cached(self, key: str, value: Any) -> None:
        self._cache[key] = (time.time(), value)

    async def search_wikipedia(self, query: str, sentences: int = 3) -> dict[str, Any]:
        """Search Wikipedia for a query and return a summary."""
        if not self.config.enabled:
            return {"status": "disabled"}
        if not self._check_rate_limit():
            return {"status": "rate_limited"}

        cache_key = f"wiki:{query}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            encoded = urllib.parse.quote(query)

            def _fetch():
                url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
                req = urllib.request.Request(url, headers={"User-Agent": "incllmv2/1.0"})
                resp = urllib.request.urlopen(req, timeout=self.config.timeout_s)
                return json.loads(resp.read().decode())

            data = await asyncio.to_thread(_fetch)
            result = {
                "status": "ok",
                "title": data.get("title", ""),
                "extract": data.get("extract", ""),
                "url": data.get("content_urls", {}).get("desktop", {}).get("page", ""),
            }
            self._set_cached(cache_key, result)
            return result
        except Exception as e:
            logger.warning("Wikipedia search failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def search_web(self, query: str) -> dict[str, Any]:
        """Search the web using a simple fetch (DuckDuckGo instant answers)."""
        if not self.config.enabled:
            return {"status": "disabled"}
        if not self._check_rate_limit():
            return {"status": "rate_limited"}

        cache_key = f"web:{query}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        try:
            encoded = urllib.parse.quote(query)

            def _fetch():
                url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_html=1&skip_disambig=1"
                req = urllib.request.Request(url, headers={"User-Agent": "incllmv2/1.0"})
                resp = urllib.request.urlopen(req, timeout=self.config.timeout_s)
                return json.loads(resp.read().decode())

            data = await asyncio.to_thread(_fetch)
            abstract = data.get("AbstractText", "") or data.get("Abstract", "")
            related: list[dict[str, str]] = []
            for topic in data.get("RelatedTopics", [])[:5]:
                if isinstance(topic, dict) and topic.get("Text"):
                    related.append({"text": topic["Text"], "url": topic.get("FirstURL", "")})

            result = {
                "status": "ok",
                "abstract": abstract,
                "related": related,
                "source": "duckduckgo",
            }
            self._set_cached(cache_key, result)
            return result
        except Exception as e:
            logger.warning("Web search failed: %s", e)
            return {"status": "error", "error": str(e)}

    async def fetch_url(self, url: str) -> dict[str, Any]:
        """Fetch content from a URL."""
        if not self.config.enabled:
            return {"status": "disabled"}
        if not self._check_rate_limit():
            return {"status": "rate_limited"}

        try:
            def _fetch():
                req = urllib.request.Request(url, headers={"User-Agent": "incllmv2/1.0"})
                resp = urllib.request.urlopen(req, timeout=self.config.timeout_s)
                content_type = resp.headers.get("Content-Type", "")
                body = resp.read().decode("utf-8", errors="replace")
                return {"content": body[:10000], "content_type": content_type}

            result = await asyncio.to_thread(_fetch)
            result["status"] = "ok"
            return result
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def get_stats(self) -> dict[str, Any]:
        return {
            "enabled": self.config.enabled,
            "requests_this_minute": len(self._request_times),
            "cache_size": len(self._cache),
            "rate_limit": self.config.rate_limit_per_min,
        }
