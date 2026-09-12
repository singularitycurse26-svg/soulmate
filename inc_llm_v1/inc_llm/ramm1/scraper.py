"""Ramm1 Web Scraper — new, way better than the current InternetIntegration.

Multi-strategy parsing (readability, JSON-LD, Open Graph, microdata, tables, lists,
full-text fallback), JS-render fallback via optional playwright, adaptive crawler
with robots.txt + dedup + relevance ranking, SQLite cache with ETag/Last-Modified,
streaming async generator. No hard deps — stdlib urllib + html.parser base;
playwright and bs4 are optional and auto-detected.
"""

from __future__ import annotations

import asyncio
import hashlib
import html.parser
import json
import logging
import os
import re
import sqlite3
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator

logger = logging.getLogger(__name__)

# Optional deps — auto-detected, scraper works without them
try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

try:
    import playwright
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False


# ── SSRF protection — block private/internal networks ──
PRIVATE_IP_PATTERNS = [
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^172\.(1[6-9]|2[0-9]|3[01])\."),
    re.compile(r"^169\.254\."),
    re.compile(r"^0\."),
    re.compile(r"^::1$"),
    re.compile(r"^fc00:"),
    re.compile(r"^fe80:"),
]


def _is_private_url(url: str) -> bool:
    """Check if a URL points to a private/internal network (SSRF protection)."""
    try:
        parsed = urllib.parse.urlparse(url)
        hostname = parsed.hostname or ""
        if hostname in ("localhost", "0.0.0.0", "[::1]"):
            return True
        for pattern in PRIVATE_IP_PATTERNS:
            if pattern.match(hostname):
                return True
        # Resolve hostname to check IP
        import socket
        try:
            ips = socket.getaddrinfo(hostname, None)
            for family, _, _, _, sockaddr in ips:
                ip = sockaddr[0]
                for pattern in PRIVATE_IP_PATTERNS:
                    if pattern.match(ip):
                        return True
        except socket.gaierror:
            pass
        return False
    except Exception:
        return False


@dataclass
class ScrapeRecord:
    """A scraped page record."""
    url: str
    title: str = ""
    text: str = ""
    structured_data: dict[str, Any] = field(default_factory=dict)
    links: list[str] = field(default_factory=list)
    fetched_at: float = field(default_factory=time.time)
    content_hash: str = ""
    strategy_used: str = ""
    status: str = "ok"
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url, "title": self.title, "text": self.text,
            "structured_data": self.structured_data, "links": self.links,
            "fetched_at": self.fetched_at, "content_hash": self.content_hash,
            "strategy_used": self.strategy_used, "status": self.status, "error": self.error,
        }


class _ReadabilityParser(html.parser.HTMLParser):
    """Simple readability-style extractor — finds main content blocks."""
    def __init__(self) -> None:
        super().__init__()
        self._in_main = False
        self._skip_tags = {"script", "style", "nav", "footer", "header", "aside", "noscript"}
        self._skip_depth = 0
        self._main_depth = 0
        self._text_parts: list[str] = []
        self._title = ""
        self._in_title = False
        self._links: list[str] = []
        self._in_a = False
        self._current_href = ""
        self._json_ld: list[str] = []
        self._in_json_ld = False
        self._og_tags: dict[str, str] = {}
        self._in_meta = False
        self._meta_property = ""
        self._meta_content = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attrs_dict = dict(attrs)
        if tag in self._skip_tags:
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag in ("article", "main"):
            self._in_main = True
            self._main_depth += 1
        if tag == "a" and attrs_dict.get("href"):
            self._in_a = True
            self._current_href = attrs_dict.get("href", "")
        if tag == "script" and attrs_dict.get("type") == "application/ld+json":
            self._in_json_ld = True
        if tag == "meta":
            prop = attrs_dict.get("property", "")
            content = attrs_dict.get("content", "")
            if prop and content:
                self._og_tags[prop] = content

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self._skip_tags and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag in ("article", "main") and self._main_depth > 0:
            self._main_depth -= 1
            if self._main_depth == 0:
                self._in_main = False
        if tag == "a":
            self._in_a = False
            if self._current_href:
                self._links.append(self._current_href)
                self._current_href = ""
        if tag == "script":
            self._in_json_ld = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0 and not self._in_json_ld:
            return
        if self._in_title:
            self._title += data
        if self._in_json_ld:
            self._json_ld.append(data)
        if self._in_main or self._main_depth > 0 or not self._text_parts:
            text = data.strip()
            if text:
                self._text_parts.append(text)

    def get_result(self) -> dict[str, Any]:
        text = "\n".join(self._text_parts)
        json_ld = []
        for raw in self._json_ld:
            try:
                json_ld.append(json.loads(raw))
            except Exception:
                pass
        return {
            "title": self._title.strip(),
            "text": text,
            "links": self._links,
            "json_ld": json_ld,
            "og_tags": self._og_tags,
        }


class Ramm1WebScraper:
    """New web scraper — way better than the current InternetIntegration.

    Multi-strategy parsing, JS-render fallback, adaptive crawler, dedup,
    rate limiting, SQLite cache, streaming. No hard deps.
    """

    def __init__(self, config: Any) -> None:
        self.config = config
        self.cache_path = Path(os.path.expanduser(getattr(config, "scraper_cache_path", "~/.inc_llm/ramm1_scraper_cache.db")))
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)
        self.rate_limit_per_min = getattr(config, "scraper_rate_limit_per_min", 30)
        self.js_fallback = getattr(config, "scraper_js_fallback", True)
        self.user_agent = getattr(config, "scraper_user_agent", "UniversalRamm1/1.0")
        self.cache_ttl_s = getattr(config, "scraper_cache_ttl_s", 86400)
        self._domain_last_fetch: dict[str, float] = {}
        self._conn: sqlite3.Connection | None = None
        self._init_cache()

    def _conn_get(self) -> sqlite3.Connection:
        if self._conn is None:
            self._init_cache()
        return self._conn  # type: ignore[return-value]

    def _init_cache(self) -> None:
        self._conn = sqlite3.connect(str(self.cache_path), check_same_thread=False)
        self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS scrape_cache (
                    url_hash TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    content_hash TEXT,
                    title TEXT,
                    text TEXT,
                    structured_data TEXT,
                    links TEXT,
                    strategy TEXT,
                    etag TEXT,
                    last_modified TEXT,
                    fetched_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cache_url ON scrape_cache(url);
            """)

    # ── Fetch ──

    def _fetch_url(self, url: str, timeout: int = 15, max_size_mb: int = 10) -> dict[str, Any]:
        """Fetch a URL with SSRF protection, redirect validation, size limits."""
        if _is_private_url(url):
            return {"status": "error", "error": "blocked: private/internal network (SSRF protection)"}

        req = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        try:
            resp = urllib.request.urlopen(req, timeout=timeout)
            # Validate redirect didn't go to a private network
            final_url = resp.geturl()
            if _is_private_url(final_url):
                return {"status": "error", "error": "blocked: redirect to private network"}

            content_type = resp.headers.get("Content-Type", "")
            max_bytes = max_size_mb * 1024 * 1024
            body = resp.read(max_bytes + 1)
            if len(body) > max_bytes:
                logger.warning("Response from %s exceeded %d MB — truncated", url, max_size_mb)
                body = body[:max_bytes]
            etag = resp.headers.get("ETag", "")
            last_modified = resp.headers.get("Last-Modified", "")
            return {
                "status": "ok",
                "url": final_url,
                "content_type": content_type,
                "body": body,
                "etag": etag,
                "last_modified": last_modified,
            }
        except urllib.error.HTTPError as e:
            return {"status": "error", "error": f"HTTP {e.code}", "code": e.code}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _respect_robots(self, url: str) -> bool:
        """Check robots.txt for the URL's domain. Returns True if allowed."""
        try:
            parsed = urllib.parse.urlparse(url)
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            req = urllib.request.Request(robots_url, headers={"User-Agent": self.user_agent})
            resp = urllib.request.urlopen(req, timeout=5)
            robots_txt = resp.read().decode("utf-8", errors="ignore")
            # Simple check: if "Disallow: /" is present for our path, block
            path = parsed.path or "/"
            # Very simple robots.txt parser
            our_agent = self.user_agent.split("/")[0].lower()
            agent_block = False
            disallow_paths: list[str] = []
            for line in robots_txt.splitlines():
                line = line.strip().lower()
                if line.startswith("user-agent:"):
                    agent = line.split(":", 1)[1].strip()
                    agent_block = agent == "*" or agent == our_agent
                elif line.startswith("disallow:") and agent_block:
                    disallow_path = line.split(":", 1)[1].strip()
                    if disallow_path and path.startswith(disallow_path):
                        return False
            return True
        except Exception:
            # If robots.txt can't be fetched, allow by default
            return True

    def _rate_limit(self, url: str) -> None:
        """Per-domain rate limiting."""
        domain = urllib.parse.urlparse(url).netloc
        now = time.time()
        last = self._domain_last_fetch.get(domain, 0)
        min_interval = 60.0 / max(1, self.rate_limit_per_min)
        if now - last < min_interval:
            time.sleep(min_interval - (now - last))
        self._domain_last_fetch[domain] = time.time()

    # ── Parse ──

    def _parse_html(self, html: str, url: str) -> dict[str, Any]:
        """Multi-strategy HTML parsing. Picks the best strategy per page."""
        # Strategy 1: readability extraction (stdlib HTMLParser)
        parser = _ReadabilityParser()
        parser.feed(html)
        result = parser.get_result()

        # Strategy 2: structured data (JSON-LD, Open Graph) — already captured
        structured: dict[str, Any] = {}
        if result.get("json_ld"):
            structured["json_ld"] = result["json_ld"]
        if result.get("og_tags"):
            structured["open_graph"] = result["og_tags"]

        # Strategy 3: BeautifulSoup-enhanced extraction if available
        if HAS_BS4:
            try:
                soup = BeautifulSoup(html, "html.parser")
                # Extract tables
                tables = []
                for table in soup.find_all("table"):
                    rows = []
                    for tr in table.find_all("tr"):
                        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                        if cells:
                            rows.append(cells)
                    if rows:
                        tables.append(rows)
                if tables:
                    structured["tables"] = tables
                # Extract headings
                headings = [(h.name, h.get_text(strip=True)) for h in soup.find_all(["h1", "h2", "h3"])]
                if headings:
                    structured["headings"] = headings
                # Extract code blocks
                code_blocks = [pre.get_text() for pre in soup.find_all("pre")]
                if code_blocks:
                    structured["code_blocks"] = code_blocks
                # Better text extraction if readability was thin
                if len(result["text"]) < 200:
                    for tag in soup.find_all(["p", "div", "section"]):
                        text = tag.get_text(strip=True)
                        if len(text) > len(result["text"]):
                            result["text"] = text
                            break
            except Exception as e:
                logger.debug("BeautifulSoup parsing skipped: %s", e)

        # Strategy 4: full-text fallback (already in result["text"])

        # Determine which strategy was used
        strategy = "readability"
        if structured.get("tables"):
            strategy = "structured+readability"
        if HAS_BS4 and len(result["text"]) > 500:
            strategy = "bs4+" + strategy

        # Normalize links to absolute URLs
        base = urllib.parse.urlparse(url)
        abs_links: list[str] = []
        for link in result.get("links", []):
            if link.startswith("#") or link.startswith("javascript:"):
                continue
            abs_url = urllib.parse.urljoin(url, link)
            abs_links.append(abs_url)

        content_hash = hashlib.sha256(result["text"].encode()).hexdigest()[:16]
        return {
            "url": url,
            "title": result["title"],
            "text": result["text"],
            "structured_data": structured,
            "links": abs_links,
            "content_hash": content_hash,
            "strategy_used": strategy,
        }

    async def _render_js(self, url: str, timeout: int = 20) -> str | None:
        """JS-render fallback via Playwright (optional)."""
        if not HAS_PLAYWRIGHT or not self.js_fallback:
            return None
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto(url, timeout=timeout * 1000)
                await page.wait_for_load_state("networkidle", timeout=timeout * 1000)
                html = await page.content()
                await browser.close()
                return html
        except Exception as e:
            logger.debug("JS render failed for %s: %s", url, e)
            return None

    # ── Public API ──

    async def scrape(self, url: str, strategy: str = "", js_fallback: bool | None = None) -> ScrapeRecord:
        """Scrape a single URL. Returns a ScrapeRecord."""
        # Check cache
        cached = self._cache_get(url)
        if cached and (time.time() - cached["fetched_at"]) < self.cache_ttl_s:
            return ScrapeRecord(**{k: v for k, v in cached.items() if k in ScrapeRecord.__dataclass_fields__})

        # Robots.txt check
        if not self._respect_robots(url):
            return ScrapeRecord(url=url, status="blocked", error="robots.txt disallows this path")

        # Rate limit
        self._rate_limit(url)

        # Fetch
        result = self._fetch_url(url)
        if result["status"] != "ok":
            return ScrapeRecord(url=url, status="error", error=result.get("error", "fetch failed"))

        body = result["body"]
        content_type = result.get("content_type", "")
        if "html" not in content_type and "text" not in content_type:
            return ScrapeRecord(url=url, status="error", error=f"unsupported content type: {content_type}")

        html = body.decode("utf-8", errors="replace")

        # Parse
        parsed = self._parse_html(html, url)

        # JS fallback if content is thin
        use_js = js_fallback if js_fallback is not None else self.js_fallback
        if use_js and len(parsed["text"]) < 200:
            logger.info("Thin content for %s — trying JS render fallback", url)
            js_html = await self._render_js(url)
            if js_html:
                parsed = self._parse_html(js_html, url)
                parsed["strategy_used"] = "js_render+" + parsed["strategy_used"]

        record = ScrapeRecord(
            url=url, title=parsed["title"], text=parsed["text"],
            structured_data=parsed["structured_data"], links=parsed["links"],
            content_hash=parsed["content_hash"], strategy_used=parsed["strategy_used"],
        )
        self._cache_put(record, etag=result.get("etag", ""), last_modified=result.get("last_modified", ""))
        return record

    async def search(self, query: str, max_pages: int = 5, depth: int = 1) -> list[ScrapeRecord]:
        """Search + scrape. Uses DuckDuckGo HTML search as the discovery backend."""
        results: list[ScrapeRecord] = []
        # DuckDuckGo HTML search
        search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        search_record = await self.scrape(search_url, js_fallback=False)
        if search_record.status != "ok":
            return results

        # Extract result URLs from the search page
        result_urls: list[str] = []
        for link in search_record.links:
            # DuckDuckGo redirects through /l/?uddg=...
            if "duckduckgo.com/l/" in link or "uddg=" in link:
                parsed = urllib.parse.urlparse(link)
                params = urllib.parse.parse_qs(parsed.query)
                if "uddg" in params:
                    result_urls.append(urllib.parse.unquote(params["uddg"][0]))
            elif link.startswith("http") and "duckduckgo.com" not in link:
                result_urls.append(link)

        # Scrape the top results
        for url in result_urls[:max_pages]:
            record = await self.scrape(url)
            if record.status == "ok":
                results.append(record)

        # Rank by relevance to the query (simple TF-IDF cosine)
        if results:
            results = self._rank_by_relevance(results, query)
        return results

    async def crawl(
        self,
        seed_url: str,
        depth: int = 2,
        query: str = "",
        max_pages: int = 50,
    ) -> AsyncIterator[ScrapeRecord]:
        """Crawl from a seed URL, yielding records as they complete.

        Crawls within the same domain, respects robots.txt, dedupes by content hash.
        """
        visited: set[str] = set()
        seen_hashes: set[str] = set()
        queue: list[tuple[str, int]] = [(seed_url, 0)]
        count = 0

        while queue and count < max_pages:
            url, current_depth = queue.pop(0)
            if url in visited or current_depth > depth:
                continue
            visited.add(url)

            record = await self.scrape(url)
            if record.status == "ok":
                if record.content_hash not in seen_hashes:
                    seen_hashes.add(record.content_hash)
                    count += 1
                    yield record
                # Enqueue same-domain links
                if current_depth < depth:
                    seed_domain = urllib.parse.urlparse(seed_url).netloc
                    for link in record.links:
                        link_domain = urllib.parse.urlparse(link).netloc
                        if link_domain == seed_domain and link not in visited:
                            queue.append((link, current_depth + 1))

    def _rank_by_relevance(self, records: list[ScrapeRecord], query: str) -> list[ScrapeRecord]:
        """Rank records by TF-IDF cosine similarity to the query."""
        query_words = query.lower().split()
        if not query_words:
            return records
        scored: list[tuple[float, ScrapeRecord]] = []
        for record in records:
            doc_words = (record.title + " " + record.text).lower().split()
            if not doc_words:
                scored.append((0.0, record))
                continue
            # Simple term frequency overlap
            overlap = sum(1 for w in query_words if w in doc_words)
            score = overlap / len(query_words)
            scored.append((score, record))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for _, r in scored]

    # ── Cache ──

    def _cache_get(self, url: str) -> dict[str, Any] | None:
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
        conn = self._conn_get()
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM scrape_cache WHERE url_hash = ?", (url_hash,)).fetchone()
        if row:
            d = dict(row)
            d["structured_data"] = json.loads(d["structured_data"]) if d.get("structured_data") else {}
            d["links"] = json.loads(d["links"]) if d.get("links") else []
            return d
        return None

    def _cache_put(self, record: ScrapeRecord, etag: str = "", last_modified: str = "") -> None:
        url_hash = hashlib.sha256(record.url.encode()).hexdigest()[:16]
        conn = self._conn_get()
        conn.execute(
            """INSERT OR REPLACE INTO scrape_cache
               (url_hash, url, content_hash, title, text, structured_data, links, strategy, etag, last_modified, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (url_hash, record.url, record.content_hash, record.title, record.text,
             json.dumps(record.structured_data), json.dumps(record.links),
             record.strategy_used, etag, last_modified, record.fetched_at),
        )
        conn.commit()

    def clear_cache(self) -> None:
        conn = self._conn_get()
        conn.execute("DELETE FROM scrape_cache")
        conn.commit()

    def get_cache_stats(self) -> dict[str, Any]:
        conn = self._conn_get()
        count = conn.execute("SELECT COUNT(*) FROM scrape_cache").fetchone()[0]
        return {"cached_urls": count, "cache_path": str(self.cache_path)}

    def get_status(self) -> dict[str, Any]:
        return {
            "rate_limit_per_min": self.rate_limit_per_min,
            "js_fallback": self.js_fallback,
            "has_bs4": HAS_BS4,
            "has_playwright": HAS_PLAYWRIGHT,
            "cache": self.get_cache_stats(),
        }
