// Aceline Signature CLI — Universal Memory + Journal + 4-Surface Displays
// The canonical Aceline CLI that connects to everything:
// - Universal Memory (.fablemythos/)
// - Universal Journal (file-based, shared)
// - 4-surface activity displays (UI, CLI, webpage, terminal)
// - Auto-invention + ACRE rules
// - Backend observer + auto-invention endpoints

import * as readline from "readline";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const INCLLMV2_BASE = process.env.INCLLMV2_BASE || "http://localhost:8547";
const FABLEMYTHOS_DIR = join(homedir(), ".fablemythos");
const JOURNAL_FILE = join(FABLEMYTHOS_DIR, "JOURNAL.md");
const MEMORY_FILE = join(FABLEMYTHOS_DIR, "MEMORY.md");
const SOUL_FILE = join(FABLEMYTHOS_DIR, "SOUL.md");
const UNIVERSAL_MEMORY_FILE = join(FABLEMYTHOS_DIR, "UNIVERSAL_MEMORY.json");
const SIGNATURE_JOURNAL = join(FABLEMYTHOS_DIR, "aceline-journal.json");

// ── Types ────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string;
  timestamp: string;
  surface: "ui" | "cli" | "webpage" | "terminal";
  action: string;
  thought: string;
  result: string;
  tags: string[];
}

interface SurfaceState {
  name: string;
  status: "idle" | "thinking" | "working" | "waiting" | "done" | "error";
  currentAction: string;
  lastThought: string;
  activity: string[];
  functions: string[];
}

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source: string;
  timestamp: string;
}

// ── Universal Memory ─────────────────────────────────────────────────

function readUniversalMemory(): string {
  try {
    if (!existsSync(MEMORY_FILE)) return "(no memory file)";
    return readFileSync(MEMORY_FILE, "utf-8").slice(0, 5000);
  } catch { return "(error reading memory)"; }
}

function readSoul(): string {
  try {
    if (!existsSync(SOUL_FILE)) return "(no soul file)";
    return readFileSync(SOUL_FILE, "utf-8").slice(0, 3000);
  } catch { return "(error reading soul)"; }
}

function readJournal(): string {
  try {
    if (!existsSync(JOURNAL_FILE)) return "(no journal file)";
    const content = readFileSync(JOURNAL_FILE, "utf-8");
    // Get last 100 lines
    const lines = content.split("\n");
    return lines.slice(-100).join("\n");
  } catch { return "(error reading journal)"; }
}

function appendToJournal(entry: string): void {
  try {
    const timestamp = new Date().toISOString();
    const formatted = `\n## ${timestamp} — ${entry}\n`;
    appendFileSync(JOURNAL_FILE, formatted, "utf-8");
  } catch (e: any) {
    console.error("  ! Failed to update journal:", e.message);
  }
}

// ── Signature Journal (JSON-based, structured) ───────────────────────

function loadSignatureJournal(): JournalEntry[] {
  try {
    if (!existsSync(SIGNATURE_JOURNAL)) return [];
    return JSON.parse(readFileSync(SIGNATURE_JOURNAL, "utf-8"));
  } catch { return []; }
}

function saveSignatureJournal(entries: JournalEntry[]): void {
  try {
    mkdirSync(FABLEMYTHOS_DIR, { recursive: true });
    // Keep last 1000 entries
    writeFileSync(SIGNATURE_JOURNAL, JSON.stringify(entries.slice(-1000), null, 2), "utf-8");
  } catch (e: any) {
    console.error("  ! Failed to save journal:", e.message);
  }
}

function addJournalEntry(entry: Omit<JournalEntry, "id">): void {
  const entries = loadSignatureJournal();
  const newEntry: JournalEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  };
  entries.push(newEntry);
  saveSignatureJournal(entries);
}

function getRecentEntries(surface?: string, limit: number = 10): JournalEntry[] {
  const entries = loadSignatureJournal();
  const filtered = surface ? entries.filter(e => e.surface === surface) : entries;
  return filtered.slice(-limit);
}

// ── Memory Store ─────────────────────────────────────────────────────

const MEMORY_STORE = join(FABLEMYTHOS_DIR, "aceline-memory.json");

function loadMemoryStore(): MemoryEntry[] {
  try {
    if (!existsSync(MEMORY_STORE)) return [];
    return JSON.parse(readFileSync(MEMORY_STORE, "utf-8"));
  } catch { return []; }
}

function saveMemoryStore(entries: MemoryEntry[]): void {
  try {
    mkdirSync(FABLEMYTHOS_DIR, { recursive: true });
    writeFileSync(MEMORY_STORE, JSON.stringify(entries.slice(-500), null, 2), "utf-8");
  } catch (e: any) {
    console.error("  ! Failed to save memory:", e.message);
  }
}

function remember(key: string, value: string, source: string = "cli"): void {
  const entries = loadMemoryStore();
  const filtered = entries.filter(m => m.key !== key);
  filtered.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    key, value, source,
    timestamp: new Date().toISOString(),
  });
  saveMemoryStore(filtered);
}

function recall(key: string): MemoryEntry | undefined {
  return loadMemoryStore().find(m => m.key === key);
}

// ── 4-Surface State ──────────────────────────────────────────────────

const surfaces: Record<string, SurfaceState> = {
  ui: {
    name: "UI",
    status: "idle",
    currentAction: "",
    lastThought: "",
    activity: [],
    functions: ["render", "navigate", "interact", "display", "overlay", "consent"],
  },
  cli: {
    name: "CLI",
    status: "idle",
    currentAction: "",
    lastThought: "",
    activity: [],
    functions: ["run", "read", "write", "search", "chat", "auto-invent", "memory", "journal"],
  },
  webpage: {
    name: "Webpage",
    status: "idle",
    currentAction: "",
    lastThought: "",
    activity: [],
    functions: ["render", "pwa", "offline", "install", "sync", "notify"],
  },
  terminal: {
    name: "Terminal",
    status: "idle",
    currentAction: "",
    lastThought: "",
    activity: [],
    functions: ["execute", "build", "test", "deploy", "monitor", "stream"],
  },
};

function updateSurface(surface: string, status: SurfaceState["status"], action: string, thought: string): void {
  const s = surfaces[surface];
  if (!s) return;
  s.status = status;
  s.currentAction = action;
  s.lastThought = thought;
  const time = new Date().toLocaleTimeString();
  s.activity.push(`[${time}] ${status}: ${action}`);
  if (s.activity.length > 20) s.activity.shift();

  // Log to journal
  addJournalEntry({
    timestamp: new Date().toISOString(),
    surface: surface as any,
    action,
    thought,
    result: status,
    tags: [surface],
  });
}

// ── Backend API ──────────────────────────────────────────────────────

let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auth/auto`, { method: "POST" });
  const data = await resp.json() as any;
  if (!resp.ok || data.status !== "ok") throw new Error("auth failed");
  cachedToken = data.token;
  return cachedToken!;
}

async function checkBackend(): Promise<boolean> {
  try {
    const resp = await fetch(`${INCLLMV2_BASE}/v1/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch { return false; }
}

async function getModels(): Promise<string[]> {
  try {
    const token = await getToken();
    const resp = await fetch(`${INCLLMV2_BASE}/v1/ai/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json() as any;
    if (data.models) return data.models.map((m: any) => m.name || m.id || m);
    if (Array.isArray(data)) return data.map((m: any) => m.name || m.id || m);
    return [];
  } catch { return []; }
}

async function jarvisChat(message: string, model: string, context: any): Promise<string> {
  const token = await getToken();
  const resp = await fetch(`${INCLLMV2_BASE}/v1/ai/jarvis`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, model, context }),
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.detail || data.message || `HTTP ${resp.status}`);
  return data.response || "No response";
}

async function autoInventState(): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/state`, {
    signal: AbortSignal.timeout(5000),
  });
  return resp.json();
}

async function autoInventRun(): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/run`, { method: "POST" });
  return resp.json();
}

async function autoInventToggle(enabled: boolean): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/auto-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return resp.json();
}

async function observerStats(): Promise<any> {
  try {
    const resp = await fetch(`${INCLLMV2_BASE}/v1/observer/stats`, {
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch { return null; }
}

async function observerWorkflows(): Promise<any> {
  try {
    const resp = await fetch(`${INCLLMV2_BASE}/v1/observer/workflows`, {
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch { return null; }
}

// ── Tool Execution ───────────────────────────────────────────────────

import { execSync } from "child_process";

function executeCommand(cmd: string, cwd: string): string {
  try {
    const output = execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
      cwd, encoding: "utf-8", timeout: 120000, maxBuffer: 1024 * 1024 * 5,
    });
    return output.slice(0, 3000) || "(no output)";
  } catch (e: any) {
    if (e.killed) return "(timed out after 120s)";
    const out = (e.stdout || "") + (e.stderr || "");
    return out.slice(0, 3000) || `(error: ${e.message})`;
  }
}

// ── Display Functions ────────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

const SURFACE_COLORS: Record<string, string> = {
  ui: COLORS.cyan,
  cli: COLORS.green,
  webpage: COLORS.magenta,
  terminal: COLORS.yellow,
};

const STATUS_ICONS: Record<string, string> = {
  idle: "○",
  thinking: "⊕",
  working: "▶",
  waiting: "⋯",
  done: "✓",
  error: "✗",
};

function displaySurfaces(): void {
  console.log();
  console.log(`${COLORS.bold}╔══════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bold}║          ACELINE 4-SURFACE ACTIVITY DASHBOARD                ║${COLORS.reset}`);
  console.log(`${COLORS.bold}╚══════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log();

  for (const [key, s] of Object.entries(surfaces)) {
    const color = SURFACE_COLORS[key];
    const icon = STATUS_ICONS[s.status] || "○";
    const statusColor = s.status === "done" ? COLORS.green :
                        s.status === "error" ? COLORS.red :
                        s.status === "working" ? COLORS.yellow :
                        s.status === "thinking" ? COLORS.cyan : COLORS.dim;

    console.log(`  ${color}${COLORS.bold}┌─ ${s.name.toUpperCase()} SURFACE ─────────────────────────┐${COLORS.reset}`);
    console.log(`  ${color}│${COLORS.reset} ${statusColor}${icon} Status: ${s.status.padEnd(12)}${COLORS.reset} ${color}│${COLORS.reset}`);
    if (s.currentAction) {
      console.log(`  ${color}│${COLORS.reset} Action: ${s.currentAction.slice(0, 40).padEnd(42)}${color}│${COLORS.reset}`);
    }
    if (s.lastThought) {
      console.log(`  ${color}│${COLORS.reset} Thought: ${s.lastThought.slice(0, 40).padEnd(42)}${color}│${COLORS.reset}`);
    }
    console.log(`  ${color}│${COLORS.reset} Functions: ${s.functions.join(", ").slice(0, 38).padEnd(42)}${color}│${COLORS.reset}`);
    if (s.activity.length > 0) {
      console.log(`  ${color}│${COLORS.reset} Recent:                                                    ${color}│${COLORS.reset}`);
      for (const line of s.activity.slice(-3)) {
        console.log(`  ${color}│${COLORS.reset}   ${line.slice(0, 42).padEnd(42)}${color}│${COLORS.reset}`);
      }
    }
    console.log(`  ${color}└────────────────────────────────────────────┘${COLORS.reset}`);
    console.log();
  }
}

function displayMemory(): void {
  const entries = loadMemoryStore();
  console.log(`${COLORS.bold}  ── Universal Memory (${entries.length} entries) ──${COLORS.reset}`);
  for (const m of entries.slice(-5)) {
    console.log(`    ${COLORS.blue}${m.key}${COLORS.reset}: ${m.value.slice(0, 60)}`);
  }
  console.log();
}

function displayJournal(surface?: string): void {
  const entries = getRecentEntries(surface, 10);
  console.log(`${COLORS.bold}  ── Signature Journal (${entries.length} recent${surface ? ` ${surface}` : ""}) ──${COLORS.reset}`);
  for (const e of entries) {
    const color = SURFACE_COLORS[e.surface] || COLORS.dim;
    console.log(`    ${color}[${e.surface}]${COLORS.reset} ${e.action.slice(0, 50)}`);
    if (e.thought) console.log(`      ${COLORS.dim}→ ${e.thought.slice(0, 50)}${COLORS.reset}`);
  }
  console.log();
}

function displayHeader(): void {
  console.log();
  console.log(`${COLORS.bold}${COLORS.cyan}  ╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  ║   ACELINE SIGNATURE CLI — Universal Memory + 4 Surfaces   ║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  ║   Innovation Framework + ACRE Rules Active                 ║${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}  ╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log();
}

function displayHelp(): void {
  console.log(`
  ${COLORS.bold}Aceline Signature CLI — Commands:${COLORS.reset}

  ${COLORS.green}Core:${COLORS.reset}
    aceline                    Start interactive REPL
    aceline chat "msg"         One-shot AI message
    aceline run "cmd"          Direct terminal command
    aceline help               Show this help

  ${COLORS.cyan}4-Surface Displays:${COLORS.reset}
    aceline surfaces           Show all 4 surface activity dashboard
    aceline surface <name>     Show one surface (ui, cli, webpage, terminal)
    aceline think <surface> "thought"  Log what a surface is thinking

  ${COLORS.magenta}Universal Memory:${COLORS.reset}
    aceline memory             Show stored memories
    aceline remember <key> "val"  Save a memory
    aceline recall <key>       Recall a memory
    aceline soul               Read SOUL.md identity
    aceline context            Read universal memory context

  ${COLORS.yellow}Universal Journal:${COLORS.reset}
    aceline journal            Show recent journal entries
    aceline journal <surface>  Show entries for one surface
    aceline log "entry"        Add entry to universal journal
    aceline entries            Show signature journal entries

  ${COLORS.blue}Auto-Invention:${COLORS.reset}
    aceline invent             Run one invention cycle
    aceline invent on          Enable continuous auto mode
    aceline invent off         Disable auto mode
    aceline invent state       Show current invention state
    aceline invent framework   Show the Innovation Framework rule
    aceline invent acre        Show the ACRE cloning rule
    aceline invent design      Show the Design Engineering rule
    aceline invent self-building  Show the Self-Building System rule
    aceline invent suggestion  Show the Suggestion Engine rule
    aceline invent auto-adapt  Show the Auto-Adapt System rule
    aceline invent rules       Show all 6 mandatory rules

  ${COLORS.dim}Environment:
    INCLLMV2_BASE              Backend URL (default: http://localhost:8547)${COLORS.reset}
`);
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    displayHelp();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${COLORS.cyan}aceline${COLORS.reset}> `,
  });

  // ── Surfaces ──
  if (cmd === "surfaces" || cmd === "dashboard") {
    updateSurface("cli", "working", "display surfaces", "Showing 4-surface dashboard");
    displaySurfaces();
    displayMemory();
    displayJournal();
    updateSurface("cli", "done", "display surfaces", "Dashboard shown");
    rl.close();
    return;
  }

  if (cmd === "surface") {
    const name = args[1];
    if (!name || !surfaces[name]) {
      console.log("  Usage: aceline surface <ui|cli|webpage|terminal>");
      rl.close();
      return;
    }
    const s = surfaces[name];
    const color = SURFACE_COLORS[name];
    console.log(`\n  ${color}${COLORS.bold}┌─ ${s.name.toUpperCase()} SURFACE ──┐${COLORS.reset}`);
    console.log(`  Status: ${STATUS_ICONS[s.status]} ${s.status}`);
    console.log(`  Action: ${s.currentAction || "(idle)"}`);
    console.log(`  Thought: ${s.lastThought || "(none)"}`);
    console.log(`  Functions: ${s.functions.join(", ")}`);
    console.log(`  Activity (${s.activity.length}):`);
    for (const a of s.activity.slice(-10)) console.log(`    ${a}`);
    console.log();
    rl.close();
    return;
  }

  if (cmd === "think") {
    const surface = args[1];
    const thought = args.slice(2).join(" ");
    if (!surface || !thought || !surfaces[surface]) {
      console.log("  Usage: aceline think <surface> \"thought\"");
      rl.close();
      return;
    }
    updateSurface(surface, "thinking", "manual thought", thought);
    console.log(`  ✓ ${SURFACE_COLORS[surface]}${surface}${COLORS.reset} is thinking: ${thought}`);
    rl.close();
    return;
  }

  // ── Memory ──
  if (cmd === "memory") {
    const entries = loadMemoryStore();
    if (entries.length === 0) {
      console.log("  No memories stored. Use 'aceline remember <key> \"value\"' to save.");
    } else {
      console.log(`\n  ${COLORS.bold}Universal Memory (${entries.length} entries):${COLORS.reset}\n`);
      for (const m of entries.slice(-20)) {
        console.log(`  ${COLORS.blue}${m.key}${COLORS.reset} = ${m.value.slice(0, 80)}`);
        console.log(`    ${COLORS.dim}source: ${m.source} · ${m.timestamp}${COLORS.reset}`);
      }
    }
    rl.close();
    return;
  }

  if (cmd === "remember") {
    const key = args[1];
    const value = args.slice(2).join(" ");
    if (!key || !value) {
      console.log("  Usage: aceline remember <key> \"value\"");
      rl.close();
      return;
    }
    remember(key, value, "cli");
    console.log(`  ✓ Remembered: ${key} = ${value.slice(0, 60)}`);
    rl.close();
    return;
  }

  if (cmd === "recall") {
    const key = args[1];
    if (!key) {
      console.log("  Usage: aceline recall <key>");
      rl.close();
      return;
    }
    const m = recall(key);
    if (m) {
      console.log(`  ${COLORS.blue}${m.key}${COLORS.reset} = ${m.value}`);
      console.log(`  ${COLORS.dim}source: ${m.source} · ${m.timestamp}${COLORS.reset}`);
    } else {
      console.log(`  No memory found for key: ${key}`);
    }
    rl.close();
    return;
  }

  if (cmd === "soul") {
    console.log(readSoul());
    rl.close();
    return;
  }

  if (cmd === "context") {
    console.log(`\n${COLORS.bold}── Universal Memory Context ──${COLORS.reset}\n`);
    console.log(readUniversalMemory().slice(0, 3000));
    console.log(`\n${COLORS.bold}── Recent Journal ──${COLORS.reset}\n`);
    console.log(readJournal().slice(0, 2000));
    rl.close();
    return;
  }

  // ── Journal ──
  if (cmd === "journal") {
    const surface = args[1];
    if (surface && surfaces[surface]) {
      displayJournal(surface);
    } else {
      displayJournal();
    }
    rl.close();
    return;
  }

  if (cmd === "log") {
    const entry = args.slice(1).join(" ");
    if (!entry) {
      console.log("  Usage: aceline log \"entry\"");
      rl.close();
      return;
    }
    appendToJournal(entry);
    addJournalEntry({
      timestamp: new Date().toISOString(),
      surface: "cli",
      action: entry,
      thought: "manual log",
      result: "logged",
      tags: ["manual"],
    });
    console.log("  ✓ Logged to universal journal");
    rl.close();
    return;
  }

  if (cmd === "entries") {
    const entries = loadSignatureJournal();
    if (entries.length === 0) {
      console.log("  No journal entries yet.");
    } else {
      console.log(`\n  ${COLORS.bold}Signature Journal (${entries.length} entries):${COLORS.reset}\n`);
      for (const e of entries.slice(-20)) {
        const color = SURFACE_COLORS[e.surface] || COLORS.dim;
        console.log(`  ${color}[${e.surface}]${COLORS.reset} ${e.timestamp.slice(11, 19)} ${e.action}`);
        if (e.thought) console.log(`    ${COLORS.dim}→ ${e.thought}${COLORS.reset}`);
      }
    }
    rl.close();
    return;
  }

  // ── Auto-Invention ──
  if (cmd === "invent") {
    const subcmd = args[1];
    const backendOk = await checkBackend();
    if (!backendOk) {
      console.log("  ⚠ Backend not running at localhost:8547");
      rl.close();
      return;
    }

    if (subcmd === "on" || subcmd === "enable") {
      updateSurface("cli", "working", "enable auto-invent", "Turning on continuous auto mode");
      const result = await autoInventToggle(true);
      updateSurface("cli", "done", "enable auto-invent", `Auto mode ON, phase: ${result.phase}`);
      console.log(`\n  ✓ Auto-invention mode ON`);
      console.log(`    Phase: ${result.phase}`);
      console.log(`    The 4-panel overlay will appear in the web UI.`);
      rl.close();
      return;
    }

    if (subcmd === "off" || subcmd === "disable") {
      const result = await autoInventToggle(false);
      updateSurface("cli", "done", "disable auto-invent", "Auto mode OFF");
      console.log(`\n  ✓ Auto-invention mode OFF`);
      rl.close();
      return;
    }

    if (subcmd === "state") {
      const state = await autoInventState();
      console.log(`\n  Phase: ${state.phase}`);
      console.log(`  Auto mode: ${state.auto_mode}`);
      console.log(`  Task: ${state.current_task}`);
      console.log(`  Surface: ${state.current_surface}`);
      console.log(`  Approaches: ${state.approaches?.length || 0}`);
      if (state.winner) {
        console.log(`  Winner: ${state.winner.name} (score: ${state.winner.score})`);
      }
      rl.close();
      return;
    }

    if (subcmd === "framework") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/framework`, { signal: AbortSignal.timeout(5000) });
      const fw = await resp.json();
      console.log(`\n  ${fw.name}`);
      console.log(`  Core: ${fw.core_rule}`);
      console.log(`  Master: ${fw.master_principle}`);
      console.log(`  Sections: ${fw.sections.length}`);
      for (const s of fw.sections) console.log(`    ${s}`);
      rl.close();
      return;
    }

    if (subcmd === "acre") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/acre`, { signal: AbortSignal.timeout(5000) });
      const acre = await resp.json();
      console.log(`\n  ${acre.name}`);
      console.log(`  Core: ${acre.core_rule}`);
      console.log(`  Golden: ${acre.golden_rule}`);
      console.log(`  Sections: ${acre.sections.length}`);
      for (const s of acre.sections) console.log(`    ${s}`);
      rl.close();
      return;
    }

    if (subcmd === "design") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/design`, { signal: AbortSignal.timeout(5000) });
      const dr = await resp.json();
      console.log(`\n  ${dr.name}`);
      console.log(`  Master: ${dr.master_rule}`);
      console.log(`  Standard: ${dr.ultimate_standard}`);
      console.log(`  Rules: ${dr.rule_count}`);
      for (const s of dr.sections) console.log(`    ${s}`);
      rl.close();
      return;
    }

    if (subcmd === "self-building") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/self-building`, { signal: AbortSignal.timeout(5000) });
      const sr = await resp.json();
      console.log(`\n  ${sr.name}`);
      console.log(`  Purpose: ${sr.master_purpose}`);
      console.log(`  Master: ${sr.master_rule}`);
      console.log(`  Principle: ${sr.ultimate_principle}`);
      console.log(`  Rules: ${sr.rule_count}`);
      rl.close();
      return;
    }

    if (subcmd === "suggestion") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/suggestion-engine`, { signal: AbortSignal.timeout(5000) });
      const sr = await resp.json();
      console.log(`\n  ${sr.name}`);
      console.log(`  Purpose: ${sr.master_purpose}`);
      console.log(`  Master: ${sr.master_rule}`);
      console.log(`  Layers: ${sr.five_layers}`);
      console.log(`  Rules: ${sr.rule_count}`);
      rl.close();
      return;
    }

    if (subcmd === "auto-adapt") {
      const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/auto-adapt`, { signal: AbortSignal.timeout(5000) });
      const ar = await resp.json();
      console.log(`\n  ${ar.name}`);
      console.log(`  Master: ${ar.master_rule}`);
      console.log(`  Loop: ${ar.ultimate_loop}`);
      console.log(`  Objective: ${ar.final_objective}`);
      console.log(`  Rules: ${ar.rule_count}`);
      rl.close();
      return;
    }

    if (subcmd === "rules") {
      const fwResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/framework`, { signal: AbortSignal.timeout(5000) });
      const fw = await fwResp.json();
      const acreResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/acre`, { signal: AbortSignal.timeout(5000) });
      const acre = await acreResp.json();
      const designResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/design`, { signal: AbortSignal.timeout(5000) });
      const design = await designResp.json();
      const sbResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/self-building`, { signal: AbortSignal.timeout(5000) });
      const sb = await sbResp.json();
      const seResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/suggestion-engine`, { signal: AbortSignal.timeout(5000) });
      const se = await seResp.json();
      const aaResp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/auto-adapt`, { signal: AbortSignal.timeout(5000) });
      const aa = await aaResp.json();
      console.log(`\n  ${COLORS.bold}6 Mandatory Rules Active:${COLORS.reset}\n`);
      console.log(`  ${COLORS.cyan}1. ${fw.name}${COLORS.reset}`);
      console.log(`     Core: ${fw.core_rule}`);
      console.log(`     Sections: ${fw.sections.length}`);
      console.log();
      console.log(`  ${COLORS.green}2. ${acre.name}${COLORS.reset}`);
      console.log(`     Core: ${acre.core_rule}`);
      console.log(`     Sections: ${acre.sections.length}`);
      console.log();
      console.log(`  ${COLORS.magenta}3. ${design.name}${COLORS.reset}`);
      console.log(`     Master: ${design.master_rule}`);
      console.log(`     Rules: ${design.rule_count}`);
      console.log();
      console.log(`  ${COLORS.yellow}4. ${sb.name}${COLORS.reset}`);
      console.log(`     Master: ${sb.master_rule}`);
      console.log(`     Rules: ${sb.rule_count}`);
      console.log();
      console.log(`  ${COLORS.blue}5. ${se.name}${COLORS.reset}`);
      console.log(`     Master: ${se.master_rule}`);
      console.log(`     Rules: ${se.rule_count}`);
      console.log();
      console.log(`  ${COLORS.red}6. ${aa.name}${COLORS.reset}`);
      console.log(`     Master: ${aa.master_rule}`);
      console.log(`     Rules: ${aa.rule_count}`);
      rl.close();
      return;
    }

    // Run one cycle
    updateSurface("cli", "thinking", "start invention cycle", "Generating approaches using Innovation Framework + ACRE + Design Engineering");
    updateSurface("terminal", "working", "invention cycle", "Running test commands");
    updateSurface("ui", "waiting", "invention cycle", "Waiting for results");
    updateSurface("webpage", "waiting", "invention cycle", "Waiting for results");

    console.log(`\n  ⚡ Starting auto-invention cycle...`);
    console.log(`  Following the Innovation Framework + ACRE rules.`);
    console.log(`  Generating approaches, testing, and picking the best.\n`);

    await autoInventRun();

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const state = await autoInventState();
      const phase = state.phase;
      const approaches = state.approaches || [];

      updateSurface("cli", "working", `invention: ${phase}`, `${approaches.length} approaches being tested`);

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

      if (phase === "done") {
        if (state.winner) {
          console.log(`\n  🏆 WINNER: ${state.winner.name}`);
          console.log(`     Score: ${state.winner.score.toFixed(2)}`);
          console.log(`     Surface: ${state.winner.surface}`);
          console.log(`     ${state.winner.description}`);

          updateSurface("cli", "done", "invention complete", `Winner: ${state.winner.name}`);
          updateSurface("terminal", "done", "invention complete", "Tests passed");
          updateSurface("ui", "done", "invention complete", `Winner: ${state.winner.name}`);
          updateSurface("webpage", "done", "invention complete", `Winner: ${state.winner.name}`);

          remember("last-invention-winner", state.winner.name, "auto-invention");
          appendToJournal(`Auto-invention winner: ${state.winner.name} (score: ${state.winner.score.toFixed(2)})`);
        }
        break;
      }
      if (phase === "error") {
        console.log(`\n  ✗ Error: ${state.error}`);
        updateSurface("cli", "error", "invention failed", state.error);
        break;
      }
    }

    console.log(`\n  ── Surface States After Invention ──`);
    displaySurfaces();
    rl.close();
    return;
  }

  // ── Chat ──
  if (cmd === "chat") {
    const message = args.slice(1).join(" ");
    if (!message) {
      console.log("  Usage: aceline chat \"message\"");
      rl.close();
      return;
    }
    const backendOk = await checkBackend();
    if (!backendOk) {
      console.log("  ⚠ Backend not running. Start with: cd inc_llm_v1 && python -m uvicorn inc_llm.server:app --port 8547");
      rl.close();
      return;
    }

    updateSurface("cli", "thinking", "chat message", message.slice(0, 60));
    const memory = readUniversalMemory().slice(0, 2000);
    const soul = readSoul().slice(0, 1000);

    const context = {
      agent: "aceline",
      source: "signature-cli",
      personality: "aceline",
      pageContext: `Memory: ${memory}\nSoul: ${soul}\nSurfaces: ${JSON.stringify(Object.fromEntries(Object.entries(surfaces).map(([k,v]) => [k, {status: v.status, action: v.currentAction}])))}`,
    };

    try {
      const response = await jarvisChat(message, "glm-5.1", context);
      console.log(`\n  ${COLORS.cyan}Aceline:${COLORS.reset} ${response}\n`);
      updateSurface("cli", "done", "chat response", response.slice(0, 60));
      remember("last-chat", message.slice(0, 100), "cli");
      appendToJournal(`CLI chat: ${message.slice(0, 80)}`);
    } catch (e: any) {
      console.log(`\n  ⚠ ${e.message}\n`);
      updateSurface("cli", "error", "chat failed", e.message);
    }
    rl.close();
    return;
  }

  // ── Run ──
  if (cmd === "run") {
    const command = args.slice(1).join(" ");
    if (!command) {
      console.log("  Usage: aceline run \"command\"");
      rl.close();
      return;
    }
    updateSurface("terminal", "working", "execute command", command.slice(0, 60));
    const output = executeCommand(command, process.cwd());
    console.log(output);
    updateSurface("terminal", "done", "execute command", "Command completed");
    addJournalEntry({
      timestamp: new Date().toISOString(),
      surface: "terminal",
      action: command.slice(0, 100),
      thought: "direct command execution",
      result: output.slice(0, 100),
      tags: ["terminal", "command"],
    });
    rl.close();
    return;
  }

  // ── Interactive REPL ──
  displayHeader();
  const backendOk = await checkBackend();
  console.log(`  Backend: ${backendOk ? `${COLORS.green}connected${COLORS.reset}` : `${COLORS.red}offline${COLORS.reset}`}`);
  console.log(`  Universal Memory: ${existsSync(MEMORY_FILE) ? `${COLORS.green}loaded${COLORS.reset}` : `${COLORS.yellow}not found${COLORS.reset}`}`);
  console.log(`  Universal Journal: ${existsSync(JOURNAL_FILE) ? `${COLORS.green}loaded${COLORS.reset}` : `${COLORS.yellow}not found${COLORS.reset}`}`);
  console.log(`  Signature Journal: ${loadSignatureJournal().length} entries`);
  console.log(`  Memory Store: ${loadMemoryStore().length} entries`);
  console.log();

  updateSurface("cli", "idle", "REPL ready", "Waiting for user input");

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }
    if (input === "exit" || input === "quit") {
      console.log(`\n  ${COLORS.cyan}Aceline signing off.${COLORS.reset}\n`);
      appendToJournal("Aceline Signature CLI session ended");
      rl.close();
      return;
    }

    // REPL commands
    if (input === "surfaces" || input === "dashboard") {
      displaySurfaces();
      rl.prompt();
      return;
    }
    if (input === "memory") {
      displayMemory();
      rl.prompt();
      return;
    }
    if (input === "journal") {
      displayJournal();
      rl.prompt();
      return;
    }
    if (input === "entries") {
      const entries = loadSignatureJournal();
      console.log(`\n  ${entries.length} journal entries:\n`);
      for (const e of entries.slice(-10)) {
        const color = SURFACE_COLORS[e.surface] || COLORS.dim;
        console.log(`  ${color}[${e.surface}]${COLORS.reset} ${e.action}`);
      }
      rl.prompt();
      return;
    }
    if (input === "help") {
      displayHelp();
      rl.prompt();
      return;
    }
    if (input === "context") {
      console.log(readUniversalMemory().slice(0, 3000));
      rl.prompt();
      return;
    }
    if (input.startsWith("remember ")) {
      const parts = input.slice(9).split(" ");
      const key = parts[0];
      const value = parts.slice(1).join(" ");
      if (key && value) {
        remember(key, value, "cli");
        console.log(`  ✓ Remembered: ${key}`);
      }
      rl.prompt();
      return;
    }
    if (input.startsWith("think ")) {
      const parts = input.slice(6).split(" ");
      const surface = parts[0];
      const thought = parts.slice(1).join(" ");
      if (surface && thought && surfaces[surface]) {
        updateSurface(surface, "thinking", "manual thought", thought);
        console.log(`  ✓ ${surface} is thinking: ${thought}`);
      }
      rl.prompt();
      return;
    }

    // Send to AI
    updateSurface("cli", "thinking", "processing message", input.slice(0, 60));

    try {
      const memory = readUniversalMemory().slice(0, 2000);
      const context = {
        agent: "aceline",
        source: "signature-cli",
        personality: "aceline",
        pageContext: `Memory: ${memory}\nSurfaces: ${JSON.stringify(Object.fromEntries(Object.entries(surfaces).map(([k,v]) => [k, v.status])))}`,
      };
      const response = await jarvisChat(input, "glm-5.1", context);
      console.log(`\n  ${COLORS.cyan}Aceline:${COLORS.reset} ${response.slice(0, 500)}\n`);
      updateSurface("cli", "done", "AI response", response.slice(0, 60));
      remember("last-chat", input.slice(0, 100), "cli");
    } catch (e: any) {
      console.log(`\n  ⚠ ${e.message}\n`);
      updateSurface("cli", "error", "chat failed", e.message);
    }

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
