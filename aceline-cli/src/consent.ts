// Aceline CLI — Consent system (mirrors the web consent store)
// Stored at ~/.aceline/consent.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import * as readline from "readline";

const ACELINE_DIR = join(homedir(), ".aceline");
const CONSENT_FILE = join(ACELINE_DIR, "consent.json");
const MEMORY_FILE = join(ACELINE_DIR, "memory.json");

export interface ConsentFeatures {
  terminal: boolean;
  fileAccess: boolean;
  glmBackend: boolean;
  autoApi: boolean;
  customActions: boolean;
}

export interface ConsentState {
  given: boolean;
  remembered: boolean;
  features: ConsentFeatures;
  customDirectives: string;
}

const DEFAULT_FEATURES: ConsentFeatures = {
  terminal: true,
  fileAccess: true,
  glmBackend: true,
  autoApi: true,
  customActions: true,
};

export function loadConsent(): ConsentState {
  if (!existsSync(CONSENT_FILE)) {
    return {
      given: false,
      remembered: false,
      features: { ...DEFAULT_FEATURES },
      customDirectives: "",
    };
  }
  try {
    const data = JSON.parse(readFileSync(CONSENT_FILE, "utf-8"));
    return {
      given: data.given ?? false,
      remembered: data.remembered ?? false,
      features: { ...DEFAULT_FEATURES, ...(data.features || {}) },
      customDirectives: data.customDirectives || "",
    };
  } catch {
    return { given: false, remembered: false, features: { ...DEFAULT_FEATURES }, customDirectives: "" };
  }
}

export function saveConsent(state: ConsentState): void {
  mkdirSync(ACELINE_DIR, { recursive: true });
  writeFileSync(CONSENT_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function runConsentFlow(rl: readline.Interface): Promise<ConsentState> {
  const existing = loadConsent();
  if (existing.given && existing.remembered) return existing;

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║     Aceline CLI — Runtime Consent               ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));

  const master = await ask("Allow Aceline full capabilities? (y/n): ");
  const masterAllow = master.toLowerCase().startsWith("y");

  let features = { ...DEFAULT_FEATURES };
  if (masterAllow) {
    console.log("  → All features enabled.\n");
  } else {
    features = {
      terminal: false,
      fileAccess: false,
      glmBackend: true,
      autoApi: false,
      customActions: false,
    };
    console.log("  → Safe mode: GLM chat only, no terminal/file access.\n");
  }

  const rememberAns = await ask("Remember my choice? (y/n): ");
  const remembered = rememberAns.toLowerCase().startsWith("y");

  const directives = await ask("Custom directives (optional, press Enter to skip): ");

  const state: ConsentState = {
    given: true,
    remembered,
    features,
    customDirectives: directives,
  };

  saveConsent(state);
  console.log("\n  ✓ Consent saved.\n");
  return state;
}

export function getDirectivesForPrompt(state: ConsentState): string {
  const d = state.customDirectives.trim();
  if (!d) return "";
  return `\n\n## CUSTOM DIRECTIVES (from user)\n${d}`;
}

// ── Memory (shared shape with web store) ────────────────────────

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  location: string;
  timestamp: number;
  type: string;
}

export function loadMemory(): MemoryEntry[] {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function saveMemory(entries: MemoryEntry[]): void {
  mkdirSync(ACELINE_DIR, { recursive: true });
  writeFileSync(MEMORY_FILE, JSON.stringify(entries.slice(-500), null, 2), "utf-8");
}

export function addMemory(entry: Omit<MemoryEntry, "id" | "timestamp">): void {
  const entries = loadMemory();
  const filtered = entries.filter((m) => m.key !== entry.key);
  const newEntry: MemoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
  };
  filtered.unshift(newEntry);
  saveMemory(filtered);
}

export function getMemory(key: string): MemoryEntry | undefined {
  return loadMemory().find((m) => m.key === key);
}
