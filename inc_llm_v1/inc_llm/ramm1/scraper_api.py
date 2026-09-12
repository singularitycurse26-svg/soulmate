"""Scraper API — FastAPI router for the Ramm1 Web Scraper.

Endpoints:
- POST /v1/ramm1/scrape — scrape a single URL
- POST /v1/ramm1/scrape/search — search + scrape
- POST /v1/ramm1/scrape/crawl — crawl a domain (streaming)
- GET /v1/ramm1/scrape/cache — cache stats
- DELETE /v1/ramm1/scrape/cache — clear cache
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from inc_llm.ramm1.scraper import Ramm1WebScraper

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/ramm1/scrape", tags=["ramm1-scraper"])

_scraper: Ramm1WebScraper | None = None


def init_scraper_api(scraper: Ramm1WebScraper) -> None:
    """Initialize the scraper API with a scraper instance."""
    global _scraper
    _scraper = scraper


def _get_scraper() -> Ramm1WebScraper:
    if _scraper is None:
        raise RuntimeError("Scraper API not initialized — call init_scraper_api() first")
    return _scraper


class ScrapeRequest(BaseModel):
    url: str
    strategy: str = ""
    js_fallback: bool | None = None


class SearchRequest(BaseModel):
    query: str
    max_pages: int = 5
    depth: int = 1


class CrawlRequest(BaseModel):
    seed_url: str
    depth: int = 2
    query: str = ""
    max_pages: int = 50


@router.post("")
async def scrape(req: ScrapeRequest) -> dict[str, Any]:
    """Scrape a single URL."""
    scraper = _get_scraper()
    record = await scraper.scrape(req.url, strategy=req.strategy, js_fallback=req.js_fallback)
    return record.to_dict()


@router.post("/search")
async def search(req: SearchRequest) -> dict[str, Any]:
    """Search + scrape."""
    scraper = _get_scraper()
    results = await scraper.search(req.query, max_pages=req.max_pages, depth=req.depth)
    return {
        "query": req.query,
        "count": len(results),
        "results": [r.to_dict() for r in results],
    }


@router.post("/crawl")
async def crawl(req: CrawlRequest) -> dict[str, Any]:
    """Crawl a domain. Returns all records (non-streaming for simplicity)."""
    scraper = _get_scraper()
    records = []
    async for record in scraper.crawl(req.seed_url, depth=req.depth, query=req.query, max_pages=req.max_pages):
        records.append(record.to_dict())
    return {
        "seed_url": req.seed_url,
        "depth": req.depth,
        "count": len(records),
        "records": records,
    }


@router.get("/cache")
async def cache_stats() -> dict[str, Any]:
    """Get cache stats."""
    return _get_scraper().get_cache_stats()


@router.delete("/cache")
async def clear_cache() -> dict[str, Any]:
    """Clear the cache."""
    _get_scraper().clear_cache()
    return {"status": "cleared"}


@router.get("/status")
async def scraper_status() -> dict[str, Any]:
    """Get scraper status."""
    return _get_scraper().get_status()
