import { useStore, type AppPage } from "@/lib/store";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  LayoutDashboard,
  Mail,
  Phone,
  Users,
  Brain,
  Gamepad2,
  Wallet,
  Shield,
  LogOut,
  Terminal,
  Cpu,
  ShoppingBag,
  Heart,
  Coins,
  Crown,
  Activity,
  BookOpen,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import incentivesCoin from "@/assets/incentives-coin.png";

const navItems: { page: AppPage; labelKey: string; icon: any }[] = [
  { page: "dashboard", labelKey: "common:nav.dashboard", icon: LayoutDashboard },
  { page: "marketplace", labelKey: "common:nav.marketplace", icon: ShoppingBag },
  { page: "dating", labelKey: "common:nav.dating", icon: Heart },
  { page: "email", labelKey: "common:nav.email", icon: Mail },
  { page: "phone", labelKey: "common:nav.phone", icon: Phone },
  { page: "contacts", labelKey: "common:nav.contacts", icon: Users },
  { page: "ai", labelKey: "common:nav.ai", icon: Brain },
  { page: "games", labelKey: "common:nav.games", icon: Gamepad2 },
  { page: "wallet", labelKey: "common:nav.wallet", icon: Wallet },
  { page: "security", labelKey: "common:nav.security", icon: Shield },
  { page: "openclaw", labelKey: "common:nav.openclaw", icon: Terminal },
  { page: "hermes", labelKey: "common:nav.hermes", icon: Cpu },
  { page: "incentives", labelKey: "common:nav.incentives", icon: Coins },
  { page: "soultube", labelKey: "common:nav.soultube", icon: PlayCircle },
  { page: "soulillusions", labelKey: "common:nav.soulillusions", icon: Sparkles },
];

const founderNavItems: { page: AppPage; labelKey: string; icon: any }[] = [
  { page: "healing", labelKey: "common:nav.healing", icon: Activity },
  { page: "journal", labelKey: "common:nav.journal", icon: BookOpen },
];

export function Sidebar() {
  const { activePage, setActivePage, clearWallet, clearAuth, setView, isFounder, authEmail } = useStore();
  const { t } = useTranslation();

  const handleLogout = () => {
    clearWallet();
    clearAuth();
    setView("login");
  };

  return (
    <aside className="hidden md:flex flex-col w-60 h-screen bg-bg-card border-r border-border p-4 fixed left-0 top-0">
      <div className="mb-8 px-2">
        <div className="flex items-center gap-2">
          <img src={incentivesCoin} alt="Incentives Inc." className="w-7 h-7 rounded-lg object-cover" />
          <div className="flex flex-col leading-none">
            <h1 className="text-lg font-bold text-gradient">Incentives Inc.</h1>
            <p className="text-[10px] text-muted mt-0.5">Soulmate OS</p>
          </div>
        </div>
        {isFounder && (
          <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-md bg-accent/10">
            <Crown className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs text-accent font-medium">Founder Account</span>
          </div>
        )}
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              onClick={() => setActivePage(item.page)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                activePage === item.page
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white hover:bg-bg-alt"
              )}
            >
              <Icon className="w-5 h-5" />
              {t(item.labelKey)}
            </button>
          );
        })}
        {isFounder && (
          <>
            <div className="h-px bg-border my-2" />
            {founderNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.page}
                  onClick={() => setActivePage(item.page)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium",
                    activePage === item.page
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-white hover:bg-bg-alt"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </>
        )}
      </nav>

      <div className="flex items-center gap-2 px-1">
        <LanguageSwitcher />
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-all text-sm font-medium"
        >
          <LogOut className="w-5 h-5" />
          {t("common:common.logout")}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const { activePage, setActivePage } = useStore();
  const { t } = useTranslation();

  const mobileItems = navItems.slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-card border-t border-border flex items-center justify-around px-2 py-1.5 z-40">
      {mobileItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.page}
            onClick={() => setActivePage(item.page)}
            className={cn(
              "nav-item w-16",
              activePage === item.page && "active"
            )}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px]">{t(item.labelKey)}</span>
          </button>
        );
      })}
      <button
        onClick={() => setActivePage("wallet")}
        className={cn("nav-item w-16", activePage === "wallet" && "active")}
      >
        <Wallet className="w-5 h-5" />
        <span className="text-[10px]">{t("common:nav.wallet")}</span>
      </button>
      <LanguageSwitcher />
    </nav>
  );
}
