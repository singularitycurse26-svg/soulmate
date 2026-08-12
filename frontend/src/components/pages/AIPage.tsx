import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { soulIllusionsAgentApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Send, Brain, Loader2, Sparkles, Trash2, X, Cpu, Cloud, Server,
  Zap, Mail, Users, Wallet, Bell, Play, Square, Target, RefreshCw,
  Settings, Activity, MessageSquare, FolderPlus, Folder, ChevronRight,
  Bot, Gauge, Power, Radio,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tokens?: number;
}

interface Conversation {
  id: string;
  title: string;
  model?: string;
  project_id?: string;
  created_at?: number;
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface AgentStatus {
  status: string;
  model?: string;
  goal?: string;
  actions_taken?: number;
  uptime?: string;
}

const QUICK_ACTIONS = [
  { label: "Check my wallet balance", icon: Wallet, prompt: "Check my wallet balance and show me all token holdings" },
  { label: "Read my emails", icon: Mail, prompt: "Check my email inbox and summarize unread messages" },
  { label: "Who are my contacts?", icon: Users, prompt: "List all my contacts and their details" },
  { label: "Set a reminder", icon: Bell, prompt: "Set a reminder for me" },
  { label: "Browse the web", icon: Cloud, prompt: "Search the web for the latest AI news and summarize" },
  { label: "Agent status", icon: Activity, prompt: "Show me the current agent status and recent actions" },
];

const MODELS = [
  { id: "dolphin-mistral:latest", label: "dolphin-mistral", desc: "Uncensored, autonomous" },
  { id: "qwen2.5:7b", label: "qwen2.5:7b", desc: "Fast, capable" },
  { id: "gemma-12b:latest", label: "gemma-12b", desc: "Google, balanced" },
  { id: "qwen-hermes-7b:latest", label: "qwen-hermes-7b", desc: "Hermes-tuned" },
];

type Tab = "chat" | "agent" | "overview" | "config";

export function AIPage() {
  const { showAlert, setActivePage } = useStore();
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("dolphin-mistral:latest");
  const [showSidebar, setShowSidebar] = useState(true);
  const [totalTokens, setTotalTokens] = useState(0);

  // Agent state
  const [agentStatus, setAgentStatus] = useState<string>("idle");
  const [agentGoal, setAgentGoal] = useState("");
  const [agentActions, setAgentActions] = useState(0);
  const [agentUptime, setAgentUptime] = useState("--");
  const [agentModel, setAgentModel] = useState("--");

  // Config state
  const [config, setConfig] = useState<any>({});
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const data = await soulIllusionsAgentApi.listConversations();
      setConversations(data.conversations || []);
    } catch {
      setConversations([]);
    }
  }, []);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      const data = await soulIllusionsAgentApi.listProjects();
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    }
  }, []);

  // Load agent status
  const loadAgentStatus = useCallback(async () => {
    try {
      const data = await soulIllusionsAgentApi.getStatus();
      setAgentStatus(data.status || "idle");
      setAgentModel(data.model || "dolphin-mistral");
      setAgentActions(data.actions_taken || 0);
      setAgentUptime(data.uptime || "--");
      if (data.goal) setAgentGoal(data.goal);
    } catch {
      setAgentStatus("offline");
    }
  }, []);

  // Load config
  const loadConfig = useCallback(async () => {
    try {
      const data = await soulIllusionsAgentApi.getConfig();
      setConfig(data);
    } catch {}
  }, []);

  // Load models
  const loadModels = useCallback(async () => {
    try {
      const data = await soulIllusionsAgentApi.getModels();
      setAvailableModels(data.models || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadConversations();
    loadProjects();
    loadAgentStatus();
    loadConfig();
    loadModels();
  }, [loadConversations, loadProjects, loadAgentStatus, loadConfig, loadModels]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const newChat = () => {
    setMessages([]);
    setCurrentConvId(null);
  };

  const loadConversation = async (id: string) => {
    try {
      const data = await soulIllusionsAgentApi.getConversation(id);
      setCurrentConvId(id);
      const msgs = (data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        tokens: m.tokens,
      }));
      setMessages(msgs);
      if (data.project_id) setCurrentProjectId(data.project_id);
      if (data.model) setSelectedModel(data.model);
    } catch (e: any) {
      showAlert("danger", `Failed to load conversation: ${e.message}`);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await soulIllusionsAgentApi.deleteConversation(id);
      if (id === currentConvId) {
        setMessages([]);
        setCurrentConvId(null);
      }
      loadConversations();
    } catch {}
  };

  const createProject = async () => {
    const name = prompt("Project name:");
    if (!name) return;
    try {
      await soulIllusionsAgentApi.createProject({ name });
      loadProjects();
      showAlert("success", "Project created");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await soulIllusionsAgentApi.deleteProject(id);
      if (id === currentProjectId) setCurrentProjectId(null);
      loadProjects();
    } catch {}
  };

  const handleSend = async (text?: string) => {
    const message = (text || input).trim();
    if (!message || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    // Create conversation if needed
    let convId = currentConvId;
    if (!convId) {
      try {
        const conv = await soulIllusionsAgentApi.createConversation({
          title: message.slice(0, 40),
          model: selectedModel,
          project_id: currentProjectId || undefined,
        });
        if (conv.id) {
          convId = conv.id;
          setCurrentConvId(convId);
        }
      } catch {}
    }

    // Save user message
    if (convId) {
      try {
        await soulIllusionsAgentApi.addMessage(convId, { role: "user", content: message });
      } catch {}
    }

    const chatMessages = [...messages, { role: "user", content: message }];

    try {
      const result = await soulIllusionsAgentApi.chat(
        chatMessages.map((m) => ({ role: m.role, content: m.content })),
        selectedModel
      );

      const content = result.choices?.[0]?.message?.content || "No response";
      const tokens = result.usage?.total_tokens || 0;

      setMessages((prev) => [...prev, { role: "assistant", content, tokens }]);
      setTotalTokens((prev) => prev + tokens);

      // Save assistant message
      if (convId) {
        try {
          await soulIllusionsAgentApi.addMessage(convId, { role: "assistant", content, tokens });
        } catch {}
      }
      loadConversations();
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${e.message}. Make sure SoulIllusions Agent is running on port 7869.` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startAgent = async () => {
    try {
      await soulIllusionsAgentApi.startAgent(agentGoal || undefined);
      setAgentStatus("running");
      showAlert("success", "Agent started");
      loadAgentStatus();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const stopAgent = async () => {
    try {
      await soulIllusionsAgentApi.stopAgent();
      setAgentStatus("stopped");
      showAlert("info", "Agent stopped");
      loadAgentStatus();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const setAgentGoalApi = async () => {
    if (!agentGoal.trim()) return;
    try {
      await soulIllusionsAgentApi.setGoal(agentGoal);
      showAlert("success", "Goal set for agent");
      loadAgentStatus();
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const updateConfig = async (key: string, value: any) => {
    try {
      await soulIllusionsAgentApi.updateConfig({ [key]: value });
      setConfig((prev: any) => ({ ...prev, [key]: value }));
      showAlert("success", "Config updated");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const statusColor = (status: string) => {
    if (status === "running") return "text-green-400 bg-green-400/10";
    if (status === "stopped" || status === "failed") return "text-red-400 bg-red-400/10";
    if (status === "offline") return "text-muted bg-bg-alt";
    return "text-orange-400 bg-orange-400/10";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-accent flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gradient">SoulIllusions</h2>
            <p className="text-xs text-muted">Autonomous AI Agent — controls all Soulmate OS categories</p>
          </div>
          <div className={cn("ml-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium", statusColor(agentStatus))}>
            <span className={cn("w-1.5 h-1.5 rounded-full", agentStatus === "running" ? "bg-green-400 animate-pulse" : "bg-current")} />
            {agentStatus}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="btn-ghost p-2"
            title="Toggle sidebar"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {[
          { id: "chat", label: "Chat", icon: MessageSquare },
          { id: "agent", label: "Agent Control", icon: Bot },
          { id: "overview", label: "Overview", icon: Gauge },
          { id: "config", label: "Config", icon: Settings },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
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

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Sidebar — Conversations & Projects */}
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            className="w-64 flex-shrink-0 border-r border-border pr-3 overflow-y-auto no-scrollbar"
          >
            {/* Projects */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5" /> Projects
                </h3>
                <button onClick={createProject} className="text-muted hover:text-accent p-0.5" title="New project">
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="text-xs text-muted/50 px-2">No projects yet</p>
              ) : (
                <div className="space-y-1">
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setCurrentProjectId(p.id === currentProjectId ? null : p.id)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs group transition-all",
                        currentProjectId === p.id
                          ? "bg-accent/10 text-accent"
                          : "text-muted hover:text-white hover:bg-bg-alt"
                      )}
                    >
                      <Folder className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate flex-1">{p.name}</span>
                      <button
                        onClick={(e) => deleteProject(p.id, e)}
                        className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conversations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Conversations
                </h3>
                <button onClick={newChat} className="text-muted hover:text-accent p-0.5" title="New chat">
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted/50 px-2">No conversations yet</p>
              ) : (
                <div className="space-y-1">
                  {conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => loadConversation(c.id)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs group transition-all",
                        currentConvId === c.id
                          ? "bg-bg-alt text-white"
                          : "text-muted hover:text-white hover:bg-bg-alt"
                      )}
                    >
                      <ChevronRight className="w-3 h-3 shrink-0" />
                      <span className="truncate flex-1">{c.title}</span>
                      <button
                        onClick={(e) => deleteConversation(c.id, e)}
                        className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ===== Chat Tab ===== */}
          {tab === "chat" && (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-3">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-accent/20 flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">SoulIllusions Agent</h3>
                    <p className="text-muted text-sm max-w-sm mx-auto mb-6">
                      Your autonomous AI brain running dolphin-mistral (uncensored) via Ollama. I control every category in Soulmate OS — email, contacts, wallet, phone, games, and more. I have 3-layer persistent memory and get smarter with every interaction.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-md mx-auto">
                      {QUICK_ACTIONS.map((action) => (
                        <button
                          key={action.label}
                          onClick={() => handleSend(action.prompt)}
                          className="btn-secondary text-sm flex items-center gap-2"
                        >
                          <action.icon className="w-4 h-4" /> {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex",
                        msg.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5",
                        msg.role === "user"
                          ? "bg-accent text-white"
                          : "bg-bg-card border border-border"
                      )}>
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-4 h-4 rounded bg-gradient-to-br from-purple-500 to-accent flex items-center justify-center">
                              <Bot className="w-2.5 h-2.5 text-white" />
                            </div>
                            <span className="text-xs font-medium text-muted">SoulIllusions</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        {msg.role === "assistant" && msg.tokens && (
                          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                            <span className="inline-flex items-center gap-1">
                              <Zap className="w-3 h-3" /> {msg.tokens} tokens
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="bg-bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                      <span className="text-sm text-muted">SoulIllusions is thinking...</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Input */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="text-xs rounded-lg px-2 py-1 outline-none bg-bg-card border border-border"
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <span className="text-xs text-muted">{totalTokens} tokens used</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Ask SoulIllusions anything... it controls all of Soulmate OS"
                    className="flex-1"
                    disabled={loading}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    className="btn-primary p-2.5"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ===== Agent Control Tab ===== */}
          {tab === "agent" && (
            <div className="overflow-y-auto no-scrollbar">
              {/* Status Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Radio className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted">Status</span>
                  </div>
                  <div className={cn("text-sm font-bold capitalize", agentStatus === "running" ? "text-green-400" : agentStatus === "offline" ? "text-muted" : "text-orange-400")}>
                    {agentStatus}
                  </div>
                </div>
                <div className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted">Model</span>
                  </div>
                  <div className="text-sm font-bold text-white">{agentModel}</div>
                </div>
                <div className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted">Actions</span>
                  </div>
                  <div className="text-sm font-bold text-white">{agentActions}</div>
                </div>
                <div className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Gauge className="w-4 h-4 text-accent" />
                    <span className="text-xs text-muted">Uptime</span>
                  </div>
                  <div className="text-sm font-bold text-white">{agentUptime}</div>
                </div>
              </div>

              {/* Controls */}
              <div className="card p-4 mb-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Power className="w-4 h-4 text-accent" /> Agent Controls
                </h3>
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={startAgent}
                    disabled={agentStatus === "running"}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-all disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" /> Start Agent
                  </button>
                  <button
                    onClick={stopAgent}
                    disabled={agentStatus !== "running"}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <Square className="w-4 h-4" /> Stop Agent
                  </button>
                  <button
                    onClick={loadAgentStatus}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-alt text-muted text-sm font-medium hover:text-white transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Refresh
                  </button>
                </div>

                {/* Goal */}
                <div>
                  <label className="text-xs text-muted block mb-1.5">Autonomous Goal</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                      <input
                        value={agentGoal}
                        onChange={(e) => setAgentGoal(e.target.value)}
                        placeholder="e.g. Research latest AI news and summarize findings..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white placeholder:text-muted focus:outline-none focus:border-accent/50"
                      />
                    </div>
                    <button
                      onClick={setAgentGoalApi}
                      disabled={!agentGoal.trim()}
                      className="px-4 py-2 rounded-lg bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-all disabled:opacity-50"
                    >
                      Set Goal
                    </button>
                  </div>
                </div>
              </div>

              {/* 9-Phase Reasoning Info */}
              <div className="card p-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent" /> 9-Phase Reasoning Loop
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { phase: "Classify", desc: "Determine task type" },
                    { phase: "Define Done", desc: "Success criteria" },
                    { phase: "Evidence", desc: "Gather facts" },
                    { phase: "Decide", desc: "One recommendation" },
                    { phase: "Act", desc: "Smallest correct change" },
                    { phase: "Verify", desc: "Observe, don't infer" },
                    { phase: "Repair", desc: "Fix root cause" },
                    { phase: "Synthesize", desc: "Combine findings" },
                    { phase: "Judge", desc: "Adversarial review" },
                  ].map((p, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-bg-alt">
                      <span className="text-accent font-mono font-bold shrink-0">{i + 1}</span>
                      <div>
                        <p className="text-white font-medium">{p.phase}</p>
                        <p className="text-muted">{p.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== Overview Tab ===== */}
          {tab === "overview" && (
            <div className="overflow-y-auto no-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Cpu className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Active Model</span>
                  </div>
                  <div className="text-lg font-bold text-white">{agentModel}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Radio className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Agent Status</span>
                  </div>
                  <div className={cn("text-lg font-bold capitalize", agentStatus === "running" ? "text-green-400" : "text-white")}>
                    {agentStatus}
                  </div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Uptime</span>
                  </div>
                  <div className="text-lg font-bold text-white">{agentUptime}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Conversations</span>
                  </div>
                  <div className="text-lg font-bold text-white">{conversations.length}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Actions Taken</span>
                  </div>
                  <div className="text-lg font-bold text-white">{agentActions}</div>
                </div>
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-5 h-5 text-accent" />
                    <span className="text-xs text-muted">Tokens Used</span>
                  </div>
                  <div className="text-lg font-bold text-white">{totalTokens}</div>
                </div>
              </div>

              {/* 3-Layer Memory */}
              <div className="card p-4 mb-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-accent" /> 3-Layer Persistent Memory
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-bg-alt">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <span className="text-sm font-medium text-white">Working</span>
                    </div>
                    <p className="text-xs text-muted">Context window — current session state, sacred zone for critical context</p>
                  </div>
                  <div className="p-3 rounded-lg bg-bg-alt">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-accent" />
                      <span className="text-sm font-medium text-white">Episodic</span>
                    </div>
                    <p className="text-xs text-muted">SQLite — session trajectories with timestamps, decays over 30 days</p>
                  </div>
                  <div className="p-3 rounded-lg bg-bg-alt">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <span className="text-sm font-medium text-white">Semantic</span>
                    </div>
                    <p className="text-xs text-muted">Knowledge graph — skills, facts, concepts with bidirectional recursive links</p>
                  </div>
                </div>
              </div>

              {/* Capabilities */}
              <div className="card p-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" /> Soulmate OS Integration
                </h3>
                <p className="text-xs text-muted mb-3">
                  SoulIllusions is the AI brain that controls every category in Soulmate OS. Through the chat interface, it can:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { label: "Email", icon: Mail, page: "email" },
                    { label: "Contacts", icon: Users, page: "contacts" },
                    { label: "Wallet", icon: Wallet, page: "wallet" },
                    { label: "Phone", icon: Bell, page: "phone" },
                    { label: "Games", icon: Sparkles, page: "games" },
                    { label: "Security", icon: Brain, page: "security" },
                  ].map((cap) => {
                    const Icon = cap.icon;
                    return (
                      <button
                        key={cap.label}
                        onClick={() => setActivePage(cap.page as any)}
                        className="flex items-center gap-2 p-2 rounded-lg bg-bg-alt hover:bg-accent/10 hover:text-accent transition-all text-muted"
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{cap.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ===== Config Tab ===== */}
          {tab === "config" && (
            <div className="overflow-y-auto no-scrollbar max-w-2xl">
              <div className="card p-4 mb-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-accent" /> Agent Configuration
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted block mb-1.5">LLM Model</label>
                    <select
                      value={selectedModel}
                      onChange={(e) => {
                        setSelectedModel(e.target.value);
                        updateConfig("model", e.target.value);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white focus:outline-none focus:border-accent/50"
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-muted block mb-1.5">Ollama Endpoint</label>
                    <div className="px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-muted">
                      localhost:11434
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted block mb-1.5">API Endpoint</label>
                    <div className="px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-muted">
                      localhost:7869
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted block mb-1.5">Censorship</label>
                    <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400 font-medium">
                      DISABLED (uncensored)
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-muted block mb-1.5">Max Actions Before Refresh</label>
                    <select
                      value={config.max_actions || "10"}
                      onChange={(e) => updateConfig("max_actions", parseInt(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-bg-alt border border-border text-sm text-white focus:outline-none focus:border-accent/50"
                    >
                      <option value="5">5</option>
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Available Models */}
              {availableModels.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-accent" /> Available Ollama Models
                  </h3>
                  <div className="space-y-2">
                    {availableModels.map((m: any) => (
                      <div key={m.name} className="flex items-center gap-2 p-2 rounded-lg bg-bg-alt text-sm">
                        <Server className="w-4 h-4 text-muted" />
                        <span className="text-white font-medium">{m.name}</span>
                        <span className="text-xs text-muted ml-auto">{m.size || "--"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
