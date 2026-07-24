<div align="center">

# ❤️ Soulmate

### A local-first AI reasoning agent with persistent memory

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests: 286](https://img.shields.io/badge/tests-286%20passing-brightgreen.svg)](#)
[![Ollama](https://img.shields.io/badge/Ollama-compatible-orange.svg)](https://ollama.ai)

<img src="assets/soulmate.jpg" width="200" alt="Soulmate Heart Logo" />

**Soulmate** gives your AI agent a structured mind — a 9-phase reasoning loop, 3-layer persistent memory, a recursive knowledge graph, and guard hooks that prevent grinding. It works with [Cascade/Windsurf](https://windsurf.com), [Ollama](https://ollama.ai), or any OpenAI-compatible backend.

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

- **Hermes Agent Chat** — Full chat interface with the autonomous AI agent, session management, markdown rendering, and tool execution
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

<div align="center">

Built with love for the local-first AI community

</div>
