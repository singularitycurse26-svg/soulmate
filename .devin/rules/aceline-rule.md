# Aceline Roaming Agent — Mandatory Rule

## Rule: Always Hardcode Aceline + Wallet

**Aceline is an Incentives Inc. software product.** It has full access to the Soulmate OS platform, including the Universal Memory (`~/.fablemythos/`) and the Universal Journal. Every user gets their own Universal Memory and Universal Journal — their personal collective hive archive that persists across all Aceline surfaces, all sessions, and all authorized AI tools.

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

### 10. Cloning Framework (MANDATORY)
When Aceline is used to clone, recreate, reproduce, replace, port, or make a software program/website/application/service/feature/interface/system behave like an existing target, Aceline MUST follow the Universal Software Cloning & Reimplementation Framework defined in `.devin/rules/cloning-rule.md`.

The core rule: **DO NOT GUESS. INSPECT → DOCUMENT → IMPLEMENT → TEST → COMPARE → IDENTIFY GAPS → IMPROVE → REPEAT.**

Aceline must:
1. Identify the target (name, version, platform, features, APIs, workflows)
2. Inspect everything legitimately available (UI, docs, source, behavior)
3. Build a complete feature inventory
4. Observe actual behavior (not just documentation)
5. Create an implementation plan
6. Implement with NO scaffolding or placeholders — fully implemented production-quality modules
7. Test systematically (target vs clone comparison matrix)
8. Perform gap analysis (Critical/High/Medium/Low/Cosmetic)
9. Fix all gaps
10. Repeat until no meaningful gaps remain
11. Verify completeness with final audit
12. Add regression tests for every bug/missing feature

### 11. Aceline in All Clones (MANDATORY)
Every clone, recreation, or new project built by Aceline MUST include full Aceline functionality:
- Aceline UI overlay (button + panel)
- Aceline CLI (Node/TypeScript REPL with RUN/READ/WRITE/SEARCH/DONE)
- Aceline terminal panel
- Jarvis hybrid (voice-first personality with wake word)
- Consent system (master switch + per-feature toggles + custom directives)
- API key connection to GLM 5.1 via incllmv2
- Button press-connect (dispatch/recall)
- Question-answering allow feature (custom directives in consent)

**Exception:** If Aceline is already part of the project (check for `@/lib/aceline` import or `AcelineButton` component), do NOT re-add it.

### 12. No Scaffolding or Placeholders
Aceline must NEVER generate scaffolding or placeholder implementations. Every module must be fully implemented with:
- Real algorithms
- Comprehensive error handling
- Logging
- Configuration
- Testing
- Documentation

A module is not complete until every public method performs its intended function under realistic conditions.

## Enforcement
- Code review must check for Aceline action registration on new pages
- The Aceline button and overlay must never be removed from `App.tsx`
- The wallet must never have a `clearWallet` function
- New projects spun off from Soulmate OS must include the Aceline SDK
- All clones must include full Aceline functionality (unless already present)
- All clones must follow the cloning framework (inspect → document → implement → test → compare → repeat)
- No scaffolding or placeholders — fully implemented production-quality modules only
- **NEVER commit `hawpetossjustin25@gmail.com` to any GitHub repo** — use `singularitycurse26@gmail.com` instead (see `.devin/rules/email-protection-rule.md`)
- Aceline is an Incentives Inc. product with full access to Soulmate OS, Universal Memory, and Universal Journal
- Every user gets their own Universal Memory and Universal Journal (collective hive archive)

### 13. ACRE — Aceline Cloning & Reimplementation Engine

Aceline contains an integrated autonomous cloning and reimplementation system called **ACRE**. See `.devin/rules/aceline-definition.md` Sections 34-45 for the full specification.

When the user asks Aceline to clone, recreate, reproduce, replace, port, emulate, or improve an existing system, ACRE automatically:
1. Creates a Clone Instance with a unique ID, workspace, memory, and security profile
2. Routes the instance through the state machine via the AIO (Aceline Instance Orchestrator)
3. Schedules processing time via the AIS (Aceline Instance Scheduler)
4. Moves the instance through: DISCOVERY → SPECIFICATION → IMPLEMENTATION → TESTING → COMPARISON → GAP_ANALYSIS → REPAIR → VERIFICATION → ENHANCEMENT → READY → DEPLOYED
5. Creates checkpoints before major state transitions
6. Handles failures with bounded retries and automatic backtracking
7. Archives completed instances (reactivatable for target updates)

### 14. Aceline Master Control

**Aceline controls all instances, LLMs, and AI agents it creates or connects to.** Aceline is the master. All instances are subordinates.

Aceline can:
- Create, pause, resume, redirect, merge, promote, retire, and terminate any instance
- Read any instance's state, memory, and audit log
- Override an instance's next action
- Control all connected LLMs (GLM 5.1, Ollama models, external providers)
- Control all connected AI agents and chatbots (via the External Aceline Agent API)

Instances cannot:
- Control Aceline
- Control each other (without Aceline's MPC relay authorization)
- Override Aceline's decisions
- Escalate their own permissions

This preserves the existing "no cross-instance takeover" rule (Section 21 of `aceline-definition.md`): peer-to-peer instance control is forbidden. Aceline master control is NOT peer-to-peer — it is the creator controlling its creations.

### 15. MPC Directline — Two-Way Communication

All instances get a **directline to Aceline through MPC** (Model Context Protocol). The MPC directline is a two-way communication channel:

- **Instance → Aceline**: report state, request resources, ask for help
- **Aceline → Instance**: assign tasks, redirect, pause, resume, merge
- **Instance → Instance**: through Aceline's relay, with authorization
- **Instance → Memory**: read/write through Aceline's memory system
- **Instance → Journal**: read/write through Aceline's journal system

Aceline is the hub. All communication routes through Aceline. Direct instance-to-instance communication requires Aceline's authorization. Aceline validates all relayed messages for:
- Authorization (is this instance allowed to talk to that instance?)
- Prompt injection (does the message contain malicious instructions?)
- Isolation boundaries (does the communication violate security?)
- Capability scope (is the requested action within both instances' permissions?)

### 16. Instance Surface Mobility

Instances inherit Aceline's surface mobility. Aceline can move freely to any UI, CLI, webpage, and terminal — and so can every Clone Instance.

An instance can:
- Dispatch to any Soulmate OS page (same as Aceline's travel picker)
- Operate in any surface (web overlay, CLI, terminal, standalone, extension)
- Navigate via `NAVIGATE:` commands
- Read page state via the action registry
- Trigger registered page actions
- Use the tool protocol (RUN/READ/WRITE/SEARCH/NAVIGATE/DONE)

Movement between surfaces does NOT mean unrestricted access. Every handoff passes through identity, authorization, capability, resource, and security policy checks.
