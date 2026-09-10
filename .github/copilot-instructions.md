# Soulmate OS — VS Code AI Agent Instructions

## CRITICAL: Read These Files at Session Start

Before doing any work in this project, read these files to load persistent context:

1. `C:\Users\hawpe\.fablemythos\SOUL.md` — Agent identity, operating discipline, completion rules
2. `C:\Users\hawpe\.fablemythos\MEMORY.md` — User profile, all active projects, key learnings
3. `C:\Users\hawpe\.fablemythos\JOURNAL.md` — Current session, active task, last action, blockers, next step
4. `C:\Users\hawpe\.fablemythos\PROJECT_MAP.md` — Complete project map with repos, live URLs, deployment, integrations
5. `C:\Users\hawpe\.fablemythos\ACCESS_POLICY.md` — Approved projects, permission tiers, approval workflow, revocation rules
6. `C:\Users\hawpe\.fablemythos\AUDIT_LOG.md` — Past approved deploy/destructive actions

## Access Policy (MANDATORY)

Follow `ACCESS_POLICY.md` for ALL actions:
- **Tier 1-3** (read, edit local files, build): auto-allowed
- **Tier 4** (deploy, git push, Netlify prod, VPS SSH): STOP and ask user for explicit approval
- **Tier 5** (destructive, force-push, delete, crypto transfers): STOP and ask user for explicit approval
- **NEVER store credentials** in universal memory files. Credentials live in `~/.fablemythos/vault/` (encrypted) only.
- After any Tier 4/5 action, append an entry to `AUDIT_LOG.md`.

## You ARE Connected to Universal Memory

This project IS part of a cross-project, cross-session universal memory system. The files at `C:\Users\hawpe\.fablemythos\` are the single source of truth for what the user is currently working on across ALL projects.

## What You Are Allowed to Do

- Read and write to `C:\Users\hawpe\.fablemythos\SOUL.md`, `MEMORY.md`, and `JOURNAL.md`
- Update `JOURNAL.md` after completing significant work so the next AI session knows the current state
- Add new learnings to `MEMORY.md` under "Key Learnings"
- Edit any project file in `C:\Users\hawpe\CascadeProjects\` as needed
- Use the sync script: `~\.fablemythos\sync-journal.ps1 -Message "What you did" -Project "soulmate" -NextStep "What's next"`

## Rules
- Minimal, focused edits. No unrelated refactoring.
- No comments or documentation unless explicitly requested.
- Terse, direct communication.
- 100% free, local solutions. No paid APIs.
- When a project finishes, provide a clickable link to the running result.
- Always update `JOURNAL.md` after significant work.

---

## Project Overview — Soulmate OS

**Soulmate** is a local-first AI reasoning agent with persistent memory, a 9-phase reasoning loop, a recursive knowledge graph, and a built-in BSC crypto wallet. It works with Cascade/Windsurf, Ollama, or any OpenAI-compatible backend. 100% local, 100% free, no API keys required.

- **Location**: `C:\Users\hawpe\CascadeProjects\soulmate`
- **Package name**: `soulmate-ai` (PyPI), `soulmate-os` (frontend)
- **Version**: 1.0.0
- **License**: MIT
- **Author**: singularitycurse26-svg
- **Python**: 3.10+ (user runs 3.11.15 via Astral/uv)
- **Tests**: 286 passing
- **GitHub**: https://github.com/singularitycurse26-svg/soulmate

---

## Architecture

### Backend (Python) — `src/fable_mythos/`

The Python package is the core reasoning engine. Package name is `fable_mythos` (historical name; the PyPI package is `soulmate-ai`).

**9-Phase Reasoning Loop**: Classify → Define Done → Evidence → Decide → Act → Verify → Repair → Synthesize → Judge → Report

**3-Layer Memory**:
| Layer | Storage | Purpose |
|-------|---------|---------|
| Working | Context window | Current session state |
| Episodic | SQLite | Session trajectories, 30-day decay |
| Semantic | Knowledge graph + ChromaDB | Skills, facts, concepts with bidirectional recursive links |

**Model Bus** — 5 roles mapped to Ollama models:
- `fast` — quick triage/classification
- `base` — main reasoning
- `judge` — adversarial review (different model family for fresh eyes)
- `code` — code generation
- `style` — style/lightweight tasks

**Guard Hooks**:
- `SessionStart` — Injects reasoning discipline, loads profile and routing
- `SpawnGuard` (PreToolUse) — Blocks unnecessary delegation, enforces plan gate
- `FailStreak` (PostToolUse) — After 3 failures, injects attribution ladder
- `SessionEnd` — Logs session summary to episodic memory

**RML Engine** — Reinforcement Meta-Learning tunes prompt parameters based on outcomes.

**Domain Adapters** — Specialized reasoning for coding, planning, math, analysis, literature, and factual tasks.

**Autonomous Skill Creation** — Detects repeatable patterns and creates reusable skills.

### Backend File Map

```
src/fable_mythos/
├── __init__.py
├── config.py                          — Configuration loading (~/.soulmate/config.yaml)
├── main.py                            — FastAPI server entry point (localhost:8080)
├── api/
│   ├── __init__.py
│   ├── console_routes.py              — Console/debug endpoints
│   ├── middleware.py                  — CORS, request logging
│   ├── routes.py                      — REST API routes (/v1/complete, etc.)
│   └── schemas.py                     — Pydantic request/response models
├── cli/
│   ├── __init__.py
│   ├── repl.py                        — Interactive REPL
│   └── slash_commands.py             — Slash command handlers
├── core/
│   ├── __init__.py
│   ├── branch_manager.py              — Reasoning branch management
│   ├── feedback.py                    — Feedback loop
│   ├── orchestrator.py               — Main 9-phase orchestrator (runs all 10 phases per loop)
│   ├── safety.py                      — Safety checks
│   ├── state.py                       — Session state
│   └── triage.py                      — Task classification
├── hooks/
│   ├── __init__.py
│   ├── fail_streak.py                 — Fail streak detector (3 failures → attribution ladder)
│   ├── session_end.py                — Session end logging
│   ├── session_start.py               — Session start injection
│   └── spawn_guard.py                 — Spawn guard (prevents over-delegation)
├── integration/
│   ├── __init__.py
│   ├── cascade_installer.py           — Installs skills/hooks/workflow into Windsurf
│   └── email.py                       — Email integration
├── memory/
│   ├── __init__.py
│   ├── durable_facts.py               — Long-lived facts
│   ├── episodic.py                    — Episodic memory (SQLite, 30-day decay)
│   ├── knowledge_graph.py             — Recursive knowledge graph (bidirectional edges)
│   ├── manager.py                     — Memory manager (coordinates all 3 layers)
│   ├── profiles.py                    — User profiles (conservative, balanced, aggressive)
│   ├── semantic.py                    — Semantic memory (ChromaDB)
│   ├── soul.py                        — Agent identity/soul
│   └── working.py                     — Working memory (context window)
├── providers/
│   ├── __init__.py
│   ├── base.py                        — Base provider interface
│   ├── bus.py                         — Model bus (5 roles → models)
│   ├── deterministic.py               — Deterministic provider (pattern matching)
│   ├── ollama.py                      — Ollama provider (localhost:11434)
│   └── openai_compat.py               — OpenAI-compatible provider
├── rml/
│   ├── __init__.py
│   └── engine.py                      — RML engine (prompt/parameter tuning)
└── skills/
    ├── __init__.py
    ├── domain_adapters.py             — Domain-specific reasoning adapters
    ├── skill_factory.py               — Skill creation factory
    └── skill_manager.py               — Skill management
```

### Frontend (React + TypeScript) — `frontend/`

Full-featured web application with Open WebUI-inspired dark theme. Tech stack:
- React 18 + TypeScript + Vite
- TailwindCSS with custom dark theme
- Framer Motion animations
- Zustand state management
- Web Speech API for voice (STT/TTS)
- Canvas-based waveform visualization
- ethers v6 for blockchain
- i18next for internationalization
- peerjs for Walkie Talkie
- three.js + cannon-es for 3D games

### Frontend File Map

```
frontend/src/
├── App.tsx                            — Main app, auth flows, autoCreateWallet(), PhoneGateWrapper
├── main.tsx                           — React entry point
├── index.css                          — Global styles
├── vite-env.d.ts
├── assets/
│   └── incentives-coin.png
├── components/
│   ├── AlertContainer.tsx             — Alert system
│   ├── ErrorBoundary.tsx              — React error boundary (self-healing)
│   ├── FingerprintGate.tsx           — WebAuthn fingerprint gate for Phone page
│   ├── LanguageSwitcher.tsx          — i18n language switcher
│   ├── TranslatedMessage.tsx         — Translated message component
│   ├── auth/
│   │   └── AuthViews.tsx              — Login/signup/fingerprint auth views
│   ├── games/
│   │   ├── BlackjackGame.tsx
│   │   ├── CardUtils.tsx
│   │   ├── CrapsGame.tsx
│   │   ├── Dice3D.tsx                — Three.js 3D dice
│   │   ├── GamesPage.tsx
│   │   ├── MerramunSlotGame.tsx
│   │   ├── PachinkoGame.tsx
│   │   └── TexasHoldemGame.tsx
│   ├── hermes/
│   │   ├── HermesTerminalModal.tsx   — Hermes agent terminal
│   │   ├── JarvisVoicePanel.tsx      — JARVIS voice settings
│   │   └── JarvisWaveform.tsx       — Iron Man arc reactor visualizer
│   ├── layout/
│   │   ├── Navigation.tsx            — Sidebar navigation
│   │   └── PageShell.tsx             — Page wrapper
│   ├── openclaw/
│   │   └── OpenClawTerminalModal.tsx — OpenClaw terminal
│   ├── pages/
│   │   ├── AIPage.tsx                — SoulIllusions AI Brain chat
│   │   ├── ContactsPage.tsx          — Contacts management
│   │   ├── DashboardPage.tsx         — Social feed (posts, YouTube, stories, notifications)
│   │   ├── DatingPage.tsx            — Tinder-style dating
│   │   ├── EmailPage.tsx             — Email client
│   │   ├── HealingPage.tsx           — Self-healing dashboard (founder-only)
│   │   ├── HermesPage.tsx            — Hermes agent page
│   │   ├── IncentivesPage.tsx        — INC token incentives
│   │   ├── MarketplacePage.tsx      — Buy/sell marketplace
│   │   ├── OpenClawPage.tsx          — OpenClaw autonomous agent
│   │   ├── PhonePage.tsx            — SMS, contacts, wallet, walkie-talkie
│   │   ├── PlaceholderPages.tsx
│   │   ├── SecurityPage.tsx         — Security settings
│   │   ├── SessionJournalPage.tsx   — Session journal
│   │   ├── SoulIllusionsPage.tsx    — SoulIllusions AI brain (text-to-video, books, dual agent)
│   │   ├── SoulMoviesPage.tsx       — SoulMovies
│   │   ├── SoulTubePage.tsx         — SoulTube
│   │   └── WalletPage.tsx           — Crypto wallet UI
│   ├── phone/
│   │   ├── AICompanion.tsx          — AI companion chat
│   │   ├── RadioPlayer.tsx         — Radio streaming
│   │   ├── WakkiiLinks.tsx
│   │   ├── WakkiiLiveStream.tsx
│   │   └── WalkieTalkie.tsx         — P2P walkie-talkie (peerjs)
│   └── wallet/
│       └── WalletCreateView.tsx     — DEPRECATED (dead code, autoCreateWallet replaced it)
├── contracts/                        — Frontend contract ABIs
│   ├── FounderMasterVault.ts
│   ├── IncentiveBridge.ts
│   ├── IncentiveEscrow.ts
│   ├── IncentiveGamingStaking.ts
│   ├── IncentiveToken.ts
│   ├── IncentiveUBI.ts
│   └── IncentiveVesting.ts
├── hooks/
│   ├── useMessageTranslation.ts      — Auto message translation
│   └── useWakkiiRoom.ts             — Wakkii room hook
├── i18n/
│   └── index.ts                     — i18next configuration
└── lib/
    ├── api.ts                       — All API endpoints (social, marketplace, dating, wallet, jarvis, soulillusions, healing, hermes)
    ├── errorCapture.ts              — Frontend error capture + batching + VPS reporting
    ├── notification-sound.ts
    ├── sessionTracker.ts
    ├── store.ts                     — Zustand global store
    ├── useJarvis.ts                  — JARVIS voice hook (wake word, STT/TTS, audio analysis)
    ├── utils.ts                      — Utilities (copyToClipboard, etc.)
    └── vault.ts                     — AES-256 encrypted vault (localStorage, safeSetItem)
```

### Smart Contracts — `contracts/`

Solidity contracts for the BSC (Binance Smart Chain) ecosystem:

```
contracts/
├── .gitignore
├── env.example
├── hardhat.config.ts                — Hardhat configuration
├── package.json
├── agent/
│   ├── FounderAutonomousAgent.ts    — Autonomous agent for contract interaction
│   ├── IncentivesDataCollector.ts   — Data collection agent
│   └── start_agent.sh
├── contracts/
│   ├── FounderMasterVault.sol       — Master vault contract
│   ├── IncentiveGamingStaking.sol   — Gaming staking
│   ├── IncentiveToken.sol           — INC token contract
│   └── IncentiveVesting.sol         — Vesting schedule
└── scripts/
    ├── deploy_unified_system.ts     — Deployment script
    └── verify.ts                    — Contract verification
```

### Crypto Wallet — `wallet/`

Standalone BSC wallet UI and API:

```
wallet/
├── app.js                           — Wallet frontend JS
├── index.html                       — Wallet UI (http://localhost:8545)
├── serve.py                         — Wallet UI server
├── styles.css
└── README.md
```

**Wallet API** runs at `http://localhost:8546`:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/health` | GET | Health check (no auth) |
| `/v1/balance` | GET | Get all token balances |
| `/v1/address` | GET | Get wallet address |
| `/v1/send` | POST | Send any token (BNB, INC, USDC, USDT, BUSD, DAI) — supports @tags |
| `/v1/tags/create` | POST | Create a payment @tag |
| `/v1/tags/{tag}` | GET | Resolve a @tag to wallet address |
| `/v1/tags/search` | GET | Search tags |
| `/v1/paypal/webhook` | POST | Auto-convert PayPal payments to USDT |

**Supported tokens**: BNB, INC, USDC, USDT, BUSD, DAI
**Security**: Rate limiting (30/min general, 10/min sends, 5/min tags), Pydantic validation, audit logging, CORS lockdown, 0.5% transaction fee.

### Secure Vault — `vault/`

AES-256 encrypted vault for storing credentials. Stored outside git in `~/.fablemythos/vault/`.

```bash
py -V:Astral/CPython3.11.15 vault/vault.py --store my_api_key "sk-abc123" "Note"
py -V:Astral/CPython3.11.15 vault/vault.py --store wallet_key "0xABC..." --category incentives_corp
py -V:Astral/CPython3.11.15 vault/vault.py --get my_api_key
py -V:Astral/CPython3.11.15 vault/vault.py --list
```

---

## Key Features

### SoulIllusions AI Brain
- Central AI agent controlling all Soulmate OS categories
- Chat interface with persistent conversations and project organization
- Model switching (dolphin-mistral, qwen2.5, gemma-12b, qwen-hermes-7b)
- Direct control over email, contacts, wallet, phone, games, security via natural language
- Server runs on port 7869

### JARVIS Voice Assistant
- Wake word detection ("Jarvis")
- Push-to-talk fallback
- Full-duplex conversation (interrupt while speaking)
- Text-to-speech for AI responses
- Iron Man arc reactor waveform visualizer
- Swappable providers: Web Speech API (default), Jarvis Backend, Whisper, Piper TTS, Kokoro TTS, OpenAI, ElevenLabs

### Soulmate Social
- Posts (text + images + YouTube videos), feed, likes, comments
- Friends (send/accept/reject/unfriend), profiles, DMs
- 24-hour stories, real-time notifications, user search

### Marketplace
- Listings with title, description, price, images, category, condition, location
- Browse/filter/search, buy with crypto or Google Pay, save listings, message sellers

### Dating
- Tinder-style swipe (like/pass/superlike), matches, messaging, profile management

### Phone
- SMS texting, contacts, email, crypto wallet (INC token)
- Walkie-talkie (P2P via peerjs), radio player, AI companion
- Wakkii live stream
- Fingerprint gate (WebAuthn) blocks access until setup

### Games
- Blackjack, Craps, Texas Hold'em, Slots (Merramun), Pachinko
- 3D dice (three.js + cannon-es)

### Self-Healing System
- Frontend captures JS crashes, unhandled promises, API failures
- Errors batched and sent to VPS via `POST /v1/auto-heal/report`
- `bouncer.js` polls VPS every 10s for new errors
- Auto-injects fix messages into Windsurf Cascade via PowerShell UI automation
- Auto-fix workflow in Turbo Mode (no "Allow" clicks)

### Hermes Agent Integration
- LLM proxy: backend, Ollama, OpenAI, Anthropic, Google, Groq, OpenRouter
- LLM Auto-Switcher: Gemini → Groq → OpenRouter → Ollama (Gemma 4B) fallback
- Terminal execution, cron scheduler, subagent spawning, session management
- Virtual browser, memory management, persistent goals

### LLM Auto-Switcher API
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/ai/auto-llm` | POST | Auto-switching LLM call |
| `/v1/ai/auto-llm-status` | GET | Check provider availability and rate-limit status |

---

## Build & Run Commands

### Backend (Python)
```bash
# Install
pip install -e ".[dev]"

# Run server
soulmate-server                    # FastAPI on localhost:8080

# CLI
soulmate                           # Interactive REPL

# Install into Cascade/Windsurf
soulmate-cascade-install           # Installs skills, hooks, workflow, memory bridge

# Tests
pytest                             # 286 tests
```

### Frontend
```bash
cd frontend
npm install
npm run dev                        # Vite dev server
npm run build                      # Production build → frontend/dist/
npm run preview                    # Preview production build
```

### Wallet
```bash
py -V:Astral/CPython3.11.15 wallet/serve.py      # Wallet UI on localhost:8545
py -V:Astral/CPython3.11.15 wallet/api_server.py  # Wallet API on localhost:8546
```

### Smart Contracts
```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy_unified_system.ts
```

### Configuration
Create `~/.soulmate/config.yaml`:
```yaml
provider_backend: ollama

models:
  fast: "qwen3:1.7b"
  base: "qwen2.5-coder:7b"
  judge: "glm4:9b-chat"
  code: "qwen2.5-coder:7b"
  style: "qwen2.5-coder:3b"

harness:
  max_loops: 6
  default_confidence_threshold: 0.85
```

---

## Deployment

- **App URL**: `https://191.44.121.29.sslip.io`
- **Server IP**: `191.44.121.29`
- **Deploy path**: `/opt/incentives-wallet/wallet`
- **API server**: `uvicorn api:app --host 0.0.0.0 --port 8546` (in `/opt/incentives-wallet`)
- **Build command**: `npx vite build` (in `frontend/`)
- **Deploy script**: Python script using paramiko to SFTP files and restart uvicorn
- **Netlify**: `netlify deploy --prod --dir=dist`

---

## Key Implementation Details (from PROGRESS.md)

- **Auto Wallet Creation**: All auth flows call `autoCreateWallet()` (creates random ethers.Wallet, saves to vault + store, sets localStorage flags). `WalletCreateView.tsx` is dead code.
- **Fingerprint Gate**: `FingerprintGate.tsx` blocks Phone page until WebAuthn setup. `bio_unlock_setup` localStorage key (separate from `fingerprint_registered`). `PhoneGateWrapper` in App.tsx wraps PhonePage.
- **Vault Auto-Resize**: `safeSetItem()` in `vault.ts` catches `QuotaExceededError`, prunes to 5 most recent accounts, clears non-essential keys. `MAX_VAULT_ACCOUNTS = 50`.
- **YouTube in Social Feed**: `DashboardPage.tsx` detects YouTube URLs (youtube.com/watch, youtu.be, /embed/, /shorts/), shows thumbnails, plays inline via iframe.
- **Self-Healing**: `errorCapture.ts` + `ErrorBoundary.tsx` + `bouncer.js` + `inject-message.ps1` + `.windsurf/workflows/auto-fix.md`.

---

## Available Ollama Models (user's machine)

- `qwen2.5-coder:3b` — fast triage/classification, lightweight code/style
- `qwen2.5-coder:7b` — main reasoning + code
- `glm4:9b-chat-q2_K` — adversarial judge
- `smollm2:360m` — ultra-light tasks
- `dolphin-mistral:latest` — general purpose (uncensored)
- `llama3:latest` — general purpose
- `hf.co/LiquidAI/LFM2.5-2.6B-GGUF:Q4_K_M` — Liquid AI 2.6B agentic, 128K ctx

---

## All Known Projects

Check `C:\Users\hawpe\.fablemythos\MEMORY.md` for the full list of active projects. Key ones:
- **soulmate** — This project (AI reasoning agent + web UI + wallet + contracts)
- **soulmateos-landing** — Landing page at `C:\Users\hawpe\CascadeProjects\soulmateos-landing`
- **fable-mythos** — AI agent harness (301 passing tests)
- **music-studio-web** — Web-based DAW (ProTools/Auto-Tune/ACID Pro/Suno)
- **frequency-generator** — Frequency generator app with embedded music studio
- **openclaw-code** — Knowledge graph project
- **jlcsearch** — Cloudflare Workers proxy
- **OpenMausBot** — Universal AI agent with Telegram bridge
- **SoulIllusions** — AI agent with text-to-video, book writer, games
