<div align="center">

# ❤️ Soulmate

### A local-first AI reasoning agent with persistent memory

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests: 286](https://img.shields.io/badge/tests-286%20passing-brightgreen.svg)](#)
[![Ollama](https://img.shields.io/badge/Ollama-compatible-orange.svg)](https://ollama.ai)

<img src="assets/soulmate.jpg" width="200" alt="Soulmate Heart Logo" />

**Soulmate** gives your AI agent a structured mind — a 9-phase reasoning loop, 3-layer persistent memory, a recursive knowledge graph, and guard hooks that prevent grinding. It works with [Cascade/Windsurf](https://windsurf.com), [Ollama](https://ollama.ai), or any OpenAI-compatible backend.

## Phone Home Screen Shortcut

Add Soulmate OS to your phone home screen with one tap:

1. Open the app on your phone
2. Browser will prompt **Add to Home Screen** automatically
3. Or visit `/install` and tap **Add to Home Screen**
4. Soulmate OS icon appears on your home screen
5. Tap it to open like a native app (no browser chrome)

The install page auto-detects Android vs iPhone and shows the right steps.

100% local. 100% free. No API keys required.

### Works With Your AI Stack

Soulmate integrates with the tools and agents you already use:

**AI Coding IDEs:** Cursor · Windsurf · Antigravity · Zed AI · Void IDE · Aide IDE · Trae IDE · Replit AI

**AI Coding Agents:** Claude Code · OpenAI Codex · Cline · Roo Cline · Aider · OpenCode · Gemini CLI · Amp · Continue · Goose AI

**Autonomous Agent Frameworks:** OpenClaw · Hermes Agent · OpenHands · AutoGPT · BabyAGI · SuperAGI · CrewAI · Microsoft AutoGen · LangGraph · MetaGPT · Agent Zero · Devin · OpenDevin

Soulmate's REST API and wallet endpoints work with any agent that can make HTTP requests — your AI can check balances, send crypto, resolve payment tags, and handle PayPal conversions programmatically.

</div>

---

## What Soulmate Does

Most AI coding assistants are stateless — they forget everything between sessions. Soulmate fixes this:

- **Persistent Memory** — Remembers your profile, projects, preferences, and past learnings across sessions
- **9-Phase Reasoning Loop** — Classify, Define Done, Evidence, Decide, Act, Verify, Repair, Synthesize, Judge, Report
- **Recursive Knowledge Graph** — Facts, skills, and concepts linked with bidirectional edges. Multi-hop traversal finds connections that flat memory can't
- **Guard Hooks** — Spawn guard prevents over-delegation, fail streak detector stops grinding after 3 failures
- **Domain Adapters** — Specialized reasoning for coding, planning, math, analysis, literature, and factual tasks
- **RML Engine** — Reinforcement Meta-Learning tunes prompt parameters based on outcomes
- **Autonomous Skill Creation** — Detects repeatable patterns and creates reusable skills

## Quick Start

### Install

```bash
pip install soulmate-ai
```

### Use with Cascade/Windsurf

```bash
soulmate-cascade-install
```

This installs:
- 7 skill files in `~/.windsurf/skills/`
- 4 guard hooks in `~/.windsurf/hooks/`
- A workflow file for `/soulmate` slash command
- Memory bridge files in `~/.soulmate/` (MEMORY.md, SOUL.md)

### Use with Ollama

1. Make sure [Ollama](https://ollama.ai) is running with at least one model
2. Start the server:

```bash
soulmate-server
```

3. Send tasks:

```bash
curl -X POST http://localhost:8080/v1/complete \
  -H "Content-Type: application/json" \
  -d '{"query": "How should I architect a real-time chat system?", "thread_id": "my-project"}'
```

## The 9-Phase Reasoning Loop

| Phase | What It Does |
|-------|-------------|
| **Classify** | Is this trivial, a question, a task, or needs planning? |
| **Define Done** | What does success look like? How will it be verified? |
| **Evidence** | Gather facts from primary sources. Don't guess. |
| **Decide** | Synthesize evidence into ONE recommendation. Name alternatives. |
| **Act** | Make the smallest correct change. State INTENT before editing. |
| **Verify** | Run the check. Don't infer success — observe it. |
| **Repair** | If verification fails, fix the root cause. Don't patch symptoms. |
| **Synthesize** | Combine findings into a coherent answer. |
| **Judge** | Adversarial review. Check for unverified claims. Assign confidence. |
| **Report** | Outcome-first: result, then reasoning, then caveats. |

## 3-Layer Memory

| Layer | Storage | Purpose |
|-------|---------|---------|
| **Working** | Context window | Current session state, sacred zone for critical context |
| **Episodic** | SQLite | Session trajectories with timestamps. Decays over 30 days. |
| **Semantic** | Knowledge graph + ChromaDB | Skills, facts, concepts with bidirectional recursive links |

## Guard Hooks

- **SessionStart** — Injects reasoning discipline, loads profile and routing
- **SpawnGuard** (PreToolUse) — Blocks unnecessary delegation, enforces plan gate
- **FailStreak** (PostToolUse) — After 3 failures, injects attribution ladder: harness, deployment, product
- **SessionEnd** — Logs session summary to episodic memory

## Configuration

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

## Testing

```bash
pip install -e ".[dev]"
pytest
```

286 tests covering all core modules.

## Requirements

- Python 3.10+
- [Ollama](https://ollama.ai) (for local LLM backend) or any OpenAI-compatible API
- Optional: [Cascade/Windsurf](https://windsurf.com) IDE for full integration

## Secure Vault

Soulmate includes an AES-256 encrypted vault for storing sensitive credentials — API keys, wallet private keys, recovery codes, and more. Secrets are stored outside the git repo in `~/.fablemythos/vault/` so they're never pushed to GitHub.

```bash
# Store a secret
py -V:Astral/CPython3.11.15 vault/vault.py --store my_api_key "sk-abc123" "Note"

# Store with a category
py -V:Astral/CPython3.11.15 vault/vault.py --store wallet_key "0xABC..." --category incentives_corp

# Retrieve a secret
py -V:Astral/CPython3.11.15 vault/vault.py --get my_api_key

# List all secrets by category
py -V:Astral/CPython3.11.15 vault/vault.py --list
```

Supports categories/folders for organizing secrets by project. See [vault/README.md](vault/README.md) for full documentation.

## License

MIT — see [LICENSE](LICENSE)

## Author

[singularitycurse26-svg](https://github.com/singularitycurse26-svg)

## Built-in Crypto Wallet

Soulmate comes with a BSC (Binance Smart Chain) crypto wallet for accepting payments and bounties. The wallet integrates with Soulmate's reasoning agent — the AI can check balances, send payments, and handle PayPal conversions via the wallet API.

**Supported tokens:** BNB, INC, USDC, USDT, BUSD, DAI

### Wallet UI

```bash
py -V:Astral/CPython3.11.15 wallet/serve.py
# Open http://localhost:8545
```

Features: create/import wallet, send/receive all tokens, transaction history, balance display with USD values.

### Wallet API

The wallet includes a REST API that Soulmate's AI agent can call programmatically:

```bash
py -V:Astral/CPython3.11.15 wallet/api_server.py
# API runs on http://localhost:8546
```

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

All endpoints (except health and tag lookups) require `X-API-Token` header for authentication.

### Security

The wallet API is hardened with:
- **Rate limiting** — 30 req/min general, 10 req/min for sends, 5 req/min for tag creation
- **Input validation** — Pydantic validators on all request bodies, address/format checking
- **Audit logging** — All transactions, tag creations, and webhook events logged
- **CORS lockdown** — Only allowed origins can make requests
- **0.5% transaction fee** — Every send deducts 0.5% to the wallet owner

### PayPal → Crypto Auto-Conversion

When someone pays you via PayPal and includes their BSC wallet address in the payment note, the API server automatically sends equivalent USDT to their wallet. This enables seamless cash-to-crypto payments for Soulmate services.

### GitHub Bounty Payments

**USDC** is the standard stablecoin for open-source bounties. Your wallet supports it natively — share your wallet address on GitHub bounty posts and your profile to receive payments.

See [wallet/README.md](wallet/README.md) for full documentation.

## Soulmate Web UI

Soulmate includes a full-featured React + TypeScript web application with an Open WebUI-inspired dark theme.

### Features

- **SoulIllusions AI Brain** — The central AI agent that controls all Soulmate OS categories. Chat interface with persistent conversations, project organization, model switching (dolphin-mistral, qwen2.5, gemma-12b, qwen-hermes-7b), and direct control over email, contacts, wallet, phone, games, and security through natural language
- **JARVIS Voice Assistant** — Iron Man-style voice integration with wake word detection, push-to-talk, and animated waveform visualizer
- **Soulmate Social** — Facebook-style social feed with posts, likes, comments, friends, DMs, stories, and notifications
- **Marketplace** — Buy/sell listings with categories, search, saved items, Google Pay integration, and seller messaging
- **Dating** — Tinder-style dating with swipe (like/pass/superlike), matches, messaging, and profile management
- **Phone** — SMS texting, contacts, email, and crypto wallet (INC token) with send/receive/buy functionality
- **Terminal** — Full terminal access to the VPS with tabbed interface for memory, skills, goals, cron, subagents, browser, and more

### Web UI Tech Stack

- React 18 + TypeScript + Vite
- TailwindCSS with custom dark theme
- Framer Motion animations
- Zustand state management
- Web Speech API for voice (STT/TTS)
- Canvas-based waveform visualization

### Build & Deploy

```bash
cd frontend
npm install
npm run build
# Deploy to Netlify
netlify deploy --prod --dir=dist
```

## JARVIS Voice Assistant

Soulmate Web UI includes a JARVIS-like voice assistant layer built on top of the Hermes Agent.

### Voice Features

- **Wake Word Detection** — Say "Jarvis" to activate voice command mode (always-listening)
- **Push-to-Talk** — Press and hold the mic button as a fallback
- **Full-Duplex Conversation** — Interrupt the AI while it's speaking by saying the wake word
- **Text-to-Speech** — AI responses are spoken aloud automatically
- **Iron Man Waveform** — Animated arc reactor visualizer with frequency bars that react to audio
- **Voice Settings** — Configure wake word, STT/TTS providers, voice selection, speech rate, volume, and mute

### Swappable Provider Architecture

The voice system is designed for easy provider swapping without UI changes:

| Provider | STT | TTS | Status |
|----------|-----|-----|--------|
| Web Speech API | ✅ | ✅ | Default (browser-native) |
| isair/Jarvis Backend | ✅ | ✅ | Connect to local Jarvis server |
| Whisper | ✅ | — | Future |
| Piper TTS | — | ✅ | Future |
| Kokoro TTS | — | ✅ | Future |
| OpenAI | ✅ | ✅ | Future |
| ElevenLabs | — | ✅ | Future |

### Jarvis Backend Integration

Connect the [isair/Jarvis](https://github.com/isair/Jarvis) Python project as a dedicated voice processing backend:

1. Start the Jarvis backend server locally
2. Open JARVIS Voice Settings in the Web UI (more menu → JARVIS Voice)
3. Set STT/TTS provider to "Jarvis Backend"
4. Enter the backend URL (e.g., `http://localhost:8765`)

The Hermes Agent remains the core reasoning engine — Jarvis handles voice I/O only.

### Voice Files

| File | Description |
|------|-------------|
| `frontend/src/lib/useJarvis.ts` | Core voice hook (wake word, STT/TTS, audio analysis) |
| `frontend/src/components/hermes/JarvisWaveform.tsx` | Iron Man canvas visualizer |
| `frontend/src/components/hermes/JarvisVoicePanel.tsx` | Settings panel |
| `frontend/src/lib/api.ts` | `jarvisApi` endpoints for backend integration |

## Soulmate Social

A full social network layer with Facebook-style features:

- **Posts** — Create posts with text and images, public/private privacy
- **Feed** — Paginated social feed with posts from all users
- **Interactions** — Like, comment, and delete posts
- **Friends** — Send/accept/reject friend requests, unfriend
- **Profiles** — Bio, avatar, cover photo, user post history
- **Messages** — Direct messages with threaded conversations
- **Stories** — 24-hour disappearing stories
- **Notifications** — Real-time notification system
- **Search** — Search for users by name

### Social API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/social/posts` | POST | Create a post |
| `/v1/social/feed` | GET | Get paginated feed |
| `/v1/social/posts/{id}/like` | POST/DELETE | Like/unlike a post |
| `/v1/social/posts/{id}/comments` | POST/GET | Add/get comments |
| `/v1/social/friends/{id}` | POST/DELETE | Send request/unfriend |
| `/v1/social/friends/{id}/accept` | POST | Accept friend request |
| `/v1/social/profile/{id}` | GET | Get user profile |
| `/v1/social/messages` | GET/POST | Get/send DMs |
| `/v1/social/stories` | POST/GET | Create/get stories |
| `/v1/social/notifications` | GET | Get notifications |

## Marketplace

A Craigslist-style marketplace with crypto payment support:

- **Listings** — Create listings with title, description, price, images, category, condition, and location
- **Browse** — Filter by category, price range, search terms, and sort order
- **Buy** — Purchase listings with crypto or Google Pay
- **Save** — Save listings for later
- **Manage** — View your listings and purchases
- **Message Seller** — Contact sellers directly

### Marketplace API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/marketplace/listings` | POST/GET | Create/browse listings |
| `/v1/marketplace/listings/{id}` | GET/PUT/DELETE | Get/edit/delete listing |
| `/v1/marketplace/listings/{id}/buy` | POST | Buy a listing |
| `/v1/marketplace/listings/{id}/save` | POST | Save a listing |
| `/v1/marketplace/my-listings` | GET | Your listings |
| `/v1/marketplace/my-purchases` | GET | Your purchases |
| `/v1/marketplace/googlepay` | POST | Google Pay checkout |
| `/v1/marketplace/categories` | GET | List categories |

## Dating

A Tinder-style dating feature with swipe mechanics:

- **Profiles** — Create dating profile with bio, interests, age, gender, looking for, photos, and location
- **Swipe** — Like, pass, or superlike suggested profiles
- **Matches** — Mutual likes create matches with messaging
- **Chat** — Send messages to matches
- **Likes You** — See who liked you

### Dating API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/dating/profile` | POST/GET/PUT | Create/get/update profile |
| `/v1/dating/suggestions` | GET | Get suggested profiles |
| `/v1/dating/like/{id}` | POST | Like a profile |
| `/v1/dating/pass/{id}` | POST | Pass on a profile |
| `/v1/dating/superlike/{id}` | POST | Superlike a profile |
| `/v1/dating/matches` | GET | Get your matches |
| `/v1/dating/matches/{id}/messages` | GET/POST | Get/send match messages |
| `/v1/dating/likes-you` | GET | See who liked you |

## SoulIllusions AI Brain

The SoulIllusions Agent is the central AI brain that controls every category in Soulmate OS. Accessible from the sidebar (Brain icon), it provides a full chat interface, autonomous agent control, and configuration — all powered by the [SoulIllusions Agent](https://github.com/singularitycurse26-svg/soulillusions-agent) server running on port 7869.

### Chat Interface

- **Persistent Conversations** — All chats are saved server-side with full message history
- **Project Organization** — Group conversations into projects for context-aware sessions
- **Model Switching** — Switch between dolphin-mistral (uncensored), qwen2.5:7b, gemma-12b, and qwen-hermes-7b at runtime
- **Token Tracking** — Real-time token usage display per message and cumulative
- **Quick Actions** — One-click prompts to check wallet balance, read emails, list contacts, set reminders, browse the web, or check agent status
- **Soulmate OS Integration** — The AI can control email, contacts, wallet, phone, games, and security through natural language commands

### Agent Control

- **Start/Stop** — Launch and halt the autonomous agent loop on demand
- **Goal Setting** — Set autonomous objectives for the agent to work toward
- **Live Status** — Real-time status indicators (running, stopped, idle, offline)
- **Action Counter** — Track total actions taken by the agent
- **Uptime Display** — Monitor how long the agent has been running
- **9-Phase Reasoning Loop** — Visual breakdown of the agent's reasoning pipeline: Classify → Define Done → Evidence → Decide → Act → Verify → Repair → Synthesize → Judge

### Overview Dashboard

- **Active Model** — Current LLM model in use
- **Agent Status** — Running state with color-coded indicators
- **Uptime** — Duration of current agent session
- **Conversation Count** — Total persistent conversations
- **Actions Taken** — Cumulative agent actions
- **Tokens Used** — Total tokens consumed across all chats
- **3-Layer Memory** — Visual display of Working (context window), Episodic (SQLite, 30-day decay), and Semantic (knowledge graph with bidirectional recursive links) memory layers
- **Category Integration** — Quick-jump buttons to Email, Contacts, Wallet, Phone, Games, and Security

### Configuration

- **Model Selection** — Choose from available Ollama models
- **Ollama Endpoint** — Displays connection endpoint (localhost:11434)
- **API Endpoint** — Displays SoulIllusions server endpoint (localhost:7869)
- **Censorship Status** — Shows uncensored mode (disabled)
- **Max Actions** — Configure action limit before agent refresh (5/10/20/50)
- **Available Models** — Lists all Ollama models installed on the system

### SoulIllusions Agent API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completion |
| `/api/conversations` | GET/POST | List/create conversations |
| `/api/conversations/{id}` | GET/PUT/DELETE | Get/update/delete conversation |
| `/api/conversations/{id}/messages` | POST | Add message to conversation |
| `/api/projects` | GET/POST | List/create projects |
| `/api/projects/{id}` | DELETE | Delete project |
| `/api/status` | GET | Get agent status |
| `/api/start` | POST | Start autonomous agent |
| `/api/stop` | POST | Stop autonomous agent |
| `/api/goal` | POST | Set agent goal |
| `/api/prompt` | POST | Send direct prompt to agent |
| `/api/config` | GET/POST | Get/update configuration |
| `/api/models` | GET | List available Ollama models |

### Setup

1. Install [SoulIllusions Agent](https://github.com/singularitycurse26-svg/soulillusions-agent)
2. Start the server: `soulillusions serve` (runs on port 7869)
3. Open Soulmate OS and click the Brain icon in the sidebar

## Hermes Agent Integration

The Web UI integrates with the Hermes Agent as the autonomous AI brain:

- **LLM Proxy** — Supports backend, Ollama, OpenAI, Anthropic, Google, Groq, and OpenRouter
- **LLM Auto-Switcher** — Automatically falls back from Gemini → Groq → OpenRouter → Ollama (Gemma 4B) when a provider is rate-limited or fails. 60-second cooldown on rate-limited providers
- **Terminal Execution** — Full shell access via the Web UI terminal
- **Cron Scheduler** — Schedule recurring AI tasks
- **Subagent Spawning** — Delegate tasks to subagents
- **Session Management** — Multiple chat sessions with persistence
- **Virtual Browser** — Browse the web within the UI
- **Memory Management** — View and manage AI memory
- **Goals** — Set persistent goals for the AI to work toward

### LLM Auto-Switcher API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/ai/auto-llm` | POST | Auto-switching LLM call (tries Gemini → Groq → OpenRouter → Ollama) |
| `/v1/ai/auto-llm-status` | GET | Check provider availability and rate-limit status |

## Self-Healing System

Soulmate includes an autonomous self-healing pipeline that detects, reports, and fixes errors without manual intervention:

### How It Works

1. **Error Capture** — Frontend captures JS crashes, unhandled promise rejections, and API failures via `ErrorBoundary` and `errorCapture.ts`
2. **Error Reporting** — Errors are batched and sent to the VPS via `POST /v1/auto-heal/report`
3. **Message Bouncer** — A local Node.js script (`bouncer.js`) polls the VPS every 10 seconds for new errors
4. **Auto-Injection** — When errors are found, the bouncer writes `pending-fixes.json` and injects an auto-fix message into Windsurf Cascade via PowerShell UI automation
5. **Auto-Fix Workflow** — Cascade reads `pending-fixes.json`, fixes all errors, deploys, and deletes the file — all in Turbo Mode (no "Allow" clicks needed)

### Healing API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/auto-heal/report` | POST | Receive error batch from frontend |
| `/v1/auto-heal/pending` | GET | Bouncer polls for new errors |
| `/v1/auto-heal/ack` | POST | Bouncer acknowledges errors as received |
| `/v1/auto-heal/log` | GET | View healing history |

### Bouncer Setup

```bash
# Run the bouncer locally (polls VPS for errors)
node bouncer.js
```

Or set up as a Windows startup task:

```powershell
schtasks /create /tn "SoulmateBouncer" /tr "node C:\path\to\soulmate\bouncer.js" /sc onlogon /rl highest
```

### Self-Healing Files

| File | Description |
|------|-------------|
| `frontend/src/lib/errorCapture.ts` | Frontend error capture + batching + VPS reporting |
| `frontend/src/components/ErrorBoundary.tsx` | React error boundary for render crashes |
| `frontend/src/components/pages/HealingPage.tsx` | Healing dashboard (founder-only) |
| `bouncer.js` | Local bouncer script (polls VPS, injects into Windsurf) |
| `inject-message.ps1` | PowerShell UI automation for Windsurf injection |
| `bouncer-config.json` | Bouncer configuration |
| `.windsurf/workflows/auto-fix.md` | Auto-fix workflow with Turbo Mode (EAGER execution) |

## SoulIllusions Integration

Soulmate OS integrates with [SoulIllusions Agent](https://github.com/singularitycurse26-svg/soulillusions-agent) — an autonomous AI agent with local LLM processing via Ollama. The integration provides three powerful tools accessible directly from the Soulmate sidebar:

### Text to Video

AI-powered video generation using LTX-Video and SDXL models on GPU backends (Lightning AI, Google Colab, Kaggle GPU):

- **Prompt-based generation** — Describe a scene in natural language and the AI generates a video
- **Style presets** — Cinematic, Documentary, Anime, Realistic
- **Resolution control** — 720p or 1080p output
- **Duration slider** — 5s to 120s with segment-based chaining for longer videos
- **Live progress tracking** — Real-time status updates (storyboarding → rendering → audio → finalizing)
- **Video library** — Browse, watch, download, and delete generated videos
- **Built-in player** — Watch completed videos directly in the UI

### Dual Agent Control

Control two autonomous AI agents from within Soulmate OS:

- **Main Agent** — Full ReAct 9-phase reasoning loop powered by dolphin-mistral (uncensored) via Ollama
- **Sub-Agent** — Secondary agent for delegated tasks and parallel execution
- **Start/Stop controls** — Launch and halt agents on demand
- **Goal input** — Set objectives for each agent independently
- **Live activity logs** — Real-time log output showing agent actions and reasoning
- **Status indicators** — Visual status badges (running, stopped, idle, offline)
- **Agent configuration** — Model: dolphin-mistral, Mode: Local (Ollama), Reasoning: ReAct 9-Phase, Memory: 3-Layer Persistent

### Book Writer

Full AI-assisted book writing system with audiobook generation:

- **Book library** — Browse all created books with cover thumbnails, genre tags, and chapter counts
- **Create books** — Title, author, genre, and description fields
- **Chapter management** — Add chapters with custom titles
- **AI writing** — Generate chapter content with a single click
- **Continue writing** — Extend existing chapter content with AI continuation
- **Word count tracking** — Monitor progress per chapter
- **Chapter status** — Track writing state (pending, writing, complete)
- **Audiobook generation** — Convert completed books to audio with one click
- **Content preview** — Read chapter content inline with line clamping

### SoulIllusions API Endpoints

The integration connects to the SoulIllusions Agent server running on port 7869:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/video/create` | POST | Create AI video from text prompt |
| `/api/video/status/{id}` | GET | Check video generation status |
| `/api/video/list` | GET | List all video projects |
| `/api/video/download/{id}` | GET | Download completed video |
| `/api/video/{id}` | DELETE | Delete a video project |
| `/api/status` | GET | Get main agent status |
| `/api/start` | POST | Start main agent with goal |
| `/api/stop` | POST | Stop main agent |
| `/api/sub-agent/status` | GET | Get sub-agent status |
| `/api/sub-agent/start` | POST | Start sub-agent with goal |
| `/api/sub-agent/stop` | POST | Stop sub-agent |
| `/api/books` | GET | List all books |
| `/api/books/create` | POST | Create a new book |
| `/api/books/{id}` | GET | Get book details and chapters |
| `/api/books/{id}` | DELETE | Delete a book |
| `/api/books/{id}/chapter` | POST | Add a chapter to a book |
| `/api/books/{id}/write` | POST | AI-write a chapter |
| `/api/books/chapter/{id}/continue` | POST | Continue AI-writing a chapter |
| `/api/books/{id}/audiobook` | POST | Generate audiobook from book |

### Setup

1. Install [SoulIllusions Agent](https://github.com/singularitycurse26-svg/soulillusions-agent)
2. Start the SoulIllusions server: `soulillusions serve` (runs on port 7869)
3. Open Soulmate OS and click the SoulIllusions icon in the sidebar

## Incentives Inc. Day Trading Pro

A professional real-time crypto trading terminal built into Soulmate OS, accessible from the sidebar under **Money** → **Day Trading**. Live production deployment at [soulmate-os-app.netlify.app](https://soulmate-os-app.netlify.app).

### Real-Time Data

- **Binance WebSocket streaming** — Live ticker prices for all watchlist symbols via combined WebSocket stream (`wss://stream.binance.com`)
- **Live kline updates** — Real-time candlestick updates for the selected chart symbol
- **REST polling fallback** — Automatic fallback to REST API polling if WebSocket disconnects
- **INC stablecoin simulation** — Simulated price updates for INCUSDT (not on Binance) every 2 seconds
- **LIVE badge** — Visual indicator next to streamed prices showing real-time connection status

### Price Alerts

- **Above/below target alerts** — Create alerts for price crossing thresholds
- **Persistent storage** — Alerts saved to localStorage (`daytrading_alerts_v3`)
- **Auto-trigger** — Live ticker updates check alert conditions automatically
- **Browser notifications** — Native browser notification + in-app toast on trigger
- **Alerts tab** — Dedicated tab showing active and triggered alerts
- **Quick alert button** — One-click alert creation from chart header
- **Distance-to-target display** — Shows how far price is from alert threshold

### Chart & Trading

- **Candlestick chart** — 7 timeframes (1m, 5m, 15m, 1h, 4h, 1d) with live updates
- **Position overlays** — Visual entry/exit lines on chart (blue=long entry, orange=short entry, green dashed=TP, red dashed=SL)
- **Drawing tools** — Trendline and Fibonacci with localStorage persistence
- **Smart Trade Terminal** — Market, limit, conditional, and OCO order types
- **OCO orders** — One-Cancels-Other: when TP fills, SL cancels (and vice versa) with real-time monitoring
- **DCA bots** — Automated dollar-cost averaging with configurable strategies
- **Multiple saved watchlists** — Create, save, load, and delete named watchlists (localStorage persistent)
- **Portfolio tracking** — Unrealized P&L, position sizes, order history
- **4 layout presets** — Simple, Advanced, Terminal, Cryptowatch

### Order Flow Widget (8 View Tabs)

Professional order-flow analysis inspired by ATAS, Bookmap, and Quantower:

| Tab | Style | Features |
|-----|-------|----------|
| **Footprint** | ATAS | Bid × ask footprint, delta, volume, imbalance ratio, stacking detection |
| **Heatmap** | Bookmap | Liquidity heatmap with cumulative depth visualization |
| **Profile** | — | Volume profile with POC, VAH, VAL (value area) |
| **Tape** | — | Live trade tape with block/large/whale trade classification |
| **Dots** | Bookmap | Volume dots canvas — colored circles sized by volume, green=buy/red=sell |
| **Stats** | ATAS | Delta bars chart + 9-column cluster statistics table per candle (volume, buy, sell, delta, delta%, B/S ratio, trade count, POC) |
| **Power** | Quantower | Power trades (large aggressive orders in short time windows), stop run detection, exhaustion events |
| **Dist** | — | Trade size distribution across 6 buckets with buy/sell stacked bars |

**Detection functions** in `frontend/src/lib/indicators.ts`:
- `detectPowerTrades` — Large aggressive orders in short time windows with intensity scoring
- `detectStops` — Stop run patterns with confidence scoring
- `detectExhaustion` — Aggressive orders failing to move price
- `buildClusterStats` — Per-candle metrics (volume, delta, B/S ratio, POC, max/min delta)
- `buildTradeSizeDistribution` — 6 size buckets with buy/sell split
- `detectIcebergs` — Hidden large orders detected via trade pattern analysis
- `detectAbsorption` — Aggressive volume vs passive liquidity comparison
- `buildVolumeDots` — Bookmap-style volume dot data
- `buildFootprint` — Per-candle bid/ask footprint matrix
- `buildHeatmapData` — Order book depth heatmap snapshots

### Order Book Widget

Kraken Pro / Quantower-style order book with:

- **List, ladder, and depth views** — Three display modes with cumulative depth chart
- **Grouping precision** — None / 0.1 / 1 / 10 price bucket aggregation
- **Large order highlighting** — Orders > 3x average size get warning accent + bold + side marker
- **Recent trades tape** — Kraken-style toggleable tape showing last 20 trades with buy/sell coloring
- **Depth chart** — Cumulative bid/ask curve with area fill and price labels
- **Imbalance metrics** — Bid/ask volume ratio with spread and mid-price display
- **Volume modes** — Cumulative or step volume bars

### Day Trading Files

| File | Description |
|------|-------------|
| `frontend/src/components/pages/DayTradingPage.tsx` | Main trading page with watchlist, chart, portfolio, orders, alerts |
| `frontend/src/components/trading/ProChart.tsx` | Candlestick chart with position overlays |
| `frontend/src/components/trading/OrderFlowWidget.tsx` | 8-tab order flow analysis widget |
| `frontend/src/components/trading/OrderBookWidget.tsx` | Order book with grouping, highlights, trades tape |
| `frontend/src/components/trading/SmartTradeTerminal.tsx` | Order entry (market/limit/conditional/OCO) |
| `frontend/src/components/trading/DCABotPanel.tsx` | DCA bot management |
| `frontend/src/lib/indicators.ts` | Technical indicators + order flow detection functions |

## Frequency Generator

A full-frequency tone generator and audio toolset integrated into Soulmate OS, accessible from the sidebar under **Money** → **Frequency Gen**.

### Features

- **4-channel tone generator** — Independent frequency, waveform (sine/square/sawtooth/triangle), volume, and pan per channel
- **Master oscilloscope** — Real-time waveform visualization of combined output
- **Per-channel oscilloscopes** — Individual channel monitoring
- **Quick presets** — Schumann Resonance (7.83 Hz), Solfeggio frequencies (174, 285, 396, 417, 528, 639, 741, 852, 963 Hz), Concert Pitch (440 Hz), Alternative Tuning (432 Hz)
- **Timer & stopwatch** — Countdown timer, stopwatch with lap tracking
- **Alarm clock** — 24h/12h format, custom alarm sounds (beep/bell/buzzer/chime), screen flash, custom sound file
- **Frequency catalog** — Browse and load preset frequencies
- **Universal Journal** — Cross-session persistent journal with IndexedDB + localStorage backup, mood tracking, tags, search, export/import
- **OpenMausBot** — Universal AI agent with persistent memory, long-term goals, projects tracking, Jarvis voice (speech recognition + synthesis), chat interface
- **Music Studio** — Full music production studio (see below)

### Music Studio

Embedded inside the Frequency Generator's Music Studio tab:

- **Piano roll** — Note editing with pitch, velocity, duration
- **Wavetable synth** — Multi-voice synthesis with wavetable modulation
- **Stem separator** — Isolate vocals, drums, bass, and instruments
- **Effects rack** — Reverb, delay, distortion, compression, EQ
- **Automation lanes** — Parameter automation over time
- **Auto-tune** — Auto-mode and graph-mode pitch correction
- **Chopper** — Beat-sliced audio chopping
- **Timeline** — Multi-track arrangement view
- **Mix window** — Pro Tools-style mixing console
- **Edit Window** — Pro Tools-style audio editing
- **Transport** — Play/stop/record/loop controls
- **Musical typing** — QWERTY keyboard to musical notes mapping
- **Suno integration** — AI generation panel, chat bar, export

### Frequency Generator Files

| File | Description |
|------|-------------|
| `frontend/public/frequency-generator/index.html` | Main frequency generator app (built) |
| `frontend/public/frequency-generator/assets/` | JS + CSS bundles |
| `frontend/public/music-studio/` | Music studio app (34 files: acid, autotune, protools, suno, ui, utils) |
| `frontend/src/components/pages/FrequencyGeneratorPage.tsx` | Iframe wrapper page |

## Business Archive

A business management suite with 8 departments + Cline AI agent, accessible from the sidebar under **Home** → **Business Archive**.

### 8 Departments

| # | Department | Description |
|---|-----------|-------------|
| 1 | **Fax Machine** | Scan documents via camera or upload, auto-file by name to universal memory + journal, fax number field |
| 2 | **Custom Dept 2** | User-customizable department |
| 3 | **Custom Dept 3** | User-customizable department |
| 4 | **Contacts & Addresses** | Store fax numbers, phone, email, addresses — auto-saved to universal memory |
| 5 | **Project Analyzer** | Watch projects, analyze what's missing, generate 25 suggestions every 15 min, auto-add to memory after 1 hour |
| 6 | **Custom Dept 6** | User-customizable department |
| 7 | **Custom Dept 7** | User-customizable department |
| 8 | **Custom Dept 8** | User-customizable department |
| AI | **Cline Agent** | AI coding assistant connected via GLM 5.1 (see below) |

### Department 1: Fax Machine

- **Photo capture** — Take photo via phone camera (`capture="environment"`) or upload from file
- **Auto-filing** — Documents auto-filed by name to `Business Archive / Fax Machine / [Category] / [Name]`
- **Universal memory + journal** — Every scanned document auto-stored to both universal memory and journal
- **Fax number field** — Optional fax number for faxed documents (real fax API can be wired up later)
- **Categories** — Contract, Invoice, Legal, Receipt, Letter, ID/Document, Other
- **Search** — Filter documents by name, category, or tag

### Department 4: Contacts & Addresses

- Store fax numbers, phone numbers, emails, and full addresses
- Categorize contacts (Business, Client, Vendor, Personal, Other)
- All contacts auto-saved to universal memory

### Department 5: Project Analyzer

- **Create projects** with name, description, and status (planning → in-progress → review → complete)
- **Task tracking** with checkboxes and progress bars
- **Project analysis** — Scans each project for what's present, what's missing, and improvements needed
- **25 suggestions every 15 minutes** via local rule-based engine (analyzes project status, task completion ratios, missing items, improvements)
- **Auto-add after 1 hour** — Once a project hits the 1-hour mark, all pending suggestions auto-added to universal memory + journal
- **Compiled analysis reports** showing present/missing/improvements for each project

### Cline AI Agent

AI coding assistant integrated into the Business Archive, connected the same way as Aceline in Wakkii Links:

- **GLM 5.1 via incllmv2** — Connects through the local incllmv2 backend (port 8547) running GLM 5.1 via Ollama
- **Model picker** — GLM 5.1 (trill), Singularity, SplitBit, plus any Ollama models detected on the backend
- **Voice enabled** — Speech synthesis (text-to-speech) + speech recognition (voice input via microphone)
- **Memory integration** — Shows memory count from backend, with consolidate button
- **Universal journal logging** — All Cline queries auto-logged to business archive journal
- **Quick actions** — Analyze projects, suggestions, code help, status
- **Offline fallback** — Context-aware local responses on deployed site (knows about projects, documents, contacts, suggestions)

### Universal Memory & Journal

All 8 departments share a single localStorage-based universal memory store:
- Every action (document scan, contact save, project creation, suggestion generation) is auto-logged to the universal journal
- Documents, contacts, suggestions all linked to memory entries
- Export/import full archive data as JSON

### Business Archive Files

| File | Description |
|------|-------------|
| `frontend/src/lib/businessArchive.ts` | Universal memory, journal, documents, contacts, projects, suggestions store |
| `frontend/src/components/pages/BusinessArchivePage.tsx` | Main page with 8 department grid + Cline agent |
| `frontend/src/components/trading/business-archive/index.tsx` | All department components (Fax, Contacts, Project Analyzer, Custom, Cline) |

## Aceline Smart Work Watcher + Hybrid Messaging

A two-channel architecture that solves two bottlenecks: GLM inference contention and high-volume event traffic. The observer watches how you work across 4 Aceline surfaces (UI, CLI, webpage, terminal) and generates improvement notes using the Universal Technology Invention & Innovation Framework.

### Architecture

```
Frontend activity (50-200 events/min)
    ↓
activityWatcher.ts — dedup, throttle, coalesce
    ↓ (10-30 events/min)
LogChannel — fire-and-forget, batch SQLite, WAL mode
    ↓
AcelineObserver — workflow detection, improvement notes, monthly reports
    ↓ (via GLM priority queue — user preempts observer)
GLM inference
```

**Two channels:**
- **LogChannel** — high-volume, fire-and-forget, batch SQLite (observer events)
- **MessageChannel** — low-volume, guaranteed delivery, acks + retries (messaging)

**HybridBus** combines both into one interface.

### Bottleneck Fix 1: GLM Priority Queue

5 priority levels — user requests preempt observer analysis:

| Priority | Who | Model |
|----------|-----|-------|
| 5 (urgent) | User / remote control | primary |
| 4 | Aceline agent | primary |
| 3 | Observer analysis | observer_model (separate, zero contention) |
| 2 | Background tasks | any |
| 1 | Prefetch | any |

### Bottleneck Fix 2: Frontend activityWatcher

- Filters mouse/scroll/hover/keystroke noise
- Deduplicates same event within 100ms
- Throttles to max 10 events/second
- Coalesces rapid clicks into one "clicked Nx" event
- Reduces 50-200 events/min → 10-30 meaningful events/min

### Universal Technology Invention & Innovation Framework

The observer follows this mandatory framework when generating improvement notes and monthly reports for the 4 Aceline surfaces (UI, CLI, webpage, terminal):

**Master principle:** DO NOT JUST INVENT NEW TECHNOLOGY. INVENT NEW WAYS TO USE TECHNOLOGY THAT ALREADY EXISTS.

**Core rule:** DO NOT ASSUME THE CURRENT WAY IS THE BEST WAY.

The framework's invention pipeline:
1. Problem definition — separate actual problem from assumed solution
2. Existing technology reverse-engineering — decompose: System → Subsystem → Component → Function → Mechanism
3. Function extraction — primitive capabilities: detect, store, search, predict, generate, transform, automate, learn, remember, coordinate, control
4. Limitation analysis — find bottlenecks, remove unnecessary steps, find single points of failure
5. Possibility expansion — ask "what if": reverse, combine, remove, parallelize, automate, make adaptive
6. Cross-domain combination — transfer underlying mechanisms across industries
7. AI-assisted invention — 10+ conventional, 10+ unconventional, 10+ combination solutions, then rank
8. Existing-infrastructure-first — before new hardware, solve with software + existing hardware
9. Minimum-viable-invention — smallest functional version, test core mechanism, measure, expand only if it works
10. Failure-driven invention — "why doesn't it work?" → can the failure reveal another solution?
11. Continuous capability library — every discovery becomes reusable knowledge
12. Invention recursion — feed new capabilities back into the engine

### Observer Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/observer/events` | POST | Batch event ingest |
| `/v1/observer/stats` | GET | Observer statistics |
| `/v1/observer/workflows` | GET | Detected workflows |
| `/v1/observer/notes` | GET | Improvement notes |
| `/v1/observer/notes/{id}/approve` | POST | Approve a note |
| `/v1/observer/monthly-report` | GET | Monthly reports |
| `/v1/observer/detect` | POST | Manually trigger detection |
| `/v1/observer/innovate` | POST | Run the innovation framework on recent activity |
| `/v1/observer/framework` | GET | Get the framework rules |

### Universal Messaging Adapter (UMA)

One interface for Telegram, WhatsApp, WeChat, and Signal:

```python
uma.send("telegram", "@user", "Hello")
uma.send("whatsapp", "+1234567890", "Hello")
uma.send("wechat", "user_id", "Hello")
uma.send("signal", "+1234567890", "Hello")
uma.send("auto", "@user", "Hello")  # Picks best available
```

| App | Method | Requires |
|-----|--------|----------|
| Telegram | Bot API (HTTP REST) | Bot token |
| WhatsApp | whatsapp-web.js (Node.js bridge) | Node.js, QR pairing |
| WeChat | Wechaty (Node.js bridge) | Node.js, QR pairing |
| Signal | signal-cli (subprocess) | Java, phone number |

Bridge scripts at `~/.inc_llm/whatsapp_bridge/` and `~/.inc_llm/wechat_bridge/`.

### Messaging Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/messaging/apps` | GET | List messaging apps |
| `/v1/messaging/connect` | POST | Connect to an app |
| `/v1/messaging/disconnect` | POST | Disconnect from an app |
| `/v1/messaging/send` | POST | Send a message |
| `/v1/messaging/receive` | POST | Receive messages |
| `/v1/messaging/chats` | GET | List active chats |
| `/v1/messaging/stats` | GET | Messaging statistics |

### MCP JSON-RPC Adapter

External AI tools (Claude, GPT, etc.) can use Aceline's messaging via standard MCP:

```json
{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "messaging_send", "arguments": {"app": "telegram", "recipient": "@user", "content": "Hello"}}}
```

MCP tools: `messaging_send`, `messaging_receive`, `messaging_apps`.

### Telegram-Aceline Bridge

Interact with Aceline through Telegram bot commands:

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/aceline <message>` | Send a message to Aceline |
| `/workflows` | List detected workflows |
| `/notes` | List improvement notes |
| `/stats` | Show observer statistics |
| `/messaging` | Show messaging app status |

### RLT Token Extensions

New message-oriented token types added to the Recursive Link system:

| Token | Purpose |
|-------|---------|
| `MSG` | Message record |
| `WF` | Workflow pattern |
| `NT` | Improvement note |
| `CMD` | Command request |
| `NAV` | Navigation event |

`UniversalLinkManager` extended with `send_message()`, `receive_message()`, `broadcast_message()`. `PeerSyncManager` extended with WebSocket support for real-time peer messaging.

### Aceline Observer Files

| File | Description |
|------|-------------|
| `inc_llm/integrations/observer.py` | Observer backend + innovation framework |
| `inc_llm/messaging/log_channel.py` | High-volume log channel (batch SQLite) |
| `inc_llm/messaging/glm_queue.py` | GLM priority queue (5 levels, preemption) |
| `inc_llm/messaging/message_channel.py` | Guaranteed delivery message channel |
| `inc_llm/messaging/hybrid_bus.py` | Combined log + message bus |
| `inc_llm/messaging/mcp_adapter.py` | MCP JSON-RPC adapter |
| `inc_llm/messaging/uma.py` | Universal Messaging Adapter (4 apps) |
| `inc_llm/messaging/mcp_server.py` | Standalone MCP server |
| `inc_llm/integrations/messaging_api.py` | REST API for messaging |
| `inc_llm/integrations/telegram_aceline_bridge.py` | Telegram-Aceline bridge |
| `frontend/src/lib/activityWatcher.ts` | Frontend activity dedup/throttle/coalesce |
| `frontend/src/components/pages/ObserverPage.tsx` | Observer dashboard |
| `frontend/src/components/pages/MessagingPage.tsx` | Messaging center |

## Support the Project

If Soulmate helps you, consider supporting development:

<div align="center">

[![Donate](https://img.shields.io/badge/PayPal-Donate-red.svg?logo=paypal)](https://paypal.me/soulmate4)

**Or send crypto:**

[![Wallet](https://img.shields.io/badge/BSC-Wallet-blue.svg)](https://191.44.121.29.sslip.io)

`0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d` — USDC / USDT / BNB / INC

### Share Soulmate

[![X](https://img.shields.io/badge/𝕏-Share-000000.svg?style=social&logo=x)](https://twitter.com/intent/tweet?text=Check%20out%20Soulmate%20%E2%80%94%20a%20local-first%20AI%20reasoning%20agent%20with%20persistent%20memory%20and%20a%20BSC%20crypto%20wallet!&url=https://github.com/singularitycurse26-svg/soulmate)
[![Facebook](https://img.shields.io/badge/Facebook-Share-1877F2.svg?style=social&logo=facebook)](https://www.facebook.com/sharer/sharer.php?u=https://github.com/singularitycurse26-svg/soulmate)
[![Reddit](https://img.shields.io/badge/Reddit-Share-FF4500.svg?style=social&logo=reddit)](https://www.reddit.com/submit?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20%E2%80%94%20Local-first%20AI%20reasoning%20agent%20with%20crypto%20wallet)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Share-0A66C2.svg?style=social&logo=linkedin)](https://www.linkedin.com/sharing/share-offsite/?url=https://github.com/singularitycurse26-svg/soulmate)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Share-25D366.svg?style=social&logo=whatsapp)](https://wa.me/?text=Check%20out%20Soulmate%20%E2%80%94%20AI%20reasoning%20agent%20with%20crypto%20wallet%20https://github.com/singularitycurse26-svg/soulmate)
[![Telegram](https://img.shields.io/badge/Telegram-Share-0088CC.svg?style=social&logo=telegram)](https://t.me/share/url?url=https://github.com/singularitycurse26-svg/soulmate&text=Soulmate%20%E2%80%94%20AI%20reasoning%20agent%20with%20crypto%20wallet)
[![Discord](https://img.shields.io/badge/Discord-Share-5865F2.svg?style=social&logo=discord)](https://discord.com/channels/@me)
[![YouTube](https://img.shields.io/badge/YouTube-Share-FF0000.svg?style=social&logo=youtube)](https://www.youtube.com)
[![Instagram](https://img.shields.io/badge/Instagram-Share-E4405F.svg?style=social&logo=instagram)](https://www.instagram.com)
[![TikTok](https://img.shields.io/badge/TikTok-Share-000000.svg?style=social&logo=tiktok)](https://www.tiktok.com)
[![Snapchat](https://img.shields.io/badge/Snapchat-Share-FFFC00.svg?style=social&logo=snapchat&logoColor=black)](https://www.snapchat.com)
[![Pinterest](https://img.shields.io/badge/Pinterest-Share-BD081C.svg?style=social&logo=pinterest)](https://pinterest.com/pin/create/button/?url=https://github.com/singularitycurse26-svg/soulmate&description=Soulmate%20AI%20reasoning%20agent)
[![Tumblr](https://img.shields.io/badge/Tumblr-Share-36465D.svg?style=social&logo=tumblr)](https://www.tumblr.com/share/link?url=https://github.com/singularitycurse26-svg/soulmate&name=Soulmate%20AI)
[![Mastodon](https://img.shields.io/badge/Mastodon-Share-6364FF.svg?style=social&logo=mastodon)](https://mastodon.social/share?text=Check%20out%20Soulmate%20https://github.com/singularitycurse26-svg/soulmate)
[![VK](https://img.shields.io/badge/VK-Share-4C75C3.svg?style=social&logo=vk)](https://vk.com/share.php?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Myspace](https://img.shields.io/badge/Myspace-Share-0A0A0A.svg?style=social)](https://myspace.com)
[![Threads](https://img.shields.io/badge/Threads-Share-000000.svg?style=social)](https://threads.net)
[![Bluesky](https://img.shields.io/badge/Bluesky-Share-0085FF.svg?style=social)](https://bsky.app)
[![Hacker News](https://img.shields.io/badge/HN-Share-FF6600.svg?style=social)](https://news.ycombinator.com/submitlink?u=https://github.com/singularitycurse26-svg/soulmate&t=Soulmate%20AI%20reasoning%20agent)
[![Email](https://img.shields.io/badge/Email-Share-EA4335.svg?style=social&logo=gmail)](mailto:?subject=Soulmate%20AI&body=https://github.com/singularitycurse26-svg/soulmate)
[![SMS](https://img.shields.io/badge/SMS-Share-34A853.svg?style=social&logo=android-messages)](sms:?&body=Check%20out%20Soulmate%20https://github.com/singularitycurse26-svg/soulmate)
[![Signal](https://img.shields.io/badge/Signal-Share-3A76F0.svg?style=social&logo=signal)](https://signal.me)
[![Twitch](https://img.shields.io/badge/Twitch-Share-9146FF.svg?style=social&logo=twitch)](https://www.twitch.tv)
[![Steam](https://img.shields.io/badge/Steam-Share-171A21.svg?style=social&logo=steam)](https://store.steampowered.com)
[![Slack](https://img.shields.io/badge/Slack-Share-4A154B.svg?style=social&logo=slack)](https://slack.com)
[![Teams](https://img.shields.io/badge/Teams-Share-6264A7.svg?style=social&logo=microsoft-teams)](https://teams.microsoft.com)
[![Gab](https://img.shields.io/badge/Gab-Share-21CF7A.svg?style=social)](https://gab.com)
[![Parler](https://img.shields.io/badge/Parler-Share-BE1E2D.svg?style=social)](https://parler.com)
[![Truth Social](https://img.shields.io/badge/Truth%20Social-Share-1A78E2.svg?style=social)](https://truthsocial.com)
[![Gettr](https://img.shields.io/badge/Gettr-Share-E3000F.svg?style=social)](https://gettr.com)
[![Clubhouse](https://img.shields.io/badge/Clubhouse-Share-6515DD.svg?style=social)](https://www.clubhouse.com)
[![Koo](https://img.shields.io/badge/Koo-Share-AC1E2D.svg?style=social)](https://www.kooapp.com)
[![Weibo](https://img.shields.io/badge/Weibo-Share-E6162D.svg?style=social&logo=weibo)](https://service.weibo.com/share/share.php?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Line](https://img.shields.io/badge/Line-Share-00B900.svg?style=social&logo=line)](https://line.me/R/msg/text/?Check%20out%20Soulmate%20https://github.com/singularitycurse26-svg/soulmate)
[![Viber](https://img.shields.io/badge/Viber-Share-7360F2.svg?style=social&logo=viber)](https://viber.com)
[![Skype](https://img.shields.io/badge/Skype-Share-00AFF0.svg?style=social&logo=skype)](https://web.skype.com/share?url=https://github.com/singularitycurse26-svg/soulmate)
[![Digg](https://img.shields.io/badge/Digg-Share-0080FF.svg?style=social&logo=digg)](https://digg.com/submit?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Flipboard](https://img.shields.io/badge/Flipboard-Share-E12828.svg?style=social&logo=flipboard)](https://share.flipboard.com/bookmarklet/popout?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Pocket](https://img.shields.io/badge/Pocket-Share-EF4056.svg?style=social&logo=getpocket)](https://getpocket.com/save?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Buffer](https://img.shields.io/badge/Buffer-Share-168EEA.svg?style=social&logo=buffer)](https://buffer.com/add?url=https://github.com/singularitycurse26-svg/soulmate&text=Soulmate%20AI)
[![Medium](https://img.shields.io/badge/Medium-Share-000000.svg?style=social&logo=medium)](https://medium.com)
[![Quora](https://img.shields.io/badge/Quora-Share-B92B27.svg?style=social&logo=quora)](https://www.quora.com)
[![WeChat](https://img.shields.io/badge/WeChat-Share-07C160.svg?style=social&logo=wechat)](https://web.wechat.com)
[![Qzone](https://img.shields.io/badge/Qzone-Share-FEBE0F.svg?style=social)](https://sns.qzone.qq.com/cgi-bin/qzshare/cgi_qzshare_onekey?url=https://github.com/singularitycurse26-svg/soulmate)
[![Douban](https://img.shields.io/badge/Douban-Share-007722.svg?style=social&logo=douban)](https://www.douban.com/share/?url=https://github.com/singularitycurse26-svg/soulmate)
[![Renren](https://img.shields.io/badge/Renren-Share-217DC6.svg?style=social)](http://widget.renren.com/dialog/share?resourceUrl=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Instapaper](https://img.shields.io/badge/Instapaper-Share-000000.svg?style=social)](https://www.instapaper.com/edit?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Evernote](https://img.shields.io/badge/Evernote-Share-00A82D.svg?style=social&logo=evernote)](https://www.evernote.com/clip.action?url=https://github.com/singularitycurse26-svg/soulmate&title=Soulmate%20AI)
[![Trello](https://img.shields.io/badge/Trello-Share-0079BF.svg?style=social&logo=trello)](https://trello.com)
[![Blogger](https://img.shields.io/badge/Blogger-Share-FF8000.svg?style=social&logo=blogger)](https://www.blogger.com)
[![WordPress](https://img.shields.io/badge/WordPress-Share-21759B.svg?style=social&logo=wordpress)](https://wordpress.com)
[![Mix](https://img.shields.io/badge/Mix-Share-FF6600.svg?style=social)](https://mix.com/mixit?url=https://github.com/singularitycurse26-svg/soulmate)
[![StumbleUpon](https://img.shields.io/badge/StumbleUpon-Share-EB4924.svg?style=social)](https://stumbleupon.com)

</div>

---

## Aceline — 4-Surface Roaming AI Agent Platform

Aceline is a roaming AI agent that exists as **4 surfaces**, all sharing the same brain (GLM 5.1 via incllmv2), the same tool protocol (`RUN/READ/WRITE/SEARCH/DONE`), and the same memory shape.

### Surfaces

1. **Web UI Overlay** — Floating draggable panel in Soulmate OS. Appears on every page. Triggered by the bottom-right Aceline button or `Cmd+K`. Reads page state via the action registry, triggers registered actions, navigates between pages, and chats via GLM 5.1.

2. **CLI REPL** — Node/TypeScript CLI at `aceline-cli/`. Same tool protocol as `cline_agent.py`. Connects to GLM 5.1 via incllmv2. Commands: `aceline` (REPL), `aceline chat "msg"`, `aceline run "cmd"`, `aceline memory`, `aceline consent`, `aceline models`, `aceline help`.

3. **Standalone Webpage** — Full-page Aceline at `/aceline/`. No Soulmate OS chrome. Hostable on any static host. Same consent system, voice, and personality toggle. PWA-installable.

4. **In-App Terminal** — Terminal tab inside the Aceline overlay. Routes commands through the Hermes backend (`/v1/hermes/terminal`). Command history, up/down arrow navigation. Aceline can push `RUN:` commands from chat to the terminal.

5. **Browser Extension** — Manifest V3 extension at `aceline-extension/`. Injects a floating Aceline button onto any website. Reads page DOM, builds a page-API summary, and lets you control the page (click buttons, fill forms, read text) via voice or text. Per-domain consent modal.

### Runtime Consent

Every Aceline surface shows a consent popup on first use:
- **Master switch** — "Allow full capabilities" (all on) or "Safe mode" (read-only)
- **Per-feature toggles** — voice/Jarvis, wallet, GLM backend, terminal, file access, auto-API, browser extension, custom actions
- **Remember my choice** — skip the modal on future launches
- **Custom directives** — free-text field ("Tell Aceline to do something") injected into every system prompt

### Jarvis Hybrid

Aceline has two personalities sharing the same brain, memory, and GLM backend:
- **Aceline** (text-first) — default roaming agent
- **Jarvis** (voice-first) — uses `useJarvis.ts` voice settings, wake word, TTS/STT

Toggle between them in the overlay header. Voice commands route through the same `acelineChat` pipeline. Both can speak responses via TTS.

### Files

| Surface | Files |
|---------|-------|
| Web overlay | `frontend/src/components/aceline/AcelineOverlay.tsx`, `AcelineButton.tsx` |
| Consent | `frontend/src/lib/acelineConsent.ts`, `frontend/src/components/aceline/AcelineConsentModal.tsx` |
| Voice | `frontend/src/lib/acelineVoice.ts` (wraps `useJarvis.ts`) |
| Terminal | `frontend/src/components/aceline/AcelineTerminal.tsx` |
| Store | `frontend/src/lib/acelineStore.ts` |
| API | `frontend/src/lib/acelineApi.ts` |
| Actions | `frontend/src/lib/acelineActions.ts` |
| Registry | `frontend/src/lib/acelineRegistry.ts` |
| CLI | `aceline-cli/src/index.ts`, `api.ts`, `tools.ts`, `consent.ts` |
| Standalone | `frontend/public/aceline/index.html` |
| Extension | `aceline-extension/manifest.json`, `content.js`, `content.css`, `background.js`, `popup.html` |
| Rule | `.devin/rules/aceline-rule.md` |

### URLs

- Production: https://soulmate-os-app.netlify.app
- Standalone Aceline: https://soulmate-os-app.netlify.app/aceline/

<div align="center">

Built with love for the local-first AI community

</div>
