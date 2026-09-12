// Aceline Extension — Background service worker
// Handles extension icon clicks and message routing

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-page-api") {
    // Forward to content script of active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "get-page-api" }, (response) => {
          sendResponse(response);
        });
      } else {
        sendResponse(null);
      }
    });
    return true; // async response
  }
});

// Handle action click — toggle overlay on active tab
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle" });
  }
});
