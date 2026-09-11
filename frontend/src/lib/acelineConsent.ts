import { create } from "zustand";

export type ConsentFeature =
  | "voice"
  | "wallet"
  | "glmBackend"
  | "terminal"
  | "fileAccess"
  | "autoApi"
  | "browserExtension"
  | "customActions";

export const CONSENT_FEATURE_LABELS: Record<ConsentFeature, { label: string; description: string; icon: string }> = {
  voice: { label: "Voice / Jarvis", description: "Speech recognition + text-to-speech. Talk to Aceline or Jarvis by voice.", icon: "Mic" },
  wallet: { label: "Wallet Access", description: "Read Incentives wallet address and balance. Wallet is always present.", icon: "Wallet" },
  glmBackend: { label: "GLM 5.1 Backend", description: "Connect to local incllmv2 backend for full AI capabilities.", icon: "Cpu" },
  terminal: { label: "Terminal Execution", description: "Run commands, read/write files, search projects via terminal.", icon: "Terminal" },
  fileAccess: { label: "File Access", description: "Read and write files on the local filesystem through Aceline.", icon: "FileText" },
  autoApi: { label: "Auto-API Building", description: "Automatically record page capabilities when Aceline visits a page.", icon: "Zap" },
  browserExtension: { label: "Browser Extension", description: "Inject Aceline onto external websites (requires extension install).", icon: "Globe" },
  customActions: { label: "Custom Action Execution", description: "Execute registered page actions (navigate, trigger buttons, control UI).", icon: "Sparkles" },
};

export const ALL_CONSENT_FEATURES: ConsentFeature[] = [
  "voice",
  "wallet",
  "glmBackend",
  "terminal",
  "fileAccess",
  "autoApi",
  "browserExtension",
  "customActions",
];

export interface AcelineConsentState {
  given: boolean;
  remembered: boolean;
  masterAllow: boolean;
  features: Record<ConsentFeature, boolean>;
  customDirectives: string;
  shown: boolean;

  grantAll: () => void;
  denyAll: () => void;
  setFeature: (feature: ConsentFeature, enabled: boolean) => void;
  setMasterAllow: (allow: boolean) => void;
  setCustomDirectives: (text: string) => void;
  setRemembered: (remembered: boolean) => void;
  confirm: () => void;
  dismiss: () => void;
  reset: () => void;
  isFeatureEnabled: (feature: ConsentFeature) => boolean;
  getDirectivesForPrompt: () => string;
}

const STORAGE_KEY = "aceline_consent_v1";

const DEFAULT_FEATURES: Record<ConsentFeature, boolean> = {
  voice: true,
  wallet: true,
  glmBackend: true,
  terminal: false,
  fileAccess: false,
  autoApi: true,
  browserExtension: false,
  customActions: true,
};

function loadPersisted(): Partial<AcelineConsentState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      given: data.given ?? false,
      remembered: data.remembered ?? false,
      masterAllow: data.masterAllow ?? false,
      features: { ...DEFAULT_FEATURES, ...(data.features || {}) },
      customDirectives: data.customDirectives || "",
    };
  } catch {
    return {};
  }
}

function persist(state: AcelineConsentState) {
  try {
    const toSave = {
      given: state.given,
      remembered: state.remembered,
      masterAllow: state.masterAllow,
      features: state.features,
      customDirectives: state.customDirectives,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch {}
}

export const useAcelineConsent = create<AcelineConsentState>((set, get) => {
  const persisted = loadPersisted();

  return {
    given: persisted.given ?? false,
    remembered: persisted.remembered ?? false,
    masterAllow: persisted.masterAllow ?? false,
    features: persisted.features ?? { ...DEFAULT_FEATURES },
    customDirectives: persisted.customDirectives ?? "",
    shown: false,

    grantAll: () => {
      const allTrue = ALL_CONSENT_FEATURES.reduce((acc, f) => { acc[f] = true; return acc; }, {} as Record<ConsentFeature, boolean>);
      set({ masterAllow: true, features: allTrue });
      persist({ ...get(), masterAllow: true, features: allTrue });
    },

    denyAll: () => {
      const allFalse = ALL_CONSENT_FEATURES.reduce((acc, f) => { acc[f] = false; return acc; }, {} as Record<ConsentFeature, boolean>);
      set({ masterAllow: false, features: allFalse });
      persist({ ...get(), masterAllow: false, features: allFalse });
    },

    setFeature: (feature, enabled) => {
      const features = { ...get().features, [feature]: enabled };
      set({ features });
      persist({ ...get(), features });
    },

    setMasterAllow: (allow) => {
      if (allow) {
        get().grantAll();
      } else {
        get().denyAll();
      }
    },

    setCustomDirectives: (text) => {
      set({ customDirectives: text });
      persist({ ...get(), customDirectives: text });
    },

    setRemembered: (remembered) => {
      set({ remembered });
      persist({ ...get(), remembered });
    },

    confirm: () => {
      set({ given: true, shown: true });
      persist({ ...get(), given: true });
    },

    dismiss: () => {
      set({ shown: true, given: false });
    },

    reset: () => {
      set({
        given: false,
        remembered: false,
        masterAllow: false,
        features: { ...DEFAULT_FEATURES },
        customDirectives: "",
        shown: false,
      });
      localStorage.removeItem(STORAGE_KEY);
    },

    isFeatureEnabled: (feature) => {
      const state = get();
      if (!state.given) return false;
      return state.features[feature] ?? false;
    },

    getDirectivesForPrompt: () => {
      const directives = get().customDirectives.trim();
      if (!directives) return "";
      return `\n\n## CUSTOM DIRECTIVES (from user)\n${directives}`;
    },
  };
});
