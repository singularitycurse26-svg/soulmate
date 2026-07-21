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

## Support the Project

If Soulmate helps you, consider supporting development:

<div align="center">

[![Donate](https://img.shields.io/badge/PayPal-Donate-red.svg?logo=paypal)](https://paypal.me/soulmate4)

**Or send crypto:**

[![Wallet](https://img.shields.io/badge/BSC-Wallet-blue.svg)](https://191.44.121.29.sslip.io)

`0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d` — USDC / USDT / BNB / INC

</div>

<div align="center">

Built with love for the local-first AI community

</div>
