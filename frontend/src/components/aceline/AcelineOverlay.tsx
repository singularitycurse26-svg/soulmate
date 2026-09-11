import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAcelineStore } from "@/lib/acelineStore";
import { usePageActions, getAllRegisteredPages } from "@/lib/acelineRegistry";
import { acelineChat, executeAction, buildAndStorePageApi } from "@/lib/acelineApi";
import { useStore, type AppPage } from "@/lib/store";
import {
  X, Send, Brain, Mic, MapPin, Zap, Sparkles, Terminal,
  ChevronDown, Eye, Cpu, Compass, Trash2, Settings,
} from "lucide-react";

const PAGE_LABELS: Record<AppPage, string> = {
  dashboard: "Dashboard",
  business: "Business Archive",
  email: "Email",
  phone: "Phone",
  contacts: "Contacts",
  ai: "AI Brain",
  games: "Games",
  wallet: "Wallet",
  security: "Security",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  marketplace: "Marketplace",
  dating: "Dating",
  incentives: "Incentives",
  daytrading: "Day Trading",
  frequency: "Frequency Gen",
  healing: "Healing",
  journal: "Journal",
  soultube: "SoulTube",
  soulillusions: "SoulIllusions",
  wakkii: "Wakkii Links",
};

export function AcelineOverlay() {
  const aceline = useAcelineStore();
  const { activePage, setActivePage } = useStore();
  const actions = usePageActions(aceline.location === "standby" ? "dashboard" : aceline.location);
  const registeredPages = getAllRegisteredPages();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Build auto-API when arriving at a new page
  useEffect(() => {
    if (aceline.active && aceline.location !== "standby") {
      buildAndStorePageApi(aceline.location);
    }
  }, [aceline.active, aceline.location]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aceline.messages, thinking]);

  // Dragging
  const handleDragStart = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("button, input, textarea, select")) return;
    setDragging(true);
    const rect = overlayRef.current?.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - (rect?.left || 0),
      y: e.clientY - (rect?.top || 0),
    };
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      aceline.setPosition({
        x: Math.max(0, Math.min(window.innerWidth - aceline.size.w, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.current.y)),
      });
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, aceline]);

  // Voice
  const speak = useCallback((text: string) => {
    if (!aceline.voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_`#>]/g, "").slice(0, 500);
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, [aceline.voiceEnabled]);

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported. Use Chrome or Edge."); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setInput(transcript);
      if (event.results[event.results.length - 1].isFinal) setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    setListening(false);
  };

  const send = async () => {
    if (!input.trim() || thinking) return;
    const text = input.trim();
    setInput("");
    aceline.addMessage({ role: "user", text, location: aceline.location });
    setThinking(true);

    try {
      const result = await acelineChat(text, aceline.model, aceline.location);
      aceline.addMessage({
        role: "ai",
        text: result.response,
        location: aceline.location,
        actions: result.actions,
      });
      speak(result.response);
    } catch {
      aceline.addMessage({
        role: "ai",
        text: "I couldn't reach the GLM 5.1 backend. Make sure incllmv2 is running locally.",
        location: aceline.location,
      });
    } finally {
      setThinking(false);
    }
  };

  const handleAction = async (actionId: string) => {
    if (aceline.location === "standby") return;
    setThinking(true);
    aceline.addMessage({
      role: "user",
      text: `[Action] ${actions.find(a => a.id === actionId)?.label || actionId}`,
      location: aceline.location,
    });
    try {
      const result = await executeAction(aceline.location, actionId);
      aceline.addMessage({
        role: "ai",
        text: `Action executed: ${JSON.stringify(result).slice(0, 200)}`,
        location: aceline.location,
      });
    } catch (e: any) {
      aceline.addMessage({
        role: "ai",
        text: `Action failed: ${e.message}`,
        location: aceline.location,
      });
    } finally {
      setThinking(false);
    }
  };

  const travelTo = (page: AppPage) => {
    setActivePage(page);
    aceline.dispatch(page);
    setShowTravel(false);
  };

  if (!aceline.active) return null;

  return (
    <motion.div
      ref={overlayRef}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      style={{
        position: "fixed",
        left: aceline.position.x,
        top: aceline.position.y,
        width: aceline.size.w,
        height: aceline.size.h,
        zIndex: 9999,
      }}
      className="bg-bg-card border border-accent/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl"
    >
      {/* Header (drag handle) */}
      <div
        onMouseDown={handleDragStart}
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-accent/5 select-none",
          dragging && "cursor-grabbing",
          !dragging && "cursor-grab"
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold flex items-center gap-1.5">
            Aceline
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent font-normal">
              ROAMING AGENT
            </span>
          </p>
          <p className="text-[9px] text-muted flex items-center gap-1 truncate">
            <MapPin className="w-2.5 h-2.5" />
            {aceline.location === "standby" ? "Standby" : PAGE_LABELS[aceline.location] || aceline.location}
          </p>
        </div>
        <button
          onClick={() => setShowTravel(!showTravel)}
          className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition"
          title="Travel to page"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => aceline.setVoiceEnabled(!aceline.voiceEnabled)}
          className={cn("p-1.5 rounded-lg transition",
            aceline.voiceEnabled ? "text-accent bg-accent/10" : "text-muted hover:text-text")}
          title="Toggle voice"
        >
          <Mic className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => aceline.recall()}
          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition"
          title="Recall Aceline"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Travel picker */}
      {showTravel && (
        <div className="p-2 border-b border-white/10 bg-bg-alt max-h-48 overflow-y-auto no-scrollbar">
          <p className="text-[10px] text-muted mb-1.5 font-semibold">TRAVEL TO</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(PAGE_LABELS) as AppPage[]).map((page) => (
              <button
                key={page}
                onClick={() => travelTo(page)}
                className={cn(
                  "text-[10px] px-2 py-1.5 rounded-lg text-left transition",
                  aceline.location === page
                    ? "bg-accent/20 text-accent"
                    : "bg-bg-card text-muted hover:text-text hover:bg-white/5"
                )}
              >
                {PAGE_LABELS[page]}
                {registeredPages.includes(page) && (
                  <span className="ml-1 text-[8px] text-success">●</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
        {aceline.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted text-center">
            <Sparkles className="w-6 h-6 mb-2 opacity-50" />
            <p className="text-[10px]">Aceline is ready on {aceline.location === "standby" ? "standby" : PAGE_LABELS[aceline.location]}</p>
            <p className="text-[8px] mt-1">Ask me anything or use an action below</p>
          </div>
        )}
        {aceline.messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] p-2 rounded-xl text-[11px]",
              msg.role === "user"
                ? "bg-accent/15 text-text"
                : "bg-bg-alt text-text border border-white/5"
            )}>
              <p className="whitespace-pre-wrap">{msg.text}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-1 pt-1 border-t border-white/5 space-y-0.5">
                  {msg.actions.map((a, i) => (
                    <p key={i} className="text-[9px] text-muted flex items-center gap-1">
                      <Zap className="w-2 h-2" /> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="bg-bg-alt p-2 rounded-xl flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Actions panel */}
      {showActions && actions.length > 0 && (
        <div className="p-2 border-t border-white/10 bg-bg-alt max-h-32 overflow-y-auto no-scrollbar">
          <p className="text-[10px] text-muted mb-1 font-semibold">ACTIONS ON {aceline.location === "standby" ? "" : PAGE_LABELS[aceline.location].toUpperCase()}</p>
          <div className="space-y-1">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => handleAction(action.id)}
                className="w-full flex items-center gap-2 p-1.5 rounded-lg bg-bg-card hover:bg-accent/10 text-left transition group"
              >
                <span className={cn(
                  "text-[8px] px-1 py-0.5 rounded font-mono",
                  action.category === "read" ? "bg-blue-500/20 text-blue-400" :
                  action.category === "write" ? "bg-green-500/20 text-green-400" :
                  action.category === "navigation" ? "bg-purple-500/20 text-purple-400" :
                  action.category === "control" ? "bg-orange-500/20 text-orange-400" :
                  "bg-white/5 text-muted"
                )}>{action.category}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium group-hover:text-accent transition">{action.label}</p>
                  <p className="text-[8px] text-muted truncate">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Memory panel */}
      {showMemory && (
        <div className="p-2 border-t border-white/10 bg-bg-alt max-h-32 overflow-y-auto no-scrollbar">
          <p className="text-[10px] text-muted mb-1 font-semibold">ACELINE MEMORY ({aceline.memory.length})</p>
          <div className="space-y-1">
            {aceline.memory.slice(0, 10).map((m) => (
              <div key={m.id} className="p-1.5 rounded-lg bg-bg-card text-[9px]">
                <p className="font-mono text-accent">{m.key}</p>
                <p className="text-muted truncate">{m.value.slice(0, 80)}</p>
              </div>
            ))}
            {aceline.memory.length === 0 && <p className="text-[9px] text-muted">No memory entries yet</p>}
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="p-2 border-t border-white/10 bg-bg-card">
        <div className="flex items-center gap-1 mb-1.5">
          <button
            onClick={() => { setShowActions(!showActions); setShowMemory(false); }}
            className={cn("text-[9px] px-2 py-1 rounded-lg flex items-center gap-1 transition",
              showActions ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Zap className="w-2.5 h-2.5" /> {actions.length} actions
          </button>
          <button
            onClick={() => { setShowMemory(!showMemory); setShowActions(false); }}
            className={cn("text-[9px] px-2 py-1 rounded-lg flex items-center gap-1 transition",
              showMemory ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Brain className="w-2.5 h-2.5" /> {aceline.memory.length} mem
          </button>
          <button
            onClick={() => aceline.clearMessages()}
            className="text-[9px] px-2 py-1 rounded-lg bg-bg-alt text-muted hover:text-danger flex items-center gap-1 ml-auto"
          >
            <Trash2 className="w-2.5 h-2.5" /> Clear
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={listening ? stopListening : startListening}
            className={cn("p-1.5 rounded-lg transition flex-shrink-0",
              listening ? "bg-danger/20 text-danger animate-pulse" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Mic className="w-3 h-3" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask Aceline..."
            className="flex-1 px-2 py-1.5 rounded-lg bg-bg-alt border border-white/10 text-[11px] min-w-0"
          />
          <button
            onClick={send}
            disabled={thinking || !input.trim()}
            className="p-1.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 transition disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
