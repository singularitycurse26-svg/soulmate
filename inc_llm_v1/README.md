# INC-LLM-v1

A self-improving LLM harness with universal recursive linking, persistent memory, and skill creation.

## Features

- **3-Layer Memory System**: Working memory (context window), episodic memory (session history), semantic memory (skill library)
- **Knowledge Graph**: Recursive bidirectional linking across all memory layers with configurable traversal depth and link decay
- **Skill Creation**: Automatically learns skills from successful episodes using recursive links
- **Universal Recursive Linking**: Every INC-LLM instance connects to every other instance. When one learns something, all instances get smarter
- **Self-Improving**: Gets smarter with every use through episodic storage, skill abstraction, and peer learning
- **5-Model Routing**: Fast, base, judge, code, and style roles (same pattern as Fable 5 / Mythos)
- **Subscription System**: $15/month with 24h free trial. Accepts INC token, credit/debit cards, Cash App, and stablecoins (USDT/USDC)
- **Secret Password**: Owner gets free access by typing the secret password

## Architecture

```
INC-LLM-v1
├── Harness (main LLM wrapper)
│   ├── ModelBus (5-model routing: fast/base/judge/code/style)
│   ├── MemoryManager (3-layer memory + knowledge graph)
│   │   ├── WorkingMemory (context window with compression)
│   │   ├── EpisodicMemory (session history, SQLite)
│   │   ├── SemanticMemory (skill library, ChromaDB)
│   │   └── KnowledgeGraph (recursive linking, SQLite)
│   ├── SkillFactory (learns skills from episodes)
│   ├── SkillManager (CRUD on skill library)
│   ├── UniversalLinkManager (peer-to-peer learning network)
│   ├── PeerSyncManager (background sync with peers)
│   ├── AuthManager (secret password + session tokens)
│   └── SubscriptionManager (payment gating)
├── FastAPI Server (REST API)
└── Ollama Modelfile (base model config)
```

## Quick Start

### 1. Install Ollama and pull the base model

```bash
ollama pull qwen2.5:0.5b
ollama pull qwen2.5:1.5b  # for standard tier
```

### 2. Create the INC-LLM-v1 model

```bash
ollama create inc-llm-v1 -f Modelfile
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the server

```bash
python -m inc_llm.server
```

The API will be available at `http://localhost:8547`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/password` | Authenticate with secret password |
| POST | `/v1/auth/register` | Register a new user (starts 24h trial) |
| POST | `/v1/chat` | Chat with INC-LLM |
| POST | `/v1/chat/stream` | Stream chat response |
| GET | `/v1/subscription/status` | Check subscription status |
| GET | `/v1/subscription/pay` | Get payment instructions |
| POST | `/v1/subscription/confirm` | Confirm a payment |
| POST | `/v1/learn` | Trigger skill learning |
| GET | `/v1/stats` | System statistics |
| GET | `/v1/health` | Health check |
| POST | `/v1/sync/register` | Peer registration |
| POST | `/v1/sync/share` | Receive shared learnings |
| GET | `/v1/sync/receive` | Get learnings to share |

## Configuration

Edit `config.yaml` or use environment variables with `INC_LLM_` prefix:

```bash
export INC_LLM_HARDWARE_TIER=minimal
export INC_LLM_OLLAMA_HOST=127.0.0.1
export INC_LLM_SECRET_PASSWORD=your_password
export INC_LLM_STRIPE_API_KEY=sk_...
```

## Hardware Tiers

| Tier | Fast | Base | Judge | Code | Style | RAM |
|------|------|------|-------|------|-------|-----|
| Minimal | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | ~1GB |
| Standard | qwen2.5:0.5b | qwen2.5:1.5b | qwen2.5:1.5b | qwen2.5:1.5b | qwen2.5:0.5b | ~4GB |
| Full | qwen2.5:0.5b | qwen2.5:3b | qwen2.5:3b | qwen2.5:3b | qwen2.5:1.5b | ~6GB |

## Universal Recursive Linking

Every instance of INC-LLM-v1 connects to a peer network. When one instance:
- Creates a new skill → all instances receive it
- Discovers a fact → all instances learn it
- Solves a problem → the pattern is shared

This creates a self-improving network where every user's interactions make all instances smarter.

## License

Commercial. $15/month subscription required after 24h trial.
