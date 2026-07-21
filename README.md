<div align="center">

# ❤️ Soulmate

### A local-first AI reasoning agent with persistent memory

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests: 286](https://img.shields.io/badge/tests-286%20passing-brightgreen.svg)](#)
[![Ollama](https://img.shields.io/badge/Ollama-compatible-orange.svg)](https://ollama.ai)

<img src="assets/heart.svg" width="120" height="120" alt="Soulmate Heart Logo" />

**Soulmate** gives your AI agent a structured mind — a 9-phase reasoning loop, 3-layer persistent memory, a recursive knowledge graph, and guard hooks that prevent grinding. It works with [Cascade/Windsurf](https://windsurf.com), [Ollama](https://ollama.ai), or any OpenAI-compatible backend.

100% local. 100% free. No API keys required.

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

## License

MIT — see [LICENSE](LICENSE)

## Author

[singularitycurse26-svg](https://github.com/singularitycurse26-svg)

<div align="center">

Built with love for the local-first AI community

</div>
