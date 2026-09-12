import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { observerApi } from "@/lib/api";
import { getActivityStats } from "@/lib/activityWatcher";
import { cn } from "@/lib/utils";
import { registerPageActions } from "@/lib/acelineRegistry";
import { PageHeader } from "@/components/layout/PageShell";
import { useActivity } from "@/lib/useActivity";
import {
  Eye, Activity, Clock, TrendingUp, CheckCircle, XCircle,
  AlertTriangle, Loader2, RefreshCw, Zap, Calendar,
  FileText, Workflow, Lightbulb, ChevronDown, ChevronUp,
} from "lucide-react";

interface ObserverStats {
  running: boolean;
  buffer_size: number;
  buffer_max: number;
  total_ingested: number;
  total_flushed: number;
  total_dropped: number;
  total_pruned: number;
  db_path: string;
  detection_interval_s: number;
  observer_model: string;
}

interface Workflow {
  id: string;
  name: string;
  category: string;
  steps_json: string;
  frequency: number;
  success_rate: number;
  first_seen: number;
  last_seen: number;
}

interface Routine {
  id: string;
  workflow_id: string;
  day_of_week: number;
  time_block: string;
  confidence: number;
  occurrences: number;
  last_seen: number;
}

interface ImprovementNote {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  suggested_fix: string;
  status: string;
  created_at: number;
}

interface MonthlyReport {
  id: string;
  month: string;
  report_json: string;
  notes_count: number;
  approved_count: number;
  rejected_count: number;
  implemented_count: number;
  created_at: number;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
  critical: { color: "text-red-400", bg: "bg-red-400/10", icon: AlertTriangle },
  high: { color: "text-orange-400", bg: "bg-orange-400/10", icon: AlertTriangle },
  medium: { color: "text-yellow-400", bg: "bg-yellow-400/10", icon: Lightbulb },
  low: { color: "text-blue-400", bg: "bg-blue-400/10", icon: Lightbulb },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: any }> = {
  pending: { color: "text-yellow-400", bg: "bg-yellow-400/10", icon: Clock },
  approved: { color: "text-green-400", bg: "bg-green-400/10", icon: CheckCircle },
  rejected: { color: "text-red-400", bg: "bg-red-400/10", icon: XCircle },
  implemented: { color: "text-blue-400", bg: "bg-blue-400/10", icon: CheckCircle },
};

export function ObserverPage() {
  const showAlert = useStore((s) => s.showAlert);
  const { track, trackClick } = useActivity("observer");
  const [stats, setStats] = useState<ObserverStats | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [notes, setNotes] = useState<ImprovementNote[]>([]);
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [innovating, setInnovating] = useState(false);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [frontendStats, setFrontendStats] = useState({ tracked: 0, filtered: 0, flushed: 0, queued: 0 });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, wfData, rtData, notesData, reportsData] = await Promise.all([
        observerApi.stats().catch(() => null),
        observerApi.workflows().catch(() => ({ workflows: [] })),
        observerApi.routines().catch(() => ({ routines: [] })),
        observerApi.notes().catch(() => ({ notes: [] })),
        observerApi.monthlyReports().catch(() => ({ reports: [] })),
      ]);
      if (statsData) setStats(statsData);
      setWorkflows(wfData?.workflows || []);
      setRoutines(rtData?.routines || []);
      setNotes(notesData?.notes || []);
      setReports(reportsData?.reports || []);
      setFrontendStats(getActivityStats());
    } catch (e: any) {
      showAlert("danger", `Failed to load observer data: ${e.message}`);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [loadAll]);

  const runDetection = useCallback(async () => {
    setDetecting(true);
    track("command", "run_detection", "observer");
    try {
      const result = await observerApi.detect();
      showAlert(
        result?.status === "ok" ? "success" : "info",
        `Detection: ${result?.status} — ${result?.event_count || 0} events, ${result?.workflows_created || 0} workflows, ${result?.notes_created || 0} notes`
      );
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Detection failed: ${e.message}`);
    }
    setDetecting(false);
  }, [showAlert, loadAll, track]);

  const runInnovation = useCallback(async () => {
    setInnovating(true);
    track("command", "run_innovation_framework", "observer");
    try {
      const result = await observerApi.innovate();
      if (result?.status === "ok") {
        showAlert(
          "success",
          `Innovation Framework: ${result.notes_created} notes generated across surfaces: ${(result.surfaces || []).join(", ")}`
        );
      } else {
        showAlert("info", `Innovation: ${result?.status} — ${result?.event_count || 0} events analyzed`);
      }
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Innovation failed: ${e.message}`);
    }
    setInnovating(false);
  }, [showAlert, loadAll, track]);

  const approveNote = useCallback(async (noteId: string) => {
    trackClick(`approve-${noteId}`);
    try {
      await observerApi.approveNote(noteId);
      showAlert("success", "Note approved — Aceline will implement this improvement");
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Failed to approve: ${e.message}`);
    }
  }, [showAlert, loadAll, trackClick]);

  const rejectNote = useCallback(async (noteId: string) => {
    trackClick(`reject-${noteId}`);
    try {
      await observerApi.rejectNote(noteId);
      showAlert("info", "Note rejected");
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Failed to reject: ${e.message}`);
    }
  }, [showAlert, loadAll, trackClick]);

  // Register Aceline actions
  useEffect(() => {
    registerPageActions("observer", [
      {
        id: "run-detection",
        label: "Run workflow detection",
        description: "Trigger workflow detection on recent activity",
        category: "control",
        readState: () => ({ stats, workflow_count: workflows.length, note_count: notes.length }),
        execute: async () => {
          const result = await observerApi.detect();
          loadAll();
          return result;
        },
      },
      {
        id: "run-innovation-framework",
        label: "Run innovation framework",
        description: "Run the Universal Technology Invention & Innovation Framework on the 4 Aceline surfaces (UI, CLI, webpage, terminal)",
        category: "control",
        execute: async () => {
          const result = await observerApi.innovate();
          loadAll();
          return result;
        },
      },
      {
        id: "approve-all-notes",
        label: "Approve all pending notes",
        description: "Approve all pending improvement notes at once",
        category: "control",
        execute: async () => {
          const pending = notes.filter((n) => n.status === "pending");
          for (const n of pending) {
            await observerApi.approveNote(n.id);
          }
          loadAll();
          return `Approved ${pending.length} notes`;
        },
      },
      {
        id: "get-stats",
        label: "Get observer stats",
        description: "Read observer statistics",
        category: "read",
        execute: async () => observerApi.stats(),
      },
    ]);
  }, [stats, workflows, notes]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={Eye}
        title="Aceline Smart Work Watcher"
        subtitle="Background activity observation, workflow learning, and auto-improvement"
        actions={
          <div className="flex gap-2">
            <button
              onClick={runInnovation}
              disabled={innovating}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              {innovating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
              Innovate
            </button>
            <button
              onClick={runDetection}
              disabled={detecting}
              className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Detect Now
            </button>
            <button onClick={loadAll} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Activity}
          label="Events Logged"
          value={stats?.total_ingested ?? 0}
          sublabel={`${frontendStats.tracked} tracked, ${frontendStats.filtered} filtered`}
          color="text-blue-400"
        />
        <StatCard
          icon={Workflow}
          label="Workflows Detected"
          value={workflows.length}
          sublabel={`${routines.length} daily routines`}
          color="text-purple-400"
        />
        <StatCard
          icon={Lightbulb}
          label="Improvement Notes"
          value={notes.length}
          sublabel={`${notes.filter((n) => n.status === "pending").length} pending`}
          color="text-yellow-400"
        />
        <StatCard
          icon={Calendar}
          label="Monthly Reports"
          value={reports.length}
          sublabel={stats?.observer_model ? `Model: ${stats.observer_model}` : "Using primary model"}
          color="text-green-400"
        />
      </div>

      {/* Frontend Stats — Dedup/Throttle verification */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Event Filtering (Bottleneck Fix 2)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Tracked</div>
            <div className="text-lg font-bold text-green-400">{frontendStats.tracked}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Filtered (noise/dup)</div>
            <div className="text-lg font-bold text-red-400">{frontendStats.filtered}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Flushed to backend</div>
            <div className="text-lg font-bold text-blue-400">{frontendStats.flushed}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Queue (pending)</div>
            <div className="text-lg font-bold text-yellow-400">{frontendStats.queued}</div>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          Filter ratio: {frontendStats.tracked + frontendStats.filtered > 0
            ? Math.round((frontendStats.filtered / (frontendStats.tracked + frontendStats.filtered)) * 100)
            : 0}% of events filtered as noise/duplicates
        </div>
      </div>

      {/* Workflows */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Detected Workflows</h3>
          <span className="text-xs text-muted-foreground">({workflows.length})</span>
        </div>
        {workflows.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No workflows detected yet. The observer runs detection every 30 minutes.
            Click "Detect Now" to trigger it manually.
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.slice(0, 10).map((wf) => (
              <div key={wf.id} className="flex items-center justify-between p-2 rounded-lg bg-bg-secondary">
                <div>
                  <div className="text-sm font-medium">{wf.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Frequency: {wf.frequency}x · Success rate: {(wf.success_rate * 100).toFixed(0)}%
                  </div>
                </div>
                <button
                  onClick={() => {
                    trackClick(`run-workflow-${wf.id}`);
                    observerApi.runWorkflow(wf.id).then(() => showAlert("info", `Started workflow: ${wf.name}`));
                  }}
                  className="btn-secondary text-xs px-2 py-1"
                >
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Improvement Notes */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-yellow-400" />
          <h3 className="text-sm font-semibold">Improvement Notes</h3>
          <span className="text-xs text-muted-foreground">({notes.length})</span>
        </div>
        {notes.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No improvement notes yet. Notes are generated during workflow detection.
          </div>
        ) : (
          <div className="space-y-2">
            {notes.slice(0, 20).map((note) => {
              const sev = SEVERITY_CONFIG[note.severity] || SEVERITY_CONFIG.low;
              const st = STATUS_CONFIG[note.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedNote === note.id;
              const SevIcon = sev.icon;
              const StIcon = st.icon;
              return (
                <div key={note.id} className={cn("rounded-lg p-3", sev.bg)}>
                  <div
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setExpandedNote(isExpanded ? null : note.id)}
                  >
                    <div className="flex items-start gap-2 flex-1">
                      <SevIcon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", sev.color)} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{note.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {note.category} · {note.severity}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full flex items-center gap-1", st.bg, st.color)}>
                        <StIcon className="w-3 h-3" />
                        {note.status}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Description: </span>
                        {note.description}
                      </div>
                      {note.suggested_fix && (
                        <div>
                          <span className="text-muted-foreground">Suggested fix: </span>
                          {note.suggested_fix}
                        </div>
                      )}
                      {note.status === "pending" && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => approveNote(note.id)}
                            className="btn-primary text-xs px-3 py-1 flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => rejectNote(note.id)}
                            className="btn-secondary text-xs px-3 py-1 flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly Reports */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4 text-green-400" />
          <h3 className="text-sm font-semibold">Monthly Improvement Reports</h3>
          <span className="text-xs text-muted-foreground">({reports.length})</span>
        </div>
        {reports.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No monthly reports yet. Reports are generated on the 1st of each month.
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => {
              const isExpanded = expandedReport === report.id;
              let reportData: any = null;
              try {
                reportData = JSON.parse(report.report_json);
              } catch {
                // ignore
              }
              return (
                <div key={report.id} className="rounded-lg p-3 bg-bg-secondary">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-400" />
                      <div>
                        <div className="text-sm font-medium">{report.month}</div>
                        <div className="text-xs text-muted-foreground">
                          {report.notes_count} notes · {report.approved_count} approved · {report.implemented_count} implemented
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  {isExpanded && reportData && (
                    <div className="mt-3 space-y-2 text-xs">
                      {reportData.summary && (
                        <div className="p-2 rounded bg-bg-primary">
                          <span className="text-muted-foreground">Summary: </span>
                          {reportData.summary}
                        </div>
                      )}
                      {reportData.by_category && (
                        <div>
                          <span className="text-muted-foreground">By category: </span>
                          {Object.entries(reportData.by_category).map(([cat, count]) => `${cat} (${count})`).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Backend Stats */}
      {stats && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">Backend Stats</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Running</div>
              <div className={cn("font-bold", stats.running ? "text-green-400" : "text-red-400")}>
                {stats.running ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Buffer</div>
              <div className="font-bold">{stats.buffer_size} / {stats.buffer_max}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Ingested</div>
              <div className="font-bold text-blue-400">{stats.total_ingested}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Flushed</div>
              <div className="font-bold text-green-400">{stats.total_flushed}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Dropped</div>
              <div className="font-bold text-yellow-400">{stats.total_dropped}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Pruned</div>
              <div className="font-bold text-red-400">{stats.total_pruned}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Detection Interval</div>
              <div className="font-bold">{stats.detection_interval_s}s</div>
            </div>
            <div>
              <div className="text-muted-foreground">Observer Model</div>
              <div className="font-bold text-xs">{stats.observer_model || "(primary)"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">DB Path</div>
              <div className="font-bold text-xs truncate" title={stats.db_path}>{stats.db_path}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sublabel, color }: { icon: any; label: string; value: number; sublabel: string; color: string }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
    </div>
  );
}
