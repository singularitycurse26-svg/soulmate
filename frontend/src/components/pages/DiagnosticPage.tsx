import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { diagnosticsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { registerPageActions } from "@/lib/acelineRegistry";
import { PageHeader } from "@/components/layout/PageShell";
import {
  Stethoscope, CheckCircle, XCircle, AlertTriangle, Loader2,
  RefreshCw, Server, Globe, Database, Cpu, FileCode, Network,
  Terminal, Settings, Activity, ChevronDown, ChevronUp, Zap,
} from "lucide-react";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
  data?: any;
  timestamp: number;
}

interface DiagnosticsResult {
  overall: "healthy" | "degraded" | "unhealthy";
  summary: { total: number; passed: number; failed: number; warnings: number };
  duration_ms: number;
  checks: CheckResult[];
  timestamp: number;
}

const STATUS_CONFIG = {
  pass: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-400/10", label: "PASS" },
  fail: { icon: XCircle, color: "text-red-400", bg: "bg-red-400/10", label: "FAIL" },
  warn: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-400/10", label: "WARN" },
};

const OVERALL_CONFIG = {
  healthy: { color: "text-green-400", bg: "bg-green-400/10", label: "All Systems Healthy", icon: CheckCircle },
  degraded: { color: "text-yellow-400", bg: "bg-yellow-400/10", label: "System Degraded", icon: AlertTriangle },
  unhealthy: { color: "text-red-400", bg: "bg-red-400/10", label: "System Unhealthy", icon: XCircle },
};

function getCheckIcon(name: string): any {
  const lower = name.toLowerCase();
  if (lower.includes("backend") || lower.includes("server")) return Server;
  if (lower.includes("frontend") || lower.includes("vite")) return Globe;
  if (lower.includes("ollama") || lower.includes("glm") || lower.includes("model")) return Cpu;
  if (lower.includes("database") || lower.includes("catalog") || lower.includes("marketplace")) return Database;
  if (lower.includes("aceline")) return Terminal;
  if (lower.includes("route")) return Activity;
  if (lower.includes("module") || lower.includes("python")) return FileCode;
  if (lower.includes("network")) return Network;
  if (lower.includes("resource") || lower.includes("memory") || lower.includes("disk")) return Settings;
  if (lower.includes("file")) return FileCode;
  if (lower.includes("env")) return Settings;
  return Zap;
}

export function DiagnosticPage() {
  const showAlert = useStore((s) => s.showAlert);
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const data = await diagnosticsApi.run();
      setResult(data);
    } catch (e: any) {
      showAlert("danger", `Diagnostics failed: ${e.message}`);
      setResult(null);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(runDiagnostics, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, runDiagnostics]);

  // Register Aceline actions
  useEffect(() => {
    registerPageActions("diagnostics", [
      { id: "run-diagnostics", label: "Run diagnostics", description: "Run step-by-step system health checks", category: "control",
        readState: () => ({ overall: result?.overall, summary: result?.summary }),
        execute: async () => {
          const data = await diagnosticsApi.run();
          setResult(data);
          return data;
        } },
      { id: "quick-check", label: "Quick health check", description: "Quick check of all services", category: "read",
        execute: async () => {
          const data = await diagnosticsApi.quick();
          return data;
        } },
      { id: "toggle-auto-refresh", label: "Toggle auto-refresh", description: "Toggle 15-second auto-refresh", category: "control",
        execute: async () => {
          setAutoRefresh((v) => !v);
          return `Auto-refresh ${!autoRefresh ? "enabled" : "disabled"}`;
        } },
    ]);
  }, [result, autoRefresh]);

  const overall = result ? OVERALL_CONFIG[result.overall] : null;
  const failedChecks = result?.checks.filter(c => c.status === "fail") || [];
  const warnChecks = result?.checks.filter(c => c.status === "warn") || [];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={Stethoscope}
        title="System Diagnostics"
        subtitle="Step-by-step detector — runs 15 checks across all Soulmate OS subsystems"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition",
                autoRefresh ? "bg-accent text-white" : "btn-secondary",
              )}
            >
              <Activity className="w-3.5 h-3.5" /> {autoRefresh ? "Auto ON" : "Auto OFF"}
            </button>
            <button onClick={runDiagnostics} disabled={loading} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run Checks
            </button>
          </div>
        }
      />

      {/* Overall status banner */}
      {result && overall && (
        <div className={cn("rounded-xl p-4 flex items-center gap-3", overall.bg)}>
          <overall.icon className={cn("w-8 h-8", overall.color)} />
          <div className="flex-1">
            <p className={cn("text-sm font-semibold", overall.color)}>{overall.label}</p>
            <p className="text-xs text-muted">
              {result.summary.passed} passed, {result.summary.failed} failed, {result.summary.warnings} warnings — {result.duration_ms}ms
            </p>
          </div>
        </div>
      )}

      {/* Quick issues summary */}
      {result && failedChecks.length > 0 && (
        <div className="card border-l-2 border-red-400/50 space-y-1">
          <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5" /> Failed Checks ({failedChecks.length})
          </p>
          {failedChecks.map((c, i) => (
            <div key={i} className="text-xs text-muted">
              <span className="text-red-400 font-medium">{c.name}:</span> {c.detail}
            </div>
          ))}
        </div>
      )}

      {result && warnChecks.length > 0 && (
        <div className="card border-l-2 border-yellow-400/50 space-y-1">
          <p className="text-xs font-semibold text-yellow-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({warnChecks.length})
          </p>
          {warnChecks.map((c, i) => (
            <div key={i} className="text-xs text-muted">
              <span className="text-yellow-400 font-medium">{c.name}:</span> {c.detail}
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && !result && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted">Running diagnostics...</p>
          </div>
        </div>
      )}

      {/* Step-by-step checks */}
      {result && (
        <div className="grid gap-1.5">
          {result.checks.map((check, i) => {
            const config = STATUS_CONFIG[check.status];
            const Icon = getCheckIcon(check.name);
            const isExpanded = expanded === `${i}-${check.name}`;
            const hasData = check.data && Object.keys(check.data).length > 0;

            return (
              <div
                key={i}
                className={cn("card-soft border-l-2 transition", {
                  "border-green-400/30": check.status === "pass",
                  "border-red-400/30": check.status === "fail",
                  "border-yellow-400/30": check.status === "warn",
                })}
              >
                <div
                  className="flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : `${i}-${check.name}`)}
                >
                  {/* Step number */}
                  <span className="text-[10px] text-muted/50 font-mono w-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  {/* Status icon */}
                  <config.icon className={cn("w-4 h-4 flex-shrink-0", config.color)} />

                  {/* Check icon */}
                  <Icon className="w-3.5 h-3.5 text-muted flex-shrink-0" />

                  {/* Name + detail */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{check.name}</p>
                    <p className="text-[10px] text-muted truncate">{check.detail}</p>
                  </div>

                  {/* Status badge */}
                  <span className={cn("text-[9px] px-2 py-0.5 rounded-full font-mono font-bold", config.bg, config.color)}>
                    {config.label}
                  </span>

                  {/* Expand chevron */}
                  {hasData && (
                    isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  )}
                </div>

                {/* Expanded data */}
                {isExpanded && hasData && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <pre className="text-[10px] text-muted bg-bg-alt rounded-lg p-2 overflow-x-auto max-h-40">
                      {JSON.stringify(check.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No result */}
      {!result && !loading && (
        <div className="card text-center py-12 text-muted">
          <Stethoscope className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Click "Run Checks" to start diagnostics</p>
        </div>
      )}

      {/* Footer info */}
      {result && (
        <div className="text-[10px] text-muted/50 text-center">
          Last run: {new Date(result.timestamp * 1000).toLocaleTimeString()} — {result.duration_ms}ms —
          {autoRefresh ? " Auto-refreshing every 15s" : " Manual refresh"}
        </div>
      )}
    </div>
  );
}
