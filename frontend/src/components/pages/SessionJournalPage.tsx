import { useState, useEffect } from "react";
import {
  getVaultEntries,
  getVaultSessions,
  generateVaultAssessment,
  clearVaultJournal,
  type SessionEntry,
  type SessionAssessment,
} from "@/lib/vault";
import { useStore } from "@/lib/store";
import {
  BookOpen, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock,
  Code, Bug, Wrench, Rocket, Settings, Search, Monitor, Shield,
  ChevronDown, ChevronRight, Lightbulb,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ICONS: Record<string, any> = {
  feature: Code,
  fix: Bug,
  refactor: Wrench,
  deployment: Rocket,
  config: Settings,
  research: Search,
  ui: Monitor,
  security: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  feature: "text-blue-400",
  fix: "text-red-400",
  refactor: "text-yellow-400",
  deployment: "text-green-400",
  config: "text-gray-400",
  research: "text-purple-400",
  ui: "text-pink-400",
  security: "text-orange-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-red-500 bg-red-500/10",
  medium: "border-yellow-500 bg-yellow-500/10",
  low: "border-blue-500 bg-blue-500/10",
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function SessionJournalPage() {
  const { showAlert } = useStore();
  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [assessment, setAssessment] = useState<SessionAssessment | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [showAssessment, setShowAssessment] = useState(true);

  const refresh = () => {
    setEntries(getVaultEntries());
    setAssessment(generateVaultAssessment());
  };

  useEffect(() => { refresh(); }, []);

  const handleClear = () => {
    clearVaultJournal();
    refresh();
    showAlert("info", "Session journal cleared");
  };

  // Group entries by session
  const sessions: Record<string, SessionEntry[]> = {};
  for (const entry of entries) {
    if (!sessions[entry.session_id]) sessions[entry.session_id] = [];
    sessions[entry.session_id].push(entry);
  }

  const sessionIds = Object.keys(sessions).reverse();

  const toggleSession = (id: string) => {
    const next = new Set(expandedSessions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSessions(next);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Session Journal</h1>
            <p className="text-sm text-muted">Auto-cataloged work history & smart assessments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost p-2" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleClear} className="btn-ghost p-2 text-red-400" title="Clear journal">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Assessment Panel */}
      {assessment && showAssessment && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5 border-l-4 border-accent"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-accent" />
              <h2 className="font-bold text-lg">Next Steps Assessment</h2>
            </div>
            <button onClick={() => setShowAssessment(false)} className="text-muted hover:text-fg text-sm">
              Dismiss
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-bg-alt rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">{assessment.total_sessions}</p>
              <p className="text-xs text-muted">Sessions</p>
            </div>
            <div className="bg-bg-alt rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">{assessment.total_entries}</p>
              <p className="text-xs text-muted">Work Items</p>
            </div>
            <div className="bg-bg-alt rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-accent">{assessment.categories_covered.length}</p>
              <p className="text-xs text-muted">Categories</p>
            </div>
          </div>

          <p className="text-sm text-muted mb-3">
            Last worked on: <span className="text-fg font-medium">{assessment.last_worked_on}</span>
          </p>

          {/* Suggestions */}
          <div className="space-y-2">
            {assessment.suggestions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle className="w-4 h-4" />
                <span>All caught up — no pending items detected</span>
              </div>
            ) : (
              assessment.suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 border-l-4 ${PRIORITY_COLORS[s.priority]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase ${PRIORITY_COLORS[s.priority].split(" ")[0]}`}>
                          {s.priority}
                        </span>
                        <span className="text-xs text-muted">{s.category}</span>
                      </div>
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted mt-1">{s.reason}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}

      {/* Session Timeline */}
      <div className="space-y-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted" />
          Work Timeline
        </h2>

        {entries.length === 0 ? (
          <div className="card p-8 text-center">
            <BookOpen className="w-12 h-12 text-muted mx-auto mb-3" />
            <p className="text-muted">No work logged yet. The journal auto-records as you work.</p>
          </div>
        ) : (
          sessionIds.map((sessionId) => {
            const sessionEntries = sessions[sessionId];
            const isExpanded = expandedSessions.has(sessionId);
            const sessionStart = sessionEntries[0]?.timestamp;
            const sessionEnd = sessionEntries[sessionEntries.length - 1]?.timestamp;

            return (
              <div key={sessionId} className="card overflow-hidden">
                <button
                  onClick={() => toggleSession(sessionId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-bg-alt"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted" />
                    )}
                    <div className="text-left">
                      <p className="font-medium text-sm">
                        Session {sessionIds.length - sessionIds.indexOf(sessionId)}
                      </p>
                      <p className="text-xs text-muted">
                        {sessionStart && formatTime(sessionStart)}
                        {sessionEnd && sessionStart !== sessionEnd && ` — ${formatTime(sessionEnd)}`}
                        {" · "}{sessionEntries.length} items
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from(new Set(sessionEntries.map(e => e.category))).slice(0, 4).map(cat => {
                      const Icon = CATEGORY_ICONS[cat] || Code;
                      return <Icon key={cat} className={`w-3.5 h-3.5 ${CATEGORY_COLORS[cat]}`} />;
                    })}
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border">
                        {sessionEntries.map((entry, i) => {
                          const Icon = CATEGORY_ICONS[entry.category] || Code;
                          return (
                            <div
                              key={entry.id}
                              className={`flex items-start gap-3 p-3 ${i < sessionEntries.length - 1 ? "border-b border-border" : ""}`}
                            >
                              <div className="flex-shrink-0 mt-0.5">
                                <Icon className={`w-4 h-4 ${CATEGORY_COLORS[entry.category]}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{entry.title}</p>
                                  <span className="text-xs text-muted flex-shrink-0">{formatTime(entry.timestamp)}</span>
                                </div>
                                <p className="text-xs text-muted mt-0.5">{entry.description}</p>
                                {entry.files.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {entry.files.map((f, j) => (
                                      <code key={j} className="text-xs bg-bg-alt px-1.5 py-0.5 rounded text-muted">
                                        {f.split("/").pop()}
                                      </code>
                                    ))}
                                  </div>
                                )}
                                {entry.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {entry.tags.map((t, j) => (
                                      <span key={j} className="text-xs text-accent">#{t}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
