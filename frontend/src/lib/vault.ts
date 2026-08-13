import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";

const MAX_VAULT_ACCOUNTS = 50;

function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e: any) {
    if (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014) {
      // Storage full — try pruning old accounts and retry
      try {
        const accounts = JSON.parse(localStorage.getItem("soulmate_vault_accounts") || "[]");
        if (accounts.length > 5) {
          // Keep only the 5 most recent accounts
          const sorted = accounts.sort((a: any, b: any) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );
          const trimmed = sorted.slice(0, 5);
          localStorage.removeItem("soulmate_vault_accounts");
          localStorage.setItem("soulmate_vault_accounts", JSON.stringify(trimmed));
          // Retry saving the original value
          try {
            localStorage.setItem(key, value);
            return true;
          } catch {
            return false;
          }
        }
        // Also try clearing other non-essential keys
        const keysToClean = Object.keys(localStorage).filter(k =>
          k.startsWith("soulmate_") && k !== "soulmate_vault_accounts" && k !== "soulmate_wallet_bio"
        );
        keysToClean.forEach(k => localStorage.removeItem(k));
        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          return false;
        }
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function saveAccountToVault(email: string, sessionToken: string, extra?: Record<string, string>) {
  const vaultData = {
    email,
    session_token: sessionToken,
    created_at: new Date().toISOString(),
    platform: "soulmate-os",
    ...extra,
  };

  try {
    const existing = JSON.parse(localStorage.getItem("soulmate_vault_accounts") || "[]");
    const idx = existing.findIndex((a: any) => a.email === email);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...vaultData };
    } else {
      existing.push(vaultData);
      // Enforce max accounts — remove oldest
      if (existing.length > MAX_VAULT_ACCOUNTS) {
        existing.sort((a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        existing.splice(MAX_VAULT_ACCOUNTS);
      }
    }
    safeSetItem("soulmate_vault_accounts", JSON.stringify(existing));
  } catch (e) {
    console.error("Failed to save account to local vault:", e);
  }
}

export function getVaultAccounts(): Array<Record<string, any>> {
  try {
    return JSON.parse(localStorage.getItem("soulmate_vault_accounts") || "[]");
  } catch {
    return [];
  }
}

export function saveWalletToVault(walletAddress: string, walletKey: string) {
  try {
    const accounts = getVaultAccounts();
    const currentEmail = localStorage.getItem("auth_email");
    const idx = accounts.findIndex((a) => a.email === currentEmail);
    if (idx >= 0) {
      accounts[idx].wallet_address = walletAddress;
      accounts[idx].wallet_key = walletKey;
      accounts[idx].wallet_saved_at = new Date().toISOString();
      safeSetItem("soulmate_vault_accounts", JSON.stringify(accounts));
    }
  } catch (e) {
    console.error("Failed to save wallet to vault:", e);
  }
}

// ============================================================
// SESSION TRACKER — Built into the vault framework
// Auto-catalogs work done during sessions and generates
// assessments for what to tackle next.
// ============================================================

const VAULT_JOURNAL_KEY = "soulmate_vault_journal";
const VAULT_SESSIONS_KEY = "soulmate_vault_sessions";
const VAULT_ACTIVE_SESSION_KEY = "soulmate_vault_active_session";
const VAULT_ASSESSMENT_KEY = "soulmate_vault_assessment";
const MAX_JOURNAL_ENTRIES = 200;

export type SessionCategory = "feature" | "fix" | "refactor" | "deployment" | "config" | "research" | "ui" | "security";

export interface SessionEntry {
  id: string;
  timestamp: string;
  category: SessionCategory;
  title: string;
  description: string;
  files: string[];
  tags: string[];
  session_id: string;
}

export interface SessionMeta {
  id: string;
  started_at: string;
  ended_at?: string;
  entry_count: number;
  summary: string;
}

export interface AssessmentSuggestion {
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  reason: string;
}

export interface SessionAssessment {
  generated_at: string;
  total_sessions: number;
  total_entries: number;
  categories_covered: string[];
  last_worked_on: string;
  suggestions: AssessmentSuggestion[];
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Get the current session ID, creating one if needed */
export function getVaultSessionId(): string {
  let id = localStorage.getItem(VAULT_ACTIVE_SESSION_KEY);
  if (!id) {
    id = `session-${genId()}`;
    localStorage.setItem(VAULT_ACTIVE_SESSION_KEY, id);
    const meta: SessionMeta = {
      id,
      started_at: new Date().toISOString(),
      entry_count: 0,
      summary: "",
    };
    const metas = getVaultSessions();
    metas.push(meta);
    safeSetItem(VAULT_SESSIONS_KEY, JSON.stringify(metas));
  }
  return id;
}

/** Get all journal entries from the vault */
export function getVaultEntries(): SessionEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VAULT_JOURNAL_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Get all session metas from the vault */
export function getVaultSessions(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem(VAULT_SESSIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Log a work entry into the vault journal */
export function logWork(
  category: SessionCategory,
  title: string,
  description: string,
  files: string[] = [],
  tags: string[] = []
): void {
  const sessionId = getVaultSessionId();
  const entry: SessionEntry = {
    id: genId(),
    timestamp: new Date().toISOString(),
    category,
    title,
    description,
    files,
    tags,
    session_id: sessionId,
  };

  const entries = getVaultEntries();
  entries.push(entry);

  if (entries.length > MAX_JOURNAL_ENTRIES) {
    entries.splice(0, entries.length - MAX_JOURNAL_ENTRIES);
  }

  safeSetItem(VAULT_JOURNAL_KEY, JSON.stringify(entries));

  const metas = getVaultSessions();
  const metaIdx = metas.findIndex(m => m.id === sessionId);
  if (metaIdx >= 0) {
    metas[metaIdx].entry_count++;
    metas[metaIdx].summary = `${metas[metaIdx].entry_count} entries — latest: ${title}`;
    safeSetItem(VAULT_SESSIONS_KEY, JSON.stringify(metas));
  }
}

/** End the current session in the vault */
export function endVaultSession(): void {
  const sessionId = localStorage.getItem(VAULT_ACTIVE_SESSION_KEY);
  if (!sessionId) return;

  const metas = getVaultSessions();
  const idx = metas.findIndex(m => m.id === sessionId);
  if (idx >= 0) {
    metas[idx].ended_at = new Date().toISOString();
    safeSetItem(VAULT_SESSIONS_KEY, JSON.stringify(metas));
  }

  localStorage.removeItem(VAULT_ACTIVE_SESSION_KEY);
}

/** Generate a smart assessment of what needs to be done next */
export function generateVaultAssessment(): SessionAssessment {
  const entries = getVaultEntries();
  const sessions = getVaultSessions();

  const categoriesCovered = [...new Set(entries.map(e => e.category))];
  const lastEntry = entries[entries.length - 1];
  const lastWorkedOn = lastEntry ? lastEntry.title : "Nothing yet";

  const suggestions: AssessmentSuggestion[] = [];

  const hasDeployment = entries.some(e => e.category === "deployment");
  const featureEntries = entries.filter(e => e.category === "feature");
  const fixEntries = entries.filter(e => e.category === "fix");
  const recentEntries = entries.filter(e => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < 24 * 60 * 60 * 1000;
  });

  if (!hasDeployment) {
    suggestions.push({
      priority: "high",
      category: "deployment",
      title: "Deploy changes to production",
      reason: "No deployments logged yet — changes may not be live",
    });
  }

  if (entries.some(e => e.title.toLowerCase().includes("youtube"))) {
    const hasBackendCheck = entries.some(e => e.title.toLowerCase().includes("backend") && e.title.toLowerCase().includes("youtube"));
    if (!hasBackendCheck) {
      suggestions.push({
        priority: "high",
        category: "research",
        title: "Verify backend supports video_url field for YouTube posts",
        reason: "YouTube video posting was added to frontend but backend API may not store video_url yet",
      });
    }
  }

  if (entries.some(e => e.title.toLowerCase().includes("fingerprint"))) {
    const hasTest = entries.some(e => e.title.toLowerCase().includes("test") && e.title.toLowerCase().includes("fingerprint"));
    if (!hasTest) {
      suggestions.push({
        priority: "high",
        category: "security",
        title: "Test fingerprint gate on actual Android device",
        reason: "Fingerprint gate was built but user reported not seeing it — likely cache issue, needs verification",
      });
    }
  }

  if (entries.some(e => e.title.toLowerCase().includes("wallet") && e.title.toLowerCase().includes("auto"))) {
    const hasCleanup = entries.some(e => e.title.toLowerCase().includes("cleanup") || e.title.toLowerCase().includes("dead code"));
    if (!hasCleanup) {
      suggestions.push({
        priority: "medium",
        category: "refactor",
        title: "Clean up dead code — WalletCreateView.tsx",
        reason: "WalletCreateView.tsx is no longer imported or rendered, can be removed",
      });
    }
  }

  suggestions.push({
    priority: "medium",
    category: "feature",
    title: "Review soulmateos-landing project",
    reason: "Landing page project exists at soulmateos-landing but hasn't been worked on this session",
  });

  if (recentEntries.length > 5 && !hasDeployment) {
    suggestions.push({
      priority: "high",
      category: "deployment",
      title: "Deploy recent changes",
      reason: `${recentEntries.length} changes made in last 24h without a deployment`,
    });
  }

  if (fixEntries.length > featureEntries.length && fixEntries.length > 3) {
    suggestions.push({
      priority: "low",
      category: "research",
      title: "Consider root-cause analysis for recurring bugs",
      reason: `${fixEntries.length} fixes logged — may indicate underlying issues worth investigating`,
    });
  }

  const uiEntries = entries.filter(e => e.category === "ui");
  if (uiEntries.length > 0) {
    suggestions.push({
      priority: "medium",
      category: "feature",
      title: "Test all UI buttons on mobile device",
      reason: `${uiEntries.length} UI changes made — verify on actual mobile for responsiveness`,
    });
  }

  if (sessions.length > 1) {
    const lastSession = sessions[sessions.length - 1];
    const prevSession = sessions[sessions.length - 2];
    if (lastSession && prevSession && prevSession.ended_at) {
      const gap = new Date(lastSession.started_at).getTime() - new Date(prevSession.ended_at).getTime();
      if (gap > 6 * 60 * 60 * 1000) {
        suggestions.push({
          priority: "low",
          category: "research",
          title: "Review previous session work for context",
          reason: `Last session was ${Math.round(gap / (60 * 60 * 1000))}h ago — review PROGRESS.md for continuity`,
        });
      }
    }
  }

  const assessment: SessionAssessment = {
    generated_at: new Date().toISOString(),
    total_sessions: sessions.length,
    total_entries: entries.length,
    categories_covered: categoriesCovered,
    last_worked_on: lastWorkedOn,
    suggestions: suggestions.sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }),
  };

  safeSetItem(VAULT_ASSESSMENT_KEY, JSON.stringify(assessment));
  return assessment;
}

/** Clear all journal data from the vault */
export function clearVaultJournal(): void {
  localStorage.removeItem(VAULT_JOURNAL_KEY);
  localStorage.removeItem(VAULT_SESSIONS_KEY);
  localStorage.removeItem(VAULT_ACTIVE_SESSION_KEY);
  localStorage.removeItem(VAULT_ASSESSMENT_KEY);
}

/** Get entries grouped by session */
export function getVaultEntriesBySession(): Record<string, SessionEntry[]> {
  const entries = getVaultEntries();
  const grouped: Record<string, SessionEntry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.session_id]) grouped[entry.session_id] = [];
    grouped[entry.session_id].push(entry);
  }
  return grouped;
}

/** Initialize the session tracker — call on app load */
export function initVaultSessionTracker(): void {
  const sessionId = getVaultSessionId();
  const metas = getVaultSessions();
  const existing = metas.find(m => m.id === sessionId);
  if (!existing || existing.entry_count === 0) {
    logWork("config", "Session started", `New work session began at ${new Date().toISOString()}`, [], ["session", "auto"]);
  }

  // Run periodic assessment
  const lastAssessment = localStorage.getItem(VAULT_ASSESSMENT_KEY);
  const shouldAssess = !lastAssessment ||
    (Date.now() - new Date(JSON.parse(lastAssessment).generated_at).getTime() > 5 * 60 * 1000);
  if (shouldAssess) {
    generateVaultAssessment();
  }

  // Track session pauses/resumes
  let wasHidden = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      wasHidden = true;
    } else if (wasHidden) {
      wasHidden = false;
      logWork("config", "Session resumed", "User returned to the app", [], ["session", "auto"]);
    }
  });

  // End session on page unload
  window.addEventListener("beforeunload", () => {
    endVaultSession();
  });
}
