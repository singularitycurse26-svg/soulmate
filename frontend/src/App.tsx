import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { authApi } from "@/lib/api";
import { AlertContainer } from "@/components/AlertContainer";
import { Sidebar, MobileNav } from "@/components/layout/Navigation";
import { AuthViews } from "@/components/auth/AuthViews";
import { WalletCreateView } from "@/components/wallet/WalletCreateView";
import { DashboardPage } from "@/components/pages/DashboardPage";
import { WalletPage } from "@/components/pages/WalletPage";
import { GamesPage } from "@/components/games/GamesPage";
import { EmailPage } from "@/components/pages/EmailPage";
import { ContactsPage } from "@/components/pages/ContactsPage";
import { SecurityPage } from "@/components/pages/SecurityPage";
import { PhonePage, AIPage } from "@/components/pages/PlaceholderPages";

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

  // Auto-check session on load
  useEffect(() => {
    (async () => {
      if (sessionToken) {
        try {
          const data = await authApi.checkSession();
          if (data?.status === "valid") {
            setAuth(sessionToken, data.email || localStorage.getItem("auth_email") || "");
            if (walletAddress) {
              setView("app");
            } else {
              setView("create-wallet");
            }
            return;
          }
        } catch {}
        useStore.getState().clearAuth();
      }

      if (walletKey && walletAddress) {
        setView("app");
      } else {
        setView("login");
      }
    })();
  }, []);

  // Auth views (login, signup, loading, fingerprint-register)
  if (view === "login" || view === "signup" || view === "loading" || view === "fingerprint-register") {
    return (
      <>
        <AlertContainer />
        <AuthViews />
      </>
    );
  }

  // Create/import wallet view
  if (view === "create-wallet" || view === "import-wallet") {
    return (
      <>
        <AlertContainer />
        <WalletCreateView />
      </>
    );
  }

  // Main app
  return (
    <>
      <AlertContainer />
      <Sidebar />
      <main className="md:ml-60 min-h-screen pb-20 md:pb-0">
        <div className="max-w-2xl mx-auto p-4 md:p-8">
          {activePage === "dashboard" && <DashboardPage />}
          {activePage === "email" && <EmailPage />}
          {activePage === "phone" && <PhonePage />}
          {activePage === "contacts" && <ContactsPage />}
          {activePage === "ai" && <AIPage />}
          {activePage === "games" && <GamesPage />}
          {activePage === "wallet" && <WalletPage />}
          {activePage === "security" && <SecurityPage />}
        </div>
      </main>
      <MobileNav />
    </>
  );

  function showAlert(type: any, message: string) {
    useStore.getState().showAlert(type, message);
  }
}
