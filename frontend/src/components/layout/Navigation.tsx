import { useStore, type AppPage } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Mail,
  Phone,
  Users,
  Bot,
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
} from "lucide-react";

const navItems: { page: AppPage; label: string; icon: any }[] = [
  { page: "dashboard", label: "Soulmate Social", icon: LayoutDashboard },
  { page: "marketplace", label: "Marketplace", icon: ShoppingBag },
  { page: "dating", label: "Dating", icon: Heart },
  { page: "email", label: "Email", icon: Mail },
  { page: "phone", label: "Phone", icon: Phone },
  { page: "contacts", label: "Contacts", icon: Users },
  { page: "ai", label: "AI", icon: Bot },
  { page: "games", label: "Games", icon: Gamepad2 },
  { page: "wallet", label: "Wallet", icon: Wallet },
  { page: "security", label: "Security", icon: Shield },
  { page: "openclaw", label: "OpenClaw", icon: Terminal },
  { page: "hermes", label: "Hermes Agent", icon: Cpu },
  { page: "incentives", label: "Incentives", icon: Coins },
];

const founderNavItems: { page: AppPage; label: string; icon: any }[] = [
  { page: "healing", label: "Self-Healing", icon: Activity },
];

export function Sidebar() {
  const { activePage, setActivePage, clearWallet, clearAuth, setView, isFounder, authEmail } = useStore();

  const handleLogout = () => {
    clearWallet();
    clearAuth();
    setView("login");
  };

  return (
    <aside className="hidden md:flex flex-col w-60 h-screen bg-bg-card border-r border-border p-4 fixed left-0 top-0">
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold text-gradient">Soulmate OS</h1>
        <p className="text-xs text-muted mt-1">Personal AI Comms</p>
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
              {item.label}
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
                  {item.label}
                </button>
              );
            })}
          </>
        )}
      </nav>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted hover:text-danger hover:bg-danger/5 transition-all text-sm font-medium"
      >
        <LogOut className="w-5 h-5" />
        Lock
      </button>
    </aside>
  );
}

export function MobileNav() {
  const { activePage, setActivePage } = useStore();

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
            <span className="text-[10px]">{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={() => setActivePage("wallet")}
        className={cn("nav-item w-16", activePage === "wallet" && "active")}
      >
        <Wallet className="w-5 h-5" />
        <span className="text-[10px]">Wallet</span>
      </button>
    </nav>
  );
}
