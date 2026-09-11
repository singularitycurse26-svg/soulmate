import { create } from "zustand";
import type { AppPage } from "@/lib/store";

export interface AcelineMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: number;
  location: AppPage | "standby";
  actions?: string[];
}

export interface AcelineMemoryEntry {
  id: string;
  key: string;
  value: string;
  location: string;
  timestamp: number;
  type: "page-api" | "fact" | "context" | "action-log";
}

export interface AcelineHistoryEntry {
  page: AppPage;
  timestamp: number;
  actionsTaken: string[];
}

interface AcelineState {
  // Core state
  active: boolean;
  location: AppPage | "standby";
  model: string;
  voiceEnabled: boolean;

  // Position/size (persisted)
  position: { x: number; y: number };
  size: { w: number; h: number };

  // Conversation
  messages: AcelineMessage[];

  // Memory
  memory: AcelineMemoryEntry[];

  // Travel history
  history: AcelineHistoryEntry[];

  // Actions
  dispatch: (page: AppPage) => void;
  recall: () => void;
  toggle: () => void;
  setModel: (model: string) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setPosition: (pos: { x: number; y: number }) => void;
  setSize: (size: { w: number; h: number }) => void;
  addMessage: (msg: Omit<AcelineMessage, "id" | "timestamp">) => void;
  clearMessages: () => void;
  addMemory: (entry: Omit<AcelineMemoryEntry, "id" | "timestamp">) => void;
  getMemory: (key: string) => AcelineMemoryEntry | undefined;
  logAction: (page: AppPage, action: string) => void;
}

const STORAGE_KEY = "aceline_state_v1";

function loadPersisted(): Partial<AcelineState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      model: data.model || "trill",
      voiceEnabled: data.voiceEnabled ?? true,
      position: data.position || { x: window.innerWidth - 380, y: 80 },
      size: data.size || { w: 360, h: 520 },
      memory: data.memory || [],
      history: data.history || [],
    };
  } catch {
    return {
      model: "trill",
      voiceEnabled: true,
      position: { x: typeof window !== "undefined" ? window.innerWidth - 380 : 100, y: 80 },
      size: { w: 360, h: 520 },
      memory: [],
      history: [],
    };
  }
}

function persist(state: Partial<AcelineState>) {
  try {
    const toSave = {
      model: state.model,
      voiceEnabled: state.voiceEnabled,
      position: state.position,
      size: state.size,
      memory: state.memory,
      history: state.history,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAcelineStore = create<AcelineState>((set, get) => {
  const persisted = loadPersisted();

  return {
    active: false,
    location: "standby",
    model: persisted.model || "trill",
    voiceEnabled: persisted.voiceEnabled ?? true,
    position: persisted.position || { x: 100, y: 80 },
    size: persisted.size || { w: 360, h: 520 },
    messages: [],
    memory: persisted.memory || [],
    history: persisted.history || [],

    dispatch: (page) => {
      set({ active: true, location: page });
      get().addMessage({
        role: "ai",
        text: `Aceline has arrived at ${page}. I can see the page and its registered actions. What do you need?`,
        location: page,
      });
      const history = get().history;
      set({
        history: [{ page, timestamp: Date.now(), actionsTaken: [] }, ...history].slice(0, 50),
      });
      persist({ ...get(), history: get().history });
    },

    recall: () => {
      set({ active: false, location: "standby" });
    },

    toggle: () => {
      const { active, location } = get();
      if (active) {
        get().recall();
      } else {
        // Re-dispatch to last location or standby
        const lastPage = get().history[0]?.page || "dashboard";
        get().dispatch(location === "standby" ? lastPage : location);
      }
    },

    setModel: (model) => {
      set({ model });
      persist({ ...get(), model });
    },

    setVoiceEnabled: (enabled) => {
      set({ voiceEnabled: enabled });
      persist({ ...get(), voiceEnabled: enabled });
    },

    setPosition: (pos) => {
      set({ position: pos });
      persist({ ...get(), position: pos });
    },

    setSize: (size) => {
      set({ size });
      persist({ ...get(), size });
    },

    addMessage: (msg) => {
      const newMsg: AcelineMessage = {
        ...msg,
        id: genId(),
        timestamp: Date.now(),
      };
      set((s) => ({ messages: [...s.messages, newMsg].slice(-100) }));
    },

    clearMessages: () => set({ messages: [] }),

    addMemory: (entry) => {
      const newEntry: AcelineMemoryEntry = {
        ...entry,
        id: genId(),
        timestamp: Date.now(),
      };
      set((s) => {
        // Replace existing entry with same key
        const filtered = s.memory.filter((m) => m.key !== entry.key);
        const memory = [newEntry, ...filtered].slice(0, 500);
        persist({ ...get(), memory });
        return { memory };
      });
    },

    getMemory: (key) => {
      return get().memory.find((m) => m.key === key);
    },

    logAction: (page, action) => {
      set((s) => {
        const history = [...s.history];
        const entry = history.find((h) => h.page === page);
        if (entry) {
          entry.actionsTaken.push(action);
        }
        persist({ ...get(), history });
        return { history };
      });
    },
  };
});
