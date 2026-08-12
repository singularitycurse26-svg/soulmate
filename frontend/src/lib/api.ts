const API_BASE = "";
const API_PORT = "";
const API_TOKEN = "soulmate_wallet_2024";

const isDev = import.meta.env.DEV;
const API_URL = isDev ? "" : `${API_BASE}`;


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

// OAuth endpoints (social login)
export const oauthApi = {
  start: (provider: string) => `${API_URL}/v1/auth/oauth/${provider}/start`,
  callback: (provider: string) => `${API_URL}/v1/auth/oauth/${provider}/callback`,
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
  googlePayDeposit: (amount: number, walletAddress: string) =>
    apiFetch("/v1/wallet/googlepay/deposit", {
      method: "POST",
      body: JSON.stringify({ amount, wallet_address: walletAddress }),
    }),
  cardDeposit: (amount: number, walletAddress: string, cardNumber: string, cardExpiry: string, cardCvc: string, saveCard?: boolean) =>
    apiFetch("/v1/wallet/card/deposit", {
      method: "POST",
      body: JSON.stringify({ amount, wallet_address: walletAddress, card_number: cardNumber, card_expiry: cardExpiry, card_cvc: cardCvc, save_card: saveCard || false }),
    }),
  getSavedCards: () => apiFetch("/v1/wallet/cards"),
  saveCard: (cardNumber: string, cardExpiry: string, cardCvc: string, label?: string) =>
    apiFetch("/v1/wallet/cards/save", {
      method: "POST",
      body: JSON.stringify({ card_number: cardNumber, card_expiry: cardExpiry, card_cvc: cardCvc, label }),
    }),
  deleteCard: (cardId: string) =>
    apiFetch(`/v1/wallet/cards/${cardId}`, { method: "DELETE" }),
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
  // Pachinko
  pachinkoDrop: (betAmount: number) =>
    apiFetch("/v1/games/pachinko/drop", {
      method: "POST",
      body: JSON.stringify({ bet_amount: betAmount }),
    }),
  pachinkoHistory: () => apiFetch("/v1/games/pachinko/history"),
  // INC Staking Tournament (4 quarters/year)
  tournamentStatus: () => apiFetch("/v1/games/tournament/status"),
  tournamentStake: (amount: number, txHash: string) =>
    apiFetch("/v1/games/tournament/stake", {
      method: "POST",
      body: JSON.stringify({ amount, tx_hash: txHash }),
    }),
  tournamentLeaderboard: () => apiFetch("/v1/games/tournament/leaderboard"),
  tournamentHistory: () => apiFetch("/v1/games/tournament/history"),
  // Game Rooms (live multiplayer)
  createRoom: (gameType: string, maxPlayers: number) =>
    apiFetch("/v1/games/rooms/create", {
      method: "POST",
      body: JSON.stringify({ game_type: gameType, max_players: maxPlayers }),
    }),
  listRooms: (gameType?: string) =>
    apiFetch(`/v1/games/rooms/list${gameType ? `?game_type=${gameType}` : ""}`),
  joinRoom: (roomId: string) =>
    apiFetch(`/v1/games/rooms/${roomId}/join`, { method: "POST" }),
  leaveRoom: (roomId: string) =>
    apiFetch(`/v1/games/rooms/${roomId}/leave`, { method: "POST" }),
  // Blackjack
  blackjackStart: (mode: string, betAmount: number) =>
    apiFetch("/v1/games/blackjack/start", {
      method: "POST",
      body: JSON.stringify({ mode, bet_amount: betAmount }),
    }),
  blackjackAction: (sessionId: number, action: string) =>
    apiFetch("/v1/games/blackjack/action", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, action }),
    }),
  // Texas Hold'em
  holdemStart: (mode: string, betAmount: number) =>
    apiFetch("/v1/games/holdem/start", {
      method: "POST",
      body: JSON.stringify({ mode, bet_amount: betAmount }),
    }),
  holdemAction: (sessionId: number, action: string, amount?: number) =>
    apiFetch("/v1/games/holdem/action", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, action, amount }),
    }),
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

// SMS / Texting API
export const smsApi = {
  status: () => apiFetch("/v1/sms/status"),
  carriers: () => apiFetch("/v1/sms/carriers"),
  send: (to_number: string, body: string, carrier: string, method: string) =>
    apiFetch("/v1/sms/send", {
      method: "POST",
      body: JSON.stringify({ to_number, body, carrier, method }),
    }),
  conversations: () => apiFetch("/v1/sms/conversations"),
  messages: (phone: string) => apiFetch(`/v1/sms/messages/${phone}`),
  subscribe: (tx_hash: string) =>
    apiFetch("/v1/sms/subscribe", {
      method: "POST",
      body: JSON.stringify({ tx_hash }),
    }),
  connectTelegram: () =>
    apiFetch("/v1/sms/telegram/connect", { method: "POST" }),
  // Profile
  getProfile: () => apiFetch("/v1/sms/profile"),
  saveProfile: (data: { first_name: string; last_name: string; phone_number: string; home_address: string; display_name_type: string; wallet_tag?: string }) =>
    apiFetch("/v1/sms/profile", { method: "POST", body: JSON.stringify(data) }),
};

// Voice / Walkie-Talkie API
export const voiceApi = {
  status: () => apiFetch("/v1/voice/status"),
  send: (channel: string, audio_data: string, duration_sec: number) =>
    apiFetch("/v1/voice/send", {
      method: "POST",
      body: JSON.stringify({ channel, audio_data, duration_sec }),
    }),
  messages: (channel: string = "general") => apiFetch(`/v1/voice/messages?channel=${channel}`),
  audio: (msgId: number) => apiFetch(`/v1/voice/audio/${msgId}`),
  delete: (msgId: number) =>
    apiFetch(`/v1/voice/${msgId}`, { method: "DELETE" }),
  subscribe: (tx_hash: string) =>
    apiFetch("/v1/voice/subscribe", {
      method: "POST",
      body: JSON.stringify({ tx_hash }),
    }),
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

// OpenClaw API
export const openclawApi = {
  llmProxy: (provider: string, model: string, messages: any[], apiKey?: string) =>
    fetch(`${API_URL}/v1/ai/openclaw-llm`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ provider, model, messages, api_key: apiKey }),
    }).then((r) => r.json()),
  browserProxy: (url: string) =>
    `${API_URL}/v1/browser/proxy?url=${encodeURIComponent(url)}`,
  browseUrl: (url: string) =>
    fetch(`${API_URL}/v1/browser/proxy?url=${encodeURIComponent(url)}`, {
      headers: getAuthHeaders(),
    }).then((r) => r.text()),
  terminalExec: (command: string, cwd?: string) =>
    fetch(`${API_URL}/v1/openclaw/terminal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ command, cwd }),
    }).then((r) => r.json()),
};

// Hermes Agent API
export const hermesApi = {
  llmProxy: (provider: string, model: string, messages: any[], apiKey?: string, ollamaUrl?: string) =>
    fetch(`${API_URL}/v1/ai/hermes-llm`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ provider, model, messages, api_key: apiKey, ollama_url: ollamaUrl }),
    }).then((r) => r.json()),
  autoLlm: (messages: any[], preferredProvider?: string) =>
    fetch(`${API_URL}/v1/ai/auto-llm`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ messages, preferred_provider: preferredProvider }),
    }).then((r) => r.json()),
  autoLlmStatus: () =>
    fetch(`${API_URL}/v1/ai/auto-llm-status`, {
      headers: getAuthHeaders(),
    }).then((r) => r.json()),
  browserProxy: (url: string) =>
    `${API_URL}/v1/browser/proxy?url=${encodeURIComponent(url)}`,
  browseUrl: (url: string) =>
    fetch(`${API_URL}/v1/browser/proxy?url=${encodeURIComponent(url)}`, {
      headers: getAuthHeaders(),
    }).then((r) => r.text()),
  terminalExec: (command: string, cwd?: string) =>
    fetch(`${API_URL}/v1/hermes/terminal`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ command, cwd }),
    }).then((r) => r.json()),
  cronList: () => apiFetch("/v1/hermes/cron"),
  cronAdd: (schedule: string, description: string) =>
    apiFetch("/v1/hermes/cron", { method: "POST", body: JSON.stringify({ schedule, description }) }),
  cronDelete: (id: string) =>
    apiFetch(`/v1/hermes/cron/${id}`, { method: "DELETE" }),
  subagentSpawn: (task: string) =>
    apiFetch("/v1/hermes/subagent", { method: "POST", body: JSON.stringify({ task }) }),
  subagentList: () => apiFetch("/v1/hermes/subagent"),
  sessionList: () => apiFetch("/v1/hermes/sessions"),
  sessionCreate: () =>
    apiFetch("/v1/hermes/sessions", { method: "POST" }),
  sessionSwitch: (id: string) =>
    apiFetch(`/v1/hermes/sessions/${id}/switch`, { method: "POST" }),
};

// incllmv2 API — uses same-origin relative URLs when served from incllmv2 server,
// falls back to localhost:8547 in dev mode
const INCLLMV2_BASE = isDev ? "http://localhost:8547" : "";

async function incllmv2Token(): Promise<string> {
  const existing = localStorage.getItem("incllmv2_token");
  if (existing) return existing;
  const r = await fetch(`${INCLLMV2_BASE}/v1/auth/auto`, {
    method: "POST",
  });
  const data = await r.json();
  if (!r.ok || data.status !== "ok") throw new Error(data.message || "incllmv2 auth failed");
  localStorage.setItem("incllmv2_token", data.token);
  return data.token;
}

async function incllmv2Fetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await incllmv2Token();
  const r = await fetch(`${INCLLMV2_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || data.message || `incllmv2 HTTP ${r.status}`);
  return data;
}

export const incllmv2Api = {
  chat: (message: string, model?: string) =>
    incllmv2Fetch("/v1/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message, model: model || "incllmv2" }),
    }),
  history: () => incllmv2Fetch("/v1/ai/history"),
  memories: () => incllmv2Fetch("/v1/ai/memory"),
  deleteMemory: (nodeId: string) =>
    incllmv2Fetch(`/v1/ai/memory/${encodeURIComponent(nodeId)}`, { method: "DELETE" }),
  clearMemories: () =>
    incllmv2Fetch("/v1/ai/memory/clear", { method: "POST" }),
  consolidateMemories: () =>
    incllmv2Fetch("/v1/ai/memory/consolidate", { method: "POST" }),
  storeMemory: (type: string, content: string, importance?: number) =>
    incllmv2Fetch("/v1/ai/memory", {
      method: "POST",
      body: JSON.stringify({ type, content, importance }),
    }),
  settings: () => incllmv2Fetch("/v1/ai/settings"),
  updateSettings: (data: any) =>
    incllmv2Fetch("/v1/ai/settings", { method: "POST", body: JSON.stringify(data) }),
  tools: () => incllmv2Fetch("/v1/ai/tools"),
  // Raw chat (direct harness, no /v1/ai wrapper)
  rawChat: async (sessionId: string, message: string, model?: string) => {
    const token = await incllmv2Token();
    const r = await fetch(`${INCLLMV2_BASE}/v1/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message, session_id: sessionId, model: model || "incllmv2" }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || data.message || "incllmv2 chat failed");
    return data;
  },
};

// --- Trill / Singularity / SplitBit LLM APIs ---
// All route through incllmv2 (port 8547) with a model parameter.
// incllmv2 handles the request using its RLOS+Ollama backend with
// LLM-specific system prompts. No separate servers needed.

function makeLlmApi(modelId: string) {
  return {
    chat: (message: string) =>
      incllmv2Fetch("/v1/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, model: modelId }),
      }),
    history: () => incllmv2Fetch("/v1/ai/history"),
    memories: () => incllmv2Fetch("/v1/ai/memory"),
    deleteMemory: (nodeId: string) =>
      incllmv2Fetch(`/v1/ai/memory/${encodeURIComponent(nodeId)}`, { method: "DELETE" }),
    clearMemories: () => incllmv2Fetch("/v1/ai/memory/clear", { method: "POST" }),
    consolidateMemories: () => incllmv2Fetch("/v1/ai/memory/consolidate", { method: "POST" }),
    storeMemory: (type: string, content: string, importance?: number) =>
      incllmv2Fetch("/v1/ai/memory", {
        method: "POST",
        body: JSON.stringify({ type, content, importance }),
      }),
    settings: () => incllmv2Fetch("/v1/ai/settings"),
    updateSettings: (data: any) =>
      incllmv2Fetch("/v1/ai/settings", { method: "POST", body: JSON.stringify(data) }),
    tools: () => incllmv2Fetch("/v1/ai/tools"),
    rawChat: async (sessionId: string, message: string) => {
      const token = await incllmv2Token();
      const r = await fetch(`${INCLLMV2_BASE}/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, session_id: sessionId, model: modelId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || data.message || `${modelId} chat failed`);
      return data;
    },
  };
}

export const trillApi = makeLlmApi("trill");
export const singularityApi = makeLlmApi("singularity");
export const splitbitApi = makeLlmApi("splitbit");

// Helper to get the right API based on model selection
export function getLlmApi(model: string) {
  switch (model) {
    case "trill": return trillApi;
    case "singularity": return singularityApi;
    case "splitbit": return splitbitApi;
    default: return incllmv2Api;
  }
}

// Social API (Soulmate Social)
export const socialApi = {
  // Posts
  createPost: (data: { text: string; image_url?: string; video_url?: string; privacy?: string }) =>
    apiFetch("/v1/social/posts", { method: "POST", body: JSON.stringify(data) }),
  getFeed: (page?: number) => apiFetch(`/v1/social/feed${page ? `?page=${page}` : ""}`),
  getPost: (id: number) => apiFetch(`/v1/social/posts/${id}`),
  deletePost: (id: number) => apiFetch(`/v1/social/posts/${id}`, { method: "DELETE" }),
  // Likes
  likePost: (id: number) => apiFetch(`/v1/social/posts/${id}/like`, { method: "POST" }),
  unlikePost: (id: number) => apiFetch(`/v1/social/posts/${id}/like`, { method: "DELETE" }),
  // Comments
  addComment: (postId: number, text: string) =>
    apiFetch(`/v1/social/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text }) }),
  getComments: (postId: number) => apiFetch(`/v1/social/posts/${postId}/comments`),
  deleteComment: (id: number) => apiFetch(`/v1/social/comments/${id}`, { method: "DELETE" }),
  // Friends
  sendFriendRequest: (userId: number) => apiFetch(`/v1/social/friends/${userId}`, { method: "POST" }),
  acceptFriendRequest: (userId: number) => apiFetch(`/v1/social/friends/${userId}/accept`, { method: "POST" }),
  rejectFriendRequest: (userId: number) => apiFetch(`/v1/social/friends/${userId}/reject`, { method: "POST" }),
  listFriends: () => apiFetch("/v1/social/friends"),
  listFriendRequests: () => apiFetch("/v1/social/friends/requests"),
  unfriend: (userId: number) => apiFetch(`/v1/social/friends/${userId}`, { method: "DELETE" }),
  // Profile
  getProfile: (userId?: number) => apiFetch(`/v1/social/profile/${userId || "me"}`),
  updateProfile: (data: { bio?: string; avatar?: string; cover?: string }) =>
    apiFetch("/v1/social/profile", { method: "PUT", body: JSON.stringify(data) }),
  getUserPosts: (userId: number) => apiFetch(`/v1/social/profile/${userId}/posts`),
  // Notifications
  getNotifications: () => apiFetch("/v1/social/notifications"),
  markNotificationRead: (id: number) => apiFetch(`/v1/social/notifications/${id}/read`, { method: "POST" }),
  // Search
  searchUsers: (q: string) => apiFetch(`/v1/social/search?q=${encodeURIComponent(q)}`),
  // DMs
  getDMs: () => apiFetch("/v1/social/messages"),
  sendDM: (userId: number, text: string, sourceLang?: string) =>
    apiFetch("/v1/social/messages", { method: "POST", body: JSON.stringify({ user_id: userId, text, source_lang: sourceLang }) }),
  getDMThread: (userId: number) => apiFetch(`/v1/social/messages/${userId}`),
  // Stories
  createStory: (imageUrl: string) =>
    apiFetch("/v1/social/stories", { method: "POST", body: JSON.stringify({ image_url: imageUrl }) }),
  getStories: () => apiFetch("/v1/social/stories"),
};

// Marketplace API
export const marketplaceApi = {
  createListing: (data: { title: string; description: string; price: string; currency: string; image_urls?: string[]; category?: string; condition?: string; location?: string }) =>
    apiFetch("/v1/marketplace/listings", { method: "POST", body: JSON.stringify(data) }),
  getListings: (params?: { category?: string; min_price?: string; max_price?: string; currency?: string; search?: string; sort?: string }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.min_price) query.set("min_price", params.min_price);
    if (params?.max_price) query.set("max_price", params.max_price);
    if (params?.currency) query.set("currency", params.currency);
    if (params?.search) query.set("search", params.search);
    if (params?.sort) query.set("sort", params.sort);
    const qs = query.toString();
    return apiFetch(`/v1/marketplace/listings${qs ? `?${qs}` : ""}`);
  },
  getListing: (id: number) => apiFetch(`/v1/marketplace/listings/${id}`),
  editListing: (id: number, data: any) => apiFetch(`/v1/marketplace/listings/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteListing: (id: number) => apiFetch(`/v1/marketplace/listings/${id}`, { method: "DELETE" }),
  buyListing: (id: number, paymentMethod: string) =>
    apiFetch(`/v1/marketplace/listings/${id}/buy`, { method: "POST", body: JSON.stringify({ payment_method: paymentMethod }) }),
  saveListing: (id: number) => apiFetch(`/v1/marketplace/listings/${id}/save`, { method: "POST" }),
  getSaved: () => apiFetch("/v1/marketplace/saved"),
  messageSeller: (id: number, text: string) =>
    apiFetch(`/v1/marketplace/listings/${id}/message`, { method: "POST", body: JSON.stringify({ text }) }),
  myListings: () => apiFetch("/v1/marketplace/my-listings"),
  myPurchases: () => apiFetch("/v1/marketplace/my-purchases"),
  googlePay: (id: number) =>
    apiFetch("/v1/marketplace/googlepay", { method: "POST", body: JSON.stringify({ listing_id: id }) }),
  getCategories: () => apiFetch("/v1/marketplace/categories"),
};

// Dating API
export const datingApi = {
  createProfile: (data: { bio: string; interests: string[]; age: number; gender: string; looking_for: string; photos: string[]; location?: string }) =>
    apiFetch("/v1/dating/profile", { method: "POST", body: JSON.stringify(data) }),
  getProfile: () => apiFetch("/v1/dating/profile"),
  updateProfile: (data: any) => apiFetch("/v1/dating/profile", { method: "PUT", body: JSON.stringify(data) }),
  getSuggestions: () => apiFetch("/v1/dating/suggestions"),
  likeUser: (userId: number) => apiFetch(`/v1/dating/like/${userId}`, { method: "POST" }),
  passUser: (userId: number) => apiFetch(`/v1/dating/pass/${userId}`, { method: "POST" }),
  superLikeUser: (userId: number) => apiFetch(`/v1/dating/superlike/${userId}`, { method: "POST" }),
  getMatches: () => apiFetch("/v1/dating/matches"),
  getMatchMessages: (userId: number) => apiFetch(`/v1/dating/matches/${userId}/messages`),
  sendMatchMessage: (userId: number, text: string, sourceLang?: string) =>
    apiFetch(`/v1/dating/matches/${userId}/messages`, { method: "POST", body: JSON.stringify({ text, source_lang: sourceLang }) }),
  unmatch: (userId: number) => apiFetch(`/v1/dating/matches/${userId}`, { method: "DELETE" }),
  getLikesYou: () => apiFetch("/v1/dating/likes-you"),
};

// Jarvis Voice API (isair/Jarvis backend + future STT/TTS providers)
export const jarvisApi = {
  // isair/Jarvis backend
  stt: async (audioBlob: Blob, baseUrl: string): Promise<string> => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");
    const resp = await fetch(`${baseUrl}/api/stt`, { method: "POST", body: formData });
    const data = await resp.json();
    return data.text || data.transcript || "";
  },
  tts: async (text: string, baseUrl: string, voice?: string): Promise<Blob> => {
    const params = new URLSearchParams({ text });
    if (voice) params.append("voice", voice);
    const resp = await fetch(`${baseUrl}/api/tts?${params}`);
    return resp.blob();
  },
  status: async (baseUrl: string): Promise<any> => {
    const resp = await fetch(`${baseUrl}/api/status`);
    return resp.json();
  },
  voices: async (baseUrl: string): Promise<any[]> => {
    const resp = await fetch(`${baseUrl}/api/voices`);
    return resp.json();
  },
  // Future: Whisper STT via backend
  whisperStt: async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");
    const resp = await fetch(`${API_URL}/v1/ai/whisper-stt`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: formData,
    });
    const data = await resp.json();
    return data.text || data.transcript || "";
  },
  // Future: OpenAI TTS
  openaiTts: async (text: string, voice: string, apiKey: string): Promise<Blob> => {
    const resp = await fetch(`${API_URL}/v1/ai/tts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, voice, api_key: apiKey, provider: "openai" }),
    });
    return resp.blob();
  },
  // Future: ElevenLabs TTS
  elevenlabsTts: async (text: string, voiceId: string, apiKey: string): Promise<Blob> => {
    const resp = await fetch(`${API_URL}/v1/ai/tts`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, voice: voiceId, api_key: apiKey, provider: "elevenlabs" }),
    });
    return resp.blob();
  },
};

// Translation API
export const translateApi = {
  translate: (text: string, targetLang: string, sourceLang?: string) =>
    apiFetch("/v1/translate", { method: "POST", body: JSON.stringify({ text, target_lang: targetLang, source_lang: sourceLang }) }),
  translateBatch: (messages: { id: number; text: string; source_lang?: string }[], targetLang: string) =>
    apiFetch("/v1/translate/batch", { method: "POST", body: JSON.stringify({ messages, target_lang: targetLang }) }),
  getLanguages: () => apiFetch("/v1/translate/languages"),
  setLanguage: (lang: string) =>
    apiFetch("/v1/user/language", { method: "POST", body: JSON.stringify({ language: lang }) }),
  getLanguage: () => apiFetch("/v1/user/language"),
  getUserLanguage: (userId: number) => apiFetch(`/v1/user/language/${userId}`),
};

// SoulTube API
export const soulTubeApi = {
  getTrending: (limit = 20) => apiFetch(`/v1/soultube/trending?limit=${limit}`),
  search: (q: string, limit = 20) => apiFetch(`/v1/soultube/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getVideo: (id: string) => apiFetch(`/v1/soultube/video/${id}`),
  getRecommendations: (id: string) => apiFetch(`/v1/soultube/recommendations/${id}`),
  getComments: (id: string, sort = "top", cursor?: string) =>
    apiFetch(`/v1/soultube/comments/${id}?sort=${sort}${cursor ? `&cursor=${cursor}` : ""}`),
  addComment: (id: string, text: string) =>
    apiFetch(`/v1/soultube/comments/${id}`, { method: "POST", body: JSON.stringify({ text }) }),
  likeVideo: (id: string) => apiFetch(`/v1/soultube/like/${id}`, { method: "POST" }),
  subscribe: (creatorId: string) => apiFetch(`/v1/soultube/subscribe/${creatorId}`, { method: "POST" }),
  unsubscribe: (creatorId: string) => apiFetch(`/v1/soultube/subscribe/${creatorId}`, { method: "DELETE" }),
  getChannel: (creatorId: string) => apiFetch(`/v1/soultube/channel/${creatorId}`),
  getAnalytics: () => apiFetch(`/v1/soultube/analytics`),
  getHistory: () => apiFetch(`/v1/soultube/history`),
  getStats: () => apiFetch(`/v1/soultube/stats`),
  uploadVideo: (formData: FormData) =>
    fetch(`${API_URL}/v1/soultube/upload`, {
      method: "POST",
      headers: { "X-API-Token": API_TOKEN, "X-Session-Token": localStorage.getItem("session_token") || "" },
      body: formData,
    }).then((r) => r.json()),
  getStreamUrl: (id: string, resolution = "720p") =>
    `${API_URL}/v1/soultube/stream/${id}?resolution=${resolution}`,
  getThumbnailUrl: (id: string) => `${API_URL}/v1/soultube/thumbnail/${id}`,
};

// SoulMovies API
export const soulMoviesApi = {
  create: (data: { text_description: string; style?: string; mode?: string; resolution?: string; duration_s?: number }) =>
    apiFetch("/v1/soulmovies/create", { method: "POST", body: JSON.stringify(data) }),
  getStatus: (id: string) => apiFetch(`/v1/soulmovies/status/${id}`),
  listProjects: () => apiFetch("/v1/soulmovies/list"),
  download: (id: string) => `${API_URL}/v1/soulmovies/download/${id}`,
  delete: (id: string) => apiFetch(`/v1/soulmovies/${id}`, { method: "DELETE" }),
  publish: (id: string) => apiFetch(`/v1/soulmovies/publish/${id}`, { method: "POST" }),
  getStyles: () => apiFetch("/v1/soulmovies/styles"),
  getStats: () => apiFetch("/v1/soulmovies/stats"),
};

// SoulIllusions API — connects to SoulIllusions Agent server (port 7869)
const SOULILLUSIONS_URL = isDev ? "http://localhost:7869" : "http://localhost:7869";

export const soulIllusionsApi = {
  // Text to Video
  createVideo: (data: { text_description: string; style?: string; resolution?: string; duration_s?: number }) =>
    fetch(`${SOULILLUSIONS_URL}/api/video/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  getVideoStatus: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/video/status/${id}`).then(r => r.json()),
  listVideos: () =>
    fetch(`${SOULILLUSIONS_URL}/api/video/list`).then(r => r.json()),
  downloadVideo: (id: string) => `${SOULILLUSIONS_URL}/api/video/download/${id}`,
  deleteVideo: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/video/${id}`, { method: "DELETE" }).then(r => r.json()),

  // Agents
  getAgentStatus: () =>
    fetch(`${SOULILLUSIONS_URL}/api/status`).then(r => r.json()),
  startAgent: (goal: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) }).then(r => r.json()),
  stopAgent: () =>
    fetch(`${SOULILLUSIONS_URL}/api/stop`, { method: "POST" }).then(r => r.json()),
  getSubAgentStatus: () =>
    fetch(`${SOULILLUSIONS_URL}/api/sub-agent/status`).then(r => r.json()),
  startSubAgent: (goal: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/sub-agent/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) }).then(r => r.json()),
  stopSubAgent: () =>
    fetch(`${SOULILLUSIONS_URL}/api/sub-agent/stop`, { method: "POST" }).then(r => r.json()),

  // Books
  listBooks: () =>
    fetch(`${SOULILLUSIONS_URL}/api/books`).then(r => r.json()),
  getBook: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/${id}`).then(r => r.json()),
  createBook: (data: { title: string; author?: string; genre?: string; description?: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  deleteBook: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/${id}`, { method: "DELETE" }).then(r => r.json()),
  addChapter: (bookId: string, data: { title: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/${bookId}/chapter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  writeChapter: (bookId: string, data: { chapter_id: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/${bookId}/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  continueChapter: (chapterId: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/chapter/${chapterId}/continue`, { method: "POST" }).then(r => r.json()),
  generateAudiobook: (bookId: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/books/${bookId}/audiobook`, { method: "POST" }).then(r => r.json()),
};

// SoulIllusions Agent API — chat, conversations, projects, config, agent control
// This is the AI brain that controls all of Soulmate OS
export const soulIllusionsAgentApi = {
  // Chat (OpenAI-compatible)
  chat: (messages: Array<{ role: string; content: string }>, model?: string) =>
    fetch(`${SOULILLUSIONS_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model || "dolphin-mistral:latest", messages, max_tokens: 2000, temperature: 0.7 }),
    }).then(r => r.json()),

  // Conversations (persistent)
  listConversations: () =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations`).then(r => r.json()),
  createConversation: (data: { title: string; model?: string; project_id?: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  getConversation: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations/${id}`).then(r => r.json()),
  deleteConversation: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations/${id}`, { method: "DELETE" }).then(r => r.json()),
  updateConversation: (id: string, data: { title?: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  addMessage: (convId: string, data: { role: string; content: string; tokens?: number }) =>
    fetch(`${SOULILLUSIONS_URL}/api/conversations/${convId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),

  // Projects
  listProjects: () =>
    fetch(`${SOULILLUSIONS_URL}/api/projects`).then(r => r.json()),
  createProject: (data: { name: string; description?: string }) =>
    fetch(`${SOULILLUSIONS_URL}/api/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),
  deleteProject: (id: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/projects/${id}`, { method: "DELETE" }).then(r => r.json()),

  // Agent Control
  getStatus: () =>
    fetch(`${SOULILLUSIONS_URL}/api/status`).then(r => r.json()),
  startAgent: (goal?: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) }).then(r => r.json()),
  stopAgent: () =>
    fetch(`${SOULILLUSIONS_URL}/api/stop`, { method: "POST" }).then(r => r.json()),
  setGoal: (goal: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/goal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) }).then(r => r.json()),
  sendPrompt: (prompt: string) =>
    fetch(`${SOULILLUSIONS_URL}/api/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) }).then(r => r.json()),

  // Config
  getConfig: () =>
    fetch(`${SOULILLUSIONS_URL}/api/config`).then(r => r.json()),
  updateConfig: (data: any) =>
    fetch(`${SOULILLUSIONS_URL}/api/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(r => r.json()),

  // Models
  getModels: () =>
    fetch(`${SOULILLUSIONS_URL}/api/models`).then(r => r.json()),
};
