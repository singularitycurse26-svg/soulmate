// Aceline CLI — API client for incllmv2 backend
// Same endpoint as the web overlay: localhost:8547/v1/ai/jarvis

const INCLLMV2_BASE = process.env.INCLLMV2_BASE || "http://localhost:8547";

let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const resp = await fetch(`${INCLLMV2_BASE}/v1/auth/auto`, {
      method: "POST",
    });
    const data = await resp.json() as any;
    if (!resp.ok || data.status !== "ok") {
      throw new Error(data.message || "auth failed");
    }
    cachedToken = data.token;
    return cachedToken!;
  } catch (e) {
    throw new Error(`Cannot connect to incllmv2 at ${INCLLMV2_BASE}. Is the backend running?`);
  }
}

export interface JarvisContext {
  agent?: string;
  source?: string;
  page?: string;
  pageContext?: string;
  personality?: string;
}

export async function jarvisChat(
  message: string,
  model: string,
  context: JarvisContext,
): Promise<string> {
  const token = await getToken();
  const resp = await fetch(`${INCLLMV2_BASE}/v1/ai/jarvis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message,
      model: model || "dolphin-mistral:latest",
      context,
    }),
  });
  const data = await resp.json() as any;
  if (!resp.ok) throw new Error(data.detail || data.message || `HTTP ${resp.status}`);
  return data.response || "No response";
}

export async function checkBackend(): Promise<boolean> {
  try {
    const resp = await fetch(`${INCLLMV2_BASE}/v1/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function getModels(): Promise<string[]> {
  try {
    const token = await getToken();
    const resp = await fetch(`${INCLLMV2_BASE}/v1/ai/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await resp.json() as any;
    if (data.models) return data.models.map((m: any) => m.name || m.id || m);
    if (Array.isArray(data)) return data.map((m: any) => m.name || m.id || m);
    return [];
  } catch {
    return [];
  }
}

// ── Auto-Invention API ────────────────────────────────────────────────

export async function autoInventState(): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/state`, {
    signal: AbortSignal.timeout(5000),
  });
  return resp.json();
}

export async function autoInventToggle(enabled: boolean): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/auto-mode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  return resp.json();
}

export async function autoInventRun(): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/run`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
  return resp.json();
}

export async function autoInventFramework(): Promise<any> {
  const resp = await fetch(`${INCLLMV2_BASE}/v1/auto-invention/framework`, {
    signal: AbortSignal.timeout(5000),
  });
  return resp.json();
}
