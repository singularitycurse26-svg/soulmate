// Aceline Browser Extension — Content Script
// Injects a floating Aceline button + overlay onto any webpage.
// Reads page DOM, builds a page-API summary, sends to GLM 5.1 via incllmv2.

(function () {
  "use strict";

  // Prevent double-injection
  if (window.__acelineInjected) return;
  window.__acelineInjected = true;

  const INCLLMV2_BASE = "http://localhost:8547";
  let cachedToken = null;
  let consent = { given: false, remembered: false, features: {} };
  let state = { messages: [], personality: "aceline", voiceEnabled: true, thinking: false, listening: false };
  let overlayVisible = false;

  // Load consent from chrome.storage
  chrome.storage.local.get(["aceline_consent"], (result) => {
    if (result.aceline_consent) {
      consent = result.aceline_consent;
    }
  });

  // ── Build page API summary from DOM ──
  function buildPageApi() {
    const forms = Array.from(document.querySelectorAll("form")).slice(0, 10).map((f, i) => ({
      id: f.id || `form-${i}`,
      action: f.action || "",
      inputs: Array.from(f.querySelectorAll("input, textarea, select")).slice(0, 10).map((inp) => ({
        type: inp.type || inp.tagName.toLowerCase(),
        name: inp.name || "",
        placeholder: inp.placeholder || "",
      })),
    }));

    const buttons = Array.from(document.querySelectorAll("button, [role=button], a[href]")).slice(0, 20).map((b, i) => ({
      text: (b.textContent || "").trim().slice(0, 50),
      href: b.href || "",
      id: b.id || `btn-${i}`,
    }));

    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 10).map((h) => h.textContent.trim());

    return {
      url: location.href,
      title: document.title,
      forms,
      buttons,
      headings,
      textPreview: document.body.innerText.slice(0, 1000),
    };
  }

  // ── API ──
  async function getToken() {
    if (cachedToken) return cachedToken;
    const r = await fetch(`${INCLLMV2_BASE}/v1/auth/auto`, { method: "POST" });
    const d = await r.json();
    cachedToken = d.token;
    return cachedToken;
  }

  async function acelineChat(message) {
    const pageApi = buildPageApi();
    const sysParts = [
      state.personality === "jarvis"
        ? "You are Jarvis, voice-first AI assistant operating as a browser extension."
        : "You are Aceline, a roaming AI agent injected as a browser extension on an external webpage.",
      `You are on: ${location.href}`,
      `Page title: ${document.title}`,
      "\nPage capabilities (auto-built from DOM):",
      JSON.stringify(pageApi, null, 2).slice(0, 2000),
    ];
    if (consent.customDirectives) sysParts.push(`\nCustom directives: ${consent.customDirectives}`);

    try {
      const token = await getToken();
      const r = await fetch(`${INCLLMV2_BASE}/v1/ai/jarvis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message,
          model: "dolphin-mistral:latest",
          context: { agent: "aceline", source: "browser-extension", page: location.href, pageContext: sysParts.join("\n"), personality: state.personality },
        }),
      });
      const d = await r.json();
      return d.response || "No response";
    } catch (e) {
      return `Offline (no backend at ${INCLLMV2_BASE}). I can still read this page. Here's what I see: ${pageApi.headings.join(", ") || "no headings"}`;
    }
  }

  // ── DOM actions (consent-gated) ──
  function executeDomAction(action) {
    if (!consent.features.customActions) return "(blocked: custom actions not granted)";
    try {
      if (action.type === "click") {
        const el = document.querySelector(action.selector);
        if (el) { el.click(); return `(clicked ${action.selector})`; }
        return `(not found: ${action.selector})`;
      }
      if (action.type === "fill") {
        const el = document.querySelector(action.selector);
        if (el) { el.value = action.value; el.dispatchEvent(new Event("input", { bubbles: true })); return `(filled ${action.selector})`; }
        return `(not found: ${action.selector})`;
      }
      if (action.type === "read") {
        const el = document.querySelector(action.selector);
        if (el) return el.textContent.trim().slice(0, 500);
        return `(not found: ${action.selector})`;
      }
      if (action.type === "navigate") {
        location.href = action.url;
        return `(navigating to ${action.url})`;
      }
    } catch (e) {
      return `(error: ${e.message})`;
    }
    return "(unknown action)";
  }

  // ── Voice ──
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  function speak(text) {
    if (!state.voiceEnabled || !consent.features.voice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, "").slice(0, 500));
    u.rate = state.personality === "jarvis" ? 0.95 : 1.0;
    window.speechSynthesis.speak(u);
  }

  function startListening() {
    if (!SR || !consent.features.voice) return;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      const input = document.getElementById("__aceline-input");
      if (input) input.value = t;
    };
    recognition.onend = () => { state.listening = false; updateOverlay(); };
    recognition.start();
    state.listening = true;
    updateOverlay();
  }

  function stopListening() {
    if (recognition) { try { recognition.stop(); } catch {} }
    state.listening = false;
    updateOverlay();
  }

  // ── Inject button + overlay ──
  function injectUI() {
    // Button
    const btn = document.createElement("div");
    btn.id = "__aceline-fab";
    btn.innerHTML = "✨";
    btn.title = "Open Aceline";
    btn.addEventListener("click", () => {
      overlayVisible = !overlayVisible;
      if (overlayVisible) {
        showOverlay();
      } else {
        hideOverlay();
      }
    });
    document.body.appendChild(btn);

    // Consent modal on first use
    if (!consent.given) {
      showConsentModal();
    }
  }

  function showConsentModal() {
    const modal = document.createElement("div");
    modal.id = "__aceline-consent";
    modal.innerHTML = `
      <div class="__aceline-consent-box">
        <h2>🛡️ Aceline Extension Consent</h2>
        <p style="color:#8888aa;font-size:12px;margin-bottom:16px;">Allow Aceline to run on <b>${location.hostname}</b>?</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
          <label><input type="checkbox" id="__ac-f-voice" checked> Voice / Jarvis</label>
          <label><input type="checkbox" id="__ac-f-actions" checked> DOM Actions (click, fill, read)</label>
          <label><input type="checkbox" id="__ac-f-glm" checked> GLM 5.1 Backend</label>
          <label><input type="checkbox" id="__ac-f-autoapi" checked> Auto-API Building</label>
        </div>
        <textarea id="__ac-directives" placeholder="Custom directives (optional)..." style="width:100%;padding:8px;border-radius:8px;background:#252540;border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:12px;resize:vertical;margin-bottom:12px;" rows="2"></textarea>
        <div style="display:flex;gap:8px;">
          <button id="__ac-deny" style="flex:1;padding:10px;border-radius:10px;border:none;background:#252540;color:#8888aa;cursor:pointer;font-size:13px;">Deny</button>
          <button id="__ac-allow" style="flex:1;padding:10px;border-radius:10px;border:none;background:#E91E63;color:white;cursor:pointer;font-size:13px;font-weight:600;">Allow</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("__ac-allow").addEventListener("click", () => {
      consent.features = {
        voice: document.getElementById("__ac-f-voice").checked,
        customActions: document.getElementById("__ac-f-actions").checked,
        glmBackend: document.getElementById("__ac-f-glm").checked,
        autoApi: document.getElementById("__ac-f-autoapi").checked,
      };
      consent.customDirectives = document.getElementById("__ac-directives").value;
      consent.given = true;
      consent.remembered = true;
      chrome.storage.local.set({ aceline_consent: consent });
      modal.remove();
    });

    document.getElementById("__ac-deny").addEventListener("click", () => {
      consent.features = { voice: false, customActions: false, glmBackend: false, autoApi: false };
      consent.given = true;
      consent.remembered = true;
      chrome.storage.local.set({ aceline_consent: consent });
      modal.remove();
    });
  }

  function showOverlay() {
    let overlay = document.getElementById("__aceline-overlay");
    if (overlay) { overlay.style.display = "flex"; return; }

    overlay = document.createElement("div");
    overlay.id = "__aceline-overlay";
    overlay.innerHTML = `
      <div class="__aceline-header">
        <span id="__aceline-name">✨ Aceline</span>
        <div style="margin-left:auto;display:flex;gap:4px;">
          <button id="__aceline-personality" class="__aceline-hbtn" title="Switch personality">🤖</button>
          <button id="__aceline-voice" class="__aceline-hbtn" title="Toggle voice">🔊</button>
          <button id="__aceline-close" class="__aceline-hbtn" title="Close">✕</button>
        </div>
      </div>
      <div id="__aceline-messages" class="__aceline-messages"></div>
      <div class="__aceline-input-bar">
        <button id="__aceline-mic" class="__aceline-mic-btn">🎤</button>
        <input id="__aceline-input" type="text" placeholder="Ask Aceline..." />
        <button id="__aceline-send" class="__aceline-send-btn">➤</button>
      </div>
    `;
    document.body.appendChild(overlay);

    // Wire events
    document.getElementById("__aceline-close").addEventListener("click", () => hideOverlay());
    document.getElementById("__aceline-personality").addEventListener("click", () => {
      state.personality = state.personality === "aceline" ? "jarvis" : "aceline";
      const nameEl = document.getElementById("__aceline-name");
      nameEl.textContent = state.personality === "jarvis" ? "🤖 Jarvis" : "✨ Aceline";
      addMessage("ai", state.personality === "jarvis" ? "Jarvis mode. Speak to me." : "Aceline mode. How can I help?");
    });
    document.getElementById("__aceline-voice").addEventListener("click", () => {
      state.voiceEnabled = !state.voiceEnabled;
    });
    document.getElementById("__aceline-mic").addEventListener("click", () => {
      if (state.listening) stopListening(); else startListening();
    });
    document.getElementById("__aceline-send").addEventListener("click", sendMsg);
    document.getElementById("__aceline-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMsg();
    });

    addMessage("ai", `Aceline is here on ${location.hostname}. I can read this page, click buttons, fill forms, and help you navigate. What do you need?`);
  }

  function hideOverlay() {
    const overlay = document.getElementById("__aceline-overlay");
    if (overlay) overlay.style.display = "none";
    overlayVisible = false;
  }

  function updateOverlay() {
    const micBtn = document.getElementById("__aceline-mic");
    if (micBtn) {
      micBtn.classList.toggle("listening", state.listening);
    }
  }

  function addMessage(role, text) {
    state.messages.push({ role, text });
    const container = document.getElementById("__aceline-messages");
    if (!container) return;
    const msg = document.createElement("div");
    msg.className = `__aceline-msg __aceline-msg-${role}`;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  async function sendMsg() {
    const input = document.getElementById("__aceline-input");
    const text = input.value.trim();
    if (!text || state.thinking) return;
    input.value = "";
    addMessage("user", text);
    state.thinking = true;

    // Show thinking indicator
    const container = document.getElementById("__aceline-messages");
    const thinking = document.createElement("div");
    thinking.id = "__aceline-thinking";
    thinking.className = "__aceline-thinking";
    thinking.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(thinking);

    try {
      const resp = await acelineChat(text);
      document.getElementById("__aceline-thinking")?.remove();
      addMessage("ai", resp);
      speak(resp);

      // Parse DOM actions from response
      const actionMatch = resp.match(/CLICK:\s*(.+)/i);
      if (actionMatch && consent.features.customActions) {
        const selector = actionMatch[1].trim();
        executeDomAction({ type: "click", selector });
      }
    } catch (e) {
      document.getElementById("__aceline-thinking")?.remove();
      addMessage("ai", `Error: ${e.message}`);
    } finally {
      state.thinking = false;
    }
  }

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "toggle") {
      overlayVisible = !overlayVisible;
      if (overlayVisible) showOverlay(); else hideOverlay();
    }
    if (msg.type === "get-page-api") {
      sendResponse(buildPageApi());
    }
  });

  // Inject after page loads
  if (document.readyState === "complete") {
    injectUI();
  } else {
    window.addEventListener("load", injectUI);
  }
})();
