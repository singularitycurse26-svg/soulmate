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

## Enforcement
- Code review must check for Aceline action registration on new pages
- The Aceline button and overlay must never be removed from `App.tsx`
- The wallet must never have a `clearWallet` function
- New projects spun off from Soulmate OS must include the Aceline SDK
