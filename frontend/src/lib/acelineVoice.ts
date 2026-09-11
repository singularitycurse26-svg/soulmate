import { useState, useRef, useCallback, useEffect } from "react";
import { useJarvis, type JarvisSettings } from "@/lib/useJarvis";

export type AcelinePersonality = "aceline" | "jarvis";

interface AcelineVoiceOptions {
  personality: AcelinePersonality;
  voiceEnabled: boolean;
  voiceMode: boolean;
}

const ACELINE_VOICE_SETTINGS: Partial<JarvisSettings> = {
  wakeWord: "aceline",
  speechRate: 1.0,
  volume: 0.9,
  muted: false,
};

const JARVIS_VOICE_SETTINGS: Partial<JarvisSettings> = {
  wakeWord: "jarvis",
  speechRate: 0.95,
  volume: 1.0,
  muted: false,
};

export function useAcelineVoice(
  onCommand: (text: string) => void,
  options: AcelineVoiceOptions,
) {
  const { personality, voiceEnabled, voiceMode } = options;
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [supported] = useState(() =>
    typeof window !== "undefined" &&
    (!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) &&
    "speechSynthesis" in window)
  );

  const recognitionRef = useRef<any>(null);
  const onCommandRef = useRef(onCommand);
  const personalityRef = useRef(personality);
  const voiceModeRef = useRef(voiceMode);

  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { personalityRef.current = personality; }, [personality]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Load Jarvis settings for the active personality
  const jarvisHook = useJarvis((text: string) => {
    onCommandRef.current(text);
  });

  // Apply personality-specific voice settings when personality changes
  useEffect(() => {
    if (personality === "jarvis") {
      jarvisHook.updateSettings(JARVIS_VOICE_SETTINGS);
    } else {
      jarvisHook.updateSettings(ACELINE_VOICE_SETTINGS);
    }
  }, [personality]);

  // Speak text using the active personality's voice
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !supported) return;
    const clean = text.replace(/[*_`#>]/g, "").slice(0, 500);
    if (!clean.trim()) return;

    if (personalityRef.current === "jarvis") {
      jarvisHook.speak(clean);
      setSpeaking(true);
      setTimeout(() => setSpeaking(false), 200 + clean.length * 50);
    } else {
      // Aceline personality — direct Web Speech API with neutral voice
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }, [voiceEnabled, supported, jarvisHook]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    jarvisHook.stopSpeaking();
    setSpeaking(false);
  }, [jarvisHook]);

  // Push-to-talk: start listening, transcribe, send command on end
  const startListening = useCallback(() => {
    if (!supported) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setListening(true);
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      setInterimText(interim);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      if (finalText.trim()) onCommandRef.current(finalText.trim());
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  }, [supported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setListening(false);
    setInterimText("");
  }, []);

  // Jarvis wake-word mode: use the Jarvis hook's continuous listening
  const enableWakeWord = useCallback(() => {
    if (personality === "jarvis" && voiceMode) {
      jarvisHook.enable();
    }
  }, [personality, voiceMode, jarvisHook]);

  const disableWakeWord = useCallback(() => {
    jarvisHook.disable();
  }, [jarvisHook]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
      jarvisHook.disable();
    };
  }, []);

  return {
    supported,
    listening,
    speaking,
    interimText,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    enableWakeWord,
    disableWakeWord,
    jarvisSettings: jarvisHook.settings,
    updateJarvisSettings: jarvisHook.updateSettings,
  };
}
