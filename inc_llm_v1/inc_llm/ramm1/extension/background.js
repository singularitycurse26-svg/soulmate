// Universal Ramm1 Scraper — background service worker
// Manages connection to the local Ramm1 server and handles intercept-mode failure detection.

const RAMM1_BASE = "http://localhost:8547/v1/ramm1/scrape";

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ramm1_scrape") {
    fetch(`${RAMM1_BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: message.url, js_fallback: true }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ status: "ok", data }))
      .catch((err) => sendResponse({ status: "error", error: String(err) }));
    return true; // async response
  }
  if (message.type === "ramm1_search") {
    fetch(`${RAMM1_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: message.query, max_pages: 5 }),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ status: "ok", data }))
      .catch((err) => sendResponse({ status: "error", error: String(err) }));
    return true;
  }
  if (message.type === "ramm1_health") {
    fetch("http://localhost:8547/v1/ramm1/status")
      .then((r) => r.json())
      .then((data) => sendResponse({ status: "ok", data }))
      .catch((err) => sendResponse({ status: "error", error: String(err) }));
    return true;
  }
});

// Intercept mode: detect when a page fetch fails and re-fetch through Ramm1
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // Check if the page loaded with an error
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.title.includes("ERR_") || document.body.textContent.includes("This site can")) {
          chrome.runtime.sendMessage({ type: "ramm1_intercept_failed", url: location.href });
        }
      },
    }).catch(() => {});
  }
});
