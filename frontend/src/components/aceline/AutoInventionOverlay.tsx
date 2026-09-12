import { useState, useEffect, useCallback, useRef } from "react";
import { autoInventionApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Zap, X, Terminal, FileCode, MessageSquare, Lightbulb,
  Loader2, CheckCircle, XCircle, Trophy, ChevronDown, ChevronUp,
  Play, Square, Eye, EyeOff, Sparkles,
} from "lucide-react";

interface Approach {
  id: string;
  name: string;
  description: string;
  surface: string;
  approach_type: string;
  commands: string[];
  status: string;
  result: string;
  score: number;
  error: string;
}

interface InventionState {
  phase: string;
  auto_mode: boolean;
  current_task: string;
  current_surface: string;
  approaches: Approach[];
  winner: Approach | null;
  terminal_output: string[];
  auto_typed: string[];
  page_preview: string;
  started_at: number;
  finished_at: number;
  summary_mode: boolean;
  error: string;
}

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  observing: "Observing",
  generating: "Generating",
  testing: "Testing",
  evaluating: "Evaluating",
  picking: "Picking Winner",
  saving: "Saving",
  done: "Done",
  error: "Error",
};

const PHASE_COLORS: Record<string, string> = {
  idle: "text-muted-foreground",
  observing: "text-blue-400",
  generating: "text-purple-400",
  testing: "text-yellow-400",
  evaluating: "text-orange-400",
  picking: "text-cyan-400",
  saving: "text-green-400",
  done: "text-green-400",
  error: "text-red-400",
};

export function AutoInventionOverlay() {
  const [state, setState] = useState<InventionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [summaryMode, setSummaryMode] = useState(false);
  const [expandedApproach, setExpandedApproach] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadState = useCallback(async () => {
    try {
      const s = await autoInventionApi.state();
      setState(s);
    } catch {
      // Not initialized yet
    }
  }, []);

  useEffect(() => {
    loadState();
    pollRef.current = setInterval(loadState, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadState]);

  const toggleAutoMode = useCallback(async () => {
    setLoading(true);
    try {
      const current = state?.auto_mode ?? false;
      await autoInventionApi.setAutoMode(!current);
      await loadState();
    } catch (e) { console.error("Toggle auto mode failed:", e); }
    setLoading(false);
  }, [state, loadState]);

  const toggleSummaryMode = useCallback(async () => {
    const newMode = !summaryMode;
    setSummaryMode(newMode);
    try {
      await autoInventionApi.setSummaryMode(newMode);
    } catch { /* non-critical */ }
  }, [summaryMode]);

  const runOneCycle = useCallback(async () => {
    setLoading(true);
    try {
      await autoInventionApi.run();
      await loadState();
    } catch (e) { console.error("Run cycle failed:", e); }
    setLoading(false);
  }, [loadState]);

  if (!state) return null;

  const isActive = state.auto_mode || state.phase !== "idle";
  if (!isActive) return null;

  const isDone = state.phase === "done";
  const phaseColor = PHASE_COLORS[state.phase] || "text-muted-foreground";

  return (
    <div className={cn(
      "fixed bottom-4 right-4 z-50 transition-all duration-300",
      collapsed ? "w-64" : "w-[min(95vw,1400px)]",
      summaryMode && !collapsed && "w-[min(90vw,800px)]"
    )}>
      {/* Header bar */}
      <div className="flex items-center justify-between bg-bg-secondary/95 backdrop-blur-md border border-border rounded-t-lg px-3 py-2 shadow-2xl">
        <div className="flex items-center gap-2">
          <Sparkles className={cn("w-4 h-4", state.auto_mode ? "text-accent animate-pulse" : "text-muted-foreground")} />
          <span className="text-sm font-semibold">Auto-Invention</span>
          <span className={cn("text-xs font-mono", phaseColor)}>
            {PHASE_LABELS[state.phase] || state.phase}
          </span>
          {state.current_task && (
            <span className="text-xs text-muted-foreground hidden md:inline">
              · {state.current_task}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Summary / Real-time toggle */}
          <button
            onClick={toggleSummaryMode}
            className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
            title={summaryMode ? "Show real-time panels" : "Show summary only"}
          >
            {summaryMode ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {summaryMode ? "Real-time" : "Summary"}
          </button>

          {/* Auto mode toggle */}
          <button
            onClick={toggleAutoMode}
            disabled={loading}
            className={cn(
              "text-xs px-2 py-1 flex items-center gap-1 rounded",
              state.auto_mode
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
            )}
          >
            {state.auto_mode ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {state.auto_mode ? "Stop" : "Auto"}
          </button>

          {/* Collapse */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="btn-secondary text-xs px-1.5 py-1"
          >
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Collapsed view */}
      {collapsed && (
        <div className="bg-bg-secondary/95 backdrop-blur-md border border-t-0 border-border rounded-b-lg px-3 py-2 shadow-2xl">
          <div className="text-xs text-muted-foreground">
            {isDone && state.winner
              ? `Winner: ${state.winner.name} (score: ${state.winner.score.toFixed(2)})`
              : `${state.approaches.length} approaches · ${state.terminal_output.length} commands run`
            }
          </div>
        </div>
      )}

      {/* Summary mode — compact single panel */}
      {!collapsed && summaryMode && (
        <div className="bg-bg-secondary/95 backdrop-blur-md border border-t-0 border-border rounded-b-lg p-3 shadow-2xl max-h-[60vh] overflow-y-auto">
          {state.error && (
            <div className="text-xs text-red-400 mb-2">Error: {state.error}</div>
          )}

          {isDone && state.winner && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="font-semibold text-yellow-400">Winner: {state.winner.name}</span>
                <span className="text-xs text-muted-foreground">
                  score: {state.winner.score.toFixed(2)} · {state.winner.surface}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{state.winner.description}</div>
              <div className="text-xs text-green-400">{state.winner.result}</div>
            </div>
          )}

          {!isDone && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                {state.phase !== "done" && state.phase !== "idle" && (
                  <Loader2 className="w-3 h-3 animate-spin text-accent" />
                )}
                <span className={phaseColor}>{PHASE_LABELS[state.phase]}</span>
                <span className="text-muted-foreground">
                  · {state.approaches.length} approaches · {state.approaches.filter(a => a.status === "passed").length} passed
                </span>
              </div>
              {state.approaches.length > 0 && (
                <div className="space-y-1">
                  {state.approaches.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-bg-secondary/50">
                      <div className="flex items-center gap-2">
                        {a.status === "testing" && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
                        {a.status === "passed" && <CheckCircle className="w-3 h-3 text-green-400" />}
                        {a.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                        {a.status === "pending" && <div className="w-3 h-3 rounded-full border border-muted-foreground" />}
                        <span>{a.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {a.score > 0 ? a.score.toFixed(2) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full real-time mode — 4 floating panels */}
      {!collapsed && !summaryMode && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 bg-bg-secondary/95 backdrop-blur-md border border-t-0 border-border rounded-b-lg p-2 shadow-2xl max-h-[70vh] overflow-hidden">

          {/* Panel 1: Terminal */}
          <Panel title="Terminal" icon={Terminal} accent="text-green-400">
            <div className="font-mono text-xs space-y-0.5 overflow-y-auto max-h-[50vh]">
              {state.terminal_output.length === 0 ? (
                <div className="text-muted-foreground italic">Waiting for commands...</div>
              ) : (
                state.terminal_output.map((line, i) => (
                  <div key={i} className={cn(
                    "whitespace-pre-wrap break-all",
                    line.startsWith("[") ? "text-muted-foreground" :
                    line.startsWith("  >") ? "text-green-400" :
                    line.startsWith("  !") ? "text-red-400" :
                    "text-foreground"
                  )}>
                    {line}
                  </div>
                ))
              )}
            </div>
          </Panel>

          {/* Panel 2: Page being worked on */}
          <Panel title="Working Page" icon={FileCode} accent="text-blue-400">
            <div className="text-xs space-y-2">
              <div className="text-muted-foreground">
                Surface: <span className="text-blue-400 font-medium">{state.current_surface}</span>
              </div>
              <div className="text-muted-foreground">
                Task: <span className="text-foreground">{state.current_task}</span>
              </div>
              {state.page_preview && (
                <div className="p-2 rounded bg-bg-secondary/50 border border-border text-xs">
                  {state.page_preview}
                </div>
              )}
              <div className="text-xs text-muted-foreground italic">
                Preview of the page being improved by the auto-invention process.
              </div>
            </div>
          </Panel>

          {/* Panel 3: Auto-typing box */}
          <Panel title="Auto-Typing" icon={MessageSquare} accent="text-purple-400">
            <div className="font-mono text-xs space-y-0.5 overflow-y-auto max-h-[50vh]">
              {state.auto_typed.length === 0 ? (
                <div className="text-muted-foreground italic">Aceline will type commands here...</div>
              ) : (
                state.auto_typed.map((line, i) => (
                  <div key={i} className={cn(
                    "whitespace-pre-wrap break-all",
                    line.startsWith("#") ? "text-purple-400" :
                    line.startsWith("$") ? "text-green-400" :
                    "text-foreground"
                  )}>
                    {line}
                  </div>
                ))
              )}
              {state.phase !== "done" && state.phase !== "idle" && (
                <div className="inline-block w-2 h-3 bg-purple-400 animate-pulse" />
              )}
            </div>
          </Panel>

          {/* Panel 4: Invention Lab */}
          <Panel title="Invention Lab" icon={Lightbulb} accent="text-yellow-400">
            <div className="space-y-1.5 overflow-y-auto max-h-[50vh]">
              {state.approaches.length === 0 ? (
                <div className="text-muted-foreground italic text-xs">
                  {state.phase === "generating"
                    ? "Generating approaches..."
                    : "Approaches will appear here..."}
                </div>
              ) : (
                state.approaches.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "p-2 rounded text-xs cursor-pointer transition-colors",
                      expandedApproach === a.id ? "bg-bg-secondary" : "bg-bg-secondary/50 hover:bg-bg-secondary",
                      state.winner?.id === a.id && "ring-1 ring-yellow-400"
                    )}
                    onClick={() => setExpandedApproach(expandedApproach === a.id ? null : a.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {a.status === "testing" && <Loader2 className="w-3 h-3 animate-spin text-yellow-400" />}
                        {a.status === "passed" && <CheckCircle className="w-3 h-3 text-green-400" />}
                        {a.status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
                        {a.status === "pending" && <div className="w-3 h-3 rounded-full border border-muted-foreground" />}
                        {state.winner?.id === a.id && <Trophy className="w-3 h-3 text-yellow-400" />}
                        <span className="font-medium">{a.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {a.score > 0 ? a.score.toFixed(2) : "—"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.approach_type} · {a.surface}
                    </div>
                    {expandedApproach === a.id && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div>{a.description}</div>
                        {a.commands.length > 0 && (
                          <div className="font-mono text-xs text-green-400">
                            {a.commands.map((c, j) => <div key={j}>$ {c}</div>)}
                          </div>
                        )}
                        {a.result && <div className="text-blue-400">{a.result}</div>}
                        {a.error && <div className="text-red-400">Error: {a.error}</div>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

// ── Panel wrapper ───────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, accent, children,
}: {
  title: string;
  icon: any;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-bg-secondary/60 rounded-lg border border-border/50 overflow-hidden flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-bg-secondary/50">
        <Icon className={cn("w-3.5 h-3.5", accent)} />
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <div className="p-2 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
