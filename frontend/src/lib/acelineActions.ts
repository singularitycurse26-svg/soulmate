import { useEffect } from "react";
import { registerPageActions, unregisterPageActions, type AcelineAction } from "@/lib/acelineRegistry";
import { useStore } from "@/lib/store";

// Hook to register Aceline actions for a page
export function useAcelineActions(page: string, actions: AcelineAction[]) {
  const { setActivePage } = useStore();

  useEffect(() => {
    registerPageActions(page as any, actions);
    return () => unregisterPageActions(page as any);
  }, [page]);
}

// ── Dashboard Actions ────────────────────────────────────────────

export function useDashboardAcelineActions() {
  const { setActivePage, activePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "navigate",
      label: "Navigate to page",
      description: "Travel to any Soulmate OS page",
      category: "navigation",
      execute: async () => {
        return "Use the travel picker to select a destination page";
      },
    },
    {
      id: "read-status",
      label: "Read dashboard status",
      description: "Read current dashboard state and active page",
      category: "read",
      readState: () => ({ activePage, timestamp: Date.now() }),
      execute: async () => ({ activePage, status: "online" }),
    },
    {
      id: "go-wallet",
      label: "Go to Wallet",
      description: "Navigate to the wallet page",
      category: "navigation",
      execute: async () => { setActivePage("wallet"); return "Navigated to wallet"; },
    },
    {
      id: "go-daytrading",
      label: "Go to Day Trading",
      description: "Navigate to the day trading terminal",
      category: "navigation",
      execute: async () => { setActivePage("daytrading"); return "Navigated to day trading"; },
    },
    {
      id: "go-business",
      label: "Go to Business Archive",
      description: "Navigate to the business archive",
      category: "navigation",
      execute: async () => { setActivePage("business"); return "Navigated to business archive"; },
    },
    {
      id: "go-wakkii",
      label: "Go to Wakkii Links",
      description: "Navigate to Wakkii Links social",
      category: "navigation",
      execute: async () => { setActivePage("wakkii"); return "Navigated to Wakkii Links"; },
    },
  ];

  useAcelineActions("dashboard", actions);
}

// ── Day Trading Actions ──────────────────────────────────────────

export function useDayTradingAcelineActions(getState: () => any) {
  const { setActivePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "read-portfolio",
      label: "Read portfolio",
      description: "Read current trading portfolio state",
      category: "read",
      readState: () => {
        const s = getState();
        return {
          balance: s?.balance || 0,
          positions: s?.positions || [],
          orders: s?.orders || [],
        };
      },
      execute: async () => {
        const s = getState();
        return { balance: s?.balance || 0, positions: s?.positions?.length || 0 };
      },
    },
    {
      id: "read-watchlist",
      label: "Read watchlist",
      description: "Read current watchlist symbols",
      category: "read",
      readState: () => {
        const s = getState();
        return { watchlist: s?.watchlist || [], activeSymbol: s?.activeSymbol };
      },
      execute: async () => {
        const s = getState();
        return { watchlist: s?.watchlist || [] };
      },
    },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      description: "Navigate back to dashboard",
      category: "navigation",
      execute: async () => { setActivePage("dashboard"); return "Navigated to dashboard"; },
    },
  ];

  useAcelineActions("daytrading", actions);
}

// ── Business Archive Actions ─────────────────────────────────────

export function useBusinessArchiveAcelineActions() {
  const { setActivePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "read-projects",
      label: "Read projects",
      description: "Read all business archive projects",
      category: "read",
      readState: () => {
        try {
          const raw = localStorage.getItem("business_archive_projects");
          const projects = raw ? JSON.parse(raw) : [];
          return { count: projects.length, names: projects.map((p: any) => p.name) };
        } catch { return { count: 0 }; }
      },
      execute: async () => {
        try {
          const raw = localStorage.getItem("business_archive_projects");
          const projects = raw ? JSON.parse(raw) : [];
          return { count: projects.length, projects: projects.map((p: any) => ({ name: p.name, status: p.status, progress: p.progress })) };
        } catch { return { count: 0 }; }
      },
    },
    {
      id: "read-suggestions",
      label: "Read suggestions",
      description: "Read pending business archive suggestions",
      category: "read",
      readState: () => {
        try {
          const raw = localStorage.getItem("business_archive_suggestions");
          const suggestions = raw ? JSON.parse(raw) : [];
          return { pending: suggestions.filter((s: any) => s.status === "new").length };
        } catch { return { pending: 0 }; }
      },
      execute: async () => {
        try {
          const raw = localStorage.getItem("business_archive_suggestions");
          const suggestions = raw ? JSON.parse(raw) : [];
          return { pending: suggestions.filter((s: any) => s.status === "new").length };
        } catch { return { pending: 0 }; }
      },
    },
    {
      id: "read-documents",
      label: "Read documents",
      description: "Read filed business documents",
      category: "read",
      readState: () => {
        try {
          const raw = localStorage.getItem("business_archive_documents");
          const docs = raw ? JSON.parse(raw) : [];
          return { count: docs.length, recent: docs.slice(0, 3).map((d: any) => d.name) };
        } catch { return { count: 0 }; }
      },
      execute: async () => {
        try {
          const raw = localStorage.getItem("business_archive_documents");
          const docs = raw ? JSON.parse(raw) : [];
          return { count: docs.length };
        } catch { return { count: 0 }; }
      },
    },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      description: "Navigate back to dashboard",
      category: "navigation",
      execute: async () => { setActivePage("dashboard"); return "Navigated to dashboard"; },
    },
  ];

  useAcelineActions("business", actions);
}

// ── Wallet Actions ───────────────────────────────────────────────

export function useWalletAcelineActions() {
  const { walletAddress, setActivePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "read-balance",
      label: "Read wallet balance",
      description: "Read current wallet address and balance state",
      category: "read",
      readState: () => ({ address: walletAddress, hasKey: !!useStore.getState().walletKey }),
      execute: async () => ({ address: walletAddress, hasKey: !!useStore.getState().walletKey }),
    },
    {
      id: "read-address",
      label: "Read wallet address",
      description: "Read the Incentives wallet address",
      category: "read",
      readState: () => ({ address: walletAddress }),
      execute: async () => ({ address: walletAddress }),
    },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      description: "Navigate back to dashboard",
      category: "navigation",
      execute: async () => { setActivePage("dashboard"); return "Navigated to dashboard"; },
    },
  ];

  useAcelineActions("wallet", actions);
}

// ── Wakkii Links Actions ─────────────────────────────────────────

export function useWakkiiAcelineActions() {
  const { setActivePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "read-room",
      label: "Read room state",
      description: "Read current Wakkii room state",
      category: "read",
      readState: () => {
        const hash = window.location.hash;
        const roomId = hash.startsWith("#wakkii-") ? hash.slice(8) : null;
        return { roomId, inRoom: !!roomId };
      },
      execute: async () => {
        const hash = window.location.hash;
        const roomId = hash.startsWith("#wakkii-") ? hash.slice(8) : null;
        return { roomId, inRoom: !!roomId };
      },
    },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      description: "Navigate back to dashboard",
      category: "navigation",
      execute: async () => { setActivePage("dashboard"); return "Navigated to dashboard"; },
    },
  ];

  useAcelineActions("wakkii", actions);
}

// ── Frequency Generator Actions ──────────────────────────────────

export function useFrequencyAcelineActions() {
  const { setActivePage } = useStore();

  const actions: AcelineAction[] = [
    {
      id: "read-status",
      label: "Read frequency status",
      description: "Read current frequency generator state",
      category: "read",
      readState: () => ({ iframeLoaded: !!document.querySelector("iframe[src*='frequency-generator']") }),
      execute: async () => ({ status: "Frequency generator iframe active" }),
    },
    {
      id: "go-dashboard",
      label: "Go to Dashboard",
      description: "Navigate back to dashboard",
      category: "navigation",
      execute: async () => { setActivePage("dashboard"); return "Navigated to dashboard"; },
    },
  ];

  useAcelineActions("frequency", actions);
}
