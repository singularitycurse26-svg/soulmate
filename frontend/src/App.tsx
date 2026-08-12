import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useStore } from "@/lib/store";
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
import { DatingPage } from "@/components/pages/DatingPage";
import { IncentivesPage } from "@/components/pages/IncentivesPage";
import { HealingPage } from "@/components/pages/HealingPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Fingerprint, Loader2, BookOpen } from "lucide-react";
import { FingerprintGate } from "@/components/FingerprintGate";
import { SessionJournalPage } from "@/components/pages/SessionJournalPage";
import { SoulTubePage } from "@/components/pages/SoulTubePage";
import { SoulIllusionsPage } from "@/components/pages/SoulIllusionsPage";
import { initVaultSessionTracker, logWork } from "@/lib/vault";

function PhoneGateWrapper() {
  const [bioSetupDone, setBioSetupDone] = useState(localStorage.getItem("bio_unlock_setup") === "true");
  const { setActivePage } = useStore();

  if (bioSetupDone) {
    return <PhonePage />;
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
    localStorage.setItem("fingerprint_registered", "true");
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

      // Auto-fingerprint login if registered
      const fpRegistered = localStorage.getItem("fingerprint_registered") === "true";
      if (fpRegistered && window.PublicKeyCredential) {
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

  // Log page navigation in background
  useEffect(() => {
    if (view === "app" && activePage) {
      logWork("ui", `Navigated to ${activePage}`, `User opened the ${activePage} page`, [], ["navigation", "auto"]);
    }
  }, [activePage]);

  // Fingerprint auto-login prompt
  if (bioPrompting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Fingerprint className="w-12 h-12 text-accent animate-pulse" />
        <p className="text-muted">Scan your fingerprint to unlock Soulmate OS...</p>
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
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          {activePage === "dashboard" && <DashboardPage />}
          {activePage === "email" && <EmailPage />}
          {activePage === "phone" && (
            <PhoneGateWrapper />
          )}
          {activePage === "contacts" && <ContactsPage />}
          {activePage === "ai" && <AIPage />}
          {activePage === "games" && <GamesPage />}
          {activePage === "wallet" && <WalletPage />}
          {activePage === "security" && <SecurityPage />}
          {activePage === "openclaw" && <OpenClawPage />}
          {activePage === "hermes" && <HermesPage />}
          {activePage === "marketplace" && <MarketplacePage />}
          {activePage === "dating" && <DatingPage />}
          {activePage === "incentives" && <ErrorBoundary><IncentivesPage /></ErrorBoundary>}
          {activePage === "healing" && <HealingPage />}
          {activePage === "journal" && <SessionJournalPage />}
          {activePage === "soultube" && <ErrorBoundary><SoulTubePage /></ErrorBoundary>}
          {activePage === "soulillusions" && <ErrorBoundary><SoulIllusionsPage /></ErrorBoundary>}
        </div>
      </main>
      <MobileNav />
    </>
  );

  function showAlert(type: any, message: string) {
    useStore.getState().showAlert(type, message);
  }
}
