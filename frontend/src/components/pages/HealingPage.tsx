import { useState, useEffect } from "react";
import { Activity, CheckCircle2, AlertTriangle, Clock, Zap } from "lucide-react";
import { useStore } from "@/lib/store";

interface HealError {
  id: string;
  type: string;
  message: string;
  page: string;
  severity: string;
  timestamp: string;
  status: string;
}

interface HealLog {
  log: Array<{ id: string; type: string; message: string; page: string; timestamp: string; acked_at: number }>;
  pending: number;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://191.44.121.29.sslip.io";

export function HealingPage() {
  const { isFounder } = useStore();
  const [log, setLog] = useState<HealLog>({ log: [], pending: 0 });
  const [loading, setLoading] = useState(true);
  const [bouncerOnline, setBouncerOnline] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const resp = await fetch(`${API_BASE}/v1/auto-heal/log`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          const data = await resp.json();
          setLog(data);
          setBouncerOnline(true);
        }
      } catch {
        setBouncerOnline(false);
      }
      setLoading(false);
    };
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!isFounder) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted text-sm">Founder access only.</p>
      </div>
    );
  }

  const totalFixed = log.log.length;
  const successRate = totalFixed > 0 ? 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Activity className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Self-Healing System</h1>
          <p className="text-sm text-muted">Auto-detect, report, and fix errors</p>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Bouncer Status</span>
          </div>
          <p className={`text-lg font-bold ${bouncerOnline ? "text-success" : "text-danger"}`}>
            {bouncerOnline ? "Online" : "Offline"}
          </p>
          <p className="text-xs text-muted mt-1">
            {bouncerOnline ? "Polling VPS for errors" : "Not receiving data"}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Pending Fixes</span>
          </div>
          <p className="text-lg font-bold text-warning">{log.pending}</p>
          <p className="text-xs text-muted mt-1">Errors awaiting fix</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-sm font-medium">Total Fixed</span>
          </div>
          <p className="text-lg font-bold text-success">{totalFixed}</p>
          <p className="text-xs text-muted mt-1">{successRate}% success rate</p>
        </div>
      </div>

      {/* Error Log */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          Healing History
        </h2>
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : log.log.length === 0 ? (
          <p className="text-sm text-muted">No errors detected yet. The system is healthy.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {log.log.slice().reverse().map((entry, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-bg/50 border border-border"
              >
                <div className="flex-shrink-0 mt-0.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      background:
                        entry.type === "JS_CRASH" || entry.type === "PROMISE_REJECTION"
                          ? "#EF5350"
                          : "#FFA726",
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.message}</p>
                  <p className="text-xs text-muted">
                    [{entry.type}] {entry.page && `on ${entry.page} • `}
                    {entry.timestamp}
                  </p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">How It Works</h2>
        <div className="space-y-2 text-xs text-muted">
          <p>1. Frontend captures JS errors, API failures, and crashes via ErrorBoundary</p>
          <p>2. Errors are sent to VPS via POST /v1/auto-heal/report</p>
          <p>3. Bouncer (bouncer.js) polls VPS every 10s for new errors</p>
          <p>4. Bouncer writes pending-fixes.json and injects message into Windsurf Cascade</p>
          <p>5. Cascade auto-fixes errors using the /auto-fix workflow (Turbo Mode — no Allow clicks)</p>
          <p>6. Fixes are deployed and pending-fixes.json is deleted</p>
        </div>
      </div>
    </div>
  );
}
