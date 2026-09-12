# Aceline — Standalone Webpage

Full-page Aceline chat with no Soulmate OS chrome. Hostable on any static host.

## URL

- Production: https://soulmate-os-app.netlify.app/aceline/
- Local: http://localhost:5173/aceline/ (during dev)

## Features

- Full-page Aceline chat interface
- Same consent system as the web overlay (master switch, per-feature toggles, remember, custom directives)
- Aceline / Jarvis personality toggle
- Voice support (Web Speech API STT + TTS)
- PWA-installable (add to home screen)
- Connects to GLM 5.1 via incllmv2 (localhost:8547 in dev, same origin in production)
- Offline mode fallback when backend is unavailable

## Files

| File | Purpose |
|------|---------|
| `index.html` | Standalone Aceline page (self-contained, no build step) |

## How It Works

The page is a single self-contained HTML file with inline CSS and JavaScript. It:
1. Shows a consent modal on first visit (stored in `localStorage`)
2. Connects to the GLM 5.1 backend via incllmv2
3. Falls back to offline mode if the backend is unavailable
4. Supports voice input (STT) and voice output (TTS)
5. Persists personality, voice, and memory settings in `localStorage`

## Embedding

To embed Aceline in another page:

```html
<iframe src="https://soulmate-os-app.netlify.app/aceline/" width="400" height="600"></iframe>
```

## Customization

Edit `index.html` directly. The CSS variables at the top control the theme:

```css
:root {
  --bg: #0a0a0f;
  --bg-card: #1a1a2e;
  --bg-alt: #252540;
  --accent: #E91E63;
  --text: #ffffff;
  --muted: #8888aa;
}
```
