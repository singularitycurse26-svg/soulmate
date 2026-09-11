import { useState } from "react";
import { useStore, type AppPage } from "@/lib/store";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  LayoutDashboard,
  Briefcase,
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
  Radio,
  CandlestickChart,
  AudioWaveform,
  Menu,
  X,
} from "lucide-react";
import incentivesCoin from "@/assets/incentives-coin.png";

const navItems: { page: AppPage; labelKey: string; icon: any; group: string }[] = [
  { page: "dashboard", labelKey: "common:nav.dashboard", icon: LayoutDashboard, group: "Home" },
  { page: "business", labelKey: "common:nav.business", icon: Briefcase, group: "Home" },
  { page: "marketplace", labelKey: "common:nav.marketplace", icon: ShoppingBag, group: "Social" },
  { page: "dating", labelKey: "common:nav.dating", icon: Heart, group: "Social" },
  { page: "wakkii", labelKey: "common:nav.wakkii", icon: Radio, group: "Social" },
  { page: "email", labelKey: "common:nav.email", icon: Mail, group: "Comms" },
  { page: "phone", labelKey: "common:nav.phone", icon: Phone, group: "Comms" },
  { page: "contacts", labelKey: "common:nav.contacts", icon: Users, group: "Comms" },
  { page: "ai", labelKey: "common:nav.ai", icon: Brain, group: "AI" },
  { page: "openclaw", labelKey: "common:nav.openclaw", icon: Terminal, group: "AI" },
  { page: "hermes", labelKey: "common:nav.hermes", icon: Cpu, group: "AI" },
  { page: "games", labelKey: "common:nav.games", icon: Gamepad2, group: "Play" },
  { page: "soultube", labelKey: "common:nav.soultube", icon: PlayCircle, group: "Play" },
  { page: "soulillusions", labelKey: "common:nav.soulillusions", icon: Sparkles, group: "Play" },
  { page: "wallet", labelKey: "common:nav.wallet", icon: Wallet, group: "Money" },
  { page: "incentives", labelKey: "common:nav.incentives", icon: Coins, group: "Money" },
  { page: "daytrading", labelKey: "common:nav.daytrading", icon: CandlestickChart, group: "Money" },
  { page: "frequency", labelKey: "common:nav.frequency", icon: AudioWaveform, group: "Money" },
  { page: "security", labelKey: "common:nav.security", icon: Shield, group: "System" },
];

const founderNavItems: { page: AppPage; labelKey: string; icon: any }[] = [
  { page: "healing", labelKey: "common:nav.healing", icon: Activity },
  { page: "journal", labelKey: "common:nav.journal", icon: BookOpen },
];

function groupedNav() {
  const groups: { name: string; items: typeof navItems }[] = [];
  for (const item of navItems) {
    const last = groups[groups.length - 1];
    if (!last || last.name !== item.group) groups.push({ name: item.group, items: [item] });
    else last.items.push(item);
  }
  return groups;
}

export function Sidebar() {
  const { activePage, setActivePage, clearAuth, setView, isFounder } = useStore();
  const { t } = useTranslation();

  const handleLogout = () => {
    clearAuth();
    setView("login");
  };

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen bg-bg-card/70 backdrop-blur-xl border-r border-white/5 p-4 fixed left-0 top-0 z-30">
      <div className="mb-6 px-2">
        <div className="flex items-center gap-3">
          <img src={incentivesCoin} alt="Incentives Inc." className="w-9 h-9 rounded-xl object-cover ring-1 ring-white/10" />
          <div className="flex flex-col leading-tight">
            <h1 className="text-base font-semibold tracking-tight">Soulmate OS</h1>
            <p className="text-[11px] text-muted">Incentives Inc.</p>
          </div>
        </div>
        {isFounder && (
          <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-xl bg-accent/10 border border-accent/20">
            <Crown className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs text-accent font-medium">Founder</span>
          </div>
        )}
      </div>

      <nav className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar pr-1">
        {groupedNav().map((group) => (
          <div key={group.name}>
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted/70">{group.name}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.page;
                return (
                  <button
                    key={item.page}
                    onClick={() => setActivePage(item.page)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-medium",
                      active ? "bg-white/8 text-white" : "text-muted hover:text-white hover:bg-white/5"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />}
                    <Icon className={cn("w-[18px] h-[18px]", active ? "text-accent" : "") } />
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {isFounder && (
          <div>
            <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted/70">Founder</p>
            <div className="flex flex-col gap-0.5">
              {founderNavItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.page;
                return (
                  <button
                    key={item.page}
                    onClick={() => setActivePage(item.page)}
                    className={cn(
                      "relative flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-medium",
                      active ? "bg-white/8 text-white" : "text-muted hover:text-white hover:bg-white/5"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />}
                    <Icon className={cn("w-[18px] h-[18px]", active ? "text-accent" : "") } />
                    {t(item.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="flex items-center gap-2 px-1 pt-3 border-t border-white/5">
        <LanguageSwitcher />
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-all text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          {t("common:common.logout")}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const { activePage, setActivePage, clearAuth, setView, isFounder } = useStore();
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const mobileQuickKeys: AppPage[] = ["dashboard", "wakkii", "ai", "email", "wallet"];
  const mobileQuickItems = mobileQuickKeys.map((key) => navItems.find((i) => i.page === key)!).filter(Boolean);

  const handleNavClick = (page: AppPage) => {
    setActivePage(page);
    setDrawerOpen(false);
  };

  const handleLogout = () => {
    clearAuth();
    setView("login");
  };

  return (
    <>
      {/* Top header — mobile only */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-40 bg-bg-card/90 backdrop-blur-xl border-b border-white/5"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 rounded-lg text-muted hover:text-white hover:bg-white/5 transition-all"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={incentivesCoin} alt="Soulmate OS" className="w-6 h-6 rounded-lg" />
            <span className="text-sm font-semibold">Soulmate OS</span>
            {isFounder && <Crown className="w-3.5 h-3.5 text-warning" />}
          </div>
          <div className="w-9">
            {isFounder && (
              <span className="text-[10px] text-accent font-bold bg-accent/10 px-2 py-1 rounded-full">FOUNDER</span>
            )}
          </div>
        </div>
      </header>

      {/* Slide-out drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-bg-card border-r border-white/5 flex flex-col"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/5">
              <div className="flex items-center gap-2">
                <img src={incentivesCoin} alt="Soulmate OS" className="w-7 h-7 rounded-lg" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Soulmate OS</span>
                  <span className="text-[10px] text-muted">Incentives Inc.</span>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 -mr-2 rounded-lg text-muted hover:text-white hover:bg-white/5"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav items — scrollable */}
            <nav className="flex-1 overflow-y-auto no-scrollbar p-3 flex flex-col gap-4">
              {groupedNav().map((group) => (
                <div key={group.name}>
                  <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted/70">{group.name}</p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = activePage === item.page;
                      return (
                        <button
                          key={item.page}
                          onClick={() => handleNavClick(item.page)}
                          className={cn(
                            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium min-h-[44px]",
                            active ? "bg-white/8 text-white" : "text-muted hover:text-white hover:bg-white/5"
                          )}
                        >
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />}
                          <Icon className={cn("w-[18px] h-[18px]", active ? "text-accent" : "")} />
                          {t(item.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {isFounder && (
                <div>
                  <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted/70">Founder</p>
                  <div className="flex flex-col gap-0.5">
                    {founderNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = activePage === item.page;
                      return (
                        <button
                          key={item.page}
                          onClick={() => handleNavClick(item.page)}
                          className={cn(
                            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium min-h-[44px]",
                            active ? "bg-white/8 text-white" : "text-muted hover:text-white hover:bg-white/5"
                          )}
                        >
                          {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-accent" />}
                          <Icon className={cn("w-[18px] h-[18px]", active ? "text-accent" : "")} />
                          {t(item.labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </nav>

            {/* Drawer footer */}
            <div className="flex items-center gap-2 px-3 py-3 border-t border-white/5">
              <LanguageSwitcher />
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-all text-sm font-medium min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                {t("common:common.logout")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom quick nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-bg-card/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-1 z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", height: "calc(56px + env(safe-area-inset-bottom))" }}
      >
        {mobileQuickItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.page}
              onClick={() => setActivePage(item.page)}
              className={cn("nav-item w-16 min-h-[48px]", activePage === item.page && "active")}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] truncate">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
