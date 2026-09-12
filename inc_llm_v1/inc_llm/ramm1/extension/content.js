// Universal Ramm1 Scraper — content script
// Injects window.__ramm1.scrape(url) and window.__ramm1.search(query) APIs into all pages.
// Any existing scraper running in the browser can call these as a fallback.

(function () {
  if (window.__ramm1) return; // already injected

  const ramm1 = {
    server: "http://localhost:8547/v1/ramm1/scrape",

    // Scrape a URL through the local Ramm1 server
    scrape: function (url) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "ramm1_scrape", url }, (response) => {
          if (response && response.status === "ok") resolve(response.data);
          else reject(new Error(response ? response.error : "no response"));
        });
      });
    },

    // Search + scrape through the local Ramm1 server
    search: function (query) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "ramm1_search", query }, (response) => {
          if (response && response.status === "ok") resolve(response.data);
          else reject(new Error(response ? response.error : "no response"));
        });
      });
    },

    // Check if the local Ramm1 server is running
    health: function () {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "ramm1_health" }, (response) => {
          if (response && response.status === "ok") resolve(response.data);
          else reject(new Error(response ? response.error : "no response"));
        });
      });
    },

    // Listen for requests from other extensions via postMessage
    _initListener: function () {
      window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== "ramm1_request") return;
        const { action, url, query, id } = event.data;
        const handler = action === "search" ? ramm1.search(query) : ramm1.scrape(url);
        handler
          .then((data) => event.source.postMessage({ type: "ramm1_response", id, status: "ok", data }))
          .catch((err) => event.source.postMessage({ type: "ramm1_response", id, status: "error", error: String(err) }));
      });
    },
  };

  window.__ramm1 = ramm1;
  ramm1._initListener();

  // Dispatch a ready event so existing scrapers know the API is available
  window.dispatchEvent(new CustomEvent("ramm1_ready", { detail: { server: ramm1.server } }));
})();
