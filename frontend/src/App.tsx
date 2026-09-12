import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useStore } from "@/lib/store";
import type { AppPage } from "@/lib/store";
import { authApi } from "@/lib/api";
import { saveWalletToVault } from "@/lib/vault";
import { AlertContainer } from "@/components/AlertContainer";
import { Sidebar, MobileNav } from "@/components/layout/Navigation";
import { AuthViews } from "@/components/auth/AuthViews";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { WalletPage } from "@/components/pages/WalletPage";
import { GamesPage } from "@/components/games/GamesPage";
import { EmailPage } from "@/components/pages/EmailPage";
import { ContactsPage } from "@/components/pages/ContactsPage";
import { SecurityPage } from "@/components/pages/SecurityPage";
import { AIPage } from "@/components/pages/AIPage";
import { PhonePage } from "@/components/pages/PhonePage";
import { OpenClawPage } from "@/components/pages/OpenClawPage";
import { HermesPage } from "@/components/pages/HermesPage";
import { MarketplacePage } from "@/components/pages/MarketplacePage";
import { AgentMarketplacePage } from "@/components/pages/AgentMarketplacePage";
import { ArchivePage } from "@/components/pages/ArchivePage";
import { DatingPage } from "@/components/pages/DatingPage";
import { IncentivesPage } from "@/components/pages/IncentivesPage";
import { DayTradingPage } from "@/components/pages/DayTradingPage";
import { FrequencyGeneratorPage } from "@/components/pages/FrequencyGeneratorPage";
import { BusinessArchivePage } from "@/components/pages/BusinessArchivePage";
import { HealingPage } from "@/components/pages/HealingPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Fingerprint, Loader2, BookOpen } from "lucide-react";
import { FingerprintGate } from "@/components/FingerprintGate";
import { SessionJournalPage } from "@/components/pages/SessionJournalPage";
import { SoulTubePage } from "@/components/pages/SoulTubePage";
import { SoulIllusionsPage } from "@/components/pages/SoulIllusionsPage";
import { WakkiiLinks } from "@/components/phone/WakkiiLinks";
import { AcelineOverlay } from "@/components/aceline/AcelineOverlay";
import { AcelineButton } from "@/components/aceline/AcelineButton";
import { AcelineConsentModal } from "@/components/aceline/AcelineConsentModal";
import { useAcelineStore } from "@/lib/acelineStore";
import { initWalletAuto } from "@/lib/walletAuto";
import { initVaultSessionTracker, logWork } from "@/lib/vault";
import { hasPlatformAuthenticator } from "@/lib/utils";

function PhoneGateWrapper() {
  const [bioSetupDone, setBioSetupDone] = useState(!!localStorage.getItem("bio_unlock_setup"));
  const [checkingSensor, setCheckingSensor] = useState(!bioSetupDone);
  const { setActivePage } = useStore();

  useEffect(() => {
    if (bioSetupDone) return;
    let cancelled = false;
    (async () => {
      const hasSensor = await hasPlatformAuthenticator();
      if (cancelled) return;
      if (!hasSensor) {
        localStorage.setItem("bio_unlock_setup", "skipped-no-sensor");
        setBioSetupDone(true);
      }
      setCheckingSensor(false);
    })();
    return () => { cancelled = true; };
  }, [bioSetupDone]);

  if (bioSetupDone) {
    return <PhonePage />;
  }

  if (checkingSensor) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <FingerprintGate
      onUnlock={() => setBioSetupDone(true)}
      onBack={() => setActivePage("dashboard")}
    />
  );
}

export default function App() {
  const {
    view,
    setView,
    activePage,
    sessionToken,
    setAuth,
    walletAddress,
    walletKey,
    isAuthenticated,
  } = useStore();
  const [bioPrompting, setBioPrompting] = useState(false);

  const autoCreateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    useStore.getState().setWallet(wallet.address, wallet.privateKey);
    saveWalletToVault(wallet.address, wallet.privateKey);
    localStorage.setItem("remember_me_device", "true");
  };

  const autoFingerprintLogin = async () => {
    if (!window.PublicKeyCredential) return false;
    if (localStorage.getItem("fingerprint_registered") !== "true") return false;
    setBioPrompting(true);
    try {
      const beginResp = await authApi.webauthnAuthBegin(localStorage.getItem("auth_email") || "");
      const challenge = Uint8Array.from(atob(beginResp.challenge), (c: string) => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: beginResp.rpId,
          timeout: beginResp.timeout || 60000,
          userVerification: beginResp.userVerification || "required",
          allowCredentials: [],
        },
      }) as PublicKeyCredential;
      if (!assertion) { setBioPrompting(false); return false; }
      const credId = btoa(String.fromCharCode(...new Uint8Array(assertion.rawId)));
      const signCount = (assertion.response as AuthenticatorAssertionResponse).authenticatorData
        ? new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData).byteLength : 0;
      const result = await authApi.webauthnAuthComplete(credId, signCount);
      if (result.status === "ok") {
        setAuth(result.session_token, result.email);
        localStorage.setItem("auth_email", result.email);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setBioPrompting(false);
    }
  };

  // Auto-check session on load
  useEffect(() => {
    (async () => {
      if (sessionToken) {
        try {
          const data = await authApi.checkSession();
          if (data?.status === "valid") {
            setAuth(sessionToken, data.email || localStorage.getItem("auth_email") || "");
            if (!walletAddress) {
              autoCreateWallet();
            }
            initVaultSessionTracker();
            logWork("config", "App loaded", "Session restored via saved token", [], ["session", "auto"]);
            setView("app");
            return;
          }
        } catch {}
        useStore.getState().clearAuth();
      }

      // Remember me: auto-login from saved credentials
      const rememberDevice = localStorage.getItem("remember_me_device");
      const rememberEmail = localStorage.getItem("remember_me_email");
      const rememberPassword = localStorage.getItem("remember_me_password");

      // Local founder session (offline mode — backend not running)
      const localFounderToken = localStorage.getItem("local_founder_session");
      if (localFounderToken) {
        const founderEmail = localStorage.getItem("auth_email") || "singularitycurse26@gmail.com";
        setAuth(localFounderToken, founderEmail);
        useStore.getState().setFounder(true);
        if (!walletKey || !walletAddress) {
          autoCreateWallet();
        }
        initVaultSessionTracker();
        logWork("config", "Founder offline login", "Logged in via local founder session", [], ["session", "founder", "offline"]);
        setView("app");
        return;
      }

      if (rememberDevice === "true" && rememberEmail && rememberPassword) {
        try {
          const data = await authApi.login(rememberEmail, rememberPassword);
          if (data.status === "ok") {
            setAuth(data.session_token, rememberEmail);
            if (!walletKey || !walletAddress) {
              autoCreateWallet();
            }
            initVaultSessionTracker();
            logWork("config", "Auto-login", "Logged in via remember-me", [], ["session", "auto"]);
            setView("app");
            return;
          }
        } catch {}
      }

      // Auto-fingerprint login only if this device actually has a sensor
      const fpRegistered = localStorage.getItem("fingerprint_registered") === "true";
      if (fpRegistered && window.PublicKeyCredential) {
        const hasSensor = await hasPlatformAuthenticator();
        if (hasSensor) {
          const ok = await autoFingerprintLogin();
          if (ok) {
            if (!walletKey || !walletAddress) {
              autoCreateWallet();
            }
            initVaultSessionTracker();
            logWork("security", "Fingerprint login", "Auto-logged in via fingerprint", [], ["session", "auto", "fingerprint"]);
            setView("app");
            return;
          }
        }
      }

      if (walletKey && walletAddress) {
        initVaultSessionTracker();
        setView("app");
      } else {
        // Auto-login via /v1/auth/auto — no password needed for local access
        try {
          const resp = await fetch("/v1/auth/auto", { method: "POST" });
          if (resp.ok) {
            const data = await resp.json();
            if (data.status === "ok" && data.token) {
              setAuth(data.token, data.email || "founder");
              autoCreateWallet();
              initVaultSessionTracker();
              setView("app");
              return;
            }
          }
        } catch {}
        setView("login");
      }
    })();
  }, []);

  // Initialize wallet auto-creation (hardcoded — always present)
  useEffect(() => {
    initWalletAuto();
  }, []);

  // Cmd+K / Ctrl+K to toggle Aceline
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const aceline = useAcelineStore.getState();
        if (aceline.active) {
          aceline.recall();
        } else {
          aceline.dispatch(activePage);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activePage]);

  // Log page navigation in background
  useEffect(() => {
    if (view === "app" && activePage) {
      logWork("ui", `Navigated to ${activePage}`, `User opened the ${activePage} page`, [], ["navigation", "auto"]);
    }
  }, [activePage]);

  // Wakkii Links: auto-navigate when a #wakkii- hash is present
  useEffect(() => {
    if (view !== "app") return;
    const hash = window.location.hash;
    if (hash.startsWith("#wakkii-")) {
      useStore.getState().setActivePage("wakkii");
    }
  }, [view]);

  // PWA shortcuts: parse ?view= param and navigate
  useEffect(() => {
    if (view !== "app") return;
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    if (viewParam) {
      const validPages: AppPage[] = [
        "dashboard", "business", "email", "phone", "contacts", "ai", "games", "wallet",
        "security", "openclaw", "hermes", "marketplace", "agent_market", "archive", "dating", "incentives",
        "daytrading", "frequency", "healing", "journal", "soultube", "soulillusions", "wakkii",
      ];
      if (validPages.includes(viewParam as AppPage)) {
        useStore.getState().setActivePage(viewParam as AppPage);
      }
    }
  }, [view]);

  // Fingerprint auto-login prompt
  if (bioPrompting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Fingerprint className="w-12 h-12 text-accent animate-pulse" />
        <p className="text-muted">Scan your fingerprint to unlock Soulmate OS...</p>
        <button
          onClick={() => {
            setBioPrompting(false);
            setView("login");
          }}
          className="btn-secondary mt-2"
        >
          Use email and password instead
        </button>
      </div>
    );
  }

  // Auth views (login, signup, loading, fingerprint-register)
  if (view === "login" || view === "signup" || view === "loading" || view === "fingerprint-register") {
    return (
      <>
        <AlertContainer />
        <AuthViews />
      </>
    );
  }

  // Main app
  return (
    <>
      <AlertContainer />
      <Sidebar />
      <main className="md:ml-64 min-h-screen pt-14 md:pt-0 pb-20 md:pb-0" style={{ paddingTop: "calc(56px + env(safe-area-inset-top))", paddingBottom: "calc(56px + env(safe-area-inset-bottom))" }}>
        <div className="max-w-7xl mx-auto p-4 md:p-7">
          {activePage === "dashboard" && <ErrorBoundary><DashboardPage /></ErrorBoundary>}
          {activePage === "business" && <ErrorBoundary><BusinessArchivePage /></ErrorBoundary>}
          {activePage === "email" && <ErrorBoundary><EmailPage /></ErrorBoundary>}
          {activePage === "phone" && (
            <ErrorBoundary><PhoneGateWrapper /></ErrorBoundary>
          )}
          {activePage === "contacts" && <ErrorBoundary><ContactsPage /></ErrorBoundary>}
          {activePage === "ai" && <ErrorBoundary><AIPage /></ErrorBoundary>}
          {activePage === "games" && <ErrorBoundary><GamesPage /></ErrorBoundary>}
          {activePage === "wallet" && <ErrorBoundary><WalletPage /></ErrorBoundary>}
          {activePage === "security" && <ErrorBoundary><SecurityPage /></ErrorBoundary>}
          {activePage === "openclaw" && <ErrorBoundary><OpenClawPage /></ErrorBoundary>}
          {activePage === "hermes" && <ErrorBoundary><HermesPage /></ErrorBoundary>}
          {activePage === "marketplace" && <ErrorBoundary><MarketplacePage /></ErrorBoundary>}
          {activePage === "agent_market" && <ErrorBoundary><AgentMarketplacePage /></ErrorBoundary>}
          {activePage === "archive" && <ErrorBoundary><ArchivePage /></ErrorBoundary>}
          {activePage === "dating" && <ErrorBoundary><DatingPage /></ErrorBoundary>}
          {activePage === "incentives" && <ErrorBoundary><IncentivesPage /></ErrorBoundary>}
          {activePage === "daytrading" && <ErrorBoundary><DayTradingPage /></ErrorBoundary>}
          {activePage === "frequency" && <ErrorBoundary><FrequencyGeneratorPage /></ErrorBoundary>}
          {activePage === "healing" && <ErrorBoundary><HealingPage /></ErrorBoundary>}
          {activePage === "journal" && <ErrorBoundary><SessionJournalPage /></ErrorBoundary>}
          {activePage === "soultube" && <ErrorBoundary><SoulTubePage /></ErrorBoundary>}
          {activePage === "soulillusions" && <ErrorBoundary><SoulIllusionsPage /></ErrorBoundary>}
          {activePage === "wakkii" && (
            <ErrorBoundary>
              <WakkiiLinks
                userName={localStorage.getItem("auth_email") || "Soulmate User"}
                mode="ptt"
                defaultRole="speaker"
              />
            </ErrorBoundary>
          )}
        </div>
      </main>
      <MobileNav />
      <AcelineButton />
      <AcelineOverlay />
      <AcelineConsentModal />
    </>
  );

  function showAlert(type: any, message: string) {
    useStore.getState().showAlert(type, message);
  }
}
