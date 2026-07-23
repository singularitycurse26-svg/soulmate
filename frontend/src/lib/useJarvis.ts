import { useState, useEffect, useRef, useCallback } from "react";

export type STTProvider = "webspeech" | "jarvis" | "whisper" | "openai";
export type TTSProvider = "webspeech" | "jarvis" | "piper" | "kokoro" | "elevenlabs" | "openai";

export interface JarvisSettings {
  enabled: boolean;
  wakeWord: string;
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  selectedVoice: string;
  speechRate: number;
  volume: number;
  muted: boolean;
  jarvisBackendUrl: string;
}

const DEFAULT_SETTINGS: JarvisSettings = {
  enabled: false,
  wakeWord: "jarvis",
  sttProvider: "webspeech",
  ttsProvider: "webspeech",
  selectedVoice: "",
  speechRate: 1.0,
  volume: 1.0,
  muted: false,
  jarvisBackendUrl: "http://localhost:8765",
};

function loadSettings(): JarvisSettings {
  try {
    const saved = localStorage.getItem("jarvis_voice_settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: JarvisSettings) {
  localStorage.setItem("jarvis_voice_settings", JSON.stringify(s));
}

// Web Speech API type declarations
type SpeechRecognitionType = any;
const SpeechRecognition: SpeechRecognitionType =
  (typeof window !== "undefined" && (window as any).SpeechRecognition) ||
  (typeof window !== "undefined" && (window as any).webkitSpeechRecognition) ||
  null;

export function useJarvis(onCommand: (text: string) => void) {
  const [settings, setSettings] = useState<JarvisSettings>(loadSettings);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(64));
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSupported] = useState(() => SpeechRecognition !== null && typeof window !== "undefined" && "speechSynthesis" in window);

  const recognitionRef = useRef<SpeechRecognitionType>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const commandModeRef = useRef(false);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeWordLowerRef = useRef(settings.wakeWord.toLowerCase());
  const settingsRef = useRef(settings);
  const onCommandRef = useRef(onCommand);
  const isSpeakingRef = useRef(false);

  useEffect(() => { settingsRef.current = settings; saveSettings(settings); wakeWordLowerRef.current = settings.wakeWord.toLowerCase(); }, [settings]);
  useEffect(() => { onCommandRef.current = onCommand; }, [onCommand]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // Load available TTS voices
  useEffect(() => {
    if (!isSupported) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setAvailableVoices(voices);
        if (!settingsRef.current.selectedVoice && voices.length > 0) {
          const defaultVoice = voices.find((v) => v.default) || voices[0];
          setSettings((s) => ({ ...s, selectedVoice: defaultVoice.voiceURI }));
        }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [isSupported]);

  // Audio analysis for waveform
  const startAudioAnalysis = useCallback(async () => {
    try {
      if (micStreamRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        setFrequencyData(new Uint8Array(dataArray));
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setAudioLevel(sum / dataArray.length / 255);
        animFrameRef.current = requestAnimationFrame(update);
      };
      animFrameRef.current = requestAnimationFrame(update);
    } catch (e: any) {
      setError("Microphone access denied. Use push-to-talk or enable mic permissions.");
    }
  }, []);

  const stopAudioAnalysis = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setFrequencyData(new Uint8Array(64));
  }, []);

  // TTS — speak text
  const speak = useCallback((text: string) => {
    if (!isSupported || settingsRef.current.muted || !text.trim()) return;
    window.speechSynthesis.cancel();

    if (settingsRef.current.ttsProvider === "webspeech") {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settingsRef.current.speechRate;
      utterance.volume = settingsRef.current.volume;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.voiceURI === settingsRef.current.selectedVoice);
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
    // Future providers: jarvis, piper, kokoro, elevenlabs, openai — fetch audio and play
  }, [isSupported]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // STT — start listening
  const startListening = useCallback(() => {
    if (!SpeechRecognition || isListening) return;
    setError(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let accumulatedCommand = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }

      const fullText = (final + " " + interim).toLowerCase().trim();
      setInterimTranscript(interim);

      // Check for stop/interrupt while speaking
      if (isSpeakingRef.current && (fullText.includes("stop") || fullText.includes(settingsRef.current.wakeWord.toLowerCase()))) {
        stopSpeaking();
        return;
      }

      // Wake word detection
      if (!commandModeRef.current && fullText.includes(wakeWordLowerRef.current)) {
        commandModeRef.current = true;
        accumulatedCommand = "";
        // Extract anything after the wake word
        const afterWake = fullText.split(wakeWordLowerRef.current)[1]?.trim();
        if (afterWake) accumulatedCommand = afterWake;
        if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
        commandTimeoutRef.current = setTimeout(() => {
          if (accumulatedCommand.trim()) {
            onCommandRef.current(accumulatedCommand.trim());
          }
          commandModeRef.current = false;
          accumulatedCommand = "";
        }, 2500);
        return;
      }

      // In command mode — accumulate
      if (commandModeRef.current) {
        if (final) {
          accumulatedCommand += " " + final;
          if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
          commandTimeoutRef.current = setTimeout(() => {
            const cmd = accumulatedCommand.trim();
            if (cmd) onCommandRef.current(cmd);
            commandModeRef.current = false;
            accumulatedCommand = "";
          }, 1500);
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Speech recognition error: ${e.error}`);
      }
    };

    recognition.onend = () => {
      if (settingsRef.current.enabled && !isSpeakingRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      startAudioAnalysis();
    } catch (e: any) {
      setError(`Failed to start listening: ${e.message}`);
    }
  }, [isListening, startAudioAnalysis, stopSpeaking]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
    commandModeRef.current = false;
    setIsListening(false);
    setInterimTranscript("");
    stopAudioAnalysis();
  }, [stopAudioAnalysis]);

  // Push to talk — manual mode (no wake word needed)
  const pushToTalkStart = useCallback(() => {
    if (!SpeechRecognition) return;
    setError(null);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalText = "";
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else setInterimTranscript(event.results[i][0].transcript);
      }
    };
    recognition.onend = () => {
      setInterimTranscript("");
      if (finalText.trim()) onCommandRef.current(finalText.trim());
    };
    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`STT error: ${e.error}`);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      startAudioAnalysis();
    } catch (e: any) {
      setError(`Failed to start: ${e.message}`);
    }
  }, [startAudioAnalysis]);

  const pushToTalkStop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
    setInterimTranscript("");
    stopAudioAnalysis();
  }, [stopAudioAnalysis]);

  // Enable/disable voice mode
  const enable = useCallback(() => {
    setSettings((s) => ({ ...s, enabled: true }));
    setTimeout(() => startListening(), 100);
  }, [startListening]);

  const disable = useCallback(() => {
    stopListening();
    stopSpeaking();
    setSettings((s) => ({ ...s, enabled: false }));
  }, [stopListening, stopSpeaking]);

  // Auto-start listening when enabled
  useEffect(() => {
    if (settings.enabled && !isListening && SpeechRecognition) {
      startListening();
    }
    if (!settings.enabled && isListening) {
      stopListening();
    }
  }, [settings.enabled]); // eslint-disable-line

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
    };
  }, []); // eslint-disable-line

  const updateSettings = useCallback((partial: Partial<JarvisSettings>) => {
    setSettings((s) => ({ ...s, ...partial }));
  }, []);

  return {
    settings,
    updateSettings,
    isSupported,
    isListening,
    isSpeaking,
    isProcessing,
    interimTranscript,
    audioLevel,
    frequencyData,
    availableVoices,
    error,
    enable,
    disable,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    pushToTalkStart,
    pushToTalkStop,
    setIsProcessing,
  };
}
