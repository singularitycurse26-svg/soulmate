# Universal Ramm1 Scraper — Browser Extension

A Manifest V3 Chrome/Firefox extension that lets existing scrapers use the Ramm1 web scraper when they need new data.

## Features

- **Local proxy**: connects to the local Ramm1 server (`http://localhost:8547`).
- **Intercept mode**: detects when an existing scraper hits a page it can't parse and re-fetches through Ramm1.
- **Manual mode**: toolbar popup to scrape a URL or search + scrape.
- **Adapter APIs**: exposes `window.__ramm1.scrape(url)` and `window.__ramm1.search(query)` to page scripts, so any existing scraper running in the browser can call Ramm1 as a fallback.
- **No external services**: the extension only talks to the local Ramm1 server. No data leaves the machine. Free, local, private.

## Install (Chrome)

1. Start the Ramm1 backend: `python -m inc_llm.server` (or `ramm1` CLI once installed).
2. Open `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select this `extension/` folder.
6. The Ramm1 icon appears in your toolbar.

## Install (Firefox)

1. Start the Ramm1 backend.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on**.
4. Select `manifest.json` in this folder.

## Usage

### Manual scraping
1. Click the Ramm1 icon.
2. Paste a URL in the **Scrape** tab.
3. Click **Scrape** — get clean text + structured data.
4. Export as JSON or Markdown.

### Search + scrape
1. Click the Ramm1 icon.
2. Switch to the **Search** tab.
3. Enter a query and click **Search + Scrape**.

### From an existing scraper (programmatic)
Any page script can call:
```js
// Scrape a URL
const result = await window.__ramm1.scrape("https://example.com");

// Search + scrape
const results = await window.__ramm1.search("latest AI news");

// Check if Ramm1 is available
const health = await window.__ramm1.health();
```

Or via `postMessage` (for cross-frame/cross-extension use):
```js
window.postMessage({ type: "ramm1_request", action: "scrape", url: "https://example.com", id: "my-id" }, "*");
window.addEventListener("message", (event) => {
  if (event.data.type === "ramm1_response" && event.data.id === "my-id") {
    console.log(event.data.data);
  }
});
```

## How existing scrapers use ours

When an existing scraper (Firecrawl, Crawl4AI, Apify, Bright Data, ScrapingBee, etc.) running in the browser hits a page it can't parse (paywall, JS-heavy, bot-detection), it can call `window.__ramm1.scrape(url)` as a fallback. Ramm1 re-fetches the page through its local scraper (with JS-render fallback, multi-strategy parsing, dedup) and returns the clean content to the original scraper.
