import { useState } from "react";
import { motion } from "framer-motion";
import { X, Mic, Volume2, VolumeX, Settings, Zap, Server, Cloud, TestTube } from "lucide-react";
import type { JarvisSettings, STTProvider, TTSProvider } from "@/lib/useJarvis";

interface JarvisVoicePanelProps {
  settings: JarvisSettings;
  availableVoices: SpeechSynthesisVoice[];
  availableMics: MediaDeviceInfo[];
  selectedMicLabel: string;
  isSupported: boolean;
  error: string | null;
  onUpdate: (partial: Partial<JarvisSettings>) => void;
  onTestVoice: () => void;
  onClose: () => void;
}

const OUI = {
  bg: "#0A0908",
  sidebar: "#1A2530",
  surface: "#22333B",
  input: "#0F1A22",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  hover: "rgba(255,255,255,0.04)",
  text: "#EAE0D5",
  muted: "#C6AC8F",
  accent: "#C6AC8F",
  accentBg: "rgba(198,172,143,0.08)",
  warning: "#FFA726",
  error: "#EF5350",
  success: "#4CAF50",
};

const STT_OPTIONS: { value: STTProvider; label: string; icon: any }[] = [
  { value: "webspeech", label: "Web Speech API (Browser)", icon: Zap },
  { value: "jarvis", label: "Jarvis Backend (Local)", icon: Server },
  { value: "whisper", label: "Whisper (Future)", icon: Mic },
  { value: "openai", label: "OpenAI Whisper API (Future)", icon: Cloud },
];

const TTS_OPTIONS: { value: TTSProvider; label: string; icon: any }[] = [
  { value: "webspeech", label: "Web Speech API (Browser)", icon: Zap },
  { value: "jarvis", label: "Jarvis Backend (Piper/Chatterbox)", icon: Server },
  { value: "piper", label: "Piper TTS (Future)", icon: Mic },
  { value: "kokoro", label: "Kokoro TTS (Future)", icon: Mic },
  { value: "elevenlabs", label: "ElevenLabs (Future)", icon: Cloud },
  { value: "openai", label: "OpenAI TTS (Future)", icon: Cloud },
];

export function JarvisVoicePanel({
  settings,
  availableVoices,
  availableMics,
  selectedMicLabel,
  isSupported,
  error,
  onUpdate,
  onTestVoice,
  onClose,
}: JarvisVoicePanelProps) {
  const [testing, setTesting] = useState(false);

  const handleTest = () => {
    setTesting(true);
    onTestVoice();
    setTimeout(() => setTesting(false), 2000);
  };

  const selectStyle: React.CSSProperties = {
    background: OUI.input,
    color: OUI.text,
    border: `1px solid ${OUI.border}`,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  const inputStyle: React.CSSProperties = {
    background: OUI.input,
    color: OUI.text,
    border: `1px solid ${OUI.border}`,
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  const labelStyle: React.CSSProperties = {
    color: OUI.muted,
    fontSize: "12px",
    fontWeight: 500,
    marginBottom: "4px",
    display: "block",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl"
        style={{ background: OUI.sidebar, border: `1px solid ${OUI.border}` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${OUI.border}` }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: OUI.accentBg }}>
              <Mic className="w-4 h-4" style={{ color: OUI.accent }} />
            </div>
            <h2 className="text-base font-semibold" style={{ color: OUI.text }}>JARVIS Voice Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: OUI.muted }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {!isSupported && (
            <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
              Your browser doesn't support the Web Speech API. Use Chrome, Edge, or Safari for voice features.
            </div>
          )}

          {error && (
            <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
              {error}
            </div>
          )}

          {/* Wake Word */}
          <div>
            <label style={labelStyle}>Wake Word</label>
            <input
              type="text"
              value={settings.wakeWord}
              onChange={(e) => onUpdate({ wakeWord: e.target.value })}
              placeholder="jarvis"
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: OUI.muted }}>Say this word to activate voice mode</p>
          </div>

          {/* Microphone Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label style={labelStyle}>Microphone</label>
              <button
                onClick={() => onUpdate({ autoDetectMic: !settings.autoDetectMic })}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: settings.autoDetectMic ? "rgba(76,175,80,0.15)" : OUI.border,
                  color: settings.autoDetectMic ? OUI.success : OUI.muted,
                }}
              >
                {settings.autoDetectMic ? "Auto-Detect ON" : "Auto-Detect OFF"}
              </button>
            </div>
            {availableMics.length > 0 ? (
              <select
                value={settings.preferredMicDeviceId}
                onChange={(e) => {
                  onUpdate({ preferredMicDeviceId: e.target.value, autoDetectMic: false });
                }}
                style={selectStyle}
              >
                <option value="">Default Microphone</option>
                {availableMics.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label || `Mic ${m.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs" style={{ color: OUI.muted }}>
                Connect earbuds and click allow to see mic list
              </p>
            )}
            {selectedMicLabel && (
              <p className="text-xs mt-1" style={{ color: OUI.success }}>
                Active: {selectedMicLabel}
              </p>
            )}
          </div>

          {/* STT Provider */}
          <div>
            <label style={labelStyle}>Speech-to-Text Provider</label>
            <select
              value={settings.sttProvider}
              onChange={(e) => onUpdate({ sttProvider: e.target.value as STTProvider })}
              style={selectStyle}
            >
              {STT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* TTS Provider */}
          <div>
            <label style={labelStyle}>Text-to-Speech Provider</label>
            <select
              value={settings.ttsProvider}
              onChange={(e) => onUpdate({ ttsProvider: e.target.value as TTSProvider })}
              style={selectStyle}
            >
              {TTS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Voice Selection */}
          {settings.ttsProvider === "webspeech" && availableVoices.length > 0 && (
            <div>
              <label style={labelStyle}>Voice</label>
              <select
                value={settings.selectedVoice}
                onChange={(e) => onUpdate({ selectedVoice: e.target.value })}
                style={selectStyle}
              >
                {availableVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang}){v.default ? " — Default" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Speech Rate */}
          <div>
            <label style={labelStyle}>Speech Rate: {settings.speechRate.toFixed(1)}x</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={settings.speechRate}
              onChange={(e) => onUpdate({ speechRate: parseFloat(e.target.value) })}
              className="w-full"
              style={{ accentColor: OUI.accent }}
            />
          </div>

          {/* Volume */}
          <div>
            <label style={labelStyle}>Volume: {Math.round(settings.volume * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => onUpdate({ volume: parseFloat(e.target.value) })}
              className="w-full"
              style={{ accentColor: OUI.accent }}
            />
          </div>

          {/* Mute Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-2" style={{ color: OUI.text }}>
              {settings.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              Mute TTS Output
            </span>
            <button
              onClick={() => onUpdate({ muted: !settings.muted })}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ background: settings.muted ? OUI.accent : OUI.border }}
            >
              <div
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: settings.muted ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {/* Jarvis Backend URL */}
          {(settings.sttProvider === "jarvis" || settings.ttsProvider === "jarvis") && (
            <div>
              <label style={labelStyle}>Jarvis Backend URL</label>
              <input
                type="text"
                value={settings.jarvisBackendUrl}
                onChange={(e) => onUpdate({ jarvisBackendUrl: e.target.value })}
                placeholder="http://localhost:8765"
                style={inputStyle}
              />
              <p className="text-xs mt-1" style={{ color: OUI.muted }}>
                isair/Jarvis backend endpoint for STT/TTS
              </p>
            </div>
          )}

          {/* Test Voice */}
          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            style={{ background: testing ? OUI.border : OUI.accent, color: OUI.bg }}
          >
            <TestTube className="w-4 h-4" />
            {testing ? "Speaking..." : "Test Voice"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
