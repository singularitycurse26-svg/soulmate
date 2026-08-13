import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { soulMoviesApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Film, Play, Sparkles, Wand2, Clock, Download, Trash2,
  Share2, Crown, Cpu, Cloud, CheckCircle2, AlertCircle,
  Loader2, Clapperboard, Video, Settings, X, RefreshCw,
} from "lucide-react";

interface Project {
  project_id: string;
  text_description: string;
  style: string;
  status: string;
  progress: number;
  output_path: string;
  created_at: number;
  completed_at: number;
}

const STYLES = [
  { id: "cinematic", name: "Cinematic", desc: "Dramatic lighting, film grain" },
  { id: "documentary", name: "Documentary", desc: "Natural, informative" },
  { id: "music video", name: "Music Video", desc: "Dynamic, vibrant" },
  { id: "social media", name: "Social Media", desc: "Bright, fast-paced" },
  { id: "anime", name: "Anime", desc: "Cel-shaded, expressive" },
  { id: "realistic", name: "Realistic", desc: "Photorealistic, lifelike" },
];

const DURATION_PRESETS = [
  { label: "30s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "30 min", value: 1800 },
];

const RESOLUTIONS = ["720p", "1080p"];

const MODES = [
  { id: "auto", name: "Auto", desc: "Cloud GPU with fallback" },
  { id: "ai_generation", name: "AI Generation", desc: "Cloud GPU only" },
  { id: "clip_assembly", name: "Clip Assembly", desc: "CPU mode, always available" },
];

function formatTimeAgo(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

export function SoulMoviesPage() {
  const { isFounder } = useStore();
  const [tab, setTab] = useState<"library" | "create" | "watch">("library");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [gpuStatus, setGpuStatus] = useState<{ mode: string; providers?: string[] } | null>(null);

  // Create form state
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("cinematic");
  const [mode, setMode] = useState("auto");
  const [resolution, setResolution] = useState("1080p");
  const [duration, setDuration] = useState(35);
  const [customDuration, setCustomDuration] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await soulMoviesApi.listProjects();
      const list = data.projects || data;
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    }
    setLoading(false);
  }, []);

  const loadGpuStatus = useCallback(async () => {
    try {
      const data = await soulMoviesApi.getStats();
      setGpuStatus(data?.gpu_status || { mode: "cloud", providers: ["free_ai", "huggingface", "novai"] });
    } catch {
      setGpuStatus({ mode: "cloud", providers: ["free_ai", "huggingface", "novai"] });
    }
  }, []);

  useEffect(() => {
    loadProjects();
    loadGpuStatus();
  }, [loadProjects, loadGpuStatus]);

  const handleCreate = useCallback(async () => {
    if (!prompt.trim()) return;
    setCreating(true);
    try {
      const result = await soulMoviesApi.create({
        text_description: prompt,
        style,
        mode,
        resolution,
        duration_s: duration,
      });
      const newProject = result.project || result;
      setActiveProject(newProject);
      setCreating(false);

      pollRef.current = setInterval(async () => {
        try {
          const status = await soulMoviesApi.getStatus(newProject.project_id);
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
  }, [prompt, style, mode, resolution, duration, loadProjects]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const openWatch = (project: Project) => {
    setSelectedProject(project);
    setTab("watch");
  };

  return (
    <div className="pb-20 md:pb-0">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-bg-card/80 backdrop-blur-md border border-border rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-accent flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gradient">SoulMovies</span>

          {/* GPU Status Badge */}
          {gpuStatus && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-alt ml-2">
              {gpuStatus.mode === "cloud" ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">GPU: Free Cloud</span>
                </>
              ) : gpuStatus.mode === "local_gpu" ? (
                <>
                  <Cpu className="w-3.5 h-3.5 text-accent" />
                  <span className="text-xs text-accent font-medium">GPU: Local</span>
                </>
              ) : (
                <>
                  <Cpu className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs text-orange-400 font-medium">GPU: CPU Mode</span>
                </>
              )}
            </div>
          )}

          {isFounder && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 ml-auto">
              <Crown className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs text-accent font-medium">Founder — Free</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {[
            { id: "library", label: "Library", icon: Film },
            { id: "create", label: "Create", icon: Wand2 },
            { id: "watch", label: "Watch", icon: Play },
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

      {/* Library Tab */}
      {tab === "library" && (
        <div className="py-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Your Movies</h2>
            <button
              onClick={() => { loadProjects(); loadGpuStatus(); }}
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
              <p className="text-muted text-sm mb-4">No movies yet. Create your first AI video!</p>
              <button
                onClick={() => setTab("create")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium"
              >
                <Wand2 className="w-4 h-4" /> Create Video
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.project_id}
                  project={project}
                  onWatch={() => openWatch(project)}
                  onDelete={async () => {
                    try {
                      await soulMoviesApi.delete(project.project_id);
                      loadProjects();
                    } catch {}
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Tab */}
      {tab === "create" && (
        <div className="py-2 max-w-3xl mx-auto">
          {/* Prompt box — Google Flow style */}
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
                <span className="text-xs text-muted">AI Video Generation</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted">{formatDuration(duration)}</span>
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

          {/* Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {/* Style */}
            <div>
              <label className="text-sm text-muted block mb-2">Style</label>
              <div className="grid grid-cols-2 gap-2">
                {STYLES.map((s) => (
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

            {/* Mode */}
            <div>
              <label className="text-sm text-muted block mb-2">Render Mode</label>
              <div className="space-y-2">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg text-left transition-all border flex items-center gap-2",
                      mode === m.id
                        ? "bg-accent/10 border-accent/50 text-white"
                        : "bg-bg-alt border-border text-muted hover:text-white"
                    )}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted">{m.desc}</p>
                    </div>
                    {m.id === "auto" && <CheckCircle2 className="w-4 h-4 text-accent" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="text-sm text-muted block mb-2">Duration</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => { setDuration(d.value); setCustomDuration(false); }}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                      !customDuration && duration === d.value
                        ? "bg-white text-black"
                        : "bg-bg-alt text-muted hover:text-white"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {duration >= 600 && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                  <p className="text-xs text-orange-400">
                    Long videos ({formatDuration(duration)}) use segment-based chaining with checkpointing.
                    Each scene renders separately and stitches together.
                  </p>
                </div>
              )}
              {duration >= 1800 && (
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/30">
                  <Sparkles className="w-4 h-4 text-accent shrink-0" />
                  <p className="text-xs text-accent">
                    30-minute mode: Act-based storyboard with 6 acts, frame chaining for visual continuity.
                  </p>
                </div>
              )}
            </div>

            {/* Resolution */}
            <div>
              <label className="text-sm text-muted block mb-2">Resolution</label>
              <div className="flex gap-2">
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
            </div>
          </div>

          {/* Active project progress */}
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
                  <p className="text-xs text-muted">{(activeProject.text_description || "").slice(0, 60)}{(activeProject.text_description || "").length > 60 ? "..." : ""}</p>
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
              {/* Progress bar */}
              <div className="h-2 rounded-full bg-bg-alt overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-500"
                  style={{ width: `${activeProject.progress * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted">
                  {Math.round(activeProject.progress * 100)}% complete
                </span>
                <span className="text-xs text-muted">
                  {activeProject.status === "rendering" && "Generating video clips on cloud GPU..."}
                  {activeProject.status === "storyboarding" && "AI creating storyboard..."}
                  {activeProject.status === "audio" && "Adding voiceover..."}
                  {activeProject.status === "finalizing" && "Stitching final video..."}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Watch Tab */}
      {tab === "watch" && selectedProject && (
        <div className="py-2 max-w-4xl mx-auto">
          <button
            onClick={() => setTab("library")}
            className="flex items-center gap-2 text-muted hover:text-white mb-4 text-sm"
          >
            <X className="w-4 h-4" /> Back to Library
          </button>

          {selectedProject.status === "complete" ? (
            <>
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <video
                  src={soulMoviesApi.download(selectedProject.project_id)}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>
              <h2 className="text-lg font-bold text-white mt-4">{selectedProject.text_description}</h2>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-sm text-muted">{selectedProject.style}</span>
                <span className="text-sm text-muted">{formatTimeAgo(selectedProject.created_at)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <a
                    href={soulMoviesApi.download(selectedProject.project_id)}
                    download
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-alt text-muted hover:text-white text-sm font-medium transition-all"
                  >
                    <Download className="w-4 h-4" /> Download
                  </a>
                  <button
                    onClick={async () => {
                      try {
                        await soulMoviesApi.publish(selectedProject.project_id);
                      } catch {}
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-all"
                  >
                    <Share2 className="w-4 h-4" /> Publish to SoulTube
                  </button>
                </div>
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

function ProjectCard({
  project,
  onWatch,
  onDelete,
}: {
  project: Project;
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
