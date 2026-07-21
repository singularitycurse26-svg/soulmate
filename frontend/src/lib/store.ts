import { create } from "zustand";

type View =
  | "login"
  | "signup"
  | "loading"
  | "create-wallet"
  | "import-wallet"
  | "mnemonic"
  | "fingerprint-register"
  | "app";

type AppPage =
  | "dashboard"
  | "email"
  | "phone"
  | "contacts"
  | "ai"
  | "games"
  | "wallet"
  | "security";

interface Alert {
  id: number;
  type: "success" | "danger" | "info" | "warning";
  message: string;
}

interface AppState {
  // Auth
  sessionToken: string;
  authEmail: string;
  isAuthenticated: boolean;
  setAuth: (token: string, email: string) => void;
  clearAuth: () => void;

  // Wallet
  walletAddress: string;
  walletKey: string;
  setWallet: (address: string, key: string) => void;
  clearWallet: () => void;

  // Navigation
  view: View;
  setView: (v: View) => void;
  activePage: AppPage;
  setActivePage: (p: AppPage) => void;

  // Alerts
  alerts: Alert[];
  showAlert: (type: Alert["type"], message: string) => void;
  dismissAlert: (id: number) => void;

  // Loading
  loadingText: string;
  setLoading: (text: string) => void;
}

let alertId = 0;

export const useStore = create<AppState>((set) => ({
  sessionToken: localStorage.getItem("session_token") || "",
  authEmail: localStorage.getItem("auth_email") || "",
  isAuthenticated: false,
  setAuth: (token, email) => {
    localStorage.setItem("session_token", token);
    localStorage.setItem("auth_email", email);
    set({ sessionToken: token, authEmail: email, isAuthenticated: true });
  },
  clearAuth: () => {
    localStorage.removeItem("session_token");
    localStorage.removeItem("auth_email");
    set({ sessionToken: "", authEmail: "", isAuthenticated: false });
  },

  walletAddress: localStorage.getItem("wallet_address") || "",
  walletKey: localStorage.getItem("wallet_key") || "",
  setWallet: (address, key) => {
    localStorage.setItem("wallet_address", address);
    localStorage.setItem("wallet_key", key);
    set({ walletAddress: address, walletKey: key });
  },
  clearWallet: () => {
    localStorage.removeItem("wallet_address");
    localStorage.removeItem("wallet_key");
    set({ walletAddress: "", walletKey: "" });
  },

  view: "login",
  setView: (v) => set({ view: v }),
  activePage: "dashboard",
  setActivePage: (p) => set({ activePage: p }),

  alerts: [],
  showAlert: (type, message) => {
    const id = ++alertId;
    set((s) => ({ alerts: [...s.alerts, { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) }));
    }, 5000);
  },
  dismissAlert: (id) =>
    set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

  loadingText: "Loading...",
  setLoading: (text) => set({ loadingText: text }),
}));
