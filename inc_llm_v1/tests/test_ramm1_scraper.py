"""Test the Ramm1 Web Scraper — parsing, dedup, cache, crawl."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from inc_llm.ramm1.scraper import Ramm1WebScraper, _is_private_url
from inc_llm.config import Ramm1Config


def test_ssrf_protection():
    """Test that private/internal URLs are blocked."""
    assert _is_private_url("http://127.0.0.1:8080"), "127.0.0.1 should be blocked"
    assert _is_private_url("http://localhost:8080"), "localhost should be blocked"
    assert _is_private_url("http://192.168.1.1"), "192.168.x.x should be blocked"
    assert _is_private_url("http://10.0.0.1"), "10.x.x.x should be blocked"
    assert not _is_private_url("https://example.com"), "example.com should not be blocked"
    print("PASS: test_ssrf_protection")


def test_html_parsing():
    """Test multi-strategy HTML parsing."""
    config = Ramm1Config(scraper_cache_path=":memory:")
    scraper = Ramm1WebScraper(config)
    html = """
    <html><head><title>Test Page</title>
    <meta property="og:title" content="Test Page">
    <script type="application/ld+json">{"@type":"Article","headline":"Test"}</script>
    </head><body>
    <nav>Navigation</nav>
    <article><p>This is the main content of the article.</p></article>
    <footer>Footer</footer>
    </body></html>
    """
    result = scraper._parse_html(html, "https://example.com")
    assert "title" in result, "Parse result should have title"
    assert "Test Page" in result["title"], "Title should be extracted"
    assert "main content" in result["text"], "Main content should be extracted"
    assert "Navigation" not in result["text"], "Nav should be excluded"
    assert "Footer" not in result["text"], "Footer should be excluded"
    assert "open_graph" in result["structured_data"], "Open Graph should be extracted"
    assert "json_ld" in result["structured_data"], "JSON-LD should be extracted"
    print("PASS: test_html_parsing")


def test_cache_stats():
    """Test cache stats."""
    config = Ramm1Config(scraper_cache_path=":memory:")
    scraper = Ramm1WebScraper(config)
    stats = scraper.get_cache_stats()
    assert "cached_urls" in stats, "Cache stats should have cached_urls"
    print("PASS: test_cache_stats")


def test_scraper_status():
    """Test scraper status."""
    config = Ramm1Config(scraper_cache_path=":memory:")
    scraper = Ramm1WebScraper(config)
    status = scraper.get_status()
    assert "rate_limit_per_min" in status
    assert "js_fallback" in status
    assert "has_bs4" in status
    assert "has_playwright" in status
    print("PASS: test_scraper_status")


if __name__ == "__main__":
    test_ssrf_protection()
    test_html_parsing()
    test_cache_stats()
    test_scraper_status()
    print("\nAll Ramm1 Scraper tests passed.")
