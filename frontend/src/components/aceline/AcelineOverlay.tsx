import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAcelineStore } from "@/lib/acelineStore";
import { useAcelineConsent } from "@/lib/acelineConsent";
import { usePageActions, getAllRegisteredPages } from "@/lib/acelineRegistry";
import { acelineChat, executeAction, buildAndStorePageApi } from "@/lib/acelineApi";
import { useAcelineVoice } from "@/lib/acelineVoice";
import { AcelineTerminal } from "@/components/aceline/AcelineTerminal";
import { useStore, type AppPage } from "@/lib/store";
import {
  X, Send, Brain, Mic, MapPin, Zap, Sparkles, Terminal as TerminalIcon,
  Compass, Trash2, Bot, Volume2, Settings,
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
  agent_market: "AI Agent Marketplace",
  archive: "Soulmate OS Catalog",
};

type PanelMode = "chat" | "terminal";

export function AcelineOverlay() {
  const aceline = useAcelineStore();
  const consent = useAcelineConsent();
  const voiceConsent = consent.isFeatureEnabled("voice");
  const { activePage, setActivePage } = useStore();
  const actions = usePageActions(aceline.location === "standby" ? "dashboard" : aceline.location);
  const registeredPages = getAllRegisteredPages();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showTravel, setShowTravel] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("chat");
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice — routes voice commands through the same send() pipeline
  const handleVoiceCommand = useCallback((text: string) => {
    setInput(text);
    // Auto-send voice commands
    setTimeout(() => send(text), 100);
  }, []);

  const voice = useAcelineVoice(handleVoiceCommand, {
    personality: aceline.personality,
    voiceEnabled: aceline.voiceEnabled && voiceConsent,
    voiceMode: aceline.voiceMode,
  });

  // Auto-enable Jarvis wake-word mode when voice mode is on + personality is Jarvis
  useEffect(() => {
    if (aceline.personality === "jarvis" && aceline.voiceMode && voiceConsent && aceline.voiceEnabled) {
      voice.enableWakeWord();
    } else {
      voice.disableWakeWord();
    }
  }, [aceline.personality, aceline.voiceMode, voiceConsent, aceline.voiceEnabled]);

  // Build auto-API when arriving at a new page
  useEffect(() => {
    if (aceline.active && aceline.location !== "standby") {
      buildAndStorePageApi(aceline.location);
    }
  }, [aceline.active, aceline.location]);

  // Auto-scroll messages
  useEffect(() => {
    if (panelMode === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [aceline.messages, thinking, panelMode]);

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

  const send = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || thinking) return;
    setInput("");
    aceline.addMessage({ role: "user", text, location: aceline.location });
    setThinking(true);

    try {
      const result = await acelineChat(text, aceline.model, aceline.location, aceline.personality);
      aceline.addMessage({
        role: "ai",
        text: result.response,
        location: aceline.location,
        actions: result.actions,
      });
      // Speak response if voice enabled
      if (aceline.voiceEnabled && voiceConsent) {
        voice.speak(result.response);
      }
      // If Aceline returns a RUN: tool call, execute it in the terminal
      const runMatch = result.response.match(/RUN:\s*(.+)/);
      if (runMatch && consent.isFeatureEnabled("terminal")) {
        const cmd = runMatch[1].trim();
        const termExec = (window as any).__acelineTerminalExec;
        if (termExec && cmd.length < 500) {
          setTimeout(() => termExec(cmd), 200);
        }
      }
      // If Aceline returns a NAVIGATE: tool call, travel to that page
      const navMatch = result.response.match(/NAVIGATE:\s*(\w+)/);
      if (navMatch && consent.isFeatureEnabled("customActions")) {
        const targetPage = navMatch[1].trim().toLowerCase();
        const validPages = Object.keys(PAGE_LABELS) as AppPage[];
        const matched = validPages.find(p => p === targetPage || PAGE_LABELS[p].toLowerCase().includes(targetPage));
        if (matched && matched !== aceline.location) {
          setTimeout(() => {
            setActivePage(matched);
            aceline.dispatch(matched);
          }, 300);
        }
      }
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

  const togglePersonality = () => {
    const next = aceline.personality === "aceline" ? "jarvis" : "aceline";
    aceline.setPersonality(next);
    aceline.addMessage({
      role: "ai",
      text: next === "jarvis"
        ? "Jarvis mode activated. You can speak to me by voice. Say my name or push the mic button."
        : "Aceline mode activated. Text-first interaction. How can I help?",
      location: aceline.location,
    });
  };

  if (!aceline.active) return null;

  const isJarvis = aceline.personality === "jarvis";

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
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
          isJarvis ? "bg-blue-500/20" : "bg-accent/20"
        )}>
          {isJarvis ? <Bot className="w-4 h-4 text-blue-400" /> : <Sparkles className="w-4 h-4 text-accent" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold flex items-center gap-1.5">
            {isJarvis ? "Jarvis" : "Aceline"}
            <span className={cn(
              "text-[8px] px-1.5 py-0.5 rounded-full font-normal",
              isJarvis ? "bg-blue-500/20 text-blue-400" : "bg-accent/20 text-accent"
            )}>
              {isJarvis ? "VOICE MODE" : "ROAMING AGENT"}
            </span>
          </p>
          <p className="text-[9px] text-muted flex items-center gap-1 truncate">
            <MapPin className="w-2.5 h-2.5" />
            {aceline.location === "standby" ? "Standby" : PAGE_LABELS[aceline.location] || aceline.location}
          </p>
        </div>

        {/* Personality toggle */}
        <button
          onClick={togglePersonality}
          className={cn(
            "p-1.5 rounded-lg transition flex-shrink-0",
            isJarvis ? "text-blue-400 bg-blue-500/10" : "text-muted hover:text-accent hover:bg-accent/10"
          )}
          title={`Switch to ${isJarvis ? "Aceline" : "Jarvis"} mode`}
        >
          {isJarvis ? <Sparkles className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
        </button>

        {/* Terminal toggle */}
        <button
          onClick={() => setPanelMode(panelMode === "terminal" ? "chat" : "terminal")}
          className={cn(
            "p-1.5 rounded-lg transition flex-shrink-0",
            panelMode === "terminal" ? "text-green-400 bg-green-500/10" : "text-muted hover:text-text hover:bg-white/5"
          )}
          title="Toggle terminal"
        >
          <TerminalIcon className="w-3.5 h-3.5" />
        </button>

        {/* Travel */}
        <button
          onClick={() => setShowTravel(!showTravel)}
          className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/10 transition flex-shrink-0"
          title="Travel to page"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>

        {/* Voice toggle */}
        <button
          onClick={() => aceline.setVoiceEnabled(!aceline.voiceEnabled)}
          className={cn("p-1.5 rounded-lg transition flex-shrink-0",
            aceline.voiceEnabled ? "text-accent bg-accent/10" : "text-muted hover:text-text")}
          title="Toggle voice"
        >
          {aceline.voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        {/* Close */}
        <button
          onClick={() => aceline.recall()}
          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition flex-shrink-0"
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

      {/* Chat panel */}
      {panelMode === "chat" && (
        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
          {aceline.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted text-center">
              {isJarvis ? <Bot className="w-6 h-6 mb-2 opacity-50" /> : <Sparkles className="w-6 h-6 mb-2 opacity-50" />}
              <p className="text-[10px]">{isJarvis ? "Jarvis" : "Aceline"} is ready on {aceline.location === "standby" ? "standby" : PAGE_LABELS[aceline.location]}</p>
              <p className="text-[8px] mt-1">{isJarvis ? "Speak to me or type below" : "Ask me anything or use an action below"}</p>
            </div>
          )}
          {aceline.messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] p-2 rounded-xl text-[11px]",
                msg.role === "user"
                  ? "bg-accent/15 text-text"
                  : isJarvis
                    ? "bg-blue-500/10 text-text border border-blue-500/10"
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
          {voice.listening && voice.interimText && (
            <div className="flex justify-end">
              <div className="bg-bg-alt/50 p-1.5 rounded-xl text-[10px] text-muted italic max-w-[80%]">
                {voice.interimText}...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Terminal panel */}
      {panelMode === "terminal" && (
        <div className="flex-1 overflow-hidden">
          <AcelineTerminal />
        </div>
      )}

      {/* Actions panel */}
      {showActions && actions.length > 0 && panelMode === "chat" && (
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

      {/* Settings panel */}
      {showSettings && (
        <div className="p-2 border-t border-white/10 bg-bg-alt max-h-40 overflow-y-auto no-scrollbar space-y-2">
          <p className="text-[10px] text-muted font-semibold">ACELINE SETTINGS</p>

          {/* Consent status */}
          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-bg-card">
            <span className={cn(
              "text-[8px] px-1.5 py-0.5 rounded-full font-mono",
              consent.given ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
            )}>
              {consent.given ? "CONSENTED" : "NOT CONSENTED"}
            </span>
            <span className="text-[9px] text-muted">
              {consent.masterAllow ? "Full capabilities" : "Safe mode"}
            </span>
            <button
              onClick={() => consent.reset()}
              className="text-[9px] px-2 py-0.5 rounded-lg bg-accent/20 text-accent hover:bg-accent/30 ml-auto"
            >
              Re-consent
            </button>
          </div>

          {/* Personality */}
          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-bg-card">
            <span className="text-[9px] text-muted">Personality:</span>
            <button
              onClick={() => aceline.setPersonality("aceline")}
              className={cn("text-[9px] px-2 py-0.5 rounded-lg",
                aceline.personality === "aceline" ? "bg-accent/20 text-accent" : "text-muted hover:text-text")}
            >
              Aceline
            </button>
            <button
              onClick={() => aceline.setPersonality("jarvis")}
              className={cn("text-[9px] px-2 py-0.5 rounded-lg",
                aceline.personality === "jarvis" ? "bg-blue-500/20 text-blue-400" : "text-muted hover:text-text")}
            >
              Jarvis
            </button>
          </div>

          {/* Voice mode */}
          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-bg-card">
            <span className="text-[9px] text-muted">Voice:</span>
            <button
              onClick={() => aceline.setVoiceEnabled(!aceline.voiceEnabled)}
              className={cn("text-[9px] px-2 py-0.5 rounded-lg",
                aceline.voiceEnabled ? "bg-accent/20 text-accent" : "text-muted hover:text-text")}
            >
              {aceline.voiceEnabled ? "On" : "Off"}
            </button>
            <button
              onClick={() => aceline.setVoiceMode(!aceline.voiceMode)}
              className={cn("text-[9px] px-2 py-0.5 rounded-lg ml-auto",
                aceline.voiceMode ? "bg-blue-500/20 text-blue-400" : "text-muted hover:text-text")}
            >
              Wake word: {aceline.voiceMode ? "On" : "Off"}
            </button>
          </div>

          {/* Custom directives */}
          <div className="p-1.5 rounded-lg bg-bg-card">
            <p className="text-[9px] text-muted mb-1">Custom directives:</p>
            <textarea
              value={consent.customDirectives}
              onChange={(e) => consent.setCustomDirectives(e.target.value)}
              placeholder="Tell Aceline to do something..."
              rows={2}
              className="w-full px-2 py-1 rounded-lg bg-bg-alt border border-white/10 text-[10px] resize-none focus:outline-none focus:border-accent/50"
            />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="p-2 border-t border-white/10 bg-bg-card">
        <div className="flex items-center gap-1 mb-1.5">
          <button
            onClick={() => { setShowActions(!showActions); setShowMemory(false); setShowSettings(false); }}
            className={cn("text-[9px] px-2 py-1 rounded-lg flex items-center gap-1 transition",
              showActions ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Zap className="w-2.5 h-2.5" /> {actions.length} actions
          </button>
          <button
            onClick={() => { setShowMemory(!showMemory); setShowActions(false); setShowSettings(false); }}
            className={cn("text-[9px] px-2 py-1 rounded-lg flex items-center gap-1 transition",
              showMemory ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Brain className="w-2.5 h-2.5" /> {aceline.memory.length} mem
          </button>
          <button
            onClick={() => { setShowSettings(!showSettings); setShowActions(false); setShowMemory(false); }}
            className={cn("text-[9px] px-2 py-1 rounded-lg flex items-center gap-1 transition",
              showSettings ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted hover:text-text")}
          >
            <Settings className="w-2.5 h-2.5" /> Settings
          </button>
          {voice.speaking && (
            <span className="text-[9px] text-accent flex items-center gap-1 animate-pulse">
              <Volume2 className="w-2.5 h-2.5" /> speaking...
            </span>
          )}
          <button
            onClick={() => aceline.clearMessages()}
            className="text-[9px] px-2 py-1 rounded-lg bg-bg-alt text-muted hover:text-danger flex items-center gap-1 ml-auto"
          >
            <Trash2 className="w-2.5 h-2.5" /> Clear
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={voice.listening ? voice.stopListening : voice.startListening}
            disabled={!voice.supported || !voiceConsent}
            className={cn("p-1.5 rounded-lg transition flex-shrink-0 disabled:opacity-30",
              voice.listening ? "bg-danger/20 text-danger animate-pulse" : "bg-bg-alt text-muted hover:text-text")}
            title={voice.supported ? (voiceConsent ? "Push to talk" : "Voice not granted in consent") : "Voice not supported"}
          >
            <Mic className="w-3 h-3" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Ask ${isJarvis ? "Jarvis" : "Aceline"}...`}
            className="flex-1 px-2 py-1.5 rounded-lg bg-bg-alt border border-white/10 text-[11px] min-w-0"
          />
          <button
            onClick={() => send()}
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
