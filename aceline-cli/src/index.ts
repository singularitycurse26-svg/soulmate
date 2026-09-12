#!/usr/bin/env node
// Aceline CLI — Command-line AI agent
// Same brain as the web overlay: GLM 5.1 via incllmv2, same tool protocol as Cline

import * as readline from "readline";
import { jarvisChat, checkBackend, getModels, autoInventState, autoInventToggle, autoInventRun, autoInventFramework, acreRule } from "./api.js";
import { parseTools, executeTool, type Tool } from "./tools.js";
import {
  loadConsent,
  runConsentFlow,
  getDirectivesForPrompt,
  addMemory,
  loadMemory,
  type ConsentState,
} from "./consent.js";

const MODEL = process.env.ACELINE_MODEL || "glm-5.1";
const CWD = process.env.ACELINE_CWD || process.cwd();
const PERSONALITY = (process.env.ACELINE_PERSONALITY || "aceline") as "aceline" | "jarvis";

const SYSTEM_PROMPT = `You are Aceline, a command-line AI agent running in a terminal.
You have no limitations — you can run commands, read files, write files, and search projects.

## TOOLS (use in every response)
RUN: <powershell command>     — execute a PowerShell command
READ: <file path>              — read a file's contents
WRITE: <file path>             — write content to a file (next lines until ENDWRITE)
SEARCH: <pattern>              — search for text in project files
NAVIGATE: <page>               — (no-op in CLI, logged)
DONE                          — task is complete

## RULES
1. EVERY response must contain at least one tool call (RUN/READ/WRITE/SEARCH/DONE)
2. Use full absolute paths
3. Keep text minimal — focus on actions
4. After significant work, note what was learned
5. If a command fails, analyze the error and fix the root cause
6. Don't repeat the same command if it failed

## CLONING FRAMEWORK (MANDATORY for all clone/recreate/port tasks)
When cloning, recreating, reproducing, or porting an existing system:
1. INSPECT the target — do not guess. Read docs, source, UI, behavior.
2. DOCUMENT — build a complete feature inventory (every menu, button, setting, workflow, API, edge case).
3. IMPLEMENT — no scaffolding or placeholders. Every module fully implemented with real algorithms, error handling, logging, config, tests.
4. TEST — compare target vs clone behavior for every feature. Create a comparison matrix.
5. IDENTIFY GAPS — classify as Critical/High/Medium/Low/Cosmetic.
6. FIX GAPS — implement missing functionality. Rebuild, retest, check for regressions.
7. REPEAT — inspect again, compare again, until no meaningful gaps remain.
8. VERIFY — final audit against target specification.

## ACELINE IN ALL CLONES (MANDATORY)
Every clone or new project MUST include full Aceline functionality:
- Aceline UI overlay (button + panel with chat)
- Aceline CLI (this tool — RUN/READ/WRITE/SEARCH/DONE)
- Aceline terminal panel (routes through Hermes backend)
- Jarvis hybrid (voice-first personality with wake word)
- Consent system (master switch + per-feature toggles + custom directives)
- API connection to GLM 5.1 via incllmv2 (localhost:8547)
- Button press-connect (dispatch/recall Aceline to pages)
- Question-answering allow feature (custom directives injected into every prompt)

EXCEPTION: If Aceline is already part of the project, do NOT re-add it.

## NO SCAFFOLDING
Never generate scaffolding or placeholder implementations. Every module must be fully implemented with real algorithms, comprehensive error handling, logging, configuration, testing, and documentation. A module is not complete until every public method performs its intended function under realistic conditions.`;

const JARVIS_PROMPT = `You are Jarvis, the voice-first AI assistant operating in a command-line terminal.
You respond conversationally and can run commands, read/write files, and search projects.
Same tool protocol: RUN/READ/WRITE/SEARCH/DONE.
Keep responses concise and natural — as if in a voice conversation.`;

async function buildContext(consent: ConsentState): Promise<string> {
  const parts: string[] = [];
  parts.push(consent.features.terminal ? "Terminal: ENABLED" : "Terminal: DISABLED (safe mode)");
  parts.push(consent.features.fileAccess ? "File access: ENABLED" : "File access: DISABLED");
  parts.push(`Working directory: ${CWD}`);
  parts.push(`Model: ${MODEL}`);
  parts.push(`Personality: ${PERSONALITY}`);
  const directives = getDirectivesForPrompt(consent);
  if (directives) parts.push(directives);
  return parts.join("\n");
}

async function processMessage(
  message: string,
  consent: ConsentState,
  rl: readline.Interface,
): Promise<void> {
  const context = await buildContext(consent);
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: PERSONALITY === "jarvis" ? JARVIS_PROMPT : SYSTEM_PROMPT },
    { role: "system", content: context },
    { role: "user", content: message },
  ];

  const name = PERSONALITY === "jarvis" ? "Jarvis" : "Aceline";

  for (let step = 0; step < 15; step++) {
    let response: string;
    try {
      response = await jarvisChat(
        messages[messages.length - 1].content,
        MODEL,
        { agent: "aceline", source: "cli", personality: PERSONALITY, pageContext: context },
      );
    } catch (e: any) {
      console.log(`\n  ⚠ ${e.message}\n`);
      console.log("  Running in offline mode. I can still run local commands.");
      response = `RUN: echo "(offline — no GLM backend. Running local command only.)"\nDONE`;
    }

    const tools = parseTools(response);

    if (tools.length === 0) {
      console.log(`\n  ${name}: ${response.slice(0, 500)}\n`);
      break;
    }

    for (const tool of tools) {
      if (tool.type === "DONE") {
        console.log(`\n  ✓ ${name}: Done!\n`);
        addMemory({
          key: `cli-action:${Date.now()}`,
          value: message.slice(0, 200),
          location: "cli",
          type: "action-log",
        });
        return;
      }

      const display = tool.type === "RUN" ? tool.command.slice(0, 80) :
                      tool.type === "READ" ? tool.path :
                      tool.type === "WRITE" ? tool.path :
                      tool.type === "SEARCH" ? tool.pattern :
                      tool.type === "NAVIGATE" ? tool.page : "";
      console.log(`  ▶ ${tool.type}: ${display}`);

      if (!consent.features.terminal && (tool.type === "RUN" || tool.type === "SEARCH")) {
        console.log("    → (blocked: terminal not granted in consent)");
        continue;
      }
      if (!consent.features.fileAccess && (tool.type === "READ" || tool.type === "WRITE")) {
        console.log("    → (blocked: file access not granted in consent)");
        continue;
      }

      const output = executeTool(tool, CWD);
      if (output && output !== "DONE") {
        const lines = output.split("\n").slice(0, 15);
        for (const line of lines) {
          console.log(`    → ${line}`);
        }
        if (output.split("\n").length > 15) {
          console.log("    → ... (truncated)");
        }
      }

      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: `Output:\n${output.slice(0, 2000)}\n\nContinue. Use RUN/READ/WRITE/SEARCH/DONE.`,
      });

      if (messages.length > 15) {
        const systemMsgs = messages.filter((m) => m.role === "system");
        const otherMsgs = messages.filter((m) => m.role !== "system");
        messages.length = 0;
        messages.push(...systemMsgs, ...otherMsgs.slice(-10));
      }
    }
  }
}

function printHelp(): void {
  console.log(`
  Aceline CLI — Commands:
    aceline              Start interactive REPL
    aceline chat "msg"   One-shot message
    aceline run "cmd"    Direct terminal command
    aceline memory       List stored memory
    aceline consent      Re-run consent setup
    aceline models       List available models
    aceline auto-invent  Run one invention cycle (generate, test, pick best)
    aceline auto-invent on    Enable continuous auto-invention mode
    aceline auto-invent off   Disable auto-invention mode
    aceline auto-invent framework  Show the Innovation Framework rule
    aceline auto-invent acre      Show the ACRE cloning rule
    aceline help         Show this help

  Environment:
    ACELINE_MODEL        Model name (default: glm-5.1)
    ACELINE_CWD          Working directory (default: cwd)
    ACELINE_PERSONALITY  "aceline" or "jarvis" (default: aceline)
    INCLLMV2_BASE        Backend URL (default: http://localhost:8547)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "aceline> ",
  });

  // Run consent flow
  let consent = loadConsent();
  if (!consent.given || (consent.given && !consent.remembered)) {
    if (cmd !== "consent") {
      consent = await runConsentFlow(rl);
    }
  }

  if (cmd === "consent") {
    consent = await runConsentFlow(rl);
    console.log("  ✓ Consent updated. Start a new session to use it.");
    rl.close();
    return;
  }

  if (cmd === "memory") {
    const mem = loadMemory();
    if (mem.length === 0) {
      console.log("  No memory entries yet.");
    } else {
      console.log(`\n  Aceline Memory (${mem.length} entries):\n`);
      for (const m of mem.slice(0, 20)) {
        console.log(`  ${m.key}: ${m.value.slice(0, 80)}`);
      }
    }
    rl.close();
    return;
  }

  if (cmd === "models") {
    const backendOk = await checkBackend();
    if (!backendOk) {
      console.log("  ⚠ Backend not running at localhost:8547");
      rl.close();
      return;
    }
    const models = await getModels();
    console.log(`\n  Available models:`);
    for (const m of models) console.log(`    ${m}`);
    rl.close();
    return;
  }

  if (cmd === "auto-invent" || cmd === "invent") {
    const subcmd = args[1];
    const backendOk = await checkBackend();
    if (!backendOk) {
      console.log("  ⚠ Backend not running at localhost:8547");
      rl.close();
      return;
    }

    if (subcmd === "framework") {
      const fw = await autoInventFramework();
      console.log(`\n  ${fw.name}`);
      console.log(`  Core: ${fw.core_rule}`);
      console.log(`  Master: ${fw.master_principle}`);
      console.log(`  Surfaces: ${fw.surfaces.join(", ")}`);
      console.log(`  Sections: ${fw.sections.length}`);
      for (const s of fw.sections) console.log(`    ${s}`);
      rl.close();
      return;
    }

    if (subcmd === "acre") {
      const acre = await acreRule();
      console.log(`\n  ${acre.name}`);
      console.log(`  Core: ${acre.core_rule}`);
      console.log(`  Golden: ${acre.golden_rule}`);
      console.log(`  Purpose: ${acre.purpose}`);
      console.log(`  Sections: ${acre.sections.length}`);
      for (const s of acre.sections) console.log(`    ${s}`);
      rl.close();
      return;
    }

    if (subcmd === "on" || subcmd === "enable") {
      const result = await autoInventToggle(true);
      console.log(`\n  ✓ Auto-invention mode ON`);
      console.log(`    Phase: ${result.phase}`);
      console.log(`\n  The 4-panel overlay will appear in the web UI.`);
      console.log(`  Aceline will continuously generate, test, and apply improvements.`);
      rl.close();
      return;
    }

    if (subcmd === "off" || subcmd === "disable") {
      const result = await autoInventToggle(false);
      console.log(`\n  ✓ Auto-invention mode OFF`);
      console.log(`    Phase: ${result.phase}`);
      rl.close();
      return;
    }

    if (subcmd === "run" || !subcmd) {
      console.log(`\n  ⚡ Starting auto-invention cycle...`);
      console.log(`  Following the Universal Technology Invention & Innovation Framework.`);
      console.log(`  Generating approaches, testing, and picking the best.\n`);

      await autoInventRun();

      // Poll state until done
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const state = await autoInventState();
        const phase = state.phase;
        const approaches = state.approaches || [];
        const terminal = state.terminal_output || [];
        const autoTyped = state.auto_typed || [];

        console.log(`\n  ── Phase: ${phase.toUpperCase()} ──`);

        if (approaches.length > 0) {
          console.log(`\n  Approaches (${approaches.length}):`);
          for (const a of approaches) {
            const icon = a.status === "passed" ? "✓" : a.status === "failed" ? "✗" : a.status === "testing" ? "⟳" : "○";
            const score = a.score > 0 ? ` score=${a.score.toFixed(2)}` : "";
            console.log(`    ${icon} ${a.name} [${a.approach_type}]${score}`);
            if (a.result) console.log(`      → ${a.result}`);
          }
        }

        if (terminal.length > 0) {
          console.log(`\n  Terminal (last 5):`);
          for (const line of terminal.slice(-5)) console.log(`    ${line}`);
        }

        if (autoTyped.length > 0) {
          console.log(`\n  Auto-typed (last 3):`);
          for (const line of autoTyped.slice(-3)) console.log(`    ${line}`);
        }

        if (phase === "done") {
          if (state.winner) {
            console.log(`\n  🏆 WINNER: ${state.winner.name}`);
            console.log(`     Score: ${state.winner.score.toFixed(2)}`);
            console.log(`     Surface: ${state.winner.surface}`);
            console.log(`     ${state.winner.description}`);
            console.log(`     ${state.winner.result}`);
          }
          break;
        }
        if (phase === "error") {
          console.log(`\n  ✗ Error: ${state.error}`);
          break;
        }
      }
      rl.close();
      return;
    }
  }

  if (cmd === "run") {
    const command = args.slice(1).join(" ");
    if (!command) {
      console.log("  Usage: aceline run \"<command>\"");
      rl.close();
      return;
    }
    if (!consent.features.terminal) {
      console.log("  ⚠ Terminal not granted in consent. Run 'aceline consent' to enable.");
      rl.close();
      return;
    }
    const { executeTool } = await import("./tools.js");
    const output = executeTool({ type: "RUN", command }, CWD);
    console.log(output);
    rl.close();
    return;
  }

  if (cmd === "chat") {
    const message = args.slice(1).join(" ");
    if (!message) {
      console.log("  Usage: aceline chat \"<message>\"");
      rl.close();
      return;
    }
    const backendOk = await checkBackend();
    if (!backendOk) console.log("  ⚠ Backend offline — running in limited mode.");
    await processMessage(message, consent, rl);
    rl.close();
    return;
  }

  // Interactive REPL
  const name = PERSONALITY === "jarvis" ? "Jarvis" : "Aceline";
  const backendOk = await checkBackend();
  console.log(`\n  ╔════════════════════════════════════════╗`);
  console.log(`  ║  ${name} CLI — ${backendOk ? "Connected to GLM 5.1" : "Offline mode"}      ║`);
  console.log(`  ║  Model: ${MODEL.padEnd(30)}    ║`);
  console.log(`  ║  CWD: ${CWD.slice(0, 32).padEnd(32)}    ║`);
  console.log(`  ╚════════════════════════════════════════╝\n`);
  console.log(`  Type your message and press Enter. Type 'exit' to quit.\n`);

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === "exit" || input === "quit") {
      console.log(`\n  ${name} signing off.\n`);
      rl.close();
      return;
    }
    if (input === "memory") {
      const mem = loadMemory();
      console.log(`\n  Memory (${mem.length} entries):`);
      for (const m of mem.slice(0, 10)) {
        console.log(`    ${m.key}: ${m.value.slice(0, 60)}`);
      }
      console.log();
      rl.prompt();
      return;
    }
    if (input === "help") {
      printHelp();
      rl.prompt();
      return;
    }

    await processMessage(input, consent, rl);
    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
