import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { aiApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Send, Brain, Loader2, Sparkles, Trash2, Eye, EyeOff, X,
  Cpu, Cloud, Server, Zap, Mail, Users, Wallet, Bell,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  tools_used?: Array<{ tool: string; result: any }>;
  model?: string;
  date?: string;
}

const TOOL_ICONS: Record<string, any> = {
  send_email: Mail,
  list_contacts: Users,
  create_contact: Users,
  check_balance: Wallet,
  set_reminder: Bell,
};

const QUICK_ACTIONS = [
  { label: "Check my balance", icon: Wallet },
  { label: "Who are my contacts?", icon: Users },
  { label: "Check my inbox", icon: Mail },
  { label: "What's my subscription?", icon: Sparkles },
];

export function AIPage() {
  const { showAlert } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [memories, setMemories] = useState<any[]>([]);
  const [model, setModel] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    try {
      const data = await aiApi.history();
      if (data.history && data.history.length > 0) {
        setMessages(data.history.map((h: any) => ({
          role: h.role,
          content: h.content,
          tools_used: h.tools_used,
          model: h.model,
          date: h.date,
        })));
      }
    } catch {
      // No history yet
    }
  };

  const loadMemories = async () => {
    try {
      const data = await aiApi.memories();
      setMemories(data.memories || []);
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text?: string) => {
    const message = (text || input).trim();
    if (!message || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const data = await aiApi.chat(message);
      setModel(data.model || "unknown");
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.response,
        tools_used: data.tools_used,
        model: data.model,
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Sorry, I couldn't process that: ${e.message}`,
        model: "error",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (id: number) => {
    try {
      await aiApi.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      showAlert("info", "Memory deleted");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleClearMemories = async () => {
    if (!confirm("Clear ALL memories? This cannot be undone.")) return;
    try {
      await aiApi.clearMemories();
      setMemories([]);
      showAlert("info", "All memories cleared");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const ModelBadge = ({ model }: { model: string }) => {
    if (!model) return null;
    const isGemini = model === "gemini";
    const isOllama = model === "ollama";
    const Icon = isGemini ? Cloud : isOllama ? Server : Cpu;
    const label = isGemini ? "Gemini" : isOllama ? "Local" : model;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
        isGemini ? "bg-blue-500/10 text-blue-400" : isOllama ? "bg-orange-500/10 text-orange-400" : "bg-muted/10 text-muted"
      )}>
        <Icon className="w-3 h-3" /> {label}
      </span>
    );
  };

  const ToolBadge = ({ tool }: { tool: any }) => {
    const Icon = TOOL_ICONS[tool.tool] || Zap;
    const label = tool.tool.replace(/_/g, " ");
    let detail = "";
    if (tool.result?.status === "sent") detail = `→ ${tool.result.to}`;
    else if (tool.result?.status === "created") detail = `→ ${tool.result.name}`;
    else if (tool.result?.contacts) detail = `${tool.result.contacts.length} contacts`;
    else if (tool.result?.emails) detail = `${tool.result.emails.length} emails`;
    else if (tool.result?.tier) detail = tool.result.tier;

    return (
      <div className="flex items-center gap-1.5 text-xs bg-accent/10 text-accent px-2 py-1 rounded-md mt-1">
        <Icon className="w-3 h-3" />
        <span className="font-medium capitalize">{label}</span>
        {detail && <span className="text-muted">{detail}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-accent" />
          <div>
            <h2 className="text-lg font-bold">Soulmate AI</h2>
            <p className="text-xs text-muted">Your personal AI with persistent memory</p>
          </div>
        </div>
        <button
          onClick={() => { setShowMemory(!showMemory); if (!showMemory) loadMemories(); }}
          className="btn-ghost p-2"
          title="View memories"
        >
          {showMemory ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-3">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-lg font-bold mb-2">Hey, I'm Soulmate</h3>
                <p className="text-muted text-sm max-w-xs mx-auto mb-6">
                  Your personal AI living on your server. I can send emails, manage contacts, check your wallet, and remember everything we talk about.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-sm mx-auto">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      onClick={() => handleSend(action.label)}
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
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.tools_used && msg.tools_used.length > 0 && (
                      <div className="mt-1">
                        {msg.tools_used.map((tool, j) => (
                          <ToolBadge key={j} tool={tool} />
                        ))}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.model && (
                      <div className="mt-1.5">
                        <ModelBadge model={msg.model} />
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
                  <span className="text-sm text-muted">Thinking...</span>
                </div>
              </motion.div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask me anything..."
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

        {/* Memory sidebar */}
        {showMemory && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            className="w-72 flex-shrink-0 border-l border-border pl-3 overflow-y-auto no-scrollbar"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Brain className="w-4 h-4 text-accent" /> Memories
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => aiApi.consolidateMemories().then(() => { loadMemories(); showAlert("info", "Memories consolidated"); })}
                  className="text-xs text-muted hover:text-accent p-1"
                  title="Consolidate"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleClearMemories} className="text-muted hover:text-danger p-1" title="Clear all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setShowMemory(false)} className="text-muted hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {memories.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No memories yet. Start chatting!</p>
            ) : (
              <div className="space-y-2">
                {memories.map((m) => (
                  <div key={m.id} className="card p-2 text-xs group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mb-1",
                          m.type === "conversation_summary" && "bg-blue-500/10 text-blue-400",
                          m.type === "reminder" && "bg-warning/10 text-warning",
                          m.type === "fact" && "bg-success/10 text-success",
                          m.type === "preference" && "bg-purple-500/10 text-purple-400",
                          !["conversation_summary", "reminder", "fact", "preference"].includes(m.type) && "bg-muted/10 text-muted"
                        )}>
                          {m.type}
                        </span>
                        <p className="text-muted line-clamp-3">{m.content}</p>
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted">
                          <span>{(m.importance * 100).toFixed(0)}%</span>
                          <span>•</span>
                          <span>{m.access_count}x</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
