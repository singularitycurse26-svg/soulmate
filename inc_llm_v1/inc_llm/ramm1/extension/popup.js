// Universal Ramm1 Scraper — popup script

const RAMM1_BASE = "http://localhost:8547/v1/ramm1/scrape";

// Tab switching
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("scrape-tab").style.display = tab.dataset.tab === "scrape" ? "block" : "none";
    document.getElementById("search-tab").style.display = tab.dataset.tab === "search" ? "block" : "none";
  });
});

// Health check
chrome.runtime.sendMessage({ type: "ramm1_health" }, (response) => {
  const el = document.getElementById("health");
  if (response && response.status === "ok") {
    el.textContent = "Server: online";
    el.className = "status ok";
  } else {
    el.textContent = "Server: offline (start Ramm1 backend)";
    el.className = "status error";
  }
});

// Scrape
let lastScrapeResult = null;
document.getElementById("scrape-btn").addEventListener("click", () => {
  const url = document.getElementById("scrape-url").value.trim();
  if (!url) return;
  const resultEl = document.getElementById("scrape-result");
  resultEl.textContent = "Scraping...";
  chrome.runtime.sendMessage({ type: "ramm1_scrape", url }, (response) => {
    if (response && response.status === "ok") {
      lastScrapeResult = response.data;
      resultEl.textContent = JSON.stringify(response.data, null, 2);
    } else {
      resultEl.textContent = "Error: " + (response ? response.error : "no response");
    }
  });
});

// Export JSON
document.getElementById("scrape-export-json").addEventListener("click", () => {
  if (!lastScrapeResult) return;
  const blob = new Blob([JSON.stringify(lastScrapeResult, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ramm1_scrape.json";
  a.click();
});

// Export Markdown
document.getElementById("scrape-export-md").addEventListener("click", () => {
  if (!lastScrapeResult) return;
  const md = `# ${lastScrapeResult.title || "Untitled"}\n\nURL: ${lastScrapeResult.url}\n\n${lastScrapeResult.text || ""}`;
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ramm1_scrape.md";
  a.click();
});

// Search
document.getElementById("search-btn").addEventListener("click", () => {
  const query = document.getElementById("search-query").value.trim();
  if (!query) return;
  const resultEl = document.getElementById("search-result");
  resultEl.textContent = "Searching...";
  chrome.runtime.sendMessage({ type: "ramm1_search", query }, (response) => {
    if (response && response.status === "ok") {
      resultEl.textContent = JSON.stringify(response.data, null, 2);
    } else {
      resultEl.textContent = "Error: " + (response ? response.error : "no response");
    }
  });
});
