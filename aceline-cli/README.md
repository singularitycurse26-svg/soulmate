# Aceline CLI

Command-line AI agent — same brain as the web overlay, same tool protocol as Cline.

## Install

```powershell
cd aceline-cli
npm install
npm run build
```

## Usage

```powershell
# Interactive REPL
node dist/index.js

# One-shot chat
node dist/index.js chat "build a hello world react component"

# Direct terminal command
node dist/index.js run "Get-ChildItem"

# List stored memory
node dist/index.js memory

# Re-run consent setup
node dist/index.js consent

# List available models
node dist/index.js models

# Help
node dist/index.js help
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACELINE_MODEL` | `glm-5.1` | Model name to send to incllmv2 |
| `ACELINE_CWD` | current dir | Working directory for RUN/READ/WRITE |
| `ACELINE_PERSONALITY` | `aceline` | `aceline` (text-first) or `jarvis` (voice-first) |
| `INCLLMV2_BASE` | `http://localhost:8547` | incllmv2 backend URL |

## Tool Protocol

Aceline uses the same `RUN/READ/WRITE/SEARCH/DONE` protocol as `cline_agent.py`:

```
RUN: Get-ChildItem
READ: package.json
WRITE: src/hello.ts
export const hello = () => "world";
ENDWRITE
SEARCH: useState
NAVIGATE: dashboard
DONE
```

## Consent

First run shows a consent flow:
- Master allow/deny switch
- Per-feature toggles (terminal, file access, GLM backend, auto-API, custom actions)
- "Remember my choice" option
- Custom directives field

Stored at `~/.aceline/consent.json`. Reset with `aceline consent`.

## Memory

Stored at `~/.aceline/memory.json`. Same shape as the web store's memory entries.

## Backend

Requires [incllmv2](https://github.com/singularitycurse26-svg/incllmv2) running at `localhost:8547` for full GLM 5.1 capabilities. Without it, Aceline runs in offline mode (local commands only).

## Personality

- **Aceline** (default) — text-first, terse, action-focused
- **Jarvis** — voice-first, conversational, natural

Switch with `ACELINE_PERSONALITY=jarvis` env var.
