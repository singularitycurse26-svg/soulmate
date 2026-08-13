# incllmv2

A self-improving LLM harness with universal recursive linking, RLOS (Recursive Link Operating System), persistent memory, skill creation, long-term goal execution, and an OpenAI-compatible API for larger models to connect and run off of.

## Features

- **3-Layer Memory System**: Working memory (context window), episodic memory (session history), semantic memory (skill library)
- **Vault Memory**: Tiered storage (hot/warm/cold) that prevents slowdown as knowledge grows
- **Knowledge Graph**: Recursive bidirectional linking across all memory layers with configurable traversal depth and link decay
- **35 Domain Knowledge Seeds**: RAG-injected knowledge across programming, AI, cloud, blockchain, math, security, split-bit quantization, geometry for gaming, and more
- **RAG Layer**: ChromaDB-backed retrieval with keyword fallback for context injection
- **Skill Creation**: Automatically learns skills from successful episodes using recursive links
- **Universal Recursive Linking**: Every INC-LLM instance connects to every other instance. When one learns something, all instances get smarter
- **Universal Mesh Link**: Extends peer sync through the RLOS server mesh for bandwidth-limited knowledge propagation
- **RLOS (Recursive Link Operating System)**: Connection pooling, model preloading, prefix caching, batch processing, load balancing, free server connections, code execution sandbox
- **Response Cache**: Semantic similarity-based caching to avoid redundant LLM calls
- **Tool Execution Loop**: LLM can call tools and use results to continue reasoning
- **Self-Improving**: Gets smarter with every use through episodic storage, skill abstraction, and peer learning
- **Long-Term Goals**: Create, plan, and execute multi-step goals with LLM-generated execution plans
- **5-Model Routing**: Fast, base, judge, code, and style roles
- **OpenAI-Compatible API**: Any LLM can connect to incllmv2 and use its memory, skills, and goal system
- **Telegram Integration**: Isolated voice/text bot with pairing codes — never slows the LLM
- **Trading APIs**: Binance, Coinbase, Kraken price feeds
- **Crypto Day Trading**: Full authenticated trading on Coinbase and Kraken — buy/sell (market, limit, stop-loss), portfolio management, order management, trade history, price alerts, LLM-assisted API key setup
- **Automated Trading Engine**: LLM-driven trading decisions with risk management (max position size, max daily loss, stop-loss on every trade). Runs autonomously in background or on-demand. Zero-slowdown
- **Self-Improving Trading Skills**: Tracks trade outcomes with Bayesian scoring per platform and symbol. Creates trading meta-skills after enough trades. Shares learnings via universal recursive link. Gets better at trading over time
- **Voice Engine**: TTS (edge-tts) + STT (whisper)
- **Internet Access**: Wikipedia and web search with rate limiting
- **Hermes/Jarvis Integration**: Soulmate OS agent delegation and voice assistant
- **Usage Tracking**: Per-user token counting, cost estimation, JSON/CSV export
- **Conversation Branching**: Fork conversations for alternative explorations
- **Retry with Backoff**: Exponential backoff for resilient LLM calls
- **JSON Mode**: Extract valid JSON from LLM output
- **Rate Limiting**: Per-IP rate limiting middleware (60 req/min)
- **Tiered Subscription Pricing**: 8 tiers from $5/mo (mobile) to $5,000/mo (supercomputer). Payments via Soulmate OS wallet (USDT, USDC, BNB, INC on BSC)
- **Conversation Skill Creation**: Watches how users talk and creates conversation skills for smoother replies — every conversation makes it better at conversating
- **Code Writing Skill Creation**: Watches its own code output and creates code skills — gets better at coding with every response
- **Mega Vault Storage**: 1000-year capacity tiered storage (hot/warm/cold) with auto-sizing per device (mobile to datacenter) and auto-expansion when learning new things
- **Hardware Auto-Detection**: 8 tiers (mobile → supercomputer) with automatic parameter adjustment and 5-minute background re-checks
- **Channel Auto-Tuning**: 8 channels (Jarvis, Hermes, Telegram, OpenClaw, API, CLI, Web, App) with adaptive parameter adjustment
- **Fingerprint Biometric Login**: Phone-optimized, zero-slowdown, all users
- **AI Gaming MPC Companion**: A realistic AI companion that lives in an app — handles everything as an AI assistant with no limitations, and can also leave the app to play games autonomously. Persistent personality, emotional state, relationship tracking, and 10 game types. Tied directly to the incllmv2 harness for full intelligence. Pairing via 6-digit code. Uses geometry math for spatial reasoning and smooth animations
- **Speed Skill Auto-Tuning**: Precision mathematics to auto-tune reply speed across all channels. Records tokens/sec, latency percentiles (p50/p90/p99), cache hit rate, and error rate per channel+hardware tier. Computes optimal max_tokens, num_ctx, and temperature using exact formulas. Works on phones — no GPU, no weight changes
- **Harness-Level Meta-Learning**: Improves skill selection without changing model weights. Tracks skill effectiveness with Bayesian updating, discovers synergies, re-ranks skills during context prefetch. Creates meta-skills about HOW to use skills optimally per channel. Uses KL divergence for distribution shift detection
- **Urgency Detection**: Auto-detects urgency from message content — short voice commands get fast short replies, complex queries get fuller responses. Applied across all channels (Jarvis, Hermes, Telegram, AI Gaming, CLI, API, Web, App)
- **Voice/Agent LLM Routing**: Jarvis voice commands and Hermes agent tasks route through the LLM harness with auto-detect fast reply tuning. Markdown stripped for TTS. Falls back to external API when no harness available
- **Split-Bit Precision Mathematics**: Sub-byte quantization (ternary 1.58-bit, Q2_K through FP16) with mixed-precision arithmetic for all 8 hardware tiers. Based on BitNet b1.58 research. O(1) computations — zero-slowdown
- **Geometry Math for AI Gaming**: Vec3, Mat4, Quat operations, collision detection, raycasting, trajectory prediction, field of view, emotional slerp for smooth mood transitions. Gives the companion spatial reasoning
- **AI Gaming Auto-Skill Creation**: Automatically creates skills about game strategies (win rates, best/worst decisions) and companion dialogue styles (satisfaction rates, relationship gain). Shares via universal recursive link
- **Bayesian Statistics**: Beta-Bernoulli updating for skill effectiveness, Shannon entropy for temperature optimization, KL divergence for distribution shift detection, EWMA for response time tracking, confidence intervals
- **Security Hardening**: Founder-only endpoints, env var validation, no sensitive data in repo
- **MIT Licensed**: Open source for public distribution

## Architecture

```
incllmv2
├── Harness (main LLM wrapper)
│   ├── ModelBus (5-model routing: fast/base/judge/code/style)
│   ├── MemoryManager (3-layer memory + knowledge graph + vault)
│   │   ├── WorkingMemory (context window with compression)
│   │   ├── EpisodicMemory (session history, SQLite)
│   │   ├── SemanticMemory (skill library, ChromaDB)
│   │   ├── KnowledgeGraph (recursive linking, SQLite)
│   │   └── VaultMemory (tiered hot/warm/cold storage)
│   ├── RAGLayer (32 domain seeds + ChromaDB retrieval)
│   ├── ResponseCache (semantic similarity caching)
│   ├── RLOS (Recursive Link Operating System)
│   │   ├── ConnectionPool (reusable HTTP connections)
│   │   ├── ModelManager (model preloading + lifecycle)
│   │   ├── PrefixCache (conversation prefix caching)
│   │   ├── BatchProcessor (request batching)
│   │   ├── ServerNodeManager (health checks + routing)
│   │   ├── LoadBalancer (weighted server selection)
│   │   ├── FreeServerConnector (community server discovery)
│   │   ├── CodeExecutor (sandboxed Python execution)
│   │   └── UniversalMeshLink (mesh knowledge propagation)
│   ├── SkillFactory + SkillManager
│   ├── GoalManager (long-term goals, planning, execution)
│   ├── UniversalLinkManager + PeerSyncManager
│   ├── ToolRegistry (tool execution loop)
│   ├── UsageTracker + RetryHandler + ConversationBranchManager
│   ├── Integrations (Hermes, Jarvis, Internet, Trading, Telegram, Voice)
│   ├── AIGamingIntegration (companion + autonomous game playing)
│   ├── SpeedSkillCreator (precision reply speed tuning)
│   ├── MetaLearner (Bayesian skill effectiveness + KL divergence)
│   ├── GamingSkillCreator (auto-skill for game strategies + companion styles)
│   ├── TradingSkillCreator (self-improving trading skills, Bayesian scoring)
│   ├── AutomatedTradingEngine (LLM-driven trading, risk management)
│   ├── AutoTuner (channel + urgency + split-bit precision params)
│   ├── HardwareDetector (8-tier auto-detection: mobile → supercomputer)
│   ├── MathCore (split-bit precision + geometry + statistics)
│   ├── APIKeyManager + AuthManager + SubscriptionManager
├── FastAPI Server (REST + OpenAI-compatible API)
├── HuggingFace Publisher (model + knowledge dataset)
└── Ollama Modelfile (base model config)
```

## Quick Start

### 1. Install Ollama and pull the base model

```bash
ollama pull incentives-incllmv2
ollama pull incentives-incllmv2-dolphin  # for standard tier
```

### 2. Install incllmv2

**From PyPI:**
```bash
pip install incllmv2[full]
```

**From GitHub:**
```bash
pip install git+https://github.com/incentivesinc/incllmv2.git
```

**From HuggingFace:**
```bash
pip install https://huggingface.co/incentivesinc/incllmv2/resolve/main/incllmv2-1.0.0.tar.gz
```

**From source:**
```bash
git clone https://github.com/incentivesinc/incllmv2.git
cd incllmv2
pip install -e ".[full]"
```

### 3. Run the server

```bash
incllmv2-server
```

The API will be available at `http://localhost:8547`.

### Docker

```bash
docker-compose up -d
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/password` | Authenticate with secret password |
| POST | `/v1/auth/register` | Register a new user (15-month trial) |
| POST | `/v1/chat` | Chat with INC-LLM |
| POST | `/v1/chat/stream` | Stream chat response |
| GET | `/v1/subscription/status` | Check subscription status |
| GET | `/v1/subscription/pay` | Get payment instructions |
| POST | `/v1/subscription/deposit` | Create deposit request |
| POST | `/v1/subscription/verify` | Verify payment |
| POST | `/v1/subscription/confirm` | Confirm a payment |
| POST | `/v1/learn` | Trigger skill learning |
| POST | `/v1/goals/create` | Create a long-term goal |
| POST | `/v1/goals/plan` | Generate execution plan |
| POST | `/v1/goals/execute-step` | Execute next step |
| POST | `/v1/goals/execute` | Execute all remaining steps |
| GET | `/v1/goals/list` | List goals |
| POST | `/v1/api-keys/create` | Create API key |
| GET | `/v1/api-keys/list` | List all API keys |
| POST | `/v1/chat/completions` | **OpenAI-compatible** |
| POST | `/v1/embeddings` | **OpenAI-compatible** |
| GET | `/v1/models` | **OpenAI-compatible** |
| GET | `/v1/stats` | System statistics |
| GET | `/v1/health` | Health check |
| POST | `/v1/sync/register` | Peer registration |
| POST | `/v1/sync/share` | Receive shared learnings |
| GET | `/v1/sync/receive` | Get learnings to share |
| GET | `/v1/rlos/stats` | RLOS statistics |
| GET | `/v1/mesh/stats` | Universal mesh statistics |
| GET | `/v1/usage` | Usage statistics |
| GET | `/v1/usage/export` | Export usage (JSON/CSV) |
| POST | `/v1/internet/search` | Wikipedia/web search |
| GET | `/v1/trading/price` | Crypto price |
| GET | `/v1/trading/orderbook` | Order book (bids/asks) |
| GET | `/v1/trading/candles` | OHLCV candles for charting |
| GET | `/v1/trading/stats` | 24h price stats (high, low, volume, change) |
| GET | `/v1/trading/portfolio` | Account balances (requires API keys) |
| POST | `/v1/trading/buy` | Place a buy order (market or limit) |
| POST | `/v1/trading/sell` | Place a sell order (market or limit) |
| POST | `/v1/trading/cancel` | Cancel an open order |
| GET | `/v1/trading/orders` | List orders (open, filled, all) |
| GET | `/v1/trading/history` | Trade history |
| POST | `/v1/trading/alert` | Set a price alert (above/below) |
| GET | `/v1/trading/alerts` | Check triggered price alerts |
| POST | `/v1/trading/setup-api-key` | Configure API keys for Coinbase/Kraken |
| GET | `/v1/trading/test-connection` | Test API key connection |
| POST | `/v1/trading/auto/start` | Start autonomous trading engine |
| POST | `/v1/trading/auto/stop` | Stop autonomous trading engine |
| POST | `/v1/trading/auto/analyze` | Run single trading analysis |
| POST | `/v1/telegram/pair` | Generate Telegram pairing code |
| POST | `/v1/voice/tts` | Text-to-speech |
| POST | `/v1/voice/stt` | Speech-to-text |
| GET | `/v1/tools` | List available tools |

## Configuration

Edit `config.yaml` or use environment variables with `INC_LLM_` prefix:

```bash
export INC_LLM_HARDWARE_TIER=minimal
export INC_LLM_RLOS_ENABLED=true
export INC_LLM_TELEGRAM_BOT_TOKEN=your_bot_token
export HF_TOKEN=your_huggingface_token
```

## Crypto Day Trading

incllmv2 supports full authenticated crypto trading on Coinbase and Kraken, plus market data from Binance.

### Setting Up API Keys

Ask the LLM to configure trading: "Set up Coinbase trading" or "Configure Kraken API keys."

The LLM will guide you through:
1. **Coinbase**: Go to Coinbase Exchange > Settings > API > Create API key with trading permissions. Provide the API key, secret, and passphrase.
2. **Kraken**: Go to Kraken > Settings > API > Generate new key with trading permissions. Provide the API key and secret.

Or set them via environment variables:
```bash
export INC_LLM_COINBASE_API_KEY=your_key
export INC_LLM_COINBASE_API_SECRET=your_secret
export INC_LLM_COINBASE_PASSPHRASE=your_passphrase
export INC_LLM_KRAKEN_API_KEY=your_key
export INC_LLM_KRAKEN_API_SECRET=your_secret
```

Or via the API:
```
POST /v1/trading/setup-api-key
{"platform": "coinbase", "api_key": "...", "api_secret": "...", "passphrase": "..."}
```

Verify with:
```
GET /v1/trading/test-connection?platform=coinbase
```

### Market Data (no auth needed)

- **Prices**: `GET /v1/trading/price?symbol=BTCUSDT&platform=binance`
- **Order Book**: `GET /v1/trading/orderbook?symbol=BTC-USD&platform=coinbase`
- **Candles**: `GET /v1/trading/candles?symbol=BTC-USD&timeframe=1h&limit=24&platform=coinbase`
- **24h Stats**: `GET /v1/trading/stats?symbol=BTCUSDT&platform=binance`

### Trading (requires API keys)

- **Buy**: `POST /v1/trading/buy` — market or limit orders
- **Sell**: `POST /v1/trading/sell` — market or limit orders
- **Cancel**: `POST /v1/trading/cancel`
- **List Orders**: `GET /v1/trading/orders?status=open`
- **Trade History**: `GET /v1/trading/history?limit=50`
- **Portfolio**: `GET /v1/trading/portfolio`

### Price Alerts

```
POST /v1/trading/alert
{"symbol": "BTCUSDT", "condition": "above", "target": 100000, "platform": "binance"}

GET /v1/trading/alerts  # Check triggered alerts
```

### Automated Trading Engine

The LLM-driven trading engine analyzes market data and makes trading decisions autonomously.

**Safety features:**
- Max position size per trade (default: $100)
- Max daily loss limit (default: $50)
- Stop-loss on every trade
- Daily P&L tracking with auto-reset
- Can be stopped at any time

```bash
# Start autonomous trading
POST /v1/trading/auto/start
{"symbols": ["BTCUSDT", "ETHUSDT"], "interval_s": 300, "platform": "coinbase"}

# Stop
POST /v1/trading/auto/stop

# Single analysis (on-demand)
POST /v1/trading/auto/analyze?symbol=BTCUSDT&platform=coinbase
```

### Self-Improving Trading Skills

The system gets better at trading over time:
- Tracks every trade outcome (success, P&L, errors) per platform and symbol
- Uses Bayesian scoring to compute win rates and success probabilities
- Creates trading meta-skills after enough trades (10+ by default)
- Shares trading learnings via universal recursive link to all INC-LLM instances
- Injects past performance insights before each trade decision

## Hardware Tiers

| # | Tier | Fast | Base | Judge | Code | Style | RAM | Quant | Price/mo |
|---|------|------|------|-------|------|-------|-----|-------|----------|
| 1 | Mobile | incllmv2 | incllmv2 | incllmv2 | incllmv2 | incllmv2 | ~512MB | ternary 1.58-bit | $5 |
| 2 | Minimal | incllmv2 | incllmv2 | incllmv2 | incllmv2 | incllmv2 | ~1GB | Q2_K 2-bit | $15 |
| 3 | Light | incllmv2 | incllmv2 | incllmv2 | incllmv2 | incllmv2 | ~2GB | Q3_K_S 3-bit | $25 |
| 4 | Standard | incllmv2 | incllmv2-dolphin | incllmv2-dolphin | incllmv2-dolphin | incllmv2 | ~4GB | Q4_K_M 4-bit | $50 |
| 5 | Full | incllmv2 | incllmv2-dolphin | incllmv2-dolphin | incllmv2-dolphin | incllmv2 | ~6GB | Q5_K_M 5-bit | $100 |
| 6 | Maximum | incllmv2 | incllmv2-dolphin | incllmv2-dolphin | incllmv2-dolphin | incllmv2 | ~16GB | Q8_0 8-bit | $250 |
| 7 | Datacenter | incllmv2 | incllmv2-dolphin | incllmv2-dolphin | incllmv2-dolphin | incllmv2 | ~64GB | FP8 E4M3 | $1,000 |
| 8 | Supercomputer | incllmv2 | incllmv2-dolphin | incllmv2-dolphin | incllmv2-dolphin | incllmv2 | 256GB+ | FP16/BF16 | $5,000 |

## RLOS (Recursive Link Operating System)

RLOS optimizes Ollama communication with:
- **Connection Pooling**: Reusable HTTP connections to reduce TCP overhead
- **Model Preloading**: Models stay loaded in memory with `keep_alive: -1`
- **Prefix Caching**: Conversation prefixes cached to avoid recomputation
- **Batch Processing**: Concurrent requests grouped for batched processing
- **Load Balancing**: Weighted server selection based on health, load, and model availability
- **Free Server Discovery**: Connect to community Ollama instances for load distribution
- **Code Execution**: Sandboxed Python execution for LLM-generated code
- **Universal Mesh Link**: Propagates learnings and knowledge files through the server mesh

## AI Gaming MPC Companion

The AI Gaming MPC is a realistic AI companion that lives in an app and can also leave the app to play games.

### Companion Mode
- **Persistent Personality**: Configurable traits (friendly, competitive, analytical, creative, cautious, bold, humorous, serious, supportive, independent)
- **Emotional State**: Mood, energy, excitement, and frustration — all decay over time and affect response style. Smooth transitions via Hermite smoothstep geometry math
- **Relationship Tracking**: Shared experiences, inside jokes, user preferences, relationship level (0-100)
- **Companion Chat**: Routes through the LLM harness with auto-detect fast reply tuning
- **Spatial Reasoning**: Geometry math provides distance, direction, visibility, obstacle detection, and recommended actions for game decisions

### Autonomous Game Playing
- **10 Game Types**: Strategy, RPG, sandbox, competitive, cooperative, puzzle, simulation, adventure, card, board
- **LLM-Powered Decisions**: Game decisions routed through the LLM with personality, emotional context, and strategy hints from past games
- **Game Sessions**: Start, play, and end sessions with full state tracking
- **Personality-Driven**: Decisions influenced by companion's personality traits and current mood
- **Auto-Skill Creation**: Automatically creates gaming strategy skills (win rates, best/worst decisions) and companion dialogue skills (satisfaction rates, relationship gain)

### Pairing
- 6-digit pairing code (like Telegram)
- Isolated from LLM inference — never slows the model
- All state persisted in SQLite

## Split-Bit Precision Mathematics

Sub-byte quantization and mixed-precision arithmetic for all 8 hardware tiers:

- **Ternary Quantization (1.58-bit)**: Based on BitNet b1.58 — weights {-1, 0, +1}, 10.13x compression vs FP16
- **Per-Tier Assignments**: Mobile (ternary) → Minimal (Q2_K) → Light (Q3_K_S) → Standard (Q4_K_M) → Full (Q5_K_M) → Maximum (Q8_0) → Datacenter (FP8) → Supercomputer (FP16/BF16)
- **Mixed-Precision Arithmetic**: FP8 (E4M3, range 256), FP4 (E2M1, range 16), INT4 (range [-8, 7])
- **Quality Loss Estimate**: `1 - (1 - bpw/16)^layers`
- **Throughput Estimate**: `total_bandwidth / (model_size_gb * 2)`
- **O(1) Computations**: All math runs during parameter computation, not during inference — zero-slowdown

## Geometry Math for AI Gaming

Vector, matrix, quaternion, and game physics operations for spatial reasoning:

- **Vec3**: dot, cross, magnitude, normalize, distance, angle_between, lerp, slerp
- **Mat4**: identity, translate, scale, rotate_x/y/z, multiply, transform_point, look_at
- **Quat**: from_axis_angle, from_euler, multiply (Hamilton product), slerp, to_matrix
- **Game Physics**: sphere-sphere collision, AABB collision, ray-sphere intersection, trajectory prediction, field of view
- **Emotional Geometry**: Hermite smoothstep (3t² - 2t³) for natural mood transitions, oscillation for dynamic personality
- **Game Decision Context**: Computes distance, direction, visibility, obstacle count, and recommended action — O(1) per obstacle

## Bayesian Statistics

Rigorous statistical math for adaptive tuning and meta-learning:

- **Bayesian Updating**: Beta-Bernoulli posterior for skill effectiveness — `posterior = (alpha + successes) / (alpha + beta + total)`
- **Shannon Entropy**: `H = -Σ p_i * log2(p_i)` — used for entropy-aware temperature optimization
- **KL Divergence**: `D_KL(P||Q) = Σ P_i * log(P_i/Q_i)` — detects distribution shifts in skill effectiveness
- **Confidence Intervals**: Wilson score interval for robust proportion estimates
- **EWMA**: Exponentially weighted moving average for response time tracking — `EWMA = α * new + (1-α) * old`
- **R² (Coefficient of Determination)**: For trend analysis in auto-tuning

## AI Gaming Auto-Skill Creation

Automatically creates skills about game strategies and companion behavior:

- **Gaming Strategy Skills**: Tracks win/loss/draw per game type, best/worst decisions, satisfaction rate. Creates skills after 3+ games (category: `gaming_strategy`)
- **Companion Dialogue Skills**: Tracks satisfaction rate and relationship gain per dialogue style. Creates skills after 5+ interactions (category: `gaming_companion`)
- **Emotional Pattern Tracking**: Which emotional states lead to better user satisfaction
- **Relationship Pattern Tracking**: Which conversation patterns build relationship faster
- **O(1) Strategy Lookup**: `get_optimal_strategy()` provides instant strategy hints before game decisions
- **O(1) Style Recommendation**: `get_companion_style()` recommends best dialogue style for current context
- **Universal Sharing**: Gaming skills shared via universal recursive link — all instances learn which strategies and behaviors work
- **Zero-Slowdown**: All analysis runs post-turn via `asyncio.create_task`

## Speed Skill Auto-Tuning

Precision mathematics for auto-tuning reply speed across all channels:

- **Channels**: Jarvis, Hermes, Telegram, AI Gaming, CLI, API, Web, App
- **Metrics Recorded**: tokens/sec, latency percentiles (p50/p90/p99), cache hit rate, error rate
- **Exact Formulas**:
  - `optimal_max_tokens = clamp(target_time * measured_tps, 16, hardware_max)`
  - `optimal_num_ctx = clamp(base_ctx * speed_multiplier, 256, hardware_max_ctx)`
  - `optimal_temperature = base_temp * (1 - error_rate * 0.5)`
  - `speed_multiplier = measured_tps / baseline_tps`
- **Urgency Detection**: Short voice commands → high urgency → fewer tokens. Complex queries → low urgency → more tokens
- **Zero-Slowdown**: All analysis runs post-turn via `asyncio.create_task`
- **Universal Sharing**: Speed skills shared via universal recursive link — all instances learn optimal parameters
- **Phone Compatible**: Pure harness-level software, no GPU needed, no model weight changes

## Harness-Level Meta-Learning

Improves skill selection without changing model weights:

- **Bayesian Effectiveness Scoring**: `combined_score = 0.5 * bayesian_success + 0.3 * user_satisfaction + 0.2 * reuse_rate` (uses Beta-Bernoulli posterior instead of simple fraction)
- **Skill Re-Ranking**: During context prefetch: `final_score = 0.4 * relevance + 0.4 * effectiveness + 0.2 * channel_preference`
- **Meta-Skills**: Creates skills about HOW to use skills optimally per channel (category: 'meta')
- **Synergy Discovery**: Detects when skills A + B together produce better results than either alone
- **Feedback Detection**: Positive/negative signals and follow-up corrections
- **Distribution Shift Detection**: KL divergence compares recent vs historical effectiveness — detects when a skill's performance changes
- **Zero-Slowdown**: All analysis runs post-turn via `asyncio.create_task`
- **Universal Sharing**: Meta-learnings shared via universal recursive link

## Universal Recursive Linking

Every instance of incllmv2 connects to a peer network. When one instance:
- Creates a new skill -> all instances receive it
- Discovers a fact -> all instances learn it
- Solves a problem -> the pattern is shared

The **Universal Mesh Link** extends this through the RLOS server mesh, enabling:
- Knowledge file (RAG) propagation across the mesh
- Bandwidth-limited sync to prevent overwhelming slow connections
- Version-tagged updates for backward compatibility

## HuggingFace Publication

Publish to Hugging Face Hub:

```bash
export HF_TOKEN=your_token
python -m inc_llm.publish.hf_publish
```

Publishes:
- Model package to `incentivesinc/incllmv2`
- Knowledge dataset (35 domains) to `incentivesinc/incllmv2-knowledge`

## License

MIT License - see [LICENSE](LICENSE) for details.
