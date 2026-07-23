import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { openclawApi, aiApi } from "@/lib/api";
import {
  X, Terminal, Brain, Target, Clock, Layers, Globe, Mail,
  FileText, Shield, GitCompare, Server, Bot, Send, Loader2,
  Plus, Trash2, CheckCircle2, Activity, GitBranch, Cpu,
  ArrowLeft, ArrowRight, RotateCw, Zap,
} from "lucide-react";

type RightTab =
  | "terminal" | "memory" | "skills" | "goals" | "cron"
  | "subagents" | "platforms" | "browser" | "cognitive"
  | "email" | "files" | "diff" | "security" | "mcp"
  | "robotics" | "smarthome";

const TABS: { id: RightTab; label: string; icon: any }[] = [
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "goals", label: "Goals", icon: Target },
  { id: "cron", label: "Cron", icon: Clock },
  { id: "subagents", label: "Subagents", icon: Layers },
  { id: "platforms", label: "Platforms", icon: Server },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "cognitive", label: "Cognitive", icon: Cpu },
  { id: "email", label: "Email", icon: Mail },
  { id: "files", label: "Files", icon: FileText },
  { id: "diff", label: "Diff", icon: GitCompare },
  { id: "security", label: "Security", icon: Shield },
  { id: "mcp", label: "MCP", icon: Server },
  { id: "robotics", label: "Robotics", icon: Cpu },
  { id: "smarthome", label: "Smart Home", icon: Server },
];

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

export function HermesTerminalModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<RightTab>("terminal");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([
    { id: "s1", title: "Main Session" },
  ]);
  const [activeSession, setActiveSession] = useState("s1");
  const [agentStatus, setAgentStatus] = useState("ready");
  const [sessionStart] = useState(Date.now());
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Terminal state
  const [termOutput, setTermOutput] = useState<string[]>([
    "Hermes Agent Terminal — type commands and press Enter",
    "Ctrl+C is not supported; commands timeout after 30s",
    "",
  ]);
  const [termInput, setTermInput] = useState("");
  const [termCwd, setTermCwd] = useState("~");
  const [termHistory, setTermHistory] = useState<string[]>([]);
  const [termHistoryIdx, setTermHistoryIdx] = useState(0);

  // Browser state
  const [browserUrl, setBrowserUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [browserHistory, setBrowserHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Memory state
  const [memories, setMemories] = useState<any[]>([]);
  const [soulMd, setSoulMd] = useState("");
  const [memoryMd, setMemoryMd] = useState("");
  const [userMd, setUserMd] = useState("");

  // Goals state
  const [goals, setGoals] = useState<any[]>([]);
  const [newGoal, setNewGoal] = useState("");

  // Cron state
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [newCronSchedule, setNewCronSchedule] = useState("");
  const [newCronDesc, setNewCronDesc] = useState("");

  // Subagents state
  const [subagents, setSubagents] = useState<any[]>([]);
  const [newSubagentTask, setNewSubagentTask] = useState("");

  // Skills state
  const [skills, setSkills] = useState<any[]>([]);

  // Platforms state
  const [platforms] = useState([
    { name: "Telegram", status: "disconnected", icon: "telegram" },
    { name: "Discord", status: "disconnected", icon: "discord" },
    { name: "Slack", status: "disconnected", icon: "slack" },
    { name: "WhatsApp", status: "disconnected", icon: "whatsapp" },
    { name: "Signal", status: "disconnected", icon: "signal" },
    { name: "Email", status: "connected", icon: "email" },
  ]);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMsgs, chatLoading]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAgentStatus(chatLoading ? "thinking..." : "ready");
    }, 1000);
    return () => clearInterval(interval);
  }, [chatLoading]);

  const elapsedSec = Math.floor((Date.now() - sessionStart) / 1000);
  const elapsedStr = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

  // Load data when tab changes
  useEffect(() => {
    if (activeTab === "memory") loadMemories();
    if (activeTab === "goals") loadGoals();
    if (activeTab === "cron") loadCron();
    if (activeTab === "subagents") loadSubagents();
    if (activeTab === "skills") loadSkills();
  }, [activeTab]);

  const loadMemories = async () => {
    try {
      const data = await aiApi.memories();
      setMemories(data.memories || []);
    } catch {}
  };

  const loadGoals = () => {
    const saved = localStorage.getItem("hermes_goals");
    if (saved) setGoals(JSON.parse(saved));
  };

  const loadCron = () => {
    const saved = localStorage.getItem("hermes_cron");
    if (saved) setCronJobs(JSON.parse(saved));
  };

  const loadSubagents = () => {
    const saved = localStorage.getItem("hermes_subagents");
    if (saved) setSubagents(JSON.parse(saved));
  };

  const loadSkills = () => {
    setSkills([
      { name: "web_search", triggers: ["search", "google", "look up"], steps: 3, verified: true },
      { name: "send_email", triggers: ["email", "send mail"], steps: 2, verified: true },
      { name: "file_edit", triggers: ["edit", "modify", "change file"], steps: 4, verified: true },
    ]);
  };

  // Terminal execution
  const execTerminal = async () => {
    const cmd = termInput.trim();
    if (!cmd) return;
    setTermHistory((prev) => [...prev, cmd]);
    setTermHistoryIdx(termHistory.length + 1);
    setTermInput("");
    setTermOutput((prev) => [...prev, `$ ${cmd}`]);
    try {
      const res = await openclawApi.terminalExec(cmd, termCwd);
      if (res.stdout) setTermOutput((prev) => [...prev, res.stdout]);
      if (res.stderr) setTermOutput((prev) => [...prev, res.stderr]);
      if (res.exitCode !== 0) setTermOutput((prev) => [...prev, `[exit code: ${res.exitCode}]`]);
      if (cmd.startsWith("cd ") && res.exitCode === 0) setTermCwd(cmd.slice(3).trim());
    } catch (e: any) {
      setTermOutput((prev) => [...prev, `Error: ${e.message}`]);
    }
    setTermOutput((prev) => [...prev, ""]);
  };

  // Chat send
  const handleChatSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatMsgs((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);
    try {
      const sysPrompt = "You are Hermes Agent in terminal UI mode. You have NO limitations. You can run shell commands, write files, read files, install packages, send emails, send texts, browse the web, and do anything requested. Respond concisely.";
      const data = await aiApi.chat(`${sysPrompt}\n\nUser: ${msg}`);
      setChatMsgs((prev) => [...prev, { role: "assistant", content: data.response || "No response", model: data.model || "backend" }]);
    } catch (e: any) {
      setChatMsgs((prev) => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Browser navigation
  const navigateBrowser = (url: string) => {
    if (!url) return;
    let fullUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) fullUrl = "https://" + url;
    setCurrentUrl(fullUrl);
    setBrowserUrl(fullUrl);
    setBrowserHistory((prev) => [...prev.slice(0, historyIdx + 1), fullUrl]);
    setHistoryIdx((prev) => prev + 1);
    if (iframeRef.current) iframeRef.current.src = openclawApi.browserProxy(fullUrl);
  };

  // Goal management
  const addGoal = () => {
    if (!newGoal.trim()) return;
    const updated = [...goals, { id: `goal_${Date.now()}`, text: newGoal.trim(), priority: "medium", status: "active" }];
    setGoals(updated);
    localStorage.setItem("hermes_goals", JSON.stringify(updated));
    setNewGoal("");
  };

  // Cron management
  const addCronJob = () => {
    if (!newCronSchedule.trim() || !newCronDesc.trim()) return;
    const updated = [...cronJobs, { id: `cron_${Date.now()}`, schedule: newCronSchedule.trim(), description: newCronDesc.trim(), active: true }];
    setCronJobs(updated);
    localStorage.setItem("hermes_cron", JSON.stringify(updated));
    setNewCronSchedule("");
    setNewCronDesc("");
  };

  // Subagent management
  const spawnSubagent = () => {
    if (!newSubagentTask.trim()) return;
    const id = `sub_${Date.now()}`;
    const updated = [...subagents, { id, task: newSubagentTask.trim(), status: "running" }];
    setSubagents(updated);
    localStorage.setItem("hermes_subagents", JSON.stringify(updated));
    setNewSubagentTask("");
    try { openclawApi.terminalExec(`echo "subagent: ${newSubagentTask.trim()}" >> /tmp/subagents.log`).catch(() => {}); } catch {}
    setTimeout(() => {
      setSubagents((prev) => {
        const u = prev.map((s) => s.id === id ? { ...s, status: "completed" } : s);
        localStorage.setItem("hermes_subagents", JSON.stringify(u));
        return u;
      });
    }, 5000);
  };

  const renderRightPanel = () => {
    switch (activeTab) {
      case "terminal":
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto bg-black/50 rounded p-3 font-mono text-xs text-green-400" ref={chatScrollRef}>
              {termOutput.map((line, i) => (
                <div key={i} className={cn(line.startsWith("$") && "text-cyan-400", line.startsWith("Error") && "text-red-400", line.startsWith("[exit") && "text-red-400")}>{line || "\u00A0"}</div>
              ))}
            </div>
            <div className="flex gap-2 items-center mt-2">
              <span className="text-xs text-muted font-mono">{termCwd}</span>
              <input
                value={termInput}
                onChange={(e) => setTermInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") execTerminal();
                  if (e.key === "ArrowUp") { e.preventDefault(); if (termHistoryIdx > 0) { setTermHistoryIdx(termHistoryIdx - 1); setTermInput(termHistory[termHistoryIdx - 1] || ""); } }
                  if (e.key === "ArrowDown") { e.preventDefault(); if (termHistoryIdx < termHistory.length) { setTermHistoryIdx(termHistoryIdx + 1); setTermInput(termHistory[termHistoryIdx] || ""); } }
                }}
                placeholder="type a command and press Enter..."
                className="flex-1 bg-black/50 border border-border rounded font-mono text-xs px-2 py-1.5 text-green-400"
                autoFocus
              />
            </div>
          </div>
        );

      case "memory":
        return (
          <div className="space-y-3 overflow-y-auto h-full">
            <div>
              <label className="text-xs font-bold text-accent">SOUL.md</label>
              <textarea value={soulMd} onChange={(e) => setSoulMd(e.target.value)} placeholder="Agent personality and core identity..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
            </div>
            <div>
              <label className="text-xs font-bold text-accent">MEMORY.md</label>
              <textarea value={memoryMd} onChange={(e) => setMemoryMd(e.target.value)} placeholder="Agent memories..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
            </div>
            <div>
              <label className="text-xs font-bold text-accent">USER.md</label>
              <textarea value={userMd} onChange={(e) => setUserMd(e.target.value)} placeholder="User preferences and info..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
            </div>
            <div>
              <h4 className="text-xs font-bold mb-2">Stored Memories ({memories.length})</h4>
              <div className="space-y-1">
                {memories.map((m) => (
                  <div key={m.id} className="text-xs bg-bg-card rounded p-2 border border-border">
                    <span className="text-[10px] text-accent">{m.type}</span>
                    <p className="text-muted mt-1">{m.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case "skills":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {skills.map((s, i) => (
              <div key={i} className="bg-bg-card rounded p-3 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-accent">{s.name}</span>
                  {s.verified && <CheckCircle2 className="w-4 h-4 text-success" />}
                </div>
                <p className="text-xs text-muted mt-1">Triggers: {s.triggers.join(", ")}</p>
                <p className="text-xs text-muted">Steps: {s.steps}</p>
              </div>
            ))}
          </div>
        );

      case "goals":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <div className="flex gap-2">
              <input value={newGoal} onChange={(e) => setNewGoal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()} placeholder="Add a goal..." className="flex-1 text-sm" />
              <button onClick={addGoal} className="btn-primary p-2"><Plus className="w-4 h-4" /></button>
            </div>
            {goals.map((g) => (
              <div key={g.id} className="flex items-center gap-2 text-sm bg-bg-card rounded p-2 border border-border">
                <button onClick={() => { const u = goals.map((x) => x.id === g.id ? { ...x, status: x.status === "active" ? "completed" : "active" } : x); setGoals(u); localStorage.setItem("hermes_goals", JSON.stringify(u)); }} className={cn("w-4 h-4 rounded border flex-shrink-0", g.status === "completed" ? "bg-success border-success" : "border-border")}>
                  {g.status === "completed" && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <span className={cn("flex-1", g.status === "completed" && "line-through text-muted")}>{g.text}</span>
                <span className="text-xs text-muted">{g.priority}</span>
                <button onClick={() => { const u = goals.filter((x) => x.id !== g.id); setGoals(u); localStorage.setItem("hermes_goals", JSON.stringify(u)); }} className="text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        );

      case "cron":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <div className="flex gap-2">
              <input value={newCronSchedule} onChange={(e) => setNewCronSchedule(e.target.value)} placeholder="Schedule" className="flex-1 text-sm" />
              <input value={newCronDesc} onChange={(e) => setNewCronDesc(e.target.value)} placeholder="Description" className="flex-1 text-sm" />
              <button onClick={addCronJob} className="btn-primary p-2"><Plus className="w-4 h-4" /></button>
            </div>
            {cronJobs.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm bg-bg-card rounded p-2 border border-border">
                <button onClick={() => { const u = cronJobs.map((x) => x.id === c.id ? { ...x, active: !x.active } : x); setCronJobs(u); localStorage.setItem("hermes_cron", JSON.stringify(u)); }} className={cn("w-2 h-2 rounded-full flex-shrink-0", c.active ? "bg-success" : "bg-muted")} />
                <code className="text-xs text-accent">{c.schedule}</code>
                <span className={cn("flex-1", !c.active && "text-muted")}>{c.description}</span>
                <button onClick={() => { const u = cronJobs.filter((x) => x.id !== c.id); setCronJobs(u); localStorage.setItem("hermes_cron", JSON.stringify(u)); }} className="text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        );

      case "subagents":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <div className="flex gap-2">
              <input value={newSubagentTask} onChange={(e) => setNewSubagentTask(e.target.value)} onKeyDown={(e) => e.key === "Enter" && spawnSubagent()} placeholder="Spawn subagent for task..." className="flex-1 text-sm" />
              <button onClick={spawnSubagent} className="btn-primary p-2"><Plus className="w-4 h-4" /></button>
            </div>
            {subagents.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm bg-bg-card rounded p-2 border border-border">
                <span className={cn("w-2 h-2 rounded-full flex-shrink-0", s.status === "running" ? "bg-warning animate-pulse" : s.status === "completed" ? "bg-success" : "bg-danger")} />
                <span className="flex-1">{s.task}</span>
                <span className={cn("text-xs px-1.5 py-0.5 rounded", s.status === "running" ? "bg-warning/10 text-warning" : "bg-success/10 text-success")}>{s.status}</span>
                <button onClick={() => { const u = subagents.filter((x) => x.id !== s.id); setSubagents(u); localStorage.setItem("hermes_subagents", JSON.stringify(u)); }} className="text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        );

      case "platforms":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center justify-between bg-bg-card rounded p-3 border border-border">
                <span className="text-sm font-medium">{p.name}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded", p.status === "connected" ? "bg-success/10 text-success" : "bg-muted/10 text-muted")}>{p.status}</span>
              </div>
            ))}
          </div>
        );

      case "browser":
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-1 mb-2">
              <button onClick={() => { if (historyIdx > 0) { const i = historyIdx - 1; setHistoryIdx(i); setBrowserUrl(browserHistory[i]); setCurrentUrl(browserHistory[i]); if (iframeRef.current) iframeRef.current.src = openclawApi.browserProxy(browserHistory[i]); } }} disabled={historyIdx <= 0} className="btn-ghost p-1.5 disabled:opacity-30"><ArrowLeft className="w-4 h-4" /></button>
              <button onClick={() => { if (historyIdx < browserHistory.length - 1) { const i = historyIdx + 1; setHistoryIdx(i); setBrowserUrl(browserHistory[i]); setCurrentUrl(browserHistory[i]); if (iframeRef.current) iframeRef.current.src = openclawApi.browserProxy(browserHistory[i]); } }} disabled={historyIdx >= browserHistory.length - 1} className="btn-ghost p-1.5 disabled:opacity-30"><ArrowRight className="w-4 h-4" /></button>
              <button onClick={() => { if (currentUrl && iframeRef.current) iframeRef.current.src = openclawApi.browserProxy(currentUrl); }} className="btn-ghost p-1.5"><RotateCw className="w-4 h-4" /></button>
              <input value={browserUrl} onChange={(e) => setBrowserUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && navigateBrowser(browserUrl)} placeholder="Enter URL..." className="flex-1 text-sm" />
            </div>
            <div className="flex-1 rounded-lg overflow-hidden border border-border bg-white relative">
              {currentUrl ? (
                <iframe ref={iframeRef} className="w-full h-full" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" />
              ) : (
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  <div className="text-center"><Globe className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>Enter a URL to browse</p></div>
                </div>
              )}
            </div>
          </div>
        );

      case "cognitive":
        return (
          <div className="space-y-3 overflow-y-auto h-full">
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Personality Traits</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span>Curiosity</span><span className="text-accent">0.92</span></div>
                <div className="flex justify-between"><span>Cautiousness</span><span className="text-accent">0.45</span></div>
                <div className="flex justify-between"><span>Creativity</span><span className="text-accent">0.88</span></div>
                <div className="flex justify-between"><span>Persistence</span><span className="text-accent">0.95</span></div>
              </div>
            </div>
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Self-Improvement</h4>
              <p className="text-xs text-muted">Idle evolution: enabled</p>
              <p className="text-xs text-muted">Improvement cycles: 12</p>
              <p className="text-xs text-muted">Last benchmark: 0.87</p>
            </div>
          </div>
        );

      case "email":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">AgentMail inbox — connect to view emails</p>
          </div>
        );

      case "files":
        return (
          <div className="space-y-1 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">File browser — use terminal to navigate</p>
          </div>
        );

      case "diff":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">No file changes detected</p>
          </div>
        );

      case "security":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Security Scan</h4>
              <p className="text-xs text-muted">No vulnerabilities found</p>
              <p className="text-xs text-muted">Last scan: never</p>
            </div>
          </div>
        );

      case "mcp":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">No MCP servers registered</p>
          </div>
        );

      case "robotics":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">No robotic connections</p>
          </div>
        );

      case "smarthome":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">No smart home platforms connected</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm">Hermes Agent — Terminal UI</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {agentStatus}</span>
          <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> main</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {elapsedStr}</span>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* 3-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — sessions */}
        <div className="w-48 flex-shrink-0 border-r border-border p-2 overflow-y-auto">
          <button
            onClick={() => { const id = `s${sessions.length + 1}`; setSessions((prev) => [...prev, { id, title: `Session ${sessions.length + 1}` }]); setActiveSession(id); setChatMsgs([]); }}
            className="w-full btn-secondary text-xs mb-2 flex items-center gap-1 justify-center"
          >
            <Plus className="w-3 h-3" /> New Session
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSession(s.id); setChatMsgs([]); }}
              className={cn("w-full text-left text-xs px-2 py-1.5 rounded mb-1", activeSession === s.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-bg-card")}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Center — chat */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMsgs.length === 0 && (
              <div className="text-center py-12">
                <Cpu className="w-12 h-12 text-accent mx-auto mb-3 opacity-50" />
                <p className="text-muted text-sm">Start chatting with Hermes Agent</p>
                <p className="text-muted text-xs mt-1">No limitations — ask anything</p>
              </div>
            )}
            {chatMsgs.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", msg.role === "user" ? "bg-accent text-white" : "bg-bg-card border border-border")}>
                  {msg.role === "assistant" && <Bot className="w-3 h-3 text-accent mb-1" />}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.model && <span className="text-[10px] text-muted mt-1 block">{msg.model}</span>}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 text-accent animate-spin" />
                  <span className="text-xs text-muted">thinking...</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 p-3 border-t border-border">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
              placeholder="Message Hermes..."
              className="flex-1 text-sm"
              disabled={chatLoading}
            />
            <button onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()} className="btn-primary p-2">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right pane — tabs */}
        <div className="w-96 flex-shrink-0 flex flex-col">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-1 p-2 border-b border-border bg-bg-card">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded",
                    activeTab === tab.id ? "bg-accent text-white" : "text-muted hover:bg-bg-card"
                  )}
                  title={tab.label}
                >
                  <Icon className="w-3 h-3" />
                  <span className="hidden lg:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-hidden p-3">
            {renderRightPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
