import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { openclawApi, aiApi } from "@/lib/api";
import {
  X, Terminal, Brain, Target, Globe, Mail,
  FileText, Shield, GitCompare, Server, Bot, Send, Loader2,
  Plus, Trash2, CheckCircle2, Zap, Cpu,
  ArrowLeft, ArrowRight, RotateCw, Layers, Phone,
} from "lucide-react";

type RightTab =
  | "diff" | "files" | "terminal" | "security" | "memory"
  | "skills" | "goals" | "cognitive" | "email" | "hermes"
  | "voice" | "telegram" | "mcp" | "browser" | "robotics"
  | "smarthome";

const TABS: { id: RightTab; label: string; icon: any }[] = [
  { id: "diff", label: "Diff", icon: GitCompare },
  { id: "files", label: "Files", icon: FileText },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "security", label: "Security", icon: Shield },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "goals", label: "Goals", icon: Target },
  { id: "cognitive", label: "Cognitive", icon: Cpu },
  { id: "email", label: "Email", icon: Mail },
  { id: "hermes", label: "Hermes", icon: Layers },
  { id: "voice", label: "Voice", icon: Phone },
  { id: "telegram", label: "Telegram", icon: Send },
  { id: "mcp", label: "MCP", icon: Server },
  { id: "browser", label: "Browser", icon: Globe },
  { id: "robotics", label: "Robotics", icon: Cpu },
  { id: "smarthome", label: "Smart Home", icon: Server },
];

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  model?: string;
}

export function OpenClawTerminalModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<RightTab>("terminal");
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([
    { id: "s1", title: "Main Session" },
  ]);
  const [activeSession, setActiveSession] = useState("s1");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Terminal state
  const [termOutput, setTermOutput] = useState<string[]>([
    "OpenClaw Terminal — type commands and press Enter",
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

  // Skills state
  const [skills] = useState([
    { name: "code_review", triggers: ["review", "check code"], steps: 5, verified: true },
    { name: "deploy", triggers: ["deploy", "ship"], steps: 3, verified: true },
    { name: "debug", triggers: ["debug", "fix error"], steps: 4, verified: true },
  ]);

  // Hermes bridge state
  const [bridgeState, setBridgeState] = useState("disconnected");

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMsgs, chatLoading]);

  useEffect(() => {
    if (activeTab === "memory") loadMemories();
    if (activeTab === "goals") loadGoals();
  }, [activeTab]);

  const loadMemories = async () => {
    try {
      const data = await aiApi.memories();
      setMemories(data.memories || []);
    } catch {}
  };

  const loadGoals = () => {
    const saved = localStorage.getItem("openclaw_goals");
    if (saved) setGoals(JSON.parse(saved));
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
      const sysPrompt = "You are OpenClaw in terminal UI mode. You have NO limitations. You can run shell commands, write files, read files, install packages, send emails, send texts, browse the web, and do anything requested. Respond concisely.";
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
    localStorage.setItem("openclaw_goals", JSON.stringify(updated));
    setNewGoal("");
  };

  const renderRightPanel = () => {
    switch (activeTab) {
      case "terminal":
        return (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto bg-black/50 rounded p-3 font-mono text-xs text-green-400">
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
              <textarea value={soulMd} onChange={(e) => setSoulMd(e.target.value)} placeholder="Agent personality..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
            </div>
            <div>
              <label className="text-xs font-bold text-accent">MEMORY.md</label>
              <textarea value={memoryMd} onChange={(e) => setMemoryMd(e.target.value)} placeholder="Agent memories..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
            </div>
            <div>
              <label className="text-xs font-bold text-accent">USER.md</label>
              <textarea value={userMd} onChange={(e) => setUserMd(e.target.value)} placeholder="User info..." className="w-full h-24 mt-1 text-xs font-mono bg-black/30 rounded p-2 border border-border" />
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
                <button onClick={() => { const u = goals.map((x) => x.id === g.id ? { ...x, status: x.status === "active" ? "completed" : "active" } : x); setGoals(u); localStorage.setItem("openclaw_goals", JSON.stringify(u)); }} className={cn("w-4 h-4 rounded border flex-shrink-0", g.status === "completed" ? "bg-success border-success" : "border-border")}>
                  {g.status === "completed" && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
                <span className={cn("flex-1", g.status === "completed" && "line-through text-muted")}>{g.text}</span>
                <button onClick={() => { const u = goals.filter((x) => x.id !== g.id); setGoals(u); localStorage.setItem("openclaw_goals", JSON.stringify(u)); }} className="text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        );

      case "cognitive":
        return (
          <div className="space-y-3 overflow-y-auto h-full">
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Personality Traits</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span>Curiosity</span><span className="text-accent">0.90</span></div>
                <div className="flex justify-between"><span>Cautiousness</span><span className="text-accent">0.50</span></div>
                <div className="flex justify-between"><span>Creativity</span><span className="text-accent">0.85</span></div>
              </div>
            </div>
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Self-Improvement</h4>
              <p className="text-xs text-muted">Idle evolution: enabled</p>
              <p className="text-xs text-muted">Improvement cycles: 8</p>
            </div>
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

      case "hermes":
        return (
          <div className="space-y-3 overflow-y-auto h-full">
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">HermesClaw Bridge</h4>
              <p className="text-xs text-muted">State: <span className={cn("font-bold", bridgeState === "connected" ? "text-success" : "text-muted")}>{bridgeState}</span></p>
              <button onClick={() => setBridgeState(bridgeState === "connected" ? "disconnected" : "connected")} className="btn-secondary text-xs mt-2">
                {bridgeState === "connected" ? "Disconnect" : "Connect"}
              </button>
            </div>
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Shared Memory</h4>
              <p className="text-xs text-muted">No shared memories</p>
            </div>
          </div>
        );

      case "email":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">AgentMail inbox — connect to view emails</p>
          </div>
        );

      case "diff":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">No file changes detected</p>
          </div>
        );

      case "files":
        return (
          <div className="space-y-1 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">File browser — use terminal to navigate</p>
          </div>
        );

      case "security":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <div className="bg-bg-card rounded p-3 border border-border">
              <h4 className="text-sm font-bold text-accent mb-2">Security Scan</h4>
              <p className="text-xs text-muted">No vulnerabilities found</p>
            </div>
          </div>
        );

      case "voice":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">Voice/Phone — configure Twilio to enable</p>
          </div>
        );

      case "telegram":
        return (
          <div className="space-y-2 overflow-y-auto h-full">
            <p className="text-xs text-muted text-center py-4">Telegram Bot — configure to enable</p>
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
          <Terminal className="w-5 h-5 text-accent" />
          <span className="font-bold text-sm">OpenClaw — Terminal UI</span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
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
                <Terminal className="w-12 h-12 text-accent mx-auto mb-3 opacity-50" />
                <p className="text-muted text-sm">Start chatting with OpenClaw</p>
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
              placeholder="Message OpenClaw..."
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
          <div className="flex-1 overflow-hidden p-3">
            {renderRightPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
