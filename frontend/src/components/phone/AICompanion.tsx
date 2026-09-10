import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { incllmv2Api } from "@/lib/api";
import {
  Bot,
  Mic,
  MicOff,
  Send,
  Loader2,
  Volume2,
  VolumeX,
  X,
  Radio,
  Sparkles,
  Heart,
  Brain,
} from "lucide-react";

interface Message {
  role: "user" | "ai";
  text: string;
  timestamp: number;
}

const AI_NAME = "Daria";
const AI_PERSONALITY = `You are ${AI_NAME}, a sarcastic, witty, and caring AI companion. You have a dry sense of humor and aren't afraid to be blunt, but you genuinely care about the person you're talking to. You're uncensored — you speak your mind freely, make jokes, and don't sugarcoat things. You're like a real friend who gives honest advice. You have opinions, you're smart, and you can talk about anything. Be conversational, keep responses short and natural like a real conversation. Don't be overly formal or robotic.`;

export function AICompanion({ userName, onExit }: { userName: string; onExit: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "ai",
      text: `Hey. I'm ${AI_NAME}. So... you wanted someone to talk to? I'm here. What's on your mind?`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [avatarState, setAvatarState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [blinkPhase, setBlinkPhase] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (avatarState === "speaking" || avatarState === "thinking") return;
    const interval = setInterval(() => {
      setBlinkPhase((p) => !p);
    }, avatarState === "idle" ? 3000 : 1500);
    return () => clearInterval(interval);
  }, [avatarState]);

  const speak = useCallback((text: string) => {
    if (!synthRef.current || muted) {
      setAvatarState("idle");
      return;
    }
    synthRef.current.cancel();
    const cleanText = text.replace(/[*_#>`]/g, "").replace(/\n/g, " ").slice(0, 500);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = synthRef.current.getVoices();
    const femaleVoice = voices.find((v) =>
      v.name.toLowerCase().match(/samantha|zira|female|woman|jenny|aria|karen|tessa|moira|fiona/) &&
      v.lang.startsWith("en")
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    utterance.rate = 1.0;
    utterance.pitch = 0.95;
    utterance.volume = 1.0;
    utterance.onstart = () => { setSpeaking(true); setAvatarState("speaking"); };
    utterance.onend = () => { setSpeaking(false); setAvatarState("idle"); };
    utterance.onerror = () => { setSpeaking(false); setAvatarState("idle"); };
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  }, [muted]);

  const stopSpeaking = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setSpeaking(false);
    setAvatarState("idle");
  }, []);

  const sendToAI = useCallback(async (text: string) => {
    if (!text.trim() || thinking) return;
    const userMsg: Message = { role: "user", text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);
    setAvatarState("thinking");

    try {
      const result = await incllmv2Api.jarvis(text, "dolphin-mistral:latest", { userName, companion: AI_NAME });
      const data = await result.json();
      const aiText = data.response || "Hmm, I didn't catch that.";
      const aiMsg: Message = { role: "ai", text: aiText, timestamp: Date.now() };
      setMessages((prev) => [...prev, aiMsg]);
      setThinking(false);
      speak(aiText);
    } catch (e: any) {
      const errMsg = `Sorry, my brain's not connecting right now. ${e.message}`;
      setMessages((prev) => [...prev, { role: "ai", text: errMsg, timestamp: Date.now() }]);
      setThinking(false);
      setAvatarState("idle");
    }
  }, [thinking, userName, speak]);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input not supported on this browser. Try Chrome or Edge.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart = () => {
      setListening(true);
      setAvatarState("listening");
      stopSpeaking();
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      sendToAI(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setAvatarState("idle");
    };
    recognition.onend = () => {
      setListening(false);
      if (avatarState === "listening") setAvatarState("idle");
    };
    recognitionRef.current = recognition;
    recognition.start();
  }, [sendToAI, stopSpeaking, avatarState]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    setAvatarState("idle");
  }, []);

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (newMuted) stopSpeaking();
  };

  const avatarColors = {
    idle: { bg: "#1a1a2e", accent: "#7c3aed", glow: "#7c3aed40" },
    listening: { bg: "#1a2e1a", accent: "#22c55e", glow: "#22c55e40" },
    thinking: { bg: "#2e2a1a", accent: "#f59e0b", glow: "#f59e0b40" },
    speaking: { bg: "#2e1a2e", accent: "#ec4899", glow: "#ec489960" },
  };
  const colors = avatarColors[avatarState];

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-white/5">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Heart className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base flex items-center gap-2">
              {AI_NAME}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-normal">
                AI COMPANION
              </span>
            </h3>
            <p className="text-xs text-muted">
              {avatarState === "speaking" ? "Speaking..." :
               avatarState === "listening" ? "Listening..." :
               avatarState === "thinking" ? "Thinking..." :
               "Online · Uncensored · Voice enabled"}
            </p>
          </div>
          <button onClick={toggleMute} className="text-muted hover:text-text p-2 rounded-lg hover:bg-bg-alt">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={onExit} className="text-muted hover:text-text p-2 rounded-lg hover:bg-bg-alt">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar display */}
        <div
          className="relative flex flex-col items-center justify-center py-6 transition-all duration-700 overflow-hidden"
          style={{
            background: `radial-gradient(ellipse at 50% 30%, ${colors.glow}, transparent 60%), linear-gradient(180deg, ${colors.bg} 0%, #0a0a14 100%)`,
          }}
        >
          {/* Ambient particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: 2 + (i % 3),
                  height: 2 + (i % 3),
                  left: `${(i * 8.3) % 100}%`,
                  top: `${(i * 13.7) % 100}%`,
                  background: colors.accent,
                  opacity: 0.15 + (i % 3) * 0.1,
                  animation: `float ${4 + (i % 4)}s ease-in-out infinite`,
                  animationDelay: `${i * 0.3}s`,
                }}
              />
            ))}
          </div>

          {/* Avatar SVG */}
          <div className="relative" style={{ width: 260, height: 300 }}>
            <svg viewBox="0 0 260 300" className="w-full h-full">
              <defs>
                {/* Skin gradient */}
                <radialGradient id="skin" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#f5d4b8" />
                  <stop offset="70%" stopColor="#e8c0a0" />
                  <stop offset="100%" stopColor="#d4a888" />
                </radialGradient>
                {/* Hair gradient */}
                <linearGradient id="hair" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4a3526" />
                  <stop offset="50%" stopColor="#3d2b1f" />
                  <stop offset="100%" stopColor="#2d1f15" />
                </linearGradient>
                <linearGradient id="hairHighlight" x1="0%" y1="0%" x2="100%" y2="50%">
                  <stop offset="0%" stopColor="#5a4536" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#3d2b1f" stopOpacity="0" />
                </linearGradient>
                {/* Jacket gradient */}
                <linearGradient id="jacket" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3a5a4a" />
                  <stop offset="100%" stopColor="#1a3028" />
                </linearGradient>
                <linearGradient id="jacketShade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#000" stopOpacity="0.3" />
                  <stop offset="50%" stopColor="#000" stopOpacity="0" />
                  <stop offset="100%" stopColor="#000" stopOpacity="0.3" />
                </linearGradient>
                {/* Lip gradient */}
                <linearGradient id="lips" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#d4606a" />
                  <stop offset="100%" stopColor="#b04050" />
                </linearGradient>
                {/* Eye gradient */}
                <radialGradient id="iris" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#6b5b4a" />
                  <stop offset="80%" stopColor="#4a3a2a" />
                  <stop offset="100%" stopColor="#2a1a0a" />
                </radialGradient>
                {/* Glow filter */}
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Outer glow ring */}
              <circle
                cx="130" cy="120" r="110"
                fill="none"
                stroke={colors.accent}
                strokeWidth="1.5"
                opacity="0.2"
                style={{ filter: `drop-shadow(0 0 12px ${colors.accent})` }}
              />
              <circle
                cx="130" cy="120" r="100"
                fill="none"
                stroke={colors.accent}
                strokeWidth="1"
                opacity="0.1"
                className={avatarState === "speaking" ? "animate-pulse" : ""}
              />

              {/* Speaking sound rings */}
              {avatarState === "speaking" && (
                <>
                  <circle cx="130" cy="120" r="115" fill="none" stroke={colors.accent} strokeWidth="1.5" opacity="0.15" className="animate-ping" />
                  <circle cx="130" cy="120" r="120" fill="none" stroke={colors.accent} strokeWidth="1" opacity="0.08" className="animate-ping" style={{ animationDelay: "0.4s" }} />
                </>
              )}

              {/* Hair back layer */}
              <path
                d="M 55 100 Q 48 60 75 40 Q 100 22 130 25 Q 160 22 185 40 Q 212 60 205 100 L 205 175 Q 205 185 200 190 L 192 190 L 192 110 Q 185 88 130 85 Q 75 88 68 110 L 68 190 L 60 190 Q 55 185 55 175 Z"
                fill="url(#hair)"
              />
              <path
                d="M 60 90 Q 55 65 80 50 Q 105 38 130 40 Q 155 38 180 50 Q 205 65 200 90 L 195 85 Q 190 70 130 68 Q 70 70 65 85 Z"
                fill="url(#hairHighlight)"
              />

              {/* Neck */}
              <path d="M 112 165 L 112 195 Q 130 200 148 195 L 148 165 Z" fill="url(#skin)" />
              <path d="M 112 175 Q 130 180 148 175 L 148 195 Q 130 200 112 195 Z" fill="#c4a888" opacity="0.5" />

              {/* Face */}
              <ellipse cx="130" cy="120" rx="52" ry="62" fill="url(#skin)" />

              {/* Face shading */}
              <ellipse cx="108" cy="130" rx="20" ry="35" fill="#c4a888" opacity="0.25" />
              <ellipse cx="152" cy="130" rx="20" ry="35" fill="#c4a888" opacity="0.25" />

              {/* Cheek blush when speaking or listening */}
              {(avatarState === "speaking" || avatarState === "listening") && (
                <>
                  <ellipse cx="98" cy="140" rx="12" ry="8" fill="#e88090" opacity="0.3" />
                  <ellipse cx="162" cy="140" rx="12" ry="8" fill="#e88090" opacity="0.3" />
                </>
              )}

              {/* Hair front - bangs with layers */}
              <path
                d="M 72 88 Q 78 55 105 48 Q 130 44 155 48 Q 182 55 188 88 Q 184 72 168 66 Q 150 60 130 60 Q 110 60 92 66 Q 76 72 72 88 Z"
                fill="url(#hair)"
              />
              {/* Side bangs */}
              <path d="M 72 88 Q 70 100 68 115 Q 72 110 76 100 Q 74 92 72 88 Z" fill="url(#hair)" />
              <path d="M 188 88 Q 190 100 192 115 Q 188 110 184 100 Q 186 92 188 88 Z" fill="url(#hair)" />
              {/* Hair shine */}
              <path d="M 90 62 Q 120 55 150 60 Q 140 58 120 57 Q 100 58 90 62 Z" fill="#6a5546" opacity="0.5" />

              {/* Eyebrows - express different states */}
              {avatarState === "thinking" ? (
                <>
                  <path d="M 100 100 Q 115 94 128 99" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 132 99 Q 145 94 160 100" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              ) : avatarState === "listening" ? (
                <>
                  <path d="M 100 98 Q 115 95 128 97" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 132 97 Q 145 95 160 98" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  <path d="M 100 102 Q 115 98 128 101" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 132 101 Q 145 98 160 102" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              )}

              {/* Eyes */}
              {blinkPhase ? (
                <>
                  <path d="M 102 118 Q 115 121 128 118" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                  <path d="M 132 118 Q 145 121 158 118" stroke="#2d1f15" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </>
              ) : (
                <>
                  {/* Left eye */}
                  <ellipse cx="115" cy="118" rx="8" ry={avatarState === "listening" ? 10 : 8} fill="#fff" />
                  <ellipse cx="115" cy="118" rx="6" ry={avatarState === "listening" ? 8 : 6.5} fill="url(#iris)" />
                  <circle cx="115" cy="118" r="3" fill="#1a0a00" />
                  <circle cx="117" cy="116" r="1.5" fill="#fff" opacity="0.8" />
                  {/* Right eye */}
                  <ellipse cx="145" cy="118" rx="8" ry={avatarState === "listening" ? 10 : 8} fill="#fff" />
                  <ellipse cx="145" cy="118" rx="6" ry={avatarState === "listening" ? 8 : 6.5} fill="url(#iris)" />
                  <circle cx="145" cy="118" r="3" fill="#1a0a00" />
                  <circle cx="147" cy="116" r="1.5" fill="#fff" opacity="0.8" />
                  {/* Eyeliner */}
                  <path d="M 107 116 Q 115 113 123 116" stroke="#2d1f15" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round" />
                  <path d="M 137 116 Q 145 113 153 116" stroke="#2d1f15" strokeWidth="1" fill="none" opacity="0.6" strokeLinecap="round" />
                </>
              )}

              {/* Nose */}
              <path d="M 130 128 L 126 148 Q 130 152 134 148 Z" fill="#d4a888" opacity="0.6" />
              <ellipse cx="127" cy="150" rx="2" ry="1.5" fill="#c49878" opacity="0.4" />
              <ellipse cx="133" cy="150" rx="2" ry="1.5" fill="#c49878" opacity="0.4" />

              {/* Mouth - changes with state */}
              {avatarState === "speaking" ? (
                <g>
                  <ellipse cx="130" cy="162" rx="14" ry="3" fill="#8a2030" />
                  <ellipse cx="130" cy="160" rx="12" ry={5 + Math.abs(Math.sin(Date.now() / 60)) * 4} fill="url(#lips)" className="animate-pulse" />
                  <ellipse cx="130" cy="158" rx="8" ry="2" fill="#e88090" opacity="0.4" />
                </g>
              ) : avatarState === "thinking" ? (
                <path d="M 122 164 Q 130 159 138 164" stroke="#a04050" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              ) : avatarState === "listening" ? (
                <g>
                  <ellipse cx="130" cy="162" rx="10" ry="4" fill="url(#lips)" />
                  <ellipse cx="130" cy="161" rx="7" ry="2" fill="#e88090" opacity="0.3" />
                </g>
              ) : (
                <g>
                  <path d="M 118 160 Q 130 168 142 160" stroke="url(#lips)" strokeWidth="3" fill="none" strokeLinecap="round" />
                  <path d="M 120 161 Q 130 166 140 161" stroke="#c4606a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6" />
                </g>
              )}

              {/* Earrings */}
              <circle cx="78" cy="135" r="2.5" fill={colors.accent} opacity="0.8" filter="url(#glow)" />
              <circle cx="182" cy="135" r="2.5" fill={colors.accent} opacity="0.8" filter="url(#glow)" />

              {/* Body/shoulders */}
              <path
                d="M 68 195 Q 58 210 55 240 L 55 290 L 205 290 L 205 240 Q 202 210 192 195 Q 175 210 130 210 Q 85 210 68 195 Z"
                fill="url(#jacket)"
              />
              <path
                d="M 68 195 Q 58 210 55 240 L 55 290 L 205 290 L 205 240 Q 202 210 192 195 Q 175 210 130 210 Q 85 210 68 195 Z"
                fill="url(#jacketShade)"
              />

              {/* Jacket collar */}
              <path d="M 85 200 L 130 225 L 175 200 L 168 212 L 130 240 L 92 212 Z" fill="#0a1a14" />
              {/* Collar highlight */}
              <path d="M 88 202 L 128 222 L 168 202" stroke="#4a6a5a" strokeWidth="1" fill="none" opacity="0.5" />

              {/* Shirt under collar */}
              <path d="M 110 225 L 130 240 L 150 225 L 148 290 L 112 290 Z" fill="#2a3a4a" />

              {/* Subtle shoulder highlights */}
              <path d="M 68 200 Q 65 215 62 235" stroke="#4a6a5a" strokeWidth="1.5" fill="none" opacity="0.3" />
              <path d="M 192 200 Q 195 215 198 235" stroke="#4a6a5a" strokeWidth="1.5" fill="none" opacity="0.3" />
            </svg>

            {/* State indicator badge */}
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full backdrop-blur-sm border"
              style={{
                background: `${colors.accent}25`,
                borderColor: `${colors.accent}40`,
              }}
            >
              {avatarState === "thinking" && <Loader2 className="w-3 h-3 animate-spin" style={{ color: colors.accent }} />}
              {avatarState === "listening" && <Mic className="w-3 h-3" style={{ color: colors.accent }} />}
              {avatarState === "speaking" && (
                <span className="flex items-end gap-0.5 h-3">
                  <span className="w-0.5 rounded-full" style={{ background: colors.accent, height: "40%", animation: "pulse 0.3s infinite" }} />
                  <span className="w-0.5 rounded-full" style={{ background: colors.accent, height: "80%", animation: "pulse 0.3s infinite 0.1s" }} />
                  <span className="w-0.5 rounded-full" style={{ background: colors.accent, height: "60%", animation: "pulse 0.3s infinite 0.2s" }} />
                  <span className="w-0.5 rounded-full" style={{ background: colors.accent, height: "90%", animation: "pulse 0.3s infinite 0.15s" }} />
                </span>
              )}
              {avatarState === "idle" && <Sparkles className="w-3 h-3" style={{ color: colors.accent }} />}
              <span className="text-[11px] font-medium" style={{ color: colors.accent }}>
                {avatarState === "speaking" ? "Speaking" : avatarState === "listening" ? "Listening" : avatarState === "thinking" ? "Thinking" : "Ready"}
              </span>
            </div>
          </div>

          {/* Voice controls */}
          <div className="flex items-center gap-3 mt-8">
            <button
              onClick={listening ? stopListening : startListening}
              disabled={thinking || speaking}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 relative",
                listening
                  ? "bg-green-500 text-white scale-110 shadow-lg shadow-green-500/50"
                  : "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 hover:scale-105"
              )}
            >
              {listening && <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />}
              {listening ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>
            {speaking && (
              <button
                onClick={stopSpeaking}
                className="px-5 py-2.5 rounded-full bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 border border-red-500/20"
              >
                Stop talking
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted mt-3">
            {listening ? "Tap to stop · I'm listening" : "Tap mic to talk · She'll reply with voice"}
          </p>
        </div>

        {/* Chat messages */}
        <div className="max-h-48 overflow-y-auto p-3 space-y-2 border-t border-white/5">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl p-2.5 text-sm",
                msg.role === "user"
                  ? "bg-accent/10 ml-8"
                  : "bg-purple-500/10 border border-purple-500/15 mr-8"
              )}
            >
              <p className={cn(
                "text-[10px] font-medium mb-0.5",
                msg.role === "ai" ? "text-purple-400" : "text-muted"
              )}>
                {msg.role === "ai" ? AI_NAME : userName}
              </p>
              <p className="break-words whitespace-pre-wrap text-xs">{msg.text}</p>
            </div>
          ))}
          {thinking && (
            <div className="rounded-xl p-2.5 bg-purple-500/10 border border-purple-500/15 mr-8">
              <p className="text-[10px] font-medium mb-0.5 text-purple-400">{AI_NAME}</p>
              <p className="text-xs text-muted flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Text input */}
        <div className="flex gap-2 p-3 border-t border-white/5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendToAI(input)}
            placeholder={`Type to ${AI_NAME}...`}
            className="flex-1 text-sm"
            disabled={thinking}
          />
          <button
            onClick={() => sendToAI(input)}
            disabled={thinking || !input.trim()}
            className="btn-primary px-3"
          >
            {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
