import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { catalogApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { registerPageActions } from "@/lib/acelineRegistry";
import { PageHeader } from "@/components/layout/PageShell";
import {
  Archive, Bot, Activity, Lightbulb, Folder, Search, Loader2,
  CheckCircle, XCircle, Clock, TrendingUp, Plus, RefreshCw,
  Github, ExternalLink, FileCode, Terminal, Cpu, Tag,
  AlertCircle, ChevronDown, ChevronUp, Filter,
} from "lucide-react";

type Tab = "projects" | "agents" | "suggestions";

interface Project {
  id: string;
  name: string;
  category: string;
  status: string;
  description: string;
  repo_url: string;
  local_path: string;
  live_url: string;
  build_command: string;
  test_command: string;
  tech_stack: string[];
  file_inventory: any[];
  tags: string[];
  created_at: number;
  updated_at: number;
  completed_at: number;
}

interface AgentLog {
  id: string;
  agent_type: string;
  agent_name: string;
  action_type: string;
  target_project: string;
  description: string;
  result: string;
  output: string;
  duration_ms: number;
  timestamp: number;
}

interface Suggestion {
  id: string;
  type: string;
  target: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  proposed_by: string;
  proposed_at: number;
}

const STATUS_COLORS: Record<string, string> = {
  "planned": "text-blue-400 bg-blue-400/10",
  "in-progress": "text-yellow-400 bg-yellow-400/10",
  "completed": "text-green-400 bg-green-400/10",
  "archived": "text-gray-400 bg-gray-400/10",
  "paused": "text-orange-400 bg-orange-400/10",
  "blocked": "text-red-400 bg-red-400/10",
};

const PRIORITY_COLORS: Record<string, string> = {
  "critical": "text-red-400 bg-red-400/10 border-red-400/30",
  "high": "text-orange-400 bg-orange-400/10 border-orange-400/30",
  "medium": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  "low": "text-blue-400 bg-blue-400/10 border-blue-400/30",
};

const RESULT_COLORS: Record<string, string> = {
  "success": "text-green-400",
  "failure": "text-red-400",
  "partial": "text-yellow-400",
};

function timeAgo(ts: number): string {
  if (!ts) return "—";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function ArchivePage() {
  const showAlert = useStore((s) => s.showAlert);
  const [tab, setTab] = useState<Tab>("projects");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  // Project state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectFilterStatus, setProjectFilterStatus] = useState("");
  const [projectFilterCategory, setProjectFilterCategory] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  // Agent log state
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [logFilterAgent, setLogFilterAgent] = useState("");
  const [logFilterAction, setLogFilterAction] = useState("");
  const [agentStats, setAgentStats] = useState<any>(null);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionFilterStatus, setSuggestionFilterStatus] = useState("pending");
  const [newSuggestion, setNewSuggestion] = useState({ title: "", description: "", type: "improvement", priority: "medium", target: "" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, cats] = await Promise.all([
        catalogApi.stats().catch(() => null),
        catalogApi.listCategories().catch(() => ({ categories: [] })),
      ]);
      if (st) setStats(st);
      if (cats?.categories) setCategories(cats.categories);
    } catch {}
    setLoading(false);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const data = await catalogApi.listProjects(projectFilterStatus, projectFilterCategory, projectSearch);
      setProjects(data.projects || []);
    } catch (e: any) {
      setProjects([]);
    }
  }, [projectFilterStatus, projectFilterCategory, projectSearch]);

  const loadLogs = useCallback(async () => {
    try {
      const [data, astats] = await Promise.all([
        catalogApi.listAgentLog(logFilterAgent, "", logFilterAction),
        catalogApi.agentStats().catch(() => null),
      ]);
      setLogs(data.logs || []);
      if (astats) setAgentStats(astats);
    } catch {
      setLogs([]);
    }
  }, [logFilterAgent, logFilterAction]);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await catalogApi.listSuggestions(suggestionFilterStatus);
      setSuggestions(data.suggestions || []);
    } catch {
      setSuggestions([]);
    }
  }, [suggestionFilterStatus]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === "projects") loadProjects(); }, [tab, loadProjects]);
  useEffect(() => { if (tab === "agents") loadLogs(); }, [tab, loadLogs]);
  useEffect(() => { if (tab === "suggestions") loadSuggestions(); }, [tab, loadSuggestions]);

  // Register Aceline actions
  useEffect(() => {
    registerPageActions("archive", [
      { id: "read-projects", label: "Read project archive", description: "List all cataloged projects", category: "read",
        readState: () => ({ count: projects.length, categories: categories.length }),
        execute: async () => projects },
      { id: "read-suggestions", label: "Read pending suggestions", description: "Get best pending improvement suggestions for user review", category: "read",
        readState: () => ({ pending: suggestions.filter(s => s.status === "pending").length }),
        execute: async () => {
          const data = await catalogApi.pendingSuggestions(5);
          return data;
        } },
      { id: "read-stats", label: "Read catalog stats", description: "Read overall catalog statistics", category: "read",
        readState: () => stats, execute: async () => stats },
      { id: "read-agent-log", label: "Read agent log", description: "Read recent AI agent activity", category: "read",
        readState: () => ({ count: logs.length }),
        execute: async () => logs.slice(0, 10) },
      { id: "create-suggestion", label: "Propose improvement", description: "Create a new improvement suggestion for user review", category: "write",
        execute: async (...args: any[]) => {
          const [title, description, priority = "medium", target = "", type = "improvement"] = args;
          await catalogApi.createSuggestion({ title, description, priority, target, type, proposed_by: "aceline" });
          loadSuggestions();
          return "Suggestion created — it will appear in the pending list for user review";
        } },
      { id: "approve-suggestion", label: "Approve suggestion", description: "Approve a pending suggestion", category: "write",
        execute: async (...args: any[]) => {
          const [id] = args;
          await catalogApi.reviewSuggestion(id, "approved");
          loadSuggestions();
          return "Suggestion approved";
        } },
      { id: "log-action", label: "Log agent action", description: "Log an action to the agent log", category: "write",
        execute: async (...args: any[]) => {
          const [action_type, description, target_project = "", result = "success", output = ""] = args;
          await catalogApi.logAgentAction({ agent_type: "aceline", agent_name: "aceline", action_type, description, target_project, result, output });
          return "Action logged";
        } },
      { id: "rescan-projects", label: "Rescan projects", description: "Trigger a rescan of the projects directory", category: "control",
        execute: async () => {
          await catalogApi.rescanProjects();
          loadProjects();
          return "Projects rescanned";
        } },
      { id: "view-projects", label: "View project archive", description: "Switch to project archive tab", category: "navigation",
        execute: async () => { setTab("projects"); return "Switched to project archive" } },
      { id: "view-agents", label: "View agent log", description: "Switch to agent log tab", category: "navigation",
        execute: async () => { setTab("agents"); return "Switched to agent log" } },
      { id: "view-suggestions", label: "View suggestions", description: "Switch to suggestions tab", category: "navigation",
        execute: async () => { setTab("suggestions"); return "Switched to suggestions" } },
    ]);
  }, [projects, logs, suggestions, stats, categories]);

  const handleRescan = async () => {
    try {
      await catalogApi.rescanProjects();
      showAlert("success", "Projects rescanned");
      loadProjects();
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleReviewSuggestion = async (id: string, status: string) => {
    try {
      await catalogApi.reviewSuggestion(id, status);
      showAlert("success", `Suggestion ${status}`);
      loadSuggestions();
      loadAll();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleCreateSuggestion = async () => {
    if (!newSuggestion.title) return showAlert("danger", "Title required");
    try {
      await catalogApi.createSuggestion({ ...newSuggestion, proposed_by: "founder" });
      showAlert("success", "Suggestion created");
      setNewSuggestion({ title: "", description: "", type: "improvement", priority: "medium", target: "" });
      loadSuggestions();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: "projects", label: "Project Archive", icon: Archive, count: stats?.projects?.total },
    { id: "agents", label: "Agent Log", icon: Bot, count: stats?.agent_log?.total },
    { id: "suggestions", label: "Suggestions", icon: Lightbulb, count: stats?.suggestions?.pending },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={Archive}
        title="Soulmate OS Catalog"
        subtitle="Two-part universal memory & journaling — Project Archive + Agent Log + Improvement Suggestions"
        actions={
          <button onClick={handleRescan} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Rescan
          </button>
        }
      />

      {/* Stats overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="card-soft flex items-center gap-2">
            <Folder className="w-5 h-5 text-accent" />
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Projects</p>
              <p className="text-lg font-semibold">{stats.projects?.total || 0}</p>
            </div>
          </div>
          <div className="card-soft flex items-center gap-2">
            <Bot className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Agent Logs</p>
              <p className="text-lg font-semibold">{stats.agent_log?.total || 0}</p>
            </div>
          </div>
          <div className="card-soft flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Pending</p>
              <p className="text-lg font-semibold">{stats.suggestions?.pending || 0}</p>
            </div>
          </div>
          <div className="card-soft flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <div>
              <p className="text-[10px] text-muted uppercase tracking-wider">Approved</p>
              <p className="text-lg font-semibold">{stats.suggestions?.approved || 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              tab === t.id ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-text",
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn("ml-1 px-1.5 py-0.5 rounded-full text-[9px]", tab === t.id ? "bg-white/20" : "bg-white/10")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[20vh]">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
        </div>
      )}

      {/* ── Projects Tab ── */}
      {tab === "projects" && !loading && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-muted flex-shrink-0" />
              <input
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                className="flex-1 text-sm bg-bg-alt rounded-lg px-3 py-1.5"
              />
            </div>
            <select
              value={projectFilterStatus}
              onChange={(e) => setProjectFilterStatus(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All Statuses</option>
              <option value="planned">Planned</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
            </select>
            <select
              value={projectFilterCategory}
              onChange={(e) => setProjectFilterCategory(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.project_count})</option>)}
            </select>
          </div>

          {/* Project list */}
          {projects.length === 0 ? (
            <div className="card text-center py-8 text-muted text-sm">
              <Archive className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No projects found. Click Rescan to catalog existing projects.
            </div>
          ) : (
            <div className="grid gap-2">
              {projects.map((project) => (
                <div key={project.id} className="card hover:border-accent/30 transition-colors">
                  <div
                    className="cursor-pointer"
                    onClick={() => setExpandedProject(expandedProject === project.id ? null : project.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold">{project.name}</h3>
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[project.status] || "text-gray-400")}>
                            {project.status}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted">{project.category}</span>
                        </div>
                        {project.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">{project.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(project.updated_at)}</span>
                          {project.tech_stack?.length > 0 && (
                            <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {project.tech_stack.join(", ")}</span>
                          )}
                          {project.repo_url && (
                            <a href={project.repo_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                              <Github className="w-3 h-3" /> Repo
                            </a>
                          )}
                          {project.live_url && (
                            <a href={project.live_url} target="_blank" rel="noopener" className="flex items-center gap-1 text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                              <ExternalLink className="w-3 h-3" /> Live
                            </a>
                          )}
                        </div>
                      </div>
                      {expandedProject === project.id ? <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />}
                    </div>
                  </div>

                  {expandedProject === project.id && (
                    <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                      {/* Build commands */}
                      {(project.build_command || project.test_command) && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted uppercase tracking-wider flex items-center gap-1"><Terminal className="w-3 h-3" /> Build & Test</p>
                          {project.build_command && (
                            <div className="flex items-center gap-2 text-xs">
                              <code className="bg-bg-alt px-2 py-1 rounded text-accent">{project.build_command}</code>
                            </div>
                          )}
                          {project.test_command && (
                            <div className="flex items-center gap-2 text-xs">
                              <code className="bg-bg-alt px-2 py-1 rounded text-green-400">{project.test_command}</code>
                            </div>
                          )}
                        </div>
                      )}

                      {/* File inventory */}
                      {project.file_inventory?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted uppercase tracking-wider flex items-center gap-1"><FileCode className="w-3 h-3" /> File Inventory ({project.file_inventory.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {project.file_inventory.map((f: any, i: number) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-bg-alt text-muted">
                                {f.path}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {project.tags?.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] text-muted uppercase tracking-wider flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {project.tags.map((tag, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent">{tag}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Local path */}
                      {project.local_path && (
                        <div className="text-[10px] text-muted">
                          <span className="text-muted/70">Path: </span>
                          <code className="bg-bg-alt px-1.5 py-0.5 rounded">{project.local_path}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Agent Log Tab ── */}
      {tab === "agents" && !loading && (
        <div className="space-y-3">
          {/* Agent stats */}
          {agentStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="card-soft p-2">
                <p className="text-[10px] text-muted">Total Logs</p>
                <p className="text-sm font-semibold">{agentStats.total_logs || 0}</p>
              </div>
              <div className="card-soft p-2">
                <p className="text-[10px] text-muted">Last 24h</p>
                <p className="text-sm font-semibold">{agentStats.last_24h || 0}</p>
              </div>
              <div className="card-soft p-2 col-span-2">
                <p className="text-[10px] text-muted">By Agent Type</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {Object.entries(agentStats.by_agent_type || {}).map(([type, count]: any) => (
                    <span key={type} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-alt text-muted">{type}: {count}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={logFilterAgent}
              onChange={(e) => setLogFilterAgent(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All Agents</option>
              <option value="aceline">Aceline</option>
              <option value="jarvis">Jarvis</option>
              <option value="llm">LLM</option>
              <option value="chatbot">Chatbot</option>
              <option value="instance">Instance</option>
              <option value="external_agent">External Agent</option>
              <option value="system">System</option>
            </select>
            <select
              value={logFilterAction}
              onChange={(e) => setLogFilterAction(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All Actions</option>
              <option value="read">Read</option>
              <option value="write">Write</option>
              <option value="run">Run</option>
              <option value="build">Build</option>
              <option value="test">Test</option>
              <option value="deploy">Deploy</option>
              <option value="clone">Clone</option>
              <option value="repair">Repair</option>
              <option value="improve">Improve</option>
              <option value="navigate">Navigate</option>
              <option value="analyze">Analyze</option>
              <option value="plan">Plan</option>
              <option value="verify">Verify</option>
            </select>
          </div>

          {/* Log list */}
          {logs.length === 0 ? (
            <div className="card text-center py-8 text-muted text-sm">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No agent activity logged yet.
            </div>
          ) : (
            <div className="grid gap-1.5">
              {logs.map((log) => (
                <div key={log.id} className="card-soft">
                  <div className="flex items-start gap-2">
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                      log.result === "success" ? "bg-green-400" : log.result === "failure" ? "bg-red-400" : "bg-yellow-400")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium">{log.agent_name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted">{log.agent_type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">{log.action_type}</span>
                        <span className={cn("text-[10px]", RESULT_COLORS[log.result] || "text-muted")}>{log.result}</span>
                      </div>
                      {log.description && <p className="text-xs text-muted mt-0.5">{log.description}</p>}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                        <span>{timeAgo(log.timestamp)}</span>
                        {log.target_project && <span>→ {log.target_project}</span>}
                        {log.duration_ms > 0 && <span>{log.duration_ms}ms</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Suggestions Tab ── */}
      {tab === "suggestions" && !loading && (
        <div className="space-y-3">
          {/* Create suggestion */}
          <div className="card-soft space-y-2">
            <p className="text-xs font-semibold flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> New Suggestion</p>
            <input
              value={newSuggestion.title}
              onChange={(e) => setNewSuggestion({ ...newSuggestion, title: e.target.value })}
              placeholder="Title..."
              className="w-full text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            />
            <textarea
              value={newSuggestion.description}
              onChange={(e) => setNewSuggestion({ ...newSuggestion, description: e.target.value })}
              placeholder="Description..."
              rows={2}
              className="w-full text-sm bg-bg-alt rounded-lg px-3 py-1.5 resize-none"
            />
            <div className="flex gap-2">
              <input
                value={newSuggestion.target}
                onChange={(e) => setNewSuggestion({ ...newSuggestion, target: e.target.value })}
                placeholder="Target (project/file/system)..."
                className="flex-1 text-sm bg-bg-alt rounded-lg px-3 py-1.5"
              />
              <select
                value={newSuggestion.type}
                onChange={(e) => setNewSuggestion({ ...newSuggestion, type: e.target.value })}
                className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
              >
                <option value="improvement">Improvement</option>
                <option value="optimization">Optimization</option>
                <option value="refactor">Refactor</option>
                <option value="new_feature">New Feature</option>
                <option value="bug_fix">Bug Fix</option>
                <option value="security">Security</option>
                <option value="architecture">Architecture</option>
                <option value="workflow">Workflow</option>
              </select>
              <select
                value={newSuggestion.priority}
                onChange={(e) => setNewSuggestion({ ...newSuggestion, priority: e.target.value })}
                className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button onClick={handleCreateSuggestion} className="btn-primary text-xs px-3 py-1.5">Add</button>
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            <select
              value={suggestionFilterStatus}
              onChange={(e) => setSuggestionFilterStatus(e.target.value)}
              className="text-sm bg-bg-alt rounded-lg px-3 py-1.5"
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="implemented">Implemented</option>
            </select>
          </div>

          {/* Suggestion list */}
          {suggestions.length === 0 ? (
            <div className="card text-center py-8 text-muted text-sm">
              <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No suggestions. Aceline will propose improvements here for your review.
            </div>
          ) : (
            <div className="grid gap-2">
              {suggestions.map((sug) => (
                <div key={sug.id} className={cn("card border-l-2", PRIORITY_COLORS[sug.priority])}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{sug.title}</h3>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", PRIORITY_COLORS[sug.priority])}>
                          {sug.priority}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-muted">{sug.type}</span>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full",
                          sug.status === "pending" ? "bg-yellow-400/10 text-yellow-400" :
                          sug.status === "approved" ? "bg-green-400/10 text-green-400" :
                          sug.status === "rejected" ? "bg-red-400/10 text-red-400" :
                          "bg-blue-400/10 text-blue-400")}>
                          {sug.status}
                        </span>
                      </div>
                      {sug.description && <p className="text-xs text-muted mt-1">{sug.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
                        <span>by {sug.proposed_by}</span>
                        <span>{timeAgo(sug.proposed_at)}</span>
                        {sug.target && <span>→ {sug.target}</span>}
                      </div>
                    </div>
                    {sug.status === "pending" && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleReviewSuggestion(sug.id, "approved")}
                          className="p-1.5 rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20 transition"
                          title="Approve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReviewSuggestion(sug.id, "rejected")}
                          className="p-1.5 rounded-lg bg-red-400/10 text-red-400 hover:bg-red-400/20 transition"
                          title="Reject"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
