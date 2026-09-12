# Aceline Roaming Agent — Mandatory Rule

## Rule: Always Hardcode Aceline + Wallet

From now on, every new page, component, or project built in Soulmate OS MUST include:

### 1. Aceline Action Registration
Every page must register its capabilities with the Aceline action registry so the roaming agent can read state and trigger actions:

```typescript
import { useAcelineActions } from "@/lib/acelineActions";

export function MyNewPage() {
  useAcelineActions("my-page", [
    {
      id: "read-status",
      label: "Read status",
      description: "Read current page state",
      category: "read",
      readState: () => ({ /* page state */ }),
      execute: async () => ({ /* result */ }),
    },
    // ... more actions
  ]);
  // ... page content
}
```

### 2. Aceline Button
The Aceline button is rendered globally in `App.tsx` — it is always available on every page. Never remove it. Never make it conditional. Never hide it behind a feature flag.

### 3. Incentives Wallet
The Incentives wallet is hardcoded — it is always present and cannot be removed:
- `clearWallet` has been removed from the store
- Wallet auto-creates on app load via `initWalletAuto()`
- Every user always has a wallet address
- The wallet page is always accessible from navigation

### 4. Aceline Overlay
The Aceline floating overlay is rendered globally in `App.tsx`. It is draggable, resizable, and appears on top of any page. Aceline can:
- Read the current page's state via registered actions
- Trigger registered actions
- Navigate to any Soulmate OS page
- Chat via GLM 5.1 (incllmv2 backend)
- Use voice (speech synthesis + recognition)
- Build an auto-API summary when visiting a page

### 5. Cmd+K Shortcut
`Cmd+K` / `Ctrl+K` toggles the Aceline overlay. This shortcut is hardcoded in `App.tsx`.

### 6. Runtime Consent
Every Aceline surface (web overlay, CLI, standalone page, browser extension) must show a consent popup on first use:
- Master allow/deny switch
- Per-feature toggles (voice, wallet, GLM backend, terminal, file access, auto-API, browser extension, custom actions)
- "Remember my choice" option
- Free-text custom directives field ("Tell Aceline to do something")
- Stored at `localStorage` (web) or `~/.aceline/consent.json` (CLI) or `chrome.storage.local` (extension)

### 7. Jarvis Hybrid
Aceline has two personalities sharing the same brain, memory, and GLM backend:
- **Aceline** — text-first roaming agent (default)
- **Jarvis** — voice-first assistant (uses `useJarvis.ts` voice settings)
Both can be toggled in the overlay header. Voice commands route through the same `acelineChat` pipeline.

### 8. Four Surfaces
Aceline exists as 4 surfaces, all sharing the same GLM 5.1 backend and tool protocol:
1. **Web UI overlay** — floating panel in Soulmate OS (`AcelineOverlay.tsx`)
2. **CLI REPL** — `aceline-cli/` directory, Node/TypeScript, `RUN/READ/WRITE/SEARCH/DONE` protocol
3. **Standalone webpage** — `frontend/public/aceline/index.html`, hostable anywhere
4. **In-app terminal** — terminal tab inside the overlay (`AcelineTerminal.tsx`)
5. **Browser extension** — `aceline-extension/`, Manifest V3, injects onto external sites

### 9. Terminal Panel
The Aceline overlay includes a terminal tab that routes commands through the Hermes backend (`/v1/hermes/terminal`). Aceline can push `RUN:` commands from chat responses to the terminal. Terminal access is gated by consent.

## Enforcement
- Code review must check for Aceline action registration on new pages
- The Aceline button and overlay must never be removed from `App.tsx`
- The wallet must never have a `clearWallet` function
- New projects spun off from Soulmate OS must include the Aceline SDK
