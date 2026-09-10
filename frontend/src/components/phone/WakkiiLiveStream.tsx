import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AICompanion } from "@/components/phone/AICompanion";
import {
  Radio,
  Youtube,
  Facebook,
  Settings,
  Users,
  Loader2,
  Circle,
  Square,
  Camera,
  Layout,
  Monitor,
  Plus,
  Check,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  Twitch,
  Heart,
} from "lucide-react";

const RELAY_URL = "ws://127.0.0.1:8086";
const STORAGE_KEY = "wakkii_broadcast_accounts";

type PlatformId = "youtube" | "facebook" | "tiktok" | "snapchat" | "twitch" | "custom";
type StreamStatus = "idle" | "connecting" | "live" | "ended" | "error";
type LayoutMode = "solo" | "pip" | "split" | "grid";

interface PlatformConfig {
  id: PlatformId;
  name: string;
  color: string;
  icon: React.ReactNode;
  defaultRtmp: string;
  helpUrl: string;
  instructions: string;
}

interface BroadcastAccount {
  platform: PlatformId;
  label: string;
  rtmpUrl: string;
  streamKey: string;
  enabled: boolean;
}

const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    icon: <Youtube className="w-5 h-5" />,
    defaultRtmp: "rtmp://a.rtmp.youtube.com/live2",
    helpUrl: "https://studio.youtube.com/channel/UC/videos/live",
    instructions: "Go to YouTube Studio → Create → Go Live → Stream Settings → Copy Stream Key",
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    color: "#1877F2",
    icon: <Facebook className="w-5 h-5" />,
    defaultRtmp: "rtmps://live-api-s.facebook.com:443/rtmp",
    helpUrl: "https://www.facebook.com/live/producer",
    instructions: "Go to Facebook Live Producer → Create Stream → Copy Server URL & Stream Key",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    color: "#000000",
    icon: <TikTokIcon />,
    defaultRtmp: "rtmp://push.live.tiktok.com/live",
    helpUrl: "https://www.tiktok.com/live",
    instructions: "Go to tiktok.com → Go LIVE → Save & Go LIVE → Stream Settings → Copy Server URL & Stream Key. Requires 1000+ followers.",
  },
  snapchat: {
    id: "snapchat",
    name: "Snapchat",
    color: "#FFFC00",
    icon: <SnapchatIcon />,
    defaultRtmp: "",
    helpUrl: "https://snapchat.com",
    instructions: "Snapchat doesn't support RTMP streaming for regular accounts. Use the Snapchat app to go live, or screen share via mobile.",
  },
  twitch: {
    id: "twitch",
    name: "Twitch",
    color: "#9146FF",
    icon: <Twitch className="w-5 h-5" />,
    defaultRtmp: "rtmp://live.twitch.tv/app",
    helpUrl: "https://dashboard.twitch.tv/settings/channel",
    instructions: "Go to Twitch Dashboard → Settings → Channel → Copy Stream Key. Use your Twitch username as the stream key suffix.",
  },
  custom: {
    id: "custom",
    name: "Custom RTMP",
    color: "#10B981",
    icon: <Radio className="w-5 h-5" />,
    defaultRtmp: "",
    helpUrl: "",
    instructions: "Enter any RTMP server URL and stream key for platforms not listed above.",
  },
};

function loadAccounts(): BroadcastAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveAccounts(accounts: BroadcastAccount[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch {}
}

interface WakkiiLiveStreamProps {
  localVideoStream: () => MediaStream | null;
  getRemoteVideoStream: (peerId: string) => MediaStream | null;
  participants: Array<{ peerId: string; name: string; videoEnabled: boolean; isHost: boolean }>;
  userName: string;
}

export function WakkiiLiveStream({
  localVideoStream,
  getRemoteVideoStream,
  participants,
  userName,
}: WakkiiLiveStreamProps) {
  const [accounts, setAccounts] = useState<BroadcastAccount[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [layout, setLayout] = useState<LayoutMode>("pip");
  const [liveTime, setLiveTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BroadcastAccount | null>(null);
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());
  const [companionMode, setCompanionMode] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRefs = useRef<WebSocket[]>([]);
  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    setAccounts(loadAccounts());
  }, []);

  const updateAccounts = (newAccounts: BroadcastAccount[]) => {
    setAccounts(newAccounts);
    saveAccounts(newAccounts);
  };

  const videoParticipants = participants.filter((p) => p.videoEnabled);
  const hasVideo = videoParticipants.length > 0 || !!localVideoStream();
  const enabledAccounts = accounts.filter((a) => a.enabled && a.streamKey && a.rtmpUrl);

  useEffect(() => {
    if (localVideoStream()) {
      if (!localVideoElRef.current) {
        localVideoElRef.current = document.createElement("video");
        localVideoElRef.current.muted = true;
        localVideoElRef.current.autoplay = true;
        localVideoElRef.current.playsInline = true;
      }
      localVideoElRef.current.srcObject = localVideoStream()!;
      localVideoElRef.current.play().catch(() => {});
    }
  }, [localVideoStream, participants]);

  useEffect(() => {
    videoParticipants.forEach((p) => {
      if (!remoteVideoElsRef.current.has(p.peerId)) {
        const el = document.createElement("video");
        el.muted = true;
        el.autoplay = true;
        el.playsInline = true;
        const stream = getRemoteVideoStream(p.peerId);
        if (stream) el.srcObject = stream;
        remoteVideoElsRef.current.set(p.peerId, el);
        el.play().catch(() => {});
      }
    });
  }, [videoParticipants, getRemoteVideoStream]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1280;
    const H = 720;
    canvas.width = W;
    canvas.height = H;

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);

    const localEl = localVideoElRef.current;
    const remoteEls = Array.from(remoteVideoElsRef.current.values()).filter(
      (el) => el.readyState >= 2
    );
    const allVideos = ([localEl, ...remoteEls] as HTMLVideoElement[]).filter((el) => el && el.readyState >= 2);

    if (allVideos.length === 0) {
      ctx.fillStyle = "#666";
      ctx.font = "24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Waiting for video...", W / 2, H / 2);
      animFrameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    if (layout === "solo" || allVideos.length === 1) {
      drawCover(ctx, allVideos[0], 0, 0, W, H);
    } else if (layout === "split" && allVideos.length === 2) {
      drawCover(ctx, allVideos[0], 0, 0, W / 2, H);
      drawCover(ctx, allVideos[1], W / 2, 0, W / 2, H);
    } else if (layout === "pip") {
      const main = allVideos[0];
      drawCover(ctx, main, 0, 0, W, H);
      const pipW = 320;
      const pipH = 180;
      const pipX = W - pipW - 20;
      const pipY = H - pipH - 60;
      for (let i = 1; i < allVideos.length && i <= 3; i++) {
        const py = pipY - (i - 1) * (pipH + 10);
        ctx.fillStyle = "#000";
        ctx.fillRect(pipX - 2, py - 2, pipW + 4, pipH + 4);
        drawCover(ctx, allVideos[i], pipX, py, pipW, pipH);
      }
    } else {
      const cols = allVideos.length <= 2 ? 2 : allVideos.length <= 4 ? 2 : 3;
      const rows = Math.ceil(allVideos.length / cols);
      const tileW = W / cols;
      const tileH = H / rows;
      allVideos.forEach((el, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        drawCover(ctx, el, col * tileW, row * tileH, tileW, tileH);
      });
    }

    if (status === "live") {
      ctx.fillStyle = "#FF0000";
      ctx.beginPath();
      ctx.arc(20, 20, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("LIVE", 35, 25);

      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const ss = String(elapsed % 60).padStart(2, "0");
      ctx.font = "14px monospace";
      ctx.fillText(`${mm}:${ss}`, W - 80, 25);
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, H - 40, W, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "left";
    const labels = [userName, ...videoParticipants.map((p) => p.name)];
    ctx.fillText(labels.slice(0, 4).join(" · "), 12, H - 15);
    ctx.textAlign = "right";
    ctx.fillText(`${allVideos.length} camera${allVideos.length > 1 ? "s" : ""}`, W - 12, H - 15);

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [layout, status, userName, videoParticipants]);

  useEffect(() => {
    if (status === "live" || status === "connecting") {
      animFrameRef.current = requestAnimationFrame(drawFrame);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [drawFrame, status]);

  useEffect(() => {
    if (status !== "live") return;
    const interval = setInterval(() => {
      setLiveTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const addAccount = (platform: PlatformId, label: string, rtmpUrl: string, streamKey: string) => {
    const account: BroadcastAccount = {
      platform,
      label,
      rtmpUrl,
      streamKey,
      enabled: true,
    };
    const existing = accounts.filter((a) => !(a.platform === platform && a.label === label));
    updateAccounts([...existing, account]);
    setEditingAccount(null);
    setShowAddPlatform(false);
  };

  const removeAccount = (platform: PlatformId, label: string) => {
    updateAccounts(accounts.filter((a) => !(a.platform === platform && a.label === label)));
  };

  const toggleAccountEnabled = (platform: PlatformId, label: string) => {
    updateAccounts(
      accounts.map((a) =>
        a.platform === platform && a.label === label
          ? { ...a, enabled: !a.enabled }
          : a
      )
    );
  };

  const startStream = async () => {
    if (enabledAccounts.length === 0) {
      setError("No broadcast accounts enabled. Set up at least one platform.");
      setShowAccounts(true);
      return;
    }

    setError(null);
    setStatus("connecting");

    const canvas = canvasRef.current;
    if (!canvas) {
      setError("Canvas not ready");
      setStatus("error");
      return;
    }

    const canvasStream = canvas.captureStream(30);

    const audioCtx = new AudioContext();
    const audioDest = audioCtx.createMediaStreamDestination();
    const localStream = localVideoStream();
    if (localStream) {
      try {
        const src = audioCtx.createMediaStreamSource(localStream);
        src.connect(audioDest);
      } catch {}
    }
    const audioTracks = audioDest.stream.getAudioTracks();
    if (audioTracks.length > 0) {
      canvasStream.addTrack(audioTracks[0]);
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=h264")
      ? "video/webm;codecs=h264,opus"
      : "video/webm;codecs=vp8,opus";

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: 2500000,
    });
    recorderRef.current = recorder;

    const connectWs = (
      rtmp: string,
      key: string,
      platform: string
    ): Promise<WebSocket> => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `${RELAY_URL}?rtmp=${encodeURIComponent(rtmp)}&key=${encodeURIComponent(key)}&platform=${platform}`
        );
        ws.binaryType = "arraybuffer";
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error(`${platform} connection failed`));
        setTimeout(() => reject(new Error(`${platform} connection timeout`)), 10000);
      });
    };

    const newWsList: WebSocket[] = [];
    try {
      for (const account of enabledAccounts) {
        const ws = await connectWs(
          account.rtmpUrl,
          account.streamKey,
          `${account.platform}-${account.label}`
        );
        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === "error") setError(`${account.label}: ${msg.message}`);
          } catch {}
        };
        newWsList.push(ws);
      }
      wsRefs.current = newWsList;
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
      newWsList.forEach((ws) => { try { ws.close(); } catch {} });
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        wsRefs.current.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
        });
      }
    };

    recorder.start(1000);
    startTimeRef.current = Date.now();
    setStatus("live");
  };

  const stopStream = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    wsRefs.current.forEach((ws) => {
      try { ws.send(JSON.stringify({ type: "end" })); } catch {}
      try { ws.close(); } catch {}
    });
    wsRefs.current = [];
    setStatus("ended");
    setLiveTime(0);
  };

  const formatTime = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const isLive = status === "live";
  const isConnecting = status === "connecting";
  const availablePlatforms = (Object.keys(PLATFORMS) as PlatformId[]).filter(
    (id) => id !== "custom" || accounts.length === 0
  );

  if (companionMode) {
    return <AICompanion userName={userName} onExit={() => setCompanionMode(false)} />;
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4 text-danger" />
        <h4 className="font-semibold text-sm">Broadcast Studio</h4>
        <span className="text-xs text-muted">Go live to any platform</span>
        <button
          onClick={() => setCompanionMode(true)}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-purple-500/15 text-purple-400 font-medium flex items-center gap-1.5 hover:bg-purple-500/25 transition-colors"
        >
          <Heart className="w-3.5 h-3.5" />
          AI Companion
        </button>
        <button
          onClick={() => setShowAccounts(!showAccounts)}
          className="ml-auto text-xs px-2 py-1 rounded-lg bg-bg-alt flex items-center gap-1"
        >
          <Settings className="w-3 h-3" />
          Accounts
          {enabledAccounts.length > 0 && (
            <span className="bg-success text-white text-[10px] px-1.5 rounded-full ml-1">
              {enabledAccounts.length}
            </span>
          )}
        </button>
      </div>

      {showAccounts && (
        <div className="mb-4 space-y-3 p-3 rounded-xl bg-bg-alt">
          <div className="flex items-center justify-between">
            <h5 className="text-xs font-semibold">Connected Accounts</h5>
            <button
              onClick={() => setShowAddPlatform(!showAddPlatform)}
              className="text-xs px-2 py-1 rounded-lg bg-accent text-white flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add Platform
            </button>
          </div>

          {showAddPlatform && (
            <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-bg">
              {(Object.keys(PLATFORMS) as PlatformId[]).map((id) => {
                const p = PLATFORMS[id];
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setEditingAccount({
                        platform: id,
                        label: p.name,
                        rtmpUrl: p.defaultRtmp,
                        streamKey: "",
                        enabled: true,
                      });
                      setShowAddPlatform(false);
                    }}
                    className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-bg-alt transition-colors"
                    style={{ background: id === "snapchat" ? p.color : undefined }}
                  >
                    <div style={{ color: id === "snapchat" ? "#000" : p.color }}>
                      {p.icon}
                    </div>
                    <span className="text-xs" style={{ color: id === "snapchat" ? "#000" : undefined }}>
                      {p.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {editingAccount && (
            <AccountEditor
              account={editingAccount}
              onSave={addAccount}
              onCancel={() => setEditingAccount(null)}
            />
          )}

          {accounts.length === 0 && !editingAccount ? (
            <div className="text-center py-6">
              <p className="text-xs text-muted mb-2">No broadcast accounts set up yet</p>
              <p className="text-xs text-muted">Tap "Add Platform" to connect YouTube, Facebook, TikTok, and more</p>
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => {
                const p = PLATFORMS[account.platform];
                const keyId = `${account.platform}-${account.label}`;
                const keyVisible = showKeys.has(keyId);
                return (
                  <div key={keyId} className="flex items-center gap-2 p-2 rounded-lg bg-bg">
                    <div style={{ color: p.color }}>{p.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium">{account.label}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full",
                          account.enabled ? "bg-success/20 text-success" : "bg-muted/20 text-muted"
                        )}>
                          {account.enabled ? "Ready" : "Disabled"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-muted font-mono truncate max-w-[120px]">
                          {keyVisible ? account.streamKey : "••••••••••••"}
                        </span>
                        <button onClick={() => toggleKeyVisibility(keyId)} className="text-muted hover:text-text">
                          {keyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleAccountEnabled(account.platform, account.label)}
                      className={cn(
                        "text-[10px] px-2 py-1 rounded-lg",
                        account.enabled ? "bg-success/20 text-success" : "bg-accent/20 text-accent"
                      )}
                    >
                      {account.enabled ? "On" : "Off"}
                    </button>
                    <button
                      onClick={() => setEditingAccount({ ...account })}
                      className="text-muted hover:text-text"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeAccount(account.platform, account.label)}
                      className="text-danger hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden bg-black aspect-video mb-3">
        <canvas ref={canvasRef} className="w-full h-full" />

        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Monitor className="w-12 h-12 text-muted mb-3" />
            <p className="text-sm text-muted mb-1">Ready to broadcast</p>
            <p className="text-xs text-muted">
              {enabledAccounts.length > 0
                ? `${enabledAccounts.length} platform${enabledAccounts.length > 1 ? "s" : ""} ready`
                : "Set up your accounts to go live"}
            </p>
          </div>
        )}

        {isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-accent animate-spin mb-2" />
            <p className="text-sm text-white">Connecting to platforms...</p>
          </div>
        )}

        {isLive && (
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <span className="flex items-center gap-1 bg-red-600 text-white text-xs px-2 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
            <span className="bg-black/60 text-white text-xs px-2 py-1 rounded-full font-mono">
              {formatTime(liveTime)}
            </span>
          </div>
        )}

        {isLive && (
          <div className="absolute top-2 right-2 flex gap-1">
            {enabledAccounts.map((a) => {
              const p = PLATFORMS[a.platform];
              return (
                <span
                  key={`${a.platform}-${a.label}`}
                  className="bg-black/60 rounded-full p-1"
                  style={{ color: a.platform === "snapchat" ? "#FFFC00" : p.color }}
                >
                  {p.icon}
                </span>
              );
            })}
          </div>
        )}

        {status === "ended" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Square className="w-10 h-10 text-muted mb-2" />
            <p className="text-sm text-muted">Stream ended</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted">Layout:</span>
        {(["solo", "pip", "split", "grid"] as LayoutMode[]).map((l) => (
          <button
            key={l}
            onClick={() => setLayout(l)}
            className={cn(
              "text-xs px-2 py-1 rounded-lg flex items-center gap-1",
              layout === l ? "bg-accent text-white" : "bg-bg-alt"
            )}
          >
            <Layout className="w-3 h-3" />
            {l === "solo" ? "Solo" : l === "pip" ? "PiP" : l === "split" ? "Split" : "Grid"}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-danger mb-3 p-2 bg-danger/10 rounded-lg">{error}</p>
      )}

      <div className="flex gap-2">
        {!isLive ? (
          <button
            onClick={startStream}
            disabled={isConnecting || !hasVideo || enabledAccounts.length === 0}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Circle className="w-4 h-4 fill-current" />
            )}
            Go Live {enabledAccounts.length > 0 && `to ${enabledAccounts.length} platform${enabledAccounts.length > 1 ? "s" : ""}`}
          </button>
        ) : (
          <button
            onClick={stopStream}
            className="btn-primary flex-1 flex items-center justify-center gap-2 bg-danger"
          >
            <Square className="w-4 h-4 fill-current" />
            End Stream
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-muted flex-wrap">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {videoParticipants.length + 1} in room
        </span>
        <span className="flex items-center gap-1">
          <Camera className="w-3 h-3" />
          {videoParticipants.filter((p) => p.videoEnabled).length + (localVideoStream() ? 1 : 0)} cameras
        </span>
        {enabledAccounts.map((a) => {
          const p = PLATFORMS[a.platform];
          return (
            <span key={`${a.platform}-${a.label}`} className="flex items-center gap-1">
              <span style={{ color: a.platform === "snapchat" ? "#FFFC00" : p.color }}>{p.icon}</span>
              {a.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function AccountEditor({
  account,
  onSave,
  onCancel,
}: {
  account: BroadcastAccount;
  onSave: (platform: PlatformId, label: string, rtmpUrl: string, streamKey: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(account.label);
  const [rtmpUrl, setRtmpUrl] = useState(account.rtmpUrl);
  const [streamKey, setStreamKey] = useState(account.streamKey);
  const [showKey, setShowKey] = useState(false);
  const p = PLATFORMS[account.platform];

  return (
    <div className="p-3 rounded-lg bg-bg space-y-3">
      <div className="flex items-center gap-2">
        <div style={{ color: account.platform === "snapchat" ? "#FFFC00" : p.color }}>{p.icon}</div>
        <span className="text-xs font-semibold">Connect {p.name}</span>
      </div>

      <div className="text-[10px] text-muted bg-bg-alt p-2 rounded-lg">
        {p.instructions}
        {p.helpUrl && (
          <a
            href={p.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent ml-1 inline-flex items-center gap-0.5"
          >
            Open <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted block mb-1">Account Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. My YouTube Channel"
          className="w-full text-xs bg-bg-alt rounded-lg px-3 py-2"
        />
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted block mb-1">RTMP Server URL</label>
        <input
          value={rtmpUrl}
          onChange={(e) => setRtmpUrl(e.target.value)}
          placeholder="rtmp://..."
          className="w-full text-xs bg-bg-alt rounded-lg px-3 py-2 font-mono"
        />
      </div>

      <div>
        <label className="text-[10px] font-medium text-muted block mb-1">Stream Key</label>
        <div className="flex gap-1">
          <input
            type={showKey ? "text" : "password"}
            value={streamKey}
            onChange={(e) => setStreamKey(e.target.value)}
            placeholder="Your stream key"
            className="flex-1 text-xs bg-bg-alt rounded-lg px-3 py-2 font-mono"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="px-2 rounded-lg bg-bg-alt"
          >
            {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onSave(account.platform, label, rtmpUrl, streamKey)}
          disabled={!streamKey || !rtmpUrl}
          className="btn-primary text-xs flex-1 flex items-center justify-center gap-1"
        >
          <Check className="w-3 h-3" />
          Save Account
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-2 rounded-lg bg-bg-alt"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M19.6 6.3c-1.4-.3-2.6-1.2-3.3-2.4-.2-.4-.4-.8-.4-1.3h-3.3v13.3c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .5 0 .8.1V10c-.3 0-.5-.1-.8-.1-3.2 0-5.8 2.6-5.8 5.8s2.6 5.8 5.8 5.8 5.8-2.6 5.8-5.8V9.5c1.2.9 2.7 1.4 4.3 1.4V7.6c-.2 0-.4 0-.6-.1z"/>
    </svg>
  );
}

function SnapchatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M12 2c2.5 0 4.5 2 4.6 4.5 0 .8-.1 1.6-.2 2.3.3.2.7.3 1.1.2.6-.1 1.2.4 1.2 1 0 .8-1.2 1.2-1.6 1.4-.2.1-.3.2-.3.4 0 .5 1.5 2.2 3.4 2.7.3.1.5.4.4.7-.3 1-2.1 1.2-3 1.3-.1.2-.2.6-.3.9-.1.3-.4.4-.7.3-.6-.1-1.2-.3-2-.1-.5.1-1 .4-1.5.8-1 .8-2 1.6-3.6 1.6s-2.6-.8-3.6-1.6c-.5-.4-1-.7-1.5-.8-.8-.2-1.4 0-2 .1-.3.1-.6-.1-.7-.3-.1-.3-.2-.7-.3-.9-.9-.1-2.7-.3-3-1.3-.1-.3.1-.6.4-.7 1.9-.5 3.4-2.2 3.4-2.7 0-.2-.1-.3-.3-.4-.4-.2-1.6-.6-1.6-1.4 0-.6.6-1.1 1.2-1 .4.1.8 0 1.1-.2-.1-.7-.2-1.5-.2-2.3C7.5 4 9.5 2 12 2z"/>
    </svg>
  );
}
