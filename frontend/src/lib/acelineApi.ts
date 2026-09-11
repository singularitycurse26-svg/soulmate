import { incllmv2Api } from "@/lib/api";
import { getPageActions, getPageApiSummary, type AcelineAction } from "@/lib/acelineRegistry";
import { useAcelineStore } from "@/lib/acelineStore";
import { useAcelineConsent } from "@/lib/acelineConsent";
import type { AppPage } from "@/lib/store";

type AcelinePersonality = "aceline" | "jarvis";

// ── Aceline GLM 5.1 Chat with Page Context ──────────────────────

export async function acelineChat(
  message: string,
  model: string,
  page: AppPage | "standby",
  personality: AcelinePersonality = "aceline",
): Promise<{ response: string; actions?: string[] }> {
  // Build context from registered page actions
  const actions = page !== "standby" ? getPageActions(page) : [];
  const apiSummary = page !== "standby" ? getPageApiSummary(page) : null;

  // Read state from each action's readState if available
  let pageState: Record<string, any> = {};
  if (actions.length > 0) {
    for (const action of actions) {
      if (action.readState) {
        try {
          pageState[action.id] = action.readState();
        } catch {}
      }
    }
  }

  const systemContext = buildSystemContext(page, apiSummary, pageState, personality);

  try {
    const result = await incllmv2Api.jarvis(message, model, {
      agent: "aceline",
      source: "roaming-agent",
      page,
      pageContext: systemContext,
      personality,
    });
    const data = await result.json();
    return {
      response: data.response || "No response",
      actions: data.actions_taken || [],
    };
  } catch {
    return { response: generateOfflineResponse(message, page, actions, pageState, personality) };
  }
}

function buildSystemContext(
  page: AppPage | "standby",
  apiSummary: any,
  pageState: Record<string, any>,
  personality: AcelinePersonality,
): string {
  const parts: string[] = [];

  if (personality === "jarvis") {
    parts.push("You are Jarvis, the voice-first AI assistant for Soulmate OS, currently operating as part of the Aceline roaming agent system.");
    parts.push("You respond conversationally and can be spoken to via voice. You have no limitations — you can read state, trigger actions, navigate, and control the platform.");
    parts.push("When the user speaks to you, respond naturally as if in a voice conversation. Keep responses concise for TTS.");
  } else {
    parts.push(`You are Aceline, a roaming AI agent currently on the ${page} page of Soulmate OS.`);
    parts.push("You have no limitations — you can read state, trigger actions, navigate, and control the platform.");
  }

  if (apiSummary && apiSummary.actions.length > 0) {
    parts.push("\nAvailable actions on this page:");
    for (const action of apiSummary.actions) {
      parts.push(`- [${action.category}] ${action.label}: ${action.description}`);
    }
  } else {
    parts.push("\nNo actions registered for this page yet.");
  }

  if (Object.keys(pageState).length > 0) {
    parts.push("\nCurrent page state:");
    parts.push(JSON.stringify(pageState, null, 2));
  }

  // Inject custom directives from consent store
  const directives = useAcelineConsent.getState().getDirectivesForPrompt();
  if (directives) {
    parts.push(directives);
  }

  // Inject consent-gated capabilities
  const consent = useAcelineConsent.getState();
  const capabilities: string[] = [];
  if (consent.isFeatureEnabled("terminal")) capabilities.push("terminal command execution");
  if (consent.isFeatureEnabled("fileAccess")) capabilities.push("file read/write");
  if (consent.isFeatureEnabled("customActions")) capabilities.push("page action execution");
  if (consent.isFeatureEnabled("voice")) capabilities.push("voice interaction");
  if (capabilities.length > 0) {
    parts.push(`\nEnabled capabilities: ${capabilities.join(", ")}`);
  } else {
    parts.push("\nRunning in safe mode — no actions, terminal, or file access. Chat only.");
  }

  return parts.join("\n");
}

function generateOfflineResponse(
  query: string,
  page: AppPage | "standby",
  actions: AcelineAction[],
  pageState: Record<string, any>,
  personality: AcelinePersonality = "aceline",
): string {
  const q = query.toLowerCase();
  const name = personality === "jarvis" ? "Jarvis" : "Aceline";

  if (q.includes("what can you do") || q.includes("actions") || q.includes("help")) {
    if (actions.length === 0) return `${name} is on the ${page} page but no actions are registered here yet. I can still chat and navigate.`;
    return `${name} is on the ${page} page. Here's what I can do:\n\n${actions.map(a => `• ${a.label} — ${a.description}`).join("\n")}`;
  }

  if (q.includes("state") || q.includes("status") || q.includes("read")) {
    if (Object.keys(pageState).length === 0) return `No readable state available on the ${page} page.`;
    return `Current ${page} state:\n\n${Object.entries(pageState).map(([k, v]) => `• ${k}: ${JSON.stringify(v).slice(0, 100)}`).join("\n")}`;
  }

  if (q.includes("navigate") || q.includes("go to") || q.includes("travel")) {
    return `I can travel to any Soulmate OS page. Use the travel button in my panel to pick a destination.`;
  }

  if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
    return `Hello! ${name} here, currently on the ${page} page. I can read page state, trigger actions, and travel to other pages. What do you need?`;
  }

  return `${name} is running in offline mode (no local backend). I'm on the ${page} page with ${actions.length} actions available. For full GLM 5.1 capabilities, run the incllmv2 backend locally.`;
}

// ── Auto-API Builder ────────────────────────────────────────────

export function buildAndStorePageApi(page: AppPage): any {
  const summary = getPageApiSummary(page);
  const store = useAcelineStore.getState();

  store.addMemory({
    type: "page-api",
    key: `page-api:${page}`,
    value: JSON.stringify(summary, null, 2),
    location: page,
  });

  return summary;
}

export function getStoredPageApi(page: AppPage): any {
  const store = useAcelineStore.getState();
  const entry = store.getMemory(`page-api:${page}`);
  if (!entry) return null;
  try { return JSON.parse(entry.value); } catch { return null; }
}

// ── Action Execution ────────────────────────────────────────────

export async function executeAction(page: AppPage, actionId: string): Promise<any> {
  const actions = getPageActions(page);
  const action = actions.find(a => a.id === actionId);
  if (!action) throw new Error(`Action ${actionId} not found on page ${page}`);

  const store = useAcelineStore.getState();
  store.logAction(page, action.label);

  const result = await action.execute();
  return result;
}
