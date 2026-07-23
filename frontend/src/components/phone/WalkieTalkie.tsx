import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { voiceApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Radio,
  Play,
  Trash2,
  Loader2,
  Users,
  Volume2,
  AlertCircle,
  Crown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const API_BASE = "http://191.44.121.29:8546";
const STUN_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

interface VoiceMessage {
  id: number;
  from_name: string;
  duration: number;
  created_at: string;
}

interface WtStatus {
  allowed: boolean;
  status: string;
  detail: string;
  trial_days: number;
  price_inc: number;
}

export function WalkieTalkie() {
  const { showAlert } = useStore();
  const [status, setStatus] = useState<WtStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("general");
  const [channelInput, setChannelInput] = useState("general");
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [pttActive, setPttActive] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pttStreamRef = useRef<MediaStream | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await voiceApi.status();
      setStatus(data);
      if (data.allowed) {
        const msgs = await voiceApi.messages(channel);
        setMessages(msgs.messages || []);
      }
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  }, [showAlert, channel]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // WebSocket for live PTT signaling
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = `${API_BASE.replace("http", "ws")}/v1/voice/signal?channel=${encodeURIComponent(channel)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      showAlert("info", `Connected to channel: ${channel}`);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "user_joined") {
          setOnlineCount(data.count || 1);
          // Initiate WebRTC connection as the existing peer
          if (data.count > 1) {
            await initWebRTC(true);
          }
        } else if (data.type === "user_left") {
          setOnlineCount(data.count || 0);
        } else if (data.type === "offer") {
          await handleOffer(data.sdp);
        } else if (data.type === "answer") {
          await handleAnswer(data.sdp);
        } else if (data.type === "ice") {
          await handleIceCandidate(data.candidate);
        }
      } catch (e) {
        // Non-JSON or parse error, ignore
      }
    };

    ws.onerror = () => {
      // WebSocket errors are common if server doesn't support WSS
    };

    ws.onclose = () => {
      setOnlineCount(0);
    };

    wsRef.current = ws;
  }, [channel, showAlert]);

  // WebRTC setup
  const initWebRTC = async (isInitiator: boolean) => {
    try {
      if (!pttStreamRef.current) {
        pttStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const pc = new RTCPeerConnection(STUN_SERVERS);
      pcRef.current = pc;

      // Add audio track (muted by default)
      pttStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
        pc.addTrack(track, pttStreamRef.current!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "ice", candidate: event.candidate }));
        }
      };

      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
      };

      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({ type: "offer", sdp: offer }));
      }
    } catch (e: any) {
      showAlert("danger", "Microphone access denied: " + e.message);
    }
  };

  const handleOffer = async (sdp: RTCSessionDescriptionInit) => {
    if (!pcRef.current) {
      await initWebRTC(false);
    }
    const pc = pcRef.current!;
    await pc.setRemoteDescription(sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    wsRef.current?.send(JSON.stringify({ type: "answer", sdp: answer }));
  };

  const handleAnswer = async (sdp: RTCSessionDescriptionInit) => {
    if (pcRef.current) {
      await pcRef.current.setRemoteDescription(sdp);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch {
        // ICE candidate may arrive before remote description
      }
    }
  };

  // Push-to-talk
  const startPTT = async () => {
    if (!pcRef.current) {
      await connectWebSocket();
      await initWebRTC(true);
    }
    if (pttStreamRef.current) {
      pttStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
      setPttActive(true);
    }
  };

  const stopPTT = () => {
    if (pttStreamRef.current) {
      pttStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
    }
    setPttActive(false);
  };

  // Async voice message recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const base64Data = base64.split(",")[1];
          try {
            await voiceApi.send(channel, base64Data, recordingTime);
            showAlert("success", "Voice message sent!");
            const msgs = await voiceApi.messages(channel);
            setMessages(msgs.messages || []);
          } catch (e: any) {
            showAlert("danger", "Failed to send voice message: " + e.message);
          }
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setRecordingTime(0);
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
      };

      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (e: any) {
      showAlert("danger", "Microphone access denied: " + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  // Play voice message
  const playMessage = async (msgId: number) => {
    try {
      setPlaying(msgId);
      const data = await voiceApi.audio(msgId);
      const byteChars = atob(data.audio_data);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlaying(null);
        URL.revokeObjectURL(url);
      };
      audio.play();
    } catch (e: any) {
      showAlert("danger", "Failed to play message: " + e.message);
      setPlaying(null);
    }
  };

  const deleteMessage = async (msgId: number) => {
    try {
      await voiceApi.delete(msgId);
      setMessages(messages.filter((m) => m.id !== msgId));
      showAlert("info", "Voice message deleted");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const joinChannel = () => {
    if (!channelInput.trim()) return;
    setChannel(channelInput.trim());
    setOnlineCount(0);
    // Reconnect WebSocket and reload messages
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    loadStatus();
    connectWebSocket();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (wsRef.current) wsRef.current.close();
      if (pcRef.current) pcRef.current.close();
      if (pttStreamRef.current) pttStreamRef.current.getTracks().forEach((t) => t.stop());
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[30vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  if (status && !status.allowed) {
    return (
      <div className="space-y-4">
        <div className="card text-center py-8">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
          <p className="font-bold text-danger">Walkie-Talkie Locked</p>
          <p className="text-muted text-sm mt-1 mb-4">{status.detail}</p>
          <div className="card bg-bg-alt">
            <p className="text-sm">Subscribe for <span className="text-accent font-bold">{status.price_inc} INC/month</span></p>
            <p className="text-xs text-muted mt-1">Send INC to the fee wallet, then paste your tx hash</p>
            <input
              placeholder="0x... transaction hash"
              className="w-full mt-3 text-sm"
              style={{ userSelect: "text" }}
            />
            <button
              onClick={async () => {
                const input = document.querySelector('input[placeholder="0x... transaction hash"]') as HTMLInputElement;
                if (!input?.value.trim()) return showAlert("danger", "Enter your tx hash");
                try {
                  await voiceApi.subscribe(input.value);
                  showAlert("success", "Walkie-talkie activated!");
                  loadStatus();
                } catch (e: any) {
                  showAlert("danger", e.message);
                }
              }}
              className="btn-primary w-full mt-2 text-sm"
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      {status && (
        <div className={cn(
          "card flex items-center gap-3",
          status.status === "founder" && "border-warning",
          status.status === "trial" && "border-accent",
          status.status === "paid" && "border-success",
        )}>
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            status.status === "founder" ? "bg-warning/10" :
            status.status === "trial" ? "bg-accent/10" : "bg-success/10"
          )}>
            {status.status === "founder" ? <Crown className="w-5 h-5 text-warning" /> :
             <Radio className="w-5 h-5 text-accent" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{status.detail}</p>
            <p className="text-xs text-muted">
              {status.status === "founder" ? "Free for life" :
               status.status === "trial" ? `Free for ${status.trial_days} days` :
               "Premium walkie-talkie"}
            </p>
          </div>
        </div>
      )}

      {/* Channel selector */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">Channel</h3>
          {onlineCount > 0 && (
            <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full">
              {onlineCount} online
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            placeholder="channel name"
            className="flex-1 text-sm"
            onKeyDown={(e) => e.key === "Enter" && joinChannel()}
          />
          <button onClick={joinChannel} className="btn-secondary text-sm px-4">
            Join
          </button>
        </div>
        <p className="text-xs text-muted mt-2">Current: <span className="text-accent">#{channel}</span></p>
      </div>

      {/* Live Push-to-Talk */}
      <div className="card text-center">
        <h3 className="font-semibold text-sm mb-4">Live Push-to-Talk</h3>
        <button
          onPointerDown={startPTT}
          onPointerUp={stopPTT}
          onPointerLeave={stopPTT}
          className={cn(
            "w-32 h-32 rounded-full mx-auto flex items-center justify-center transition-all select-none",
            pttActive
              ? "bg-danger text-white scale-110 shadow-lg shadow-danger/30"
              : "bg-accent/10 text-accent hover:bg-accent/20"
          )}
        >
          <div className="flex flex-col items-center gap-2">
            {pttActive ? <Mic className="w-10 h-10" /> : <MicOff className="w-10 h-10" />}
            <span className="text-xs font-medium">
              {pttActive ? "TALKING" : "HOLD TO TALK"}
            </span>
          </div>
        </button>
        <p className="text-xs text-muted mt-3">
          {pttActive ? "Release to stop" : "Press and hold to broadcast live audio"}
        </p>
      </div>

      {/* Async Voice Messages */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-accent" /> Voice Messages
          </h3>
          <button
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={stopRecording}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all select-none",
              recording
                ? "bg-danger text-white"
                : "btn-secondary"
            )}
          >
            {recording ? <Mic className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
            {recording ? `Recording... ${recordingTime}s` : "Hold to Record"}
          </button>
        </div>

        {/* Recording indicator */}
        <AnimatePresence>
          {recording && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-danger/10 rounded-lg p-3 mb-3 flex items-center gap-2"
            >
              <div className="w-3 h-3 bg-danger rounded-full animate-pulse" />
              <span className="text-sm text-danger">Recording... {recordingTime}s (release to send)</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Message list */}
        {messages.length === 0 ? (
          <p className="text-muted text-sm text-center py-6">No voice messages yet. Hold the record button to send one.</p>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3 bg-bg-alt rounded-lg p-3"
                >
                  <button
                    onClick={() => playMessage(msg.id)}
                    disabled={playing === msg.id}
                    className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent hover:bg-accent/20"
                  >
                    {playing === msg.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{msg.from_name}</p>
                    <p className="text-xs text-muted">
                      {msg.duration > 0 ? `${msg.duration.toFixed(0)}s` : "Voice"} · {msg.created_at?.slice(11, 16) || ""}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMessage(msg.id)}
                    className="p-2 text-muted hover:text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
