import { useStore } from "@/lib/store";
import { Mail, Phone, Gamepad2, Wallet, TrendingUp, Coins } from "lucide-react";

export function DashboardPage() {
  const { setActivePage, walletAddress } = useStore();

  const stats = [
    { label: "Unread Emails", value: "0", icon: Mail, color: "text-accent", page: "email" as const },
    { label: "Missed Calls", value: "0", icon: Phone, color: "text-success", page: "phone" as const },
    { label: "Coin Balance", value: "1,000", icon: Coins, color: "text-warning", page: "games" as const },
  ];

  const quickActions = [
    { label: "Play High/Low", icon: Gamepad2, page: "games" as const, desc: "Win virtual coins" },
    { label: "Send Crypto", icon: Wallet, page: "wallet" as const, desc: "Transfer funds" },
    { label: "Check Email", icon: Mail, page: "email" as const, desc: "Inbox & compose" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-muted text-sm mt-1">Your communication hub</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              onClick={() => setActivePage(stat.page)}
              className="card hover:border-accent transition-all text-left"
            >
              <Icon className={`w-6 h-6 ${stat.color} mb-2`} />
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted">{stat.label}</p>
            </button>
          );
        })}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Quick Actions</h3>
        <div className="space-y-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => setActivePage(action.page)}
                className="card hover:border-accent transition-all w-full flex items-center gap-4 text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-bg-alt flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="font-medium">{action.label}</p>
                  <p className="text-xs text-muted">{action.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {walletAddress && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Wallet
            </h3>
            <button
              onClick={() => setActivePage("wallet")}
              className="text-xs text-accent hover:underline"
            >
              View →
            </button>
          </div>
          <p className="text-sm font-mono text-muted">{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</p>
        </div>
      )}
    </div>
  );
}
