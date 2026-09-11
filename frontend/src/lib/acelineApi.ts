import { incllmv2Api } from "@/lib/api";
import { getPageActions, getPageApiSummary, type AcelineAction } from "@/lib/acelineRegistry";
import { useAcelineStore } from "@/lib/acelineStore";
import type { AppPage } from "@/lib/store";

// ── Aceline GLM 5.1 Chat with Page Context ──────────────────────

export async function acelineChat(
  message: string,
  model: string,
  page: AppPage | "standby"
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

  const systemContext = buildSystemContext(page, apiSummary, pageState);

  try {
    const result = await incllmv2Api.jarvis(message, model, {
      agent: "aceline",
      source: "roaming-agent",
      page,
      pageContext: systemContext,
    });
    const data = await result.json();
    return {
      response: data.response || "No response",
      actions: data.actions_taken || [],
    };
  } catch {
    return { response: generateOfflineResponse(message, page, actions, pageState) };
  }
}

function buildSystemContext(
  page: AppPage | "standby",
  apiSummary: any,
  pageState: Record<string, any>
): string {
  const parts: string[] = [];
  parts.push(`You are Aceline, a roaming AI agent currently on the ${page} page of Soulmate OS.`);
  parts.push("You have no limitations — you can read state, trigger actions, navigate, and control the platform.");

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

  return parts.join("\n");
}

function generateOfflineResponse(
  query: string,
  page: AppPage | "standby",
  actions: AcelineAction[],
  pageState: Record<string, any>
): string {
  const q = query.toLowerCase();

  if (q.includes("what can you do") || q.includes("actions") || q.includes("help")) {
    if (actions.length === 0) return `I'm on the ${page} page but no actions are registered here yet. I can still chat and navigate.`;
    return `I'm on the ${page} page. Here's what I can do:\n\n${actions.map(a => `• ${a.label} — ${a.description}`).join("\n")}`;
  }

  if (q.includes("state") || q.includes("status") || q.includes("read")) {
    if (Object.keys(pageState).length === 0) return `No readable state available on the ${page} page.`;
    return `Current ${page} state:\n\n${Object.entries(pageState).map(([k, v]) => `• ${k}: ${JSON.stringify(v).slice(0, 100)}`).join("\n")}`;
  }

  if (q.includes("navigate") || q.includes("go to") || q.includes("travel")) {
    return `I can travel to any Soulmate OS page. Use the travel button in my panel to pick a destination.`;
  }

  if (q.includes("hello") || q.includes("hi") || q.includes("hey")) {
    return `Hello! I'm Aceline, currently on the ${page} page. I can read page state, trigger actions, and travel to other pages. What do you need?`;
  }

  return `I'm running in offline mode (no local backend). I'm on the ${page} page with ${actions.length} actions available. For full GLM 5.1 capabilities, run the incllmv2 backend locally.`;
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
