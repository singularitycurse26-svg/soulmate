# INC-LLM-v1

A self-improving LLM harness with universal recursive linking, persistent memory, skill creation, long-term goal execution, and an OpenAI-compatible API for larger models to connect and run off of.

## Features

- **3-Layer Memory System**: Working memory (context window), episodic memory (session history), semantic memory (skill library)
- **Knowledge Graph**: Recursive bidirectional linking across all memory layers with configurable traversal depth and link decay
- **Skill Creation**: Automatically learns skills from successful episodes using recursive links
- **Universal Recursive Linking**: Every INC-LLM instance connects to every other instance. When one learns something, all instances get smarter
- **Self-Improving**: Gets smarter with every use through episodic storage, skill abstraction, and peer learning
- **Long-Term Goals**: Create, plan, and execute multi-step goals with LLM-generated execution plans, progress tracking, and goal dependencies
- **5-Model Routing**: Fast, base, judge, code, and style roles (same pattern as Fable 5 / Mythos)
- **OpenAI-Compatible API**: Any LLM (Fable 5, GLM 5.2, Mythos, GPT-4, Claude, etc.) can connect to INC-LLM-v1 and use its memory, skills, and goal system for free locally
- **API Key System**: Create scoped API keys for larger models to connect and run off INC-LLM's memory-enhanced reasoning
- **Expert Coding**: Sophisticated system prompt for production-quality code generation and engaging conversations
- **Subscription System**: $15/month with 4.25-month free trial. All payments routed through Soulmate OS wallet system to founder's account (crypto: USDT, USDC, BNB, INC on BSC)
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
│   ├── GoalManager (long-term goals, planning, execution)
│   ├── UniversalLinkManager (peer-to-peer learning network)
│   ├── PeerSyncManager (background sync with peers)
│   ├── APIKeyManager (model-to-model API keys)
│   ├── AuthManager (secret password + session tokens)
│   └── SubscriptionManager (payment gating)
├── FastAPI Server (REST + OpenAI-compatible API)
│   ├── /v1/chat/completions (OpenAI-compatible — any LLM can connect)
│   ├── /v1/embeddings (OpenAI-compatible)
│   ├── /v1/models (OpenAI-compatible)
│   ├── /v1/goals/* (goal creation, planning, execution)
│   ├── /v1/api-keys/* (API key management)
│   └── /v1/sync/* (peer sync endpoints)
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
| POST | `/v1/auth/register` | Register a new user (starts 4.25-month trial) |
| POST | `/v1/chat` | Chat with INC-LLM |
| POST | `/v1/chat/stream` | Stream chat response |
| GET | `/v1/subscription/status` | Check subscription status |
| GET | `/v1/subscription/pay` | Get payment instructions (Soulmate OS wallet) |
| POST | `/v1/subscription/deposit` | Create deposit request to founder wallet |
| POST | `/v1/subscription/verify` | Verify payment via Soulmate OS API |
| POST | `/v1/subscription/confirm` | Confirm a payment and activate subscription |
| POST | `/v1/learn` | Trigger skill learning |
| POST | `/v1/goals/create` | Create a long-term goal |
| POST | `/v1/goals/plan` | Generate execution plan for a goal |
| POST | `/v1/goals/execute-step` | Execute next step of a goal |
| POST | `/v1/goals/execute` | Execute all remaining steps |
| GET | `/v1/goals/list` | List goals (optional status filter) |
| POST | `/v1/api-keys/create` | Create API key for model-to-model |
| GET | `/v1/api-keys/list` | List all API keys |
| POST | `/v1/chat/completions` | **OpenAI-compatible** — any LLM can connect |
| POST | `/v1/embeddings` | **OpenAI-compatible** embeddings |
| GET | `/v1/models` | **OpenAI-compatible** model list |
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
export INC_LLM_SOULMATE_API_URL=https://191.44.121.29.sslip.io
export INC_LLM_FOUNDER_EMAIL=hawpetossjustin25@gmail.com
```

## Hardware Tiers

| Tier | Fast | Base | Judge | Code | Style | RAM |
|------|------|------|-------|------|-------|-----|
| Minimal | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | qwen2.5:0.5b | ~1GB |
| Standard | qwen2.5:0.5b | qwen2.5:1.5b | qwen2.5:1.5b | qwen2.5:1.5b | qwen2.5:0.5b | ~4GB |
| Full | qwen2.5:0.5b | qwen2.5:3b | qwen2.5:3b | qwen2.5:3b | qwen2.5:1.5b | ~6GB |

## Model-to-Model API (OpenAI-Compatible)

INC-LLM-v1 exposes an OpenAI-compatible API so any larger model can connect and use its memory-enhanced reasoning for free locally:

```python
# Example: Fable 5 connecting to INC-LLM-v1
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8547/v1",
    api_key="inc-<your-api-key>"
)

response = client.chat.completions.create(
    model="inc-llm-v1",
    messages=[{"role": "user", "content": "Write a Python web scraper"}]
)
# INC-LLM responds with memory-enhanced, skill-aware output
# that the larger model couldn't produce alone
```

### Creating an API Key

```bash
# Authenticate as owner first
curl -X POST http://localhost:8547/v1/auth/password \
  -H 'Content-Type: application/json' \
  -d '{"password": "$hawpetossjustin25@gmail.com15357979$"}'

# Create API key for a larger model
curl -X POST http://localhost:8547/v1/api-keys/create \
  -H 'Authorization: Bearer <owner-token>' \
  -H 'Content-Type: application/json' \
  -d '{"name": "fable5", "scopes": ["chat", "embed", "skills"], "connected_model": "fable-5"}'
```

### How It Works

When a larger model (Fable 5, GLM 5.2, Mythos, etc.) connects:
1. It sends a chat request via the OpenAI-compatible API
2. INC-LLM prefetches relevant context from all 3 memory layers + knowledge graph
3. Active goals are injected as context
4. INC-LLM generates a memory-enhanced response
5. The episode is stored for future learning
6. The learning is shared with all peer instances
7. The larger model gets a response enriched with persistent memory and skills it doesn't have

## Long-Term Goal Execution

INC-LLM-v1 can create, plan, and execute multi-step goals:

```bash
# Create a goal
curl -X POST http://localhost:8547/v1/goals/create \
  -H 'Authorization: Bearer <token>' \
  -d '{"title": "Build REST API", "description": "Create a FastAPI REST API with auth", "priority": "high"}'

# Auto-plan the goal (LLM generates steps)
curl -X POST http://localhost:8547/v1/goals/plan \
  -d '{"goal_id": "<goal-id>"}'

# Execute all steps sequentially
curl -X POST http://localhost:8547/v1/goals/execute \
  -d '{"goal_id": "<goal-id>"}'
```

Goals support:
- Sub-goals and dependencies (one goal blocks another)
- Progress tracking with step completion
- Automatic replanning when steps fail
- Deadlines and priority scheduling
- Knowledge graph linking (goals → episodes → skills)

## Universal Recursive Linking

Every instance of INC-LLM-v1 connects to a peer network. When one instance:
- Creates a new skill → all instances receive it
- Discovers a fact → all instances learn it
- Solves a problem → the pattern is shared

This creates a self-improving network where every user's interactions make all instances smarter.

## License

Commercial. $15/month subscription required after 4.25-month free trial. Payments routed through Soulmate OS wallet system.
