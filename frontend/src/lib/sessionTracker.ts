/**
 * Session Tracker — Background OS system that catalogs work done during sessions,
 * stores it in the vault, and generates assessments for what to tackle next.
 *
 * Runs silently in the background. Logs are viewable from the Session Journal page.
 */

const VAULT_KEY = "soulmate_session_journal";
const ACTIVE_KEY = "soulmate_session_active";
const MAX_ENTRIES = 200;

export interface SessionEntry {
  id: string;
  timestamp: string;
  category: "feature" | "fix" | "refactor" | "deployment" | "config" | "research" | "ui" | "security";
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

export interface SessionAssessment {
  generated_at: string;
  total_sessions: number;
  total_entries: number;
  categories_covered: string[];
  last_worked_on: string;
  suggestions: AssessmentSuggestion[];
}

export interface AssessmentSuggestion {
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  reason: string;
}

/** Generate a unique ID */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Get or create the current session ID */
function getSessionId(): string {
  let id = localStorage.getItem(ACTIVE_KEY);
  if (!id) {
    id = `session-${genId()}`;
    localStorage.setItem(ACTIVE_KEY, id);
    // Record session start
    const meta: SessionMeta = {
      id,
      started_at: new Date().toISOString(),
      entry_count: 0,
      summary: "",
    };
    const metas = getSessions();
    metas.push(meta);
    safeSave(metas, "soulmate_session_metas");
  }
  return id;
}

/** Safely save to localStorage with quota handling */
function safeSave(data: any, key: string = VAULT_KEY): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch {
    // Prune oldest entries
    try {
      if (Array.isArray(data)) {
        const trimmed = data.slice(-Math.floor(MAX_ENTRIES / 2));
        localStorage.setItem(key, JSON.stringify(trimmed));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
}

/** Get all journal entries */
export function getEntries(): SessionEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VAULT_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Get all session metas */
export function getSessions(): SessionMeta[] {
  try {
    return JSON.parse(localStorage.getItem("soulmate_session_metas") || "[]");
  } catch {
    return [];
  }
}

/** Log a work entry — call this whenever something is done */
export function logWork(
  category: SessionEntry["category"],
  title: string,
  description: string,
  files: string[] = [],
  tags: string[] = []
): void {
  const sessionId = getSessionId();
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

  const entries = getEntries();
  entries.push(entry);

  // Enforce max entries
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }

  safeSave(entries);

  // Update session meta
  const metas = getSessions();
  const metaIdx = metas.findIndex(m => m.id === sessionId);
  if (metaIdx >= 0) {
    metas[metaIdx].entry_count++;
    metas[metaIdx].summary = `${metas[metaIdx].entry_count} entries — latest: ${title}`;
    safeSave(metas, "soulmate_session_metas");
  }
}

/** End the current session */
export function endSession(): void {
  const sessionId = localStorage.getItem(ACTIVE_KEY);
  if (!sessionId) return;

  const metas = getSessions();
  const idx = metas.findIndex(m => m.id === sessionId);
  if (idx >= 0) {
    metas[idx].ended_at = new Date().toISOString();
    safeSave(metas, "soulmate_session_metas");
  }

  localStorage.removeItem(ACTIVE_KEY);
}

/** Generate an assessment of what needs to be done next */
export function generateAssessment(): SessionAssessment {
  const entries = getEntries();
  const sessions = getSessions();

  const categoriesCovered = [...new Set(entries.map(e => e.category))];
  const lastEntry = entries[entries.length - 1];
  const lastWorkedOn = lastEntry ? lastEntry.title : "Nothing yet";

  // Analyze patterns and generate suggestions
  const suggestions: AssessmentSuggestion[] = [];

  // Check if deployment was done recently
  const hasDeployment = entries.some(e => e.category === "deployment");
  const lastDeployment = entries.filter(e => e.category === "deployment").pop();
  const recentEntries = entries.filter(e => {
    const age = Date.now() - new Date(e.timestamp).getTime();
    return age < 24 * 60 * 60 * 1000; // last 24 hours
  });

  if (!hasDeployment) {
    suggestions.push({
      priority: "high",
      category: "deployment",
      title: "Deploy changes to production",
      reason: "No deployments logged yet — changes may not be live",
    });
  }

  // Check for unfinished work (features without follow-up)
  const featureEntries = entries.filter(e => e.category === "feature");
  const fixEntries = entries.filter(e => e.category === "fix");

  // Check if YouTube video posting has backend support
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

  // Check if fingerprint gate was tested
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

  // Check if dead code was cleaned up
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

  // Check for landing page work
  suggestions.push({
    priority: "medium",
    category: "feature",
    title: "Review soulmateos-landing project",
    reason: "Landing page project exists at soulmateos-landing but hasn't been worked on this session",
  });

  // General suggestions based on patterns
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

  // Check for untested features
  const uiEntries = entries.filter(e => e.category === "ui");
  if (uiEntries.length > 0) {
    suggestions.push({
      priority: "medium",
      category: "feature",
      title: "Test all UI buttons on mobile device",
      reason: `${uiEntries.length} UI changes made — verify on actual mobile for responsiveness`,
    });
  }

  // Session gap analysis
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

  return {
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
}

/** Clear all journal data */
export function clearJournal(): void {
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem("soulmate_session_metas");
  localStorage.removeItem(ACTIVE_KEY);
}

/** Get entries grouped by session */
export function getEntriesBySession(): Record<string, SessionEntry[]> {
  const entries = getEntries();
  const grouped: Record<string, SessionEntry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.session_id]) grouped[entry.session_id] = [];
    grouped[entry.session_id].push(entry);
  }
  return grouped;
}

/** Auto-log common app events in background */
export function initSessionTracker(): void {
  const sessionId = getSessionId();

  // Log session start
  const metas = getSessions();
  const existing = metas.find(m => m.id === sessionId);
  if (!existing || existing.entry_count === 0) {
    logWork("config", "Session started", `New work session began at ${new Date().toISOString()}`, [], ["session", "auto"]);
  }

  // Set up periodic auto-assessment (every 5 minutes)
  const assessmentKey = "soulmate_last_assessment";
  const lastAssessment = localStorage.getItem(assessmentKey);
  const shouldAssess = !lastAssessment ||
    (Date.now() - new Date(lastAssessment).getTime() > 5 * 60 * 1000);

  if (shouldAssess) {
    const assessment = generateAssessment();
    localStorage.setItem(assessmentKey, JSON.stringify(assessment));
  }

  // Log page visibility changes (session pauses/resumes)
  let wasHidden = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      wasHidden = true;
    } else if (wasHidden) {
      wasHidden = false;
      logWork("config", "Session resumed", "User returned to the app", [], ["session", "auto"]);
    }
  });

  // Log session end on page unload
  window.addEventListener("beforeunload", () => {
    endSession();
  });
}
