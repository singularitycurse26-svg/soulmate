const API_BASE = "http://191.44.121.29";
const API_PORT = "8546";
const API_TOKEN = "soulmate_wallet_2024";

const isDev = import.meta.env.DEV;
const API_URL = isDev ? "" : `${API_BASE}:${API_PORT}`;


export { API_BASE, API_URL, API_TOKEN };

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Token": API_TOKEN,
  };
  const token = localStorage.getItem("session_token");
  if (token) headers["X-Session-Token"] = token;
  return headers;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  try {
    const resp = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...getAuthHeaders(), ...options.headers },
    });
    if (!resp.ok) {
      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.detail || json.message || `HTTP ${resp.status}`);
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(text || `HTTP ${resp.status}`);
        throw e;
      }
    }
    return resp.json();
  } catch (e: any) {
    if (e instanceof TypeError && e.message.includes("fetch")) {
      throw new Error("Cannot connect to Soulmate OS server. Check your connection.");
    }
    throw e;
  }
}

// Auth API
export const authApi = {
  signup: (email: string, password: string) =>
    apiFetch("/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  checkSession: () => apiFetch("/v1/auth/session"),

  saveWallet: (walletKeyEncrypted: string, walletAddress: string) =>
    apiFetch("/v1/auth/wallet/save", {
      method: "POST",
      body: JSON.stringify({
        wallet_key_encrypted: walletKeyEncrypted,
        wallet_address: walletAddress,
      }),
    }),

  getWallet: () => apiFetch("/v1/auth/wallet/get"),

  webauthnRegisterBegin: () =>
    apiFetch("/v1/auth/webauthn/register/begin", { method: "POST" }),

  webauthnRegisterComplete: (credentialId: string, publicKey: string, signCount: number) =>
    apiFetch("/v1/auth/webauthn/register/complete", {
      method: "POST",
      body: JSON.stringify({
        credential_id: credentialId,
        public_key: publicKey,
        sign_count: signCount,
      }),
    }),

  webauthnAuthBegin: (email: string) =>
    apiFetch("/v1/auth/webauthn/auth/begin", {
      method: "POST",
      headers: { "X-Email": email },
    }),

  webauthnAuthComplete: (credentialId: string, signCount: number) =>
    apiFetch("/v1/auth/webauthn/auth/complete", {
      method: "POST",
      body: JSON.stringify({
        credential_id: credentialId,
        sign_count: signCount,
      }),
    }),
};

// Wallet API
export const walletApi = {
  health: () => apiFetch("/v1/health"),
  balance: (address: string) =>
    apiFetch(`/v1/balance/${address}`),
  send: (to: string, amount: string, token: string, from: string) =>
    apiFetch("/v1/send", {
      method: "POST",
      body: JSON.stringify({ to, amount, token, from }),
    }),
  resolveTag: (tag: string) =>
    apiFetch(`/v1/tag/resolve/${tag.replace("@", "")}`),
};

// Games API
export const gamesApi = {
  coinBalance: () => apiFetch("/v1/games/coins/balance"),
  refillCoins: () => apiFetch("/v1/games/coins/refill", { method: "POST" }),
  highlowStart: () => apiFetch("/v1/games/highlow/start", { method: "POST" }),
  highlowBet: (sessionId: number, bet: "higher" | "lower", amount: number) =>
    apiFetch("/v1/games/highlow/bet", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, bet, amount }),
    }),
  highlowEnd: (sessionId: number, action: "walk" | "stake") =>
    apiFetch(`/v1/games/highlow/${sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  highlowLeaderboard: () => apiFetch("/v1/games/highlow/leaderboard"),
  crapsRooms: () => apiFetch("/v1/games/craps/rooms"),
  crapsJoin: (roomId: number) =>
    apiFetch(`/v1/games/craps/rooms/${roomId}/join`, { method: "POST" }),
  crapsBet: (roomId: number, betType: string, amount: number, extra?: any) =>
    apiFetch(`/v1/games/craps/rooms/${roomId}/bet`, {
      method: "POST",
      body: JSON.stringify({ bet_type: betType, bet_amount: amount, ...extra }),
    }),
  crapsRoll: (roomId: number) =>
    apiFetch(`/v1/games/craps/rooms/${roomId}/roll`, { method: "POST" }),
  crapsState: (roomId: number) => apiFetch(`/v1/games/craps/rooms/${roomId}/state`),
};

// Contacts API
export const contactsApi = {
  list: () => apiFetch("/v1/contacts"),
  create: (data: { name: string; email?: string; phone?: string; wallet_address?: string; notes?: string; group_id?: number }) =>
    apiFetch("/v1/contacts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: any) =>
    apiFetch(`/v1/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch(`/v1/contacts/${id}`, { method: "DELETE" }),
  groups: () => apiFetch("/v1/contacts/groups"),
  createGroup: (name: string, color: string) =>
    apiFetch("/v1/contacts/groups", { method: "POST", body: JSON.stringify({ name, color }) }),
  import: (contacts: any[]) =>
    apiFetch("/v1/contacts/import", { method: "POST", body: JSON.stringify({ contacts }) }),
};

// Subscription API
export const subscriptionApi = {
  get: () => apiFetch("/v1/subscription"),
  tiers: () => apiFetch("/v1/subscription/tiers"),
  upgrade: (txHash: string, tier: string) =>
    apiFetch("/v1/subscription/upgrade", { method: "POST", body: JSON.stringify({ tx_hash: txHash, tier }) }),
};

// Email API
export const emailApi = {
  setup: () => apiFetch("/v1/email/setup", { method: "POST" }),
  account: () => apiFetch("/v1/email/account"),
  inbox: () => apiFetch("/v1/email/inbox"),
  read: (id: number) => apiFetch(`/v1/email/${id}`),
  send: (to: string, subject: string, body: string) =>
    apiFetch("/v1/email/send", { method: "POST", body: JSON.stringify({ to, subject, body }) }),
};

// AI API
export const aiApi = {
  chat: (message: string) =>
    apiFetch("/v1/ai/chat", { method: "POST", body: JSON.stringify({ message }) }),
  history: () => apiFetch("/v1/ai/history"),
  memories: () => apiFetch("/v1/ai/memory"),
  deleteMemory: (id: number) =>
    apiFetch(`/v1/ai/memory/${id}`, { method: "DELETE" }),
  clearMemories: () =>
    apiFetch("/v1/ai/memory/clear", { method: "POST" }),
  consolidateMemories: () =>
    apiFetch("/v1/ai/memory/consolidate", { method: "POST" }),
  storeMemory: (type: string, content: string, importance?: number) =>
    apiFetch("/v1/ai/memory", { method: "POST", body: JSON.stringify({ type, content, importance }) }),
  settings: () => apiFetch("/v1/ai/settings"),
  updateSettings: (data: any) =>
    apiFetch("/v1/ai/settings", { method: "POST", body: JSON.stringify(data) }),
  tools: () => apiFetch("/v1/ai/tools"),
};
