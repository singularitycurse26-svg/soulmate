import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { soulIllusionsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Film, Play, Sparkles, Wand2, Download, Trash2,
  CheckCircle2, AlertCircle, Loader2, Clapperboard, Video,
  Settings, X, RefreshCw, Bot, BookOpen, Plus, FileText,
  Mic, Headphones, Cpu, Cloud, Send, Square, Target,
} from "lucide-react";

// ===== Types =====
interface VideoProject {
  project_id: string;
  text_description: string;
  style: string;
  status: string;
  progress: number;
  output_path: string;
  created_at: number;
}

interface Book {
  book_id: string;
  title: string;
  author: string;
  genre: string;
  description: string;
  status: string;
  chapter_count: number;
  created_at: number;
}

interface BookChapter {
  chapter_id: string;
  title: string;
  content: string;
  word_count: number;
  status: string;
}

const VIDEO_STYLES = [
  { id: "cinematic", name: "Cinematic", desc: "Dramatic lighting, film grain" },
  { id: "documentary", name: "Documentary", desc: "Natural, informative" },
  { id: "anime", name: "Anime", desc: "Cel-shaded, expressive" },
  { id: "realistic", name: "Realistic", desc: "Photorealistic, lifelike" },
];

const RESOLUTIONS = ["720p", "1080p"];

function formatTimeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ===== Main Page =====
export function SoulIllusionsPage() {
  const { isFounder } = useStore();
  const [tab, setTab] = useState<"video" | "agents" | "books">("video");

  return (
    <div className="pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-card/80 backdrop-blur-md border border-border rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gradient">SoulIllusions</span>

          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-alt ml-2">
            <Cpu className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs text-accent font-medium">Local AI</span>
          </div>

          {isFounder && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 ml-auto">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs text-accent font-medium">Founder — Free</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {[
            { id: "video", label: "Text to Video", icon: Video },
            { id: "agents", label: "Agents", icon: Bot },
            { id: "books", label: "Book Writer", icon: BookOpen },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  tab === t.id
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:text-white hover:bg-bg-alt"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "video" && <VideoTab />}
      {tab === "agents" && <AgentsTab />}
      {tab === "books" && <BooksTab />}
    </div>
  );
}

// ===== Text to Video Tab =====
function VideoTab() {
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);
  const [view, setView] = useState<"library" | "create" | "watch">("library");

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [resolution, setResolution] = useState("1080p");
  const [duration, setDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [activeProject, setActiveProject] = useState<VideoProject | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await soulIllusionsApi.listVideos();
      const list = data.projects || data || [];
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleCreate = useCallback(async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    try {
      const result = await soulIllusionsApi.createVideo({
        text_description: prompt,
        style,
        resolution,
        duration_s: duration,
      });
      const newProject = result.project || result;
      setActiveProject(newProject);
      setCreating(false);
      setView("library");

      pollRef.current = setInterval(async () => {
        try {
          const status = await soulIllusionsApi.getVideoStatus(newProject.project_id);
          const updated = status.project || status;
          setActiveProject(updated);
          if (updated.status === "complete" || updated.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            loadProjects();
          }
        } catch {}
      }, 3000);
    } catch {
      setCreating(false);
    }
  }, [prompt, style, resolution, duration, loadProjects]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const openWatch = (project: VideoProject) => {
    setSelectedProject(project);
    setView("watch");
  };

  return (
    <div className="py-2">
      {/* Sub-nav */}
      <div className="flex gap-1 mb-4">
        {[
          { id: "library", label: "Library", icon: Film },
          { id: "create", label: "Create", icon: Wand2 },
          { id: "watch", label: "Watch", icon: Play },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id as any)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                view === t.id
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:text-white hover:bg-bg-alt"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Library */}
      {view === "library" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Your Videos</h2>
            <button
              onClick={loadProjects}
              className="flex items-center gap-1.5 text-sm text-muted hover:text-white"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-video rounded-xl bg-bg-alt" />
                  <div className="h-4 bg-bg-alt rounded w-3/4 mt-3" />
                  <div className="h-3 bg-bg-alt rounded w-1/2 mt-2" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Clapperboard className="w-12 h-12 text-muted mb-3" />
              <p className="text-muted text-sm mb-4">No videos yet. Create your first AI video!</p>
              <button
                onClick={() => setView("create")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium"
              >
                <Wand2 className="w-4 h-4" /> Create Video
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <VideoCard
                  key={project.project_id}
                  project={project}
                  onWatch={() => openWatch(project)}
                  onDelete={async () => {
                    try { await soulIllusionsApi.deleteVideo(project.project_id); loadProjects(); } catch {}
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create */}
      {view === "create" && (
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <div className="rounded-2xl bg-bg-card border border-border overflow-hidden">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your video... e.g., 'A lone astronaut exploring an alien city at sunset, cinematic, dramatic music'"
                rows={4}
                className="w-full px-4 py-3 bg-transparent text-white text-sm placeholder:text-muted focus:outline-none resize-none"
              />
              <div className="flex items-center gap-2 px-4 py-2 border-t border-border">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-xs text-muted">AI Video Generation (LTX-Video + SDXL)</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted">{duration}s</span>
                  <button
                    onClick={handleCreate}
                    disabled={!prompt.trim() || creating}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    Generate
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="text-sm text-muted block mb-2">Style</label>
              <div className="grid grid-cols-2 gap-2">
                {VIDEO_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-left transition-all border",
                      style === s.id
                        ? "bg-accent/10 border-accent/50 text-white"
                        : "bg-bg-alt border-border text-muted hover:text-white"
                    )}
                  >
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted">{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted block mb-2">Resolution</label>
              <div className="flex gap-2 mb-4">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      resolution === r
                        ? "bg-white text-black"
                        : "bg-bg-alt text-muted hover:text-white"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>

              <label className="text-sm text-muted block mb-2">Duration (seconds)</label>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>5s</span>
                <span className="text-accent font-medium">{duration}s</span>
                <span>120s</span>
              </div>
            </div>
          </div>

          {activeProject && (
            <div className="mt-6 p-4 rounded-xl bg-bg-card border border-border">
              <div className="flex items-center gap-3 mb-3">
                {activeProject.status === "complete" ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : activeProject.status === "failed" ? (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Loader2 className="w-5 h-5 text-accent animate-spin" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white capitalize">
                    {activeProject.status.replace("_", " ")}
                  </p>
                  <p className="text-xs text-muted">{(activeProject.text_description || "").slice(0, 60)}</p>
                </div>
                {activeProject.status === "complete" && (
                  <button
                    onClick={() => openWatch(activeProject)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent text-white text-sm font-medium"
                  >
                    <Play className="w-4 h-4" /> Watch
                  </button>
                )}
              </div>
              <div className="h-2 rounded-full bg-bg-alt overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500"
                  style={{ width: `${activeProject.progress * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted mt-2 block">
                {Math.round(activeProject.progress * 100)}% complete
              </span>
            </div>
          )}
        </div>
      )}

      {/* Watch */}
      {view === "watch" && selectedProject && (
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => setView("library")}
            className="flex items-center gap-2 text-muted hover:text-white mb-4 text-sm"
          >
            <X className="w-4 h-4" /> Back to Library
          </button>

          {selectedProject.status === "complete" ? (
            <>
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <video
                  src={soulIllusionsApi.downloadVideo(selectedProject.project_id)}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
              <h2 className="text-lg font-bold text-white mt-4">{selectedProject.text_description}</h2>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-muted">{selectedProject.style}</span>
                <span className="text-sm text-muted">{formatTimeAgo(selectedProject.created_at)}</span>
                <a
                  href={soulIllusionsApi.downloadVideo(selectedProject.project_id)}
                  download
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-alt text-muted hover:text-white text-sm font-medium transition-all"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-accent animate-spin mb-3" />
              <p className="text-muted text-sm">Video is still being generated...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VideoCard({
  project,
  onWatch,
  onDelete,
}: {
  project: VideoProject;
  onWatch: () => void;
  onDelete: () => void;
}) {
  const statusColors: Record<string, string> = {
    complete: "text-green-400 bg-green-400/10",
    failed: "text-red-400 bg-red-400/10",
    rendering: "text-accent bg-accent/10",
    pending: "text-orange-400 bg-orange-400/10",
  };

  return (
    <div className="group cursor-pointer" onClick={onWatch}>
      <div className="aspect-video rounded-xl overflow-hidden bg-bg-alt relative">
        <div className="absolute inset-0 flex items-center justify-center">
          {project.status === "complete" ? (
            <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
          ) : project.status === "failed" ? (
            <AlertCircle className="w-8 h-8 text-red-400" />
          ) : (
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          )}
        </div>
        <div className={cn(
          "absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
          statusColors[project.status] || "text-muted bg-bg-alt"
        )}>
          {project.status.replace("_", " ")}
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-accent transition-colors">
          {project.text_description}
        </h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted">{project.style}</span>
          <span className="text-xs text-muted">•</span>
          <span className="text-xs text-muted">{formatTimeAgo(project.created_at)}</span>
        </div>
        {project.status === "complete" && (
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onWatch(); }}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 font-medium"
            >
              <Play className="w-3 h-3" /> Watch
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="flex items-center gap-1 text-xs text-muted hover:text-red-400 font-medium ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Agents Tab =====
function AgentsTab() {
  const [agentStatus, setAgentStatus] = useState<string>("idle");
  const [agentGoal, setAgentGoal] = useState("");
  const [agentLog, setAgentLog] = useState<string[]>([]);
  const [subAgentStatus, setSubAgentStatus] = useState<string>("idle");
  const [subAgentGoal, setSubAgentGoal] = useState("");
  const [subAgentLog, setSubAgentLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const subLogRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await soulIllusionsApi.getAgentStatus();
      setAgentStatus(data.status || "idle");
      if (data.goal) setAgentGoal(data.goal);
    } catch {
      setAgentStatus("offline");
    }
    try {
      const data = await soulIllusionsApi.getSubAgentStatus();
      setSubAgentStatus(data.status || "idle");
      if (data.goal) setSubAgentGoal(data.goal);
    } catch {
      setSubAgentStatus("offline");
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const startAgent = async () => {
    setLoading(true);
    try {
      await soulIllusionsApi.startAgent(agentGoal);
      setAgentStatus("running");
      setAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Agent started with goal: ${agentGoal}`]);
    } catch {
      setAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Failed to start agent`]);
    }
    setLoading(false);
  };

  const stopAgent = async () => {
    setLoading(true);
    try {
      await soulIllusionsApi.stopAgent();
      setAgentStatus("stopped");
      setAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Agent stopped`]);
    } catch {}
    setLoading(false);
  };

  const startSubAgent = async () => {
    setLoading(true);
    try {
      await soulIllusionsApi.startSubAgent(subAgentGoal);
      setSubAgentStatus("running");
      setSubAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sub-agent started with goal: ${subAgentGoal}`]);
    } catch {
      setSubAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Failed to start sub-agent`]);
    }
    setLoading(false);
  };

  const stopSubAgent = async () => {
    setLoading(true);
    try {
      await soulIllusionsApi.stopSubAgent();
      setSubAgentStatus("stopped");
      setSubAgentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Sub-agent stopped`]);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [agentLog]);

  useEffect(() => {
    if (subLogRef.current) subLogRef.current.scrollTop = subLogRef.current.scrollHeight;
  }, [subAgentLog]);

  const statusColor = (status: string) => {
    if (status === "running") return "text-green-400 bg-green-400/10";
    if (status === "stopped" || status === "failed") return "text-red-400 bg-red-400/10";
    if (status === "offline") return "text-muted bg-bg-alt";
    return "text-orange-400 bg-orange-400/10";
  };

  return (
    <div className="py-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Main Agent */}
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">Main Agent</h3>
              <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-1", statusColor(agentStatus))}>
                <span className={cn("w-1.5 h-1.5 rounded-full", agentStatus === "running" ? "bg-green-400 animate-pulse" : "bg-current")} />
                {agentStatus}
              </div>
            </div>
            <button onClick={refreshStatus} className="text-muted hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <label className="text-xs text-muted block mb-1.5">Goal / Objective</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={agentGoal}
                  onChange={(e) => setAgentGoal(e.target.value)}
                  placeholder="Enter agent goal..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={startAgent}
              disabled={loading || agentStatus === "running" || !agentGoal.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Start
            </button>
            <button
              onClick={stopAgent}
              disabled={loading || agentStatus !== "running"}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> Stop
            </button>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Activity Log</label>
            <div ref={logRef} className="h-48 overflow-y-auto rounded-lg bg-bg-alt border border-border p-3 text-xs font-mono text-muted">
              {agentLog.length === 0 ? (
                <p className="text-muted/50">No activity yet. Start the agent to begin.</p>
              ) : (
                agentLog.map((line, i) => (
                  <div key={i} className="mb-1">{line}</div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sub-Agent */}
        <div className="rounded-xl bg-bg-card border border-border p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-white">Sub-Agent</h3>
              <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-1", statusColor(subAgentStatus))}>
                <span className={cn("w-1.5 h-1.5 rounded-full", subAgentStatus === "running" ? "bg-green-400 animate-pulse" : "bg-current")} />
                {subAgentStatus}
              </div>
            </div>
            <button onClick={refreshStatus} className="text-muted hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="mb-3">
            <label className="text-xs text-muted block mb-1.5">Goal / Objective</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={subAgentGoal}
                  onChange={(e) => setSubAgentGoal(e.target.value)}
                  placeholder="Enter sub-agent goal..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            <button
              onClick={startSubAgent}
              disabled={loading || subAgentStatus === "running" || !subAgentGoal.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Start
            </button>
            <button
              onClick={stopSubAgent}
              disabled={loading || subAgentStatus !== "running"}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              <Square className="w-4 h-4" /> Stop
            </button>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1.5">Activity Log</label>
            <div ref={subLogRef} className="h-48 overflow-y-auto rounded-lg bg-bg-alt border border-border p-3 text-xs font-mono text-muted">
              {subAgentLog.length === 0 ? (
                <p className="text-muted/50">No activity yet. Start the sub-agent to begin.</p>
              ) : (
                subAgentLog.map((line, i) => (
                  <div key={i} className="mb-1">{line}</div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent Info */}
      <div className="mt-4 p-4 rounded-xl bg-bg-card border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Cloud className="w-4 h-4 text-accent" />
          <h4 className="text-sm font-bold text-white">Agent Configuration</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted">Model</p>
            <p className="text-white font-medium">dolphin-mistral</p>
          </div>
          <div>
            <p className="text-muted">Mode</p>
            <p className="text-white font-medium">Local (Ollama)</p>
          </div>
          <div>
            <p className="text-muted">Reasoning</p>
            <p className="text-white font-medium">ReAct 9-Phase</p>
          </div>
          <div>
            <p className="text-muted">Memory</p>
            <p className="text-white font-medium">3-Layer Persistent</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== Book Writer Tab =====
function BooksTab() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [view, setView] = useState<"list" | "detail" | "create">("list");

  // Create form
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Writing
  const [writing, setWriting] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState("");

  // Audiobook
  const [generatingAudio, setGeneratingAudio] = useState(false);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await soulIllusionsApi.listBooks();
      const list = data.books || data || [];
      setBooks(Array.isArray(list) ? list : []);
    } catch {
      setBooks([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadBooks(); }, [loadBooks]);

  const loadChapters = useCallback(async (bookId: string) => {
    try {
      const data = await soulIllusionsApi.getBook(bookId);
      setChapters(data.chapters || []);
    } catch {
      setChapters([]);
    }
  }, []);

  const handleCreateBook = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const result = await soulIllusionsApi.createBook({ title, author, genre, description });
      const newBook = result.book || result;
      setCreating(false);
      setTitle(""); setAuthor(""); setGenre(""); setDescription("");
      loadBooks();
      if (newBook?.book_id) {
        setSelectedBook(newBook);
        loadChapters(newBook.book_id);
        setView("detail");
      }
    } catch {
      setCreating(false);
    }
  };

  const handleAddChapter = async () => {
    if (!selectedBook || !newChapterTitle.trim()) return;
    setWriting(true);
    try {
      await soulIllusionsApi.addChapter(selectedBook.book_id, { title: newChapterTitle });
      setNewChapterTitle("");
      loadChapters(selectedBook.book_id);
    } catch {}
    setWriting(false);
  };

  const handleWriteChapter = async (chapterId: string) => {
    if (!selectedBook) return;
    setWriting(true);
    try {
      await soulIllusionsApi.writeChapter(selectedBook.book_id, { chapter_id: chapterId });
      loadChapters(selectedBook.book_id);
    } catch {}
    setWriting(false);
  };

  const handleContinueChapter = async (chapterId: string) => {
    if (!selectedBook) return;
    setWriting(true);
    try {
      await soulIllusionsApi.continueChapter(chapterId);
      loadChapters(selectedBook.book_id);
    } catch {}
    setWriting(false);
  };

  const handleGenerateAudiobook = async () => {
    if (!selectedBook) return;
    setGeneratingAudio(true);
    try {
      await soulIllusionsApi.generateAudiobook(selectedBook.book_id);
    } catch {}
    setGeneratingAudio(false);
  };

  const openBook = (book: Book) => {
    setSelectedBook(book);
    loadChapters(book.book_id);
    setView("detail");
  };

  return (
    <div className="py-2">
      {/* Sub-nav */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => { setView("list"); setSelectedBook(null); }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            view === "list" ? "bg-accent/10 text-accent" : "text-muted hover:text-white hover:bg-bg-alt"
          )}
        >
          <BookOpen className="w-4 h-4" /> Library
        </button>
        <button
          onClick={() => setView("create")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            view === "create" ? "bg-accent/10 text-accent" : "text-muted hover:text-white hover:bg-bg-alt"
          )}
        >
          <Plus className="w-4 h-4" /> New Book
        </button>
      </div>

      {/* Book List */}
      {view === "list" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Your Books</h2>
            <button onClick={loadBooks} className="flex items-center gap-1.5 text-sm text-muted hover:text-white">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-32 rounded-xl bg-bg-alt" />
                  <div className="h-4 bg-bg-alt rounded w-3/4 mt-3" />
                </div>
              ))}
            </div>
          ) : books.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="w-12 h-12 text-muted mb-3" />
              <p className="text-muted text-sm mb-4">No books yet. Start writing your first book!</p>
              <button
                onClick={() => setView("create")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> New Book
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {books.map((book) => (
                <div
                  key={book.book_id}
                  onClick={() => openBook(book)}
                  className="group cursor-pointer rounded-xl bg-bg-card border border-border p-4 hover:border-accent/50 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-16 rounded-lg bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center shrink-0">
                      <BookOpen className="w-6 h-6 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white truncate group-hover:text-accent transition-colors">
                        {book.title}
                      </h3>
                      <p className="text-xs text-muted mt-0.5">{book.author || "Unknown"}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {book.genre && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-bg-alt text-muted">{book.genre}</span>
                        )}
                        <span className="text-xs text-muted">{book.chapter_count || 0} chapters</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Book */}
      {view === "create" && (
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl bg-bg-card border border-border p-6">
            <h2 className="text-lg font-bold text-white mb-4">Create New Book</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted block mb-1.5">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter book title..."
                  className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted block mb-1.5">Author</label>
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Author name..."
                  className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted block mb-1.5">Genre</label>
                <input
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="e.g., Sci-Fi, Fantasy, Romance..."
                  className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted block mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of your book..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50 resize-none"
                />
              </div>
              <button
                onClick={handleCreateBook}
                disabled={!title.trim() || creating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Book
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Book Detail */}
      {view === "detail" && selectedBook && (
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => { setView("list"); setSelectedBook(null); }}
            className="flex items-center gap-2 text-muted hover:text-white mb-4 text-sm"
          >
            <X className="w-4 h-4" /> Back to Library
          </button>

          <div className="rounded-xl bg-bg-card border border-border p-6 mb-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-24 rounded-lg bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center shrink-0">
                <BookOpen className="w-8 h-8 text-accent" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">{selectedBook.title}</h2>
                <p className="text-sm text-muted mt-1">{selectedBook.author || "Unknown"}</p>
                {selectedBook.genre && (
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-bg-alt text-muted mt-2">{selectedBook.genre}</span>
                )}
                {selectedBook.description && (
                  <p className="text-sm text-muted mt-3">{selectedBook.description}</p>
                )}
              </div>
              <button
                onClick={handleGenerateAudiobook}
                disabled={generatingAudio}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-all disabled:opacity-50"
              >
                {generatingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : <Headphones className="w-4 h-4" />}
                Audiobook
              </button>
            </div>
          </div>

          {/* Chapters */}
          <div className="rounded-xl bg-bg-card border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white">Chapters</h3>
              <div className="flex items-center gap-2">
                <input
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="New chapter title..."
                  className="px-3 py-1.5 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50 w-48"
                />
                <button
                  onClick={handleAddChapter}
                  disabled={!newChapterTitle.trim() || writing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-all disabled:opacity-50"
                >
                  {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>
            </div>

            {chapters.length === 0 ? (
              <p className="text-muted text-sm text-center py-8">No chapters yet. Add your first chapter above.</p>
            ) : (
              <div className="space-y-3">
                {chapters.map((chapter, idx) => (
                  <div key={chapter.chapter_id} className="rounded-lg bg-bg-alt border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted shrink-0">Ch.{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-white truncate">{chapter.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted">{chapter.word_count || 0} words</span>
                          <span className="text-xs text-muted">•</span>
                          <span className={cn(
                            "text-xs capitalize",
                            chapter.status === "complete" ? "text-green-400" :
                            chapter.status === "writing" ? "text-accent" : "text-muted"
                          )}>{chapter.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleWriteChapter(chapter.chapter_id)}
                          disabled={writing}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-accent hover:bg-accent/10 transition-all disabled:opacity-50"
                        >
                          <Wand2 className="w-3 h-3" /> Write
                        </button>
                        <button
                          onClick={() => handleContinueChapter(chapter.chapter_id)}
                          disabled={writing}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted hover:text-white hover:bg-bg-card transition-all disabled:opacity-50"
                        >
                          <FileText className="w-3 h-3" /> Continue
                        </button>
                      </div>
                    </div>
                    {chapter.content && (
                      <div className="mt-2 text-xs text-muted line-clamp-3 whitespace-pre-wrap">
                        {chapter.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
