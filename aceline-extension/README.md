# Aceline Browser Extension

Manifest V3 Chrome extension that injects Aceline onto any website. Reads page DOM, builds a page-API summary, and lets you control the page via voice or text.

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `aceline-extension/` folder
5. The Aceline icon appears in your toolbar

## Usage

1. Visit any website
2. Click the Aceline icon in the toolbar, or click the floating ✨ button (bottom-right)
3. The Aceline overlay appears with a chat interface
4. First visit shows a per-domain consent modal:
   - Voice / Jarvis
   - DOM Actions (click, fill, read)
   - GLM 5.1 Backend
   - Auto-API Building
   - Custom directives (optional)
5. Chat with Aceline — it can:
   - Read the page (headings, forms, buttons, text)
   - Click buttons by selector
   - Fill form fields
   - Read element text content
   - Navigate to URLs
   - Speak responses via TTS
   - Listen to voice commands via STT

## Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 config (permissions, content scripts, background) |
| `content.js` | Content script — injects Aceline UI, reads DOM, executes actions |
| `content.css` | Styles for the floating button, overlay, consent modal |
| `background.js` | Service worker — handles icon clicks, message routing |
| `popup.html` | Toolbar popup — backend status, toggle, reset consent |
| `icon.png` | Extension icon (128x128) |

## Permissions

- `storage` — store consent per domain
- `activeTab` — access the active tab's DOM
- `scripting` — inject content scripts
- `<all_urls>` — run on any website

## Backend

For full GLM 5.1 capabilities, run [incllmv2](https://github.com/singularitycurse26-svg/incllmv2) at `localhost:8547`. Without it, Aceline runs in offline mode (can still read pages and execute DOM actions, but no AI reasoning).

## Consent

Per-domain consent stored in `chrome.storage.local`. Reset from the popup (click extension icon → "Reset Consent").

## Limitations

Browser extensions cannot:
- Execute arbitrary OS terminal commands (use the CLI or web overlay for that)
- Access the filesystem directly (use the CLI for file operations)
- Run on `chrome://` pages or the Chrome Web Store

For full filesystem and terminal access, use the [Aceline CLI](../aceline-cli/README.md) or the [web overlay](https://soulmate-os-app.netlify.app).
