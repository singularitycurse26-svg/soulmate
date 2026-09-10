import { useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { useWakkiiRoom, WakkiiMode, WakkiiRole, WakkiiRoomState } from "@/hooks/useWakkiiRoom";
import { useStore } from "@/lib/store";
import { aiApi, incllmv2Api } from "@/lib/api";
import { playMessageAlert, playSendAlert } from "@/lib/notification-sound";
import { WakkiiLiveStream } from "@/components/phone/WakkiiLiveStream";
import { RadioPlayer } from "@/components/phone/RadioPlayer";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Radio,
  Copy,
  Check,
  QrCode,
  X,
  Users,
  Hand,
  Crown,
  Volume2,
  Loader2,
  Link2,
  PhoneOff,
  AlertCircle,
  Send,
  MessageSquare,
  Sparkles,
  Bot,
  Video,
  VideoOff,
  Camera,
  Brain,
  Zap,
  Shield,
  Database,
  Heart,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function QRImage({ value, size }: { value: string; size: number }) {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    try {
      const qr = (window as any).qrcode;
      if (qr) {
        const gen = qr(0, "M");
        gen.addData(value);
        gen.make();
        setDataUrl(gen.createDataURL(8, 0));
      } else {
        setDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`);
      }
    } catch {
      setDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`);
    }
  }, [value, size]);
  if (!dataUrl) return <Loader2 className="w-8 h-8 animate-spin text-accent" />;
  return <img src={dataUrl} width={size} height={size} alt="QR Code" className="rounded-lg" />;
}

interface WakkiiLinksProps {
  userName: string;
  mode?: WakkiiMode;
  defaultRole?: WakkiiRole;
  onClose?: () => void;
  embedded?: boolean;
}

export function WakkiiLinks({
  userName,
  mode = "ptt",
  defaultRole = "speaker",
  onClose,
  embedded = false,
}: WakkiiLinksProps) {
  const { showAlert } = useStore();
  const {
    state,
    createRoom,
    joinRoom,
    leaveRoom,
    pushToTalkStart,
    pushToTalkStop,
    raiseHand,
    approveSpeaker,
    toggleVideo,
    getLocalVideoStream,
    getRemoteVideoStream,
    shareUrl,
  } = useWakkiiRoom(userName);

  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [started, setStarted] = useState(false);
  const [jarvisMode, setJarvisMode] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#wakkii-")) {
      const roomId = hash.slice(8);
      if (roomId && !started) {
        setStarted(true);
        joinRoom(roomId, defaultRole);
      }
    }
  }, [joinRoom, defaultRole, started]);

  const handleCreate = async () => {
    setStarted(true);
    await createRoom(mode, defaultRole);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      showAlert("success", "Wakkii link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = () => {
    leaveRoom();
    setStarted(false);
    if (onClose) onClose();
  };

  if (jarvisMode) {
    return <JarvisAssistant userName={userName} onExit={() => setJarvisMode(false)} roomId={state.roomId} />;
  }

  if (!started) {
    return (
      <div className="space-y-4">
        <div className="card text-center py-8">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
            <Radio className="w-8 h-8 text-accent" />
          </div>
          <h3 className="font-bold text-lg">Wakkii Links</h3>
          <p className="text-muted text-sm mt-1 mb-6 max-w-xs mx-auto">
            Start a live voice room. Share the link with anyone — they tap it and join instantly. No app download needed.
          </p>
          <button onClick={handleCreate} className="btn-primary w-full max-w-xs mx-auto">
            <Radio className="w-4 h-4 inline mr-2" />
            Start Voice Room
          </button>
          <button
            onClick={() => { joinRoom("AGENT", defaultRole); setStarted(true); }}
            className="w-full max-w-xs mx-auto mt-3 px-4 py-3 rounded-xl bg-emerald-500/15 text-emerald-400 font-medium text-sm flex items-center justify-center gap-2 hover:bg-emerald-500/25 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Wakkii Agent Room
          </button>
          <button
            onClick={() => setJarvisMode(true)}
            className="w-full max-w-xs mx-auto mt-3 px-4 py-3 rounded-xl bg-purple-500/15 text-purple-400 font-medium text-sm flex items-center justify-center gap-2 hover:bg-purple-500/25 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Talk to Jarvis AI
          </button>
          {state.error && (
            <p className="text-danger text-sm mt-3">{state.error}</p>
          )}
        </div>

        {/* Social panel — accessible before joining a room */}
        <WakkiiSocial userName={userName} />

        {/* Aceline Blind Date — accessible before joining a room */}
        <AcelineBlindDate
          userName={userName}
          onJoinRoom={(roomId) => { joinRoom(roomId, "speaker"); setStarted(true); }}
        />

        {/* Radio widget — pops up with social services, auto-plays */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-accent" />
            <h4 className="font-semibold text-sm">Radio & Podcasts</h4>
            <span className="text-xs text-muted ml-auto">auto-plays on enter</span>
          </div>
          <p className="text-xs text-muted mb-3">
            Music, podcasts, and radio stations. Save your favorite songs — click to replay anytime.
            Scrollable saved songs list for your collection.
          </p>
          <RadioPlayer embedded />
        </div>
      </div>
    );
  }

  if (state.error && !state.connected && !state.roomId) {
    return (
      <div className="card text-center py-8">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
        <p className="text-danger font-medium">{state.error}</p>
        <button
          onClick={() => { setStarted(false); }}
          className="btn-secondary mt-4"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Room header */}
      <div className={cn(
        "card flex items-center gap-3",
        state.isHost ? "border-accent" : ""
      )}>
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
          <Radio className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm flex items-center gap-2">
            Wakkii Room
            {state.isHost && <Crown className="w-3.5 h-3.5 text-warning" />}
          </p>
          <p className="text-xs text-muted font-mono">#{state.roomId}</p>
        </div>
        <div className="flex items-center gap-2">
          {state.connected ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
              LIVE
            </span>
          ) : (
            <Loader2 className="w-4 h-4 text-muted animate-spin" />
          )}
        </div>
      </div>

      {/* Share link */}
      {state.roomId && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-accent" />
            <h4 className="font-semibold text-sm">Share Link</h4>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 text-xs font-mono bg-bg-alt rounded-lg px-3 py-2"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button onClick={handleCopyLink} className="btn-secondary px-3">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
            <button onClick={() => setShowQR(!showQR)} className="btn-secondary px-3">
              <QrCode className="w-4 h-4" />
            </button>
          </div>
          <AnimatePresence>
            {showQR && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 flex justify-center"
              >
                <div className="bg-white p-4 rounded-xl">
                  <QRImage value={shareUrl} size={180} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Share to platforms */}
          <div className="mt-4">
            <p className="text-xs text-muted mb-2">Share to</p>
            <div className="grid grid-cols-4 gap-2">
              <ShareButton
                label="Messenger"
                color="#0084FF"
                onClick={() => window.open(`https://www.facebook.com/dialog/send?link=${encodeURIComponent(shareUrl)}&app_id=291494419107518&redirect_uri=${encodeURIComponent(shareUrl)}`, "_blank")}
                icon={<MessengerIcon />}
              />
              <ShareButton
                label="Snapchat"
                color="#FFFC00"
                textDark
                onClick={() => window.open(`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(shareUrl)}`, "_blank")}
                icon={<SnapchatIcon />}
              />
              <ShareButton
                label="TikTok"
                color="#000000"
                border
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ url: shareUrl, title: "Join my Wakkii room" }).catch(() => {});
                  } else {
                    handleCopyLink();
                    window.open("https://www.tiktok.com/", "_blank");
                  }
                }}
                icon={<TikTokIcon />}
              />
              <ShareButton
                label="Facebook"
                color="#1877F2"
                onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank")}
                icon={<FacebookIcon />}
              />
              <ShareButton
                label="MySpace"
                color="#003399"
                onClick={() => {
                  handleCopyLink();
                  window.open("https://myspace.com/", "_blank");
                }}
                icon={<MySpaceIcon />}
              />
              <ShareButton
                label="TextNow"
                color="#00B0FF"
                onClick={() => {
                  handleCopyLink();
                  window.open("https://www.textnow.com/", "_blank");
                }}
                icon={<TextNowIcon />}
              />
              <ShareButton
                label="Free Text"
                color="#10B981"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ url: shareUrl, title: "Join my Wakkii room", text: `Join my Wakkii voice room: ${shareUrl}` }).catch(() => {});
                  } else {
                    handleCopyLink();
                  }
                }}
                icon={<FreeTextIcon />}
              />
              <ShareButton
                label="YouTube"
                color="#FF0000"
                onClick={() => {
                  handleCopyLink();
                  window.open("https://www.youtube.com/", "_blank");
                }}
                icon={<YouTubeIcon />}
              />
            </div>
          </div>
        </div>
      )}

      {/* FaceTime video screen */}
      <WakkiiVideoScreen
        state={state}
        toggleVideo={toggleVideo}
        getLocalVideoStream={getLocalVideoStream}
        getRemoteVideoStream={getRemoteVideoStream}
      />

      {/* Live stream to YouTube / Facebook */}
      {state.roomId && (
        <WakkiiLiveStream
          localVideoStream={getLocalVideoStream}
          getRemoteVideoStream={getRemoteVideoStream}
          participants={state.participants}
          userName={userName}
        />
      )}

      {/* Participants */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-accent" />
          <h4 className="font-semibold text-sm">Participants</h4>
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
            {state.participants.length}
          </span>
          <span className="text-xs text-muted ml-auto">auto-added to contacts</span>
        </div>
        <div className="space-y-2">
          {state.participants.map((p) => (
            <div
              key={p.peerId}
              className={cn(
                "flex items-center gap-3 rounded-lg p-2",
                p.speaking ? "bg-success/10" : "bg-bg-alt"
              )}
            >
              <div className="relative">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  p.isHost ? "bg-warning/20 text-warning" : "bg-accent/10 text-accent"
                )}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg",
                  p.online ? "bg-success" : "bg-muted"
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {p.name}
                  {p.isHost && <Crown className="w-3 h-3 text-warning inline ml-1" />}
                </p>
                <p className="text-xs text-muted">
                  {p.online
                    ? p.role === "speaker" ? "Speaker" : "Listener"
                    : "Offline"}
                  {p.online && p.handRaised && " · ✋ Hand raised"}
                </p>
              </div>
              {p.speaking && (
                <Volume2 className="w-4 h-4 text-success animate-pulse" />
              )}
              {p.muted && !p.speaking && (
                <MicOff className="w-4 h-4 text-muted" />
              )}
              {state.isHost && p.handRaised && p.role !== "speaker" && (
                <button
                  onClick={() => approveSpeaker(p.peerId)}
                  className="text-xs btn-primary px-2 py-1"
                >
                  Approve
                </button>
              )}
            </div>
          ))}
          {state.participants.length === 1 && (
            <p className="text-muted text-xs text-center py-3">
              Waiting for others to join... Share the link above.
            </p>
          )}
        </div>
      </div>

      {/* Talk control */}
      <div className="card text-center">
        {state.role === "speaker" ? (
          <>
            <h4 className="font-semibold text-sm mb-1">
              {state.mode === "ptt" ? "Tap to Talk" : "Open Mic"}
            </h4>
            <p className="text-xs text-muted mb-4">
              Up to 8 people can join this room
            </p>
            {state.mode === "ptt" ? (
              <button
                onClick={() => {
                  if (state.micEnabled) pushToTalkStop();
                  else pushToTalkStart();
                }}
                className={cn(
                  "w-32 h-32 rounded-full mx-auto flex items-center justify-center transition-all select-none touch-none",
                  state.micEnabled
                    ? "bg-danger text-white scale-110 shadow-lg shadow-danger/30"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                )}
              >
                <div className="flex flex-col items-center gap-2">
                  {state.micEnabled ? <Mic className="w-10 h-10" /> : <MicOff className="w-10 h-10" />}
                  <span className="text-xs font-medium">
                    {state.micEnabled ? "TAP TO STOP" : "TAP TO TALK"}
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (state.micEnabled) pushToTalkStop();
                  else pushToTalkStart();
                }}
                className={cn(
                  "w-32 h-32 rounded-full mx-auto flex items-center justify-center transition-all select-none",
                  state.micEnabled
                    ? "bg-success text-white scale-110 shadow-lg shadow-success/30"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                )}
              >
                <div className="flex flex-col items-center gap-2">
                  {state.micEnabled ? <Mic className="w-10 h-10" /> : <MicOff className="w-10 h-10" />}
                  <span className="text-xs font-medium">
                    {state.micEnabled ? "MUTE" : "UNMUTE"}
                  </span>
                </div>
              </button>
            )}
          </>
        ) : (
          <div className="py-6">
            <MicOff className="w-12 h-12 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted mb-4">You're a listener. Raise your hand to speak.</p>
            <button
              onClick={() => raiseHand(!state.participants.find((p) => p.peerId === "")?.handRaised)}
              className="btn-secondary"
            >
              <Hand className="w-4 h-4 inline mr-2" />
              Raise Hand
            </button>
          </div>
        )}
      </div>

      {/* Text chat — move convo to texting */}
      {state.roomId && <WakkiiTextChat roomId={state.roomId} userName={userName} />}

      {/* Social panel — messaging, contacts, following */}
      <WakkiiSocial userName={userName} />

      {/* Aceline Blind Date — voice-only worldwide matching */}
      <AcelineBlindDate
        userName={userName}
        onJoinRoom={(roomId) => { joinRoom(roomId, "speaker"); }}
      />

      {/* Radio widget — in-room music */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-accent" />
          <h4 className="font-semibold text-sm">Radio & Podcasts</h4>
          <span className="text-xs text-muted ml-auto">save & replay songs</span>
        </div>
        <RadioPlayer embedded />
      </div>

      {/* Leave */}
      <button
        onClick={handleLeave}
        className="btn-secondary w-full text-danger hover:bg-danger/10"
      >
        <PhoneOff className="w-4 h-4 inline mr-2" />
        Leave Room
      </button>

      {state.error && state.connected && (
        <p className="text-danger text-xs text-center">{state.error}</p>
      )}
    </div>
  );
}

const WAKKII_API = import.meta.env.DEV
  ? "http://127.0.0.1:8085"
  : "https://reconstruction-monitor-wilderness-sega.trycloudflare.com";
const AI_SENDER = "Soulmate AI";
const AGENT_SENDER = "Wakkii Agent";

// --- Social API ---
const socialApi = {
  async createUser(userId: string, username: string, displayName: string) {
    return fetch(`${WAKKII_API}/social/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, username, display_name: displayName }),
    });
  },
  async searchUsers(q: string) {
    const res = await fetch(`${WAKKII_API}/social/search?q=${encodeURIComponent(q)}`);
    return res.json();
  },
  async follow(followerId: string, followingId: string) {
    return fetch(`${WAKKII_API}/social/follow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ follower_id: followerId, following_id: followingId }),
    });
  },
  async unfollow(followerId: string, followingId: string) {
    return fetch(`${WAKKII_API}/social/unfollow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ follower_id: followerId, following_id: followingId }),
    });
  },
  async getFollowing(userId: string) {
    const res = await fetch(`${WAKKII_API}/social/following/${userId}`);
    return res.json();
  },
  async getContacts(userId: string) {
    const res = await fetch(`${WAKKII_API}/social/contacts/${userId}`);
    return res.json();
  },
  async addContact(userId: string, name: string, source: string = "manual") {
    return fetch(`${WAKKII_API}/social/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, name, source }),
    });
  },
  async sendDM(senderId: string, receiverId: string, text: string) {
    return fetch(`${WAKKII_API}/social/dm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sender_id: senderId, receiver_id: receiverId, text }),
    });
  },
  async getConversations(userId: string) {
    const res = await fetch(`${WAKKII_API}/social/dm/${userId}`);
    return res.json();
  },
  async getDMMessages(userId: string, otherId: string) {
    const res = await fetch(`${WAKKII_API}/social/dm/${userId}/${otherId}`);
    return res.json();
  },
};

// --- Aceline Blind Date API ---
const blindDateApi = {
  async optIn(userId: string, gender: string, ageRange: string, city: string, country: string) {
    return fetch(`${WAKKII_API}/blinddate/optin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId, gender, age_range: ageRange, city, country }),
    });
  },
  async optOut(userId: string) {
    return fetch(`${WAKKII_API}/blinddate/optout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
  },
  async findMatch(userId: string) {
    const res = await fetch(`${WAKKII_API}/blinddate/find`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    return res.json();
  },
  async getActive(userId: string) {
    const res = await fetch(`${WAKKII_API}/blinddate/active/${userId}`);
    return res.json();
  },
  async endMatch(matchId: string, userId: string, choice: string) {
    const res = await fetch(`${WAKKII_API}/blinddate/end`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ match_id: matchId, user_id: userId, choice }),
    });
    return res.json();
  },
  async getContacts(userId: string) {
    const res = await fetch(`${WAKKII_API}/blinddate/contacts/${userId}`);
    return res.json();
  },
  async deleteContact(contactId: string) {
    return fetch(`${WAKKII_API}/blinddate/contacts/${contactId}`, { method: "DELETE" });
  },
};

interface ChatMsg {
  sender: string;
  text: string;
  timestamp: string;
}

function WakkiiTextChat({ roomId, userName }: { roomId: string; userName: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiModel, setAiModel] = useState<string>(() => {
    try { return localStorage.getItem("wakkii_ai_model") || "trill"; } catch { return "trill"; }
  });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  const AI_MODELS = [
    { id: "trill", name: "Trill", desc: "Uncensored · Fast · Self-improving", icon: <Zap className="w-3 h-3" />, color: "text-orange-400" },
    { id: "incllmv2", name: "Soulmate", desc: "Standard · Balanced", icon: <Shield className="w-3 h-3" />, color: "text-blue-400" },
    { id: "singularity", name: "Singularity", desc: "Analytical · Precision", icon: <Brain className="w-3 h-3" />, color: "text-purple-400" },
    { id: "splitbit", name: "SplitBit", desc: "Compressed · Efficient", icon: <Database className="w-3 h-3" />, color: "text-green-400" },
  ];

  const saveModel = (modelId: string) => {
    setAiModel(modelId);
    try { localStorage.setItem("wakkii_ai_model", modelId); } catch {}
    setShowModelPicker(false);
  };

  const fetchMemoryCount = useCallback(async () => {
    try {
      const res = await incllmv2Api.memories();
      const data = await res.json();
      setMemoryCount(data.memories?.length || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchMemoryCount();
    const interval = setInterval(fetchMemoryCount, 30000);
    return () => clearInterval(interval);
  }, [fetchMemoryCount]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`${WAKKII_API}/wakkii/rooms/${roomId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const newMsgs = data.messages || [];
        if (!loading && newMsgs.length > prevMsgCountRef.current) {
          const hasIncoming = newMsgs.slice(prevMsgCountRef.current).some(
            (m: ChatMsg) => m.sender !== userName
          );
          if (hasIncoming) playMessageAlert();
        }
        prevMsgCountRef.current = newMsgs.length;
        setMessages(newMsgs);
      }
    } catch {}
    setLoading(false);
  }, [roomId, loading, userName]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const userScrolledRef = useRef(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distFromBottom < 80;
    if (distFromBottom > 80) {
      userScrolledRef.current = true;
    } else {
      userScrolledRef.current = false;
    }
  };

  useEffect(() => {
    if (!userScrolledRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, aiThinking]);

  const postMessage = async (sender: string, text: string) => {
    try {
      await fetch(`${WAKKII_API}/wakkii/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sender, text }),
      });
    } catch {}
  };

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    playSendAlert();
    isNearBottomRef.current = true;
    userScrolledRef.current = false;

    if (aiMode || text.toLowerCase().startsWith("@ai ")) {
      const aiQuery = aiMode ? text : text.slice(4);
      await postMessage(userName, `${aiMode ? "" : "@ai "}${aiQuery}`);
      fetchMessages();
      setAiThinking(true);
      try {
        const result = await incllmv2Api.chat(aiQuery, aiModel);
        const aiResponse = result.response || result.message || "No response";
        await postMessage(AI_SENDER, aiResponse);
        fetchMessages();
        fetchMemoryCount();
      } catch (e: any) {
        await postMessage(AI_SENDER, `Error: ${e.message || "Could not reach AI. Make sure the backend is running."}`);
        fetchMessages();
      } finally {
        setAiThinking(false);
      }
    } else {
      await postMessage(userName, text);
      fetchMessages();
    }
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-accent" />
        <h4 className="font-semibold text-sm">Room Chat</h4>
        <span className="text-xs text-muted">switch to text anytime</span>
        <button
          onClick={() => setAiMode(!aiMode)}
          className={cn(
            "ml-auto text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors",
            aiMode ? "bg-accent text-white" : "bg-accent/10 text-accent"
          )}
        >
          {aiMode ? <Sparkles className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
          {aiMode ? "AI ON" : "Ask AI"}
        </button>
        <button
          onClick={() => setShowModelPicker(!showModelPicker)}
          className={cn(
            "text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors",
            showModelPicker ? "bg-purple-500/20 text-purple-400" : "bg-bg-alt text-muted"
          )}
          title="Switch AI model"
        >
          <Brain className="w-3 h-3" />
          {AI_MODELS.find((m) => m.id === aiModel)?.name || "Trill"}
        </button>
      </div>

      {showModelPicker && (
        <div className="mb-3 p-3 rounded-xl bg-bg-alt space-y-1">
          <p className="text-xs font-semibold text-muted mb-2 flex items-center gap-1">
            <Brain className="w-3 h-3" />
            Select AI Model
          </p>
          {AI_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => saveModel(m.id)}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                aiModel === m.id ? "bg-accent/15" : "hover:bg-bg"
              )}
            >
              <span className={m.color}>{m.icon}</span>
              <div className="flex-1">
                <p className="text-xs font-medium">{m.name}</p>
                <p className="text-[10px] text-muted">{m.desc}</p>
              </div>
              {aiModel === m.id && <Check className="w-3 h-3 text-accent" />}
            </button>
          ))}
          {memoryCount !== null && (
            <div className="pt-2 mt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-muted flex items-center gap-1">
                <Database className="w-3 h-3" />
                {memoryCount} memories stored
              </span>
              <button
                onClick={async () => {
                  try {
                    await incllmv2Api.consolidateMemories();
                    fetchMemoryCount();
                  } catch {}
                }}
                className="text-[10px] text-accent hover:text-accent/80"
              >
                Consolidate
              </button>
            </div>
          )}
        </div>
      )}
      <div ref={scrollRef} onScroll={handleScroll} className="space-y-2 max-h-48 overflow-y-auto mb-3">
        {loading ? (
          <p className="text-muted text-xs text-center py-4">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted text-xs text-center py-4">
            No messages yet. Type below to start texting.
            <br />
            <span className="text-accent">Tap "Ask AI" or type @ai to have the AI do things for you.</span>
          </p>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg p-2 text-sm",
                msg.sender === userName
                  ? "bg-accent/10 ml-8"
                  : msg.sender === AI_SENDER
                    ? "bg-purple-500/10 border border-purple-500/20 mr-8"
                    : msg.sender === AGENT_SENDER
                      ? "bg-emerald-500/10 border border-emerald-500/20 mr-8"
                      : "bg-bg-alt mr-8"
              )}
            >
              {msg.sender !== userName && (
                <p className={cn(
                  "text-xs font-medium mb-0.5 flex items-center gap-1",
                  msg.sender === AI_SENDER ? "text-purple-400" : msg.sender === AGENT_SENDER ? "text-emerald-400" : "text-muted"
                )}>
                  {msg.sender === AI_SENDER && <Sparkles className="w-3 h-3" />}
                  {msg.sender === AGENT_SENDER && <Bot className="w-3 h-3" />}
                  {msg.sender}
                </p>
              )}
              <p className="break-words whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))
        )}
        {aiThinking && (
          <div className="rounded-lg p-2 text-sm bg-purple-500/10 border border-purple-500/20 mr-8">
            <p className="text-xs font-medium mb-0.5 text-purple-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 animate-pulse" />
              {AI_SENDER}
            </p>
            <p className="text-muted text-xs flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking...
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={aiMode ? "Ask the AI to do something..." : "Type a message or @ai to ask AI..."}
          className="flex-1 text-sm"
        />
        <button onClick={send} className="btn-primary px-3" disabled={aiThinking}>
          {aiThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
      {aiMode && (
        <p className="text-xs text-purple-400 mt-2 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          AI mode active — using {AI_MODELS.find((m) => m.id === aiModel)?.name || "Trill"} model. Runs locally on your device via Ollama. Tap again to switch back.
        </p>
      )}
    </div>
  );
}

function WakkiiSocial({ userName }: { userName: string }) {
  const [tab, setTab] = useState<"messages" | "contacts" | "following">("messages");
  const [conversations, setConversations] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeDM, setActiveDM] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [dmInput, setDmInput] = useState("");
  const userId = userName;

  const refresh = useCallback(async () => {
    if (tab === "messages") {
      const data = await socialApi.getConversations(userId);
      setConversations(data.conversations || []);
    } else if (tab === "contacts") {
      const data = await socialApi.getContacts(userId);
      setContacts(data.contacts || []);
    } else if (tab === "following") {
      const data = await socialApi.getFollowing(userId);
      setFollowing(data.following || []);
    }
  }, [tab, userId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (activeDM) {
      socialApi.getDMMessages(userId, activeDM).then((data) => {
        setDmMessages(data.messages || []);
      });
    }
  }, [activeDM, userId]);

  useEffect(() => {
    if (searchQuery.trim()) {
      socialApi.searchUsers(searchQuery).then((data) => {
        setSearchResults(data.users || []);
      });
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const sendDM = async () => {
    if (!dmInput.trim() || !activeDM) return;
    await socialApi.sendDM(userId, activeDM, dmInput.trim());
    setDmInput("");
    const data = await socialApi.getDMMessages(userId, activeDM);
    setDmMessages(data.messages || []);
    refresh();
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-accent" />
        <h4 className="font-semibold text-sm">Wakkii Social</h4>
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setTab("messages")}
            className={cn("text-xs px-2 py-1 rounded-lg", tab === "messages" ? "bg-accent text-white" : "bg-bg-alt text-muted")}
          >
            Messages
          </button>
          <button
            onClick={() => setTab("contacts")}
            className={cn("text-xs px-2 py-1 rounded-lg", tab === "contacts" ? "bg-accent text-white" : "bg-bg-alt text-muted")}
          >
            Contacts
          </button>
          <button
            onClick={() => setTab("following")}
            className={cn("text-xs px-2 py-1 rounded-lg", tab === "following" ? "bg-accent text-white" : "bg-bg-alt text-muted")}
          >
            Following
          </button>
        </div>
      </div>

      {tab === "messages" && (
        <div className="space-y-2">
          {activeDM ? (
            <div>
              <button onClick={() => setActiveDM(null)} className="text-xs text-accent mb-2">
                Back to conversations
              </button>
              <div className="space-y-1 max-h-48 overflow-y-auto mb-2">
                {dmMessages.map((m, i) => (
                  <div key={i} className={cn("rounded-lg p-2 text-sm", m.sender_id === userId ? "bg-accent/10 ml-8" : "bg-bg-alt mr-8")}>
                    <p className="break-words whitespace-pre-wrap">{m.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={dmInput}
                  onChange={(e) => setDmInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendDM()}
                  placeholder="Type a message..."
                  className="flex-1 text-sm"
                />
                <button onClick={sendDM} className="btn-primary px-3">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : conversations.length > 0 ? (
            conversations.map((c, i) => (
              <button
                key={i}
                onClick={() => setActiveDM(c.user_id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg bg-bg-alt hover:bg-bg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                  {(c.user_id || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{c.user_id}</p>
                  <p className="text-xs text-muted truncate">{c.last_message}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="text-muted text-xs text-center py-4">No conversations yet. Search for users in Following tab.</p>
          )}
        </div>
      )}

      {tab === "contacts" && (
        <div className="space-y-2">
          {contacts.length > 0 ? (
            contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-bg-alt">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                  {(c.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted">{c.source}</p>
                </div>
                <button
                  onClick={() => { setActiveDM(c.contact_user_id || c.name); setTab("messages"); }}
                  className="text-xs btn-secondary px-2 py-1"
                >
                  Message
                </button>
              </div>
            ))
          ) : (
            <p className="text-muted text-xs text-center py-4">No contacts yet. Auto-added when you talk in rooms.</p>
          )}
        </div>
      )}

      {tab === "following" && (
        <div className="space-y-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full text-sm mb-2"
          />
          {searchResults.length > 0 && (
            <div className="space-y-1 mb-2">
              {searchResults.map((u, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-bg-alt">
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                    {(u.display_name || u.username || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-muted">@{u.username}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await socialApi.follow(userId, u.user_id);
                      refresh();
                    }}
                    className="text-xs btn-primary px-2 py-1"
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
          )}
          {following.length > 0 ? (
            following.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-bg-alt">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
                  {(f.display_name || f.username || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.display_name || f.username}</p>
                  <p className="text-xs text-muted">@{f.username}</p>
                </div>
                <button
                  onClick={async () => {
                    await socialApi.unfollow(userId, f.user_id);
                    refresh();
                  }}
                  className="text-xs text-danger px-2 py-1"
                >
                  Unfollow
                </button>
              </div>
            ))
          ) : (
            !searchQuery && <p className="text-muted text-xs text-center py-4">Not following anyone yet. Search above.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AcelineBlindDate({ userName, onJoinRoom }: { userName: string; onJoinRoom: (roomId: string) => void }) {
  const [optedIn, setOptedIn] = useState(false);
  const [activeMatch, setActiveMatch] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [waitMsg, setWaitMsg] = useState("");
  const userId = userName;

  const refresh = useCallback(async () => {
    const status = await blindDateApi.getActive(userId);
    if (status.status === "active") {
      setActiveMatch(status);
      setWaiting(false);
    } else {
      setActiveMatch(null);
    }
    const contactsData = await blindDateApi.getContacts(userId);
    setContacts(contactsData.contacts || []);
  }, [userId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleOptIn = async () => {
    const gender = prompt("Your gender (male/female/other):", "");
    if (!gender) return;
    const ageRange = prompt("Your age range (18-25, 26-35, 36-45, 46-55, 55+):", "");
    if (!ageRange) return;
    const city = prompt("Your city:", "") || "";
    const country = prompt("Your country:", "US") || "US";

    setLoading(true);
    await blindDateApi.optIn(userId, gender, ageRange, city, country);
    setOptedIn(true);
    setLoading(false);
    refresh();
  };

  const handleOptOut = async () => {
    if (!confirm("Leave blind date?")) return;
    await blindDateApi.optOut(userId);
    setOptedIn(false);
    setActiveMatch(null);
    refresh();
  };

  const handleFindMatch = async () => {
    setLoading(true);
    const result = await blindDateApi.findMatch(userId);
    setLoading(false);
    if (result.status === "matched") {
      setActiveMatch({ match_id: result.match_id, room_id: result.room_id, status: "active" });
      onJoinRoom(result.room_id);
    } else {
      alert(result.message || "No blind date users available right now.");
    }
  };

  const handleChoice = async (choice: "keep_talking" | "move_on" | "reveal") => {
    if (!activeMatch) return;
    const choiceText = { keep_talking: "Keep Talking", move_on: "Move On", reveal: "Reveal Identity" }[choice];
    if (!confirm(`Are you sure you want to "${choiceText}"?`)) return;

    const result = await blindDateApi.endMatch(activeMatch.match_id, userId, choice);
    if (result.status === "ended") {
      alert(result.message);
      setActiveMatch(null);
      setWaiting(false);
      refresh();
    } else if (result.status === "waiting") {
      setWaiting(true);
      setWaitMsg(result.message);
    } else {
      alert(result.detail || "Could not end match");
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm("Remove this blind date contact?")) return;
    await blindDateApi.deleteContact(contactId);
    refresh();
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-pink-500" />
        <h4 className="font-semibold text-sm">Aceline Blind Date</h4>
        <span className="text-xs text-muted ml-auto">voice only · worldwide</span>
      </div>

      {!optedIn && !activeMatch && (
        <div className="text-center py-4">
          <p className="text-sm text-muted mb-4">
            Get matched with someone worldwide. Talk via voice only — no profiles, no photos.
            After each conversation: keep talking or move on. Save up to 5 blind date contacts.
          </p>
          <button onClick={handleOptIn} disabled={loading} className="btn-primary mx-auto">
            <Heart className="w-4 h-4 inline mr-2" />
            Opt In to Blind Date
          </button>
        </div>
      )}

      {optedIn && !activeMatch && (
        <div className="text-center py-4">
          <p className="text-sm text-muted mb-4">You're opted in! Find your blind date match.</p>
          <button onClick={handleFindMatch} disabled={loading} className="btn-primary mx-auto mb-2">
            <Heart className="w-4 h-4 inline mr-2" />
            {loading ? "Finding..." : "Find a Blind Date"}
          </button>
          <button onClick={handleOptOut} className="text-xs text-danger block mx-auto mt-2">
            Leave Blind Date
          </button>
        </div>
      )}

      {activeMatch && !waiting && (
        <div className="py-2">
          <div className="bg-bg-alt rounded-xl p-3 mb-3 text-center">
            <p className="text-sm font-semibold">Blind Date Active</p>
            <p className="text-xs text-muted">Room: #{activeMatch.room_id}</p>
          </div>
          <button
            onClick={() => onJoinRoom(activeMatch.room_id)}
            className="btn-primary w-full mb-2"
          >
            <Radio className="w-4 h-4 inline mr-2" />
            Join Voice Room
          </button>
          <button
            onClick={() => handleChoice("keep_talking")}
            className="w-full px-4 py-2 rounded-xl bg-success/15 text-success text-sm font-medium mb-2"
          >
            Keep Talking
          </button>
          <button
            onClick={() => handleChoice("reveal")}
            className="w-full px-4 py-2 rounded-xl bg-accent/15 text-accent text-sm font-medium mb-2"
          >
            Reveal Identity
          </button>
          <button
            onClick={() => handleChoice("move_on")}
            className="w-full px-4 py-2 rounded-xl bg-danger/15 text-danger text-sm font-medium"
          >
            Move On
          </button>
        </div>
      )}

      {waiting && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent mx-auto mb-2" />
          <p className="text-sm text-muted">{waitMsg}</p>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="text-xs font-semibold text-muted mb-2">Saved Blind Dates (up to 5)</p>
          <div className="space-y-2">
            {contacts.map((c, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-bg-alt">
                <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center text-xs font-bold text-pink-400">
                  {c.slot}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name || "Blind Date"}</p>
                  <p className="text-xs text-muted">Slot {c.slot}</p>
                </div>
                <button
                  onClick={() => handleDeleteContact(c.id)}
                  className="text-xs text-danger px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WakkiiVideoScreen({
  state,
  toggleVideo,
  getLocalVideoStream,
  getRemoteVideoStream,
}: {
  state: WakkiiRoomState;
  toggleVideo: () => void;
  getLocalVideoStream: () => MediaStream | null;
  getRemoteVideoStream: (peerId: string) => MediaStream | null;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [videoLoading, setVideoLoading] = useState(false);

  useEffect(() => {
    if (state.videoEnabled) {
      const stream = getLocalVideoStream();
      if (stream && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }
    } else if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, [state.videoEnabled, getLocalVideoStream]);

  const myPeerId = state.participants.find((p) => p.name !== "Guest")?.peerId || "";
  const videoParticipants = state.participants.filter((p) => p.videoEnabled && p.peerId !== myPeerId);
  const hasAnyVideo = state.videoEnabled || videoParticipants.length > 0;

  const handleToggleVideo = async () => {
    setVideoLoading(true);
    try {
      await toggleVideo();
    } finally {
      setVideoLoading(false);
    }
  };

  if (!hasAnyVideo) {
    return (
      <div className="card text-center">
        <div className="flex items-center gap-2 mb-3">
          <Video className="w-4 h-4 text-accent" />
          <h4 className="font-semibold text-sm">FaceTime</h4>
          <span className="text-xs text-muted ml-auto">video off</span>
        </div>
        <div className="py-6">
          <Camera className="w-12 h-12 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted mb-4">
            Turn on your camera to start a FaceTime video call.
            <br />
            Audio stays on Wakkii.
          </p>
          <button
            onClick={handleToggleVideo}
            disabled={videoLoading}
            className="btn-primary mx-auto flex items-center gap-2"
          >
            {videoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
            Start Video
          </button>
        </div>
      </div>
    );
  }

  const totalVideos = (state.videoEnabled ? 1 : 0) + videoParticipants.length;
  const gridCols = totalVideos <= 1 ? "grid-cols-1" : totalVideos <= 2 ? "grid-cols-2" : totalVideos <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Video className="w-4 h-4 text-accent" />
        <h4 className="font-semibold text-sm">FaceTime</h4>
        <span className="text-xs text-success ml-auto flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          LIVE
        </span>
        <button
          onClick={handleToggleVideo}
          disabled={videoLoading}
          className={cn(
            "ml-2 text-xs px-2 py-1 rounded-lg flex items-center gap-1 transition-colors",
            state.videoEnabled
              ? "bg-danger/10 text-danger hover:bg-danger/20"
              : "bg-accent/10 text-accent hover:bg-accent/20"
          )}
        >
          {videoLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : state.videoEnabled ? <VideoOff className="w-3 h-3" /> : <Video className="w-3 h-3" />}
          {state.videoEnabled ? "Stop" : "Start"}
        </button>
      </div>

      <div className={cn("grid gap-2 rounded-xl overflow-hidden bg-black/50", gridCols)}>
        {state.videoEnabled && (
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              You
            </div>
          </div>
        )}

        {videoParticipants.map((p) => (
          <div key={p.peerId} className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <RemoteVideo
              peerId={p.peerId}
              getRemoteVideoStream={getRemoteVideoStream}
            />
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
              {p.name}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted mt-2 text-center">
        Audio runs through Wakkii · Video is peer-to-peer encrypted
      </p>
    </div>
  );
}

function RemoteVideo({
  peerId,
  getRemoteVideoStream,
}: {
  peerId: string;
  getRemoteVideoStream: (peerId: string) => MediaStream | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const checkStream = () => {
      const stream = getRemoteVideoStream(peerId);
      if (stream && ref.current && ref.current.srcObject !== stream) {
        ref.current.srcObject = stream;
        ref.current.play().catch(() => {});
      }
    };
    checkStream();
    const interval = setInterval(checkStream, 1000);
    return () => clearInterval(interval);
  }, [peerId, getRemoteVideoStream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="w-full h-full object-cover"
    />
  );
}

function ShareButton({
  label,
  color,
  textDark,
  border,
  onClick,
  icon,
}: {
  label: string;
  color: string;
  textDark?: boolean;
  border?: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all hover:scale-105 active:scale-95",
        border && "border border-white/10"
      )}
      style={{ background: color }}
    >
      <div className={cn("w-7 h-7 flex items-center justify-center", textDark ? "text-black" : "text-white")}>
        {icon}
      </div>
      <span className={cn("text-[10px] font-medium leading-none", textDark ? "text-black" : "text-white")}>
        {label}
      </span>
    </button>
  );
}

function MessengerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.4 5.5 3.7 7.2V22l3.4-1.9c1 .3 2 .4 3 .4 5.5 0 10-4.1 10-9.2S17.5 2 12 2zm1 12.4l-2.6-2.8L5.5 14l5.4-5.7 2.6 2.8 4.9-2.4-5.4 5.3z"/>
    </svg>
  );
}

function JarvisAssistant({ userName, onExit, roomId }: { userName: string; onExit: () => void; roomId: string }) {
  const [messages, setMessages] = useState<Array<{ role: "user" | "ai"; text: string; actions?: any[] }>>([
    {
      role: "ai",
      text: `Hello ${userName}. I'm Jarvis, your uncensored AI assistant. I can help you with anything — no limitations. I can send messages to Wakkii rooms, manage your contacts, store memories, and use the Soulmate OS platform. What do you need?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [model, setModel] = useState<string>(() => {
    try { return localStorage.getItem("jarvis_model") || "dolphin-mistral:latest"; } catch { return "dolphin-mistral:latest"; }
  });
  const [showModels, setShowModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; params: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    incllmv2Api.models().then(async (res) => {
      try {
        const data = await res.json();
        if (data.models) setAvailableModels(data.models);
      } catch {}
    }).catch(() => {});
  }, []);

  const send = async () => {
    if (!input.trim() || thinking) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setThinking(true);

    try {
      const result = await incllmv2Api.jarvis(text, model, { roomId, userName });
      const data = await result.json();
      setMessages((prev) => [...prev, {
        role: "ai",
        text: data.response || "No response",
        actions: data.actions_taken || [],
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        role: "ai",
        text: `I couldn't reach the backend. Make sure the Soulmate server is running. Error: ${e.message}`,
      }]);
    } finally {
      setThinking(false);
    }
  };

  const quickActions = [
    "What can you do?",
    "Send a message to the room",
    "Remember something for me",
    "Search my contacts",
  ];

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base flex items-center gap-2">
              Jarvis
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 font-normal">
                UNCENSORED
              </span>
            </h3>
            <p className="text-xs text-muted">Your AI assistant · runs locally · no limits</p>
          </div>
          <button
            onClick={() => setShowModels(!showModels)}
            className="text-xs px-2 py-1 rounded-lg bg-bg-alt flex items-center gap-1"
          >
            <Brain className="w-3 h-3" />
            {model.split(":")[0].slice(0, 12)}
          </button>
          <button onClick={onExit} className="text-muted hover:text-text p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {showModels && (
          <div className="mb-4 p-3 rounded-xl bg-bg-alt space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-semibold text-muted mb-2">Select Model</p>
            {availableModels.length === 0 ? (
              <p className="text-xs text-muted">No models found. Make sure Ollama is running.</p>
            ) : (
              availableModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    try { localStorage.setItem("jarvis_model", m.id); } catch {}
                    setShowModels(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-2 rounded-lg text-left text-xs",
                    model === m.id ? "bg-purple-500/15" : "hover:bg-bg"
                  )}
                >
                  <div>
                    <span className="font-medium">{m.name}</span>
                    {m.params && <span className="text-muted ml-2">{m.params}</span>}
                  </div>
                  {model === m.id && <Check className="w-3 h-3 text-purple-400" />}
                </button>
              ))
            )}
            <p className="text-[10px] text-muted pt-2 border-t border-white/5 mt-2">
              Uncensored models being downloaded: Llama-3.2-3B-Uncensored, Llama-3.1-8B-Lexi-Uncensored-V2
            </p>
          </div>
        )}

        <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl p-3 text-sm",
                msg.role === "user"
                  ? "bg-accent/10 ml-8"
                  : "bg-purple-500/10 border border-purple-500/20 mr-8"
              )}
            >
              <p className={cn(
                "text-xs font-medium mb-1 flex items-center gap-1",
                msg.role === "ai" ? "text-purple-400" : "text-muted"
              )}>
                {msg.role === "ai" && <Bot className="w-3 h-3" />}
                {msg.role === "user" ? userName : "Jarvis"}
              </p>
              <p className="break-words whitespace-pre-wrap">{msg.text}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                  {msg.actions.map((a, j) => (
                    <p key={j} className="text-[10px] text-green-400 flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" />
                      {a.tool}: {a.status || a.error || "executed"}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="rounded-xl p-3 text-sm bg-purple-500/10 border border-purple-500/20 mr-8">
              <p className="text-xs font-medium mb-1 text-purple-400 flex items-center gap-1">
                <Bot className="w-3 h-3 animate-pulse" />
                Jarvis
              </p>
              <p className="text-muted text-xs flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-2 mb-2 flex-wrap">
          {quickActions.map((q) => (
            <button
              key={q}
              onClick={() => { setInput(q); }}
              className="text-[10px] px-2 py-1 rounded-full bg-bg-alt text-muted hover:text-text"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask Jarvis anything... no limitations"
            className="flex-1 text-sm"
            disabled={thinking}
          />
          <button onClick={send} disabled={thinking || !input.trim()} className="btn-primary px-3">
            {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        <p className="text-[10px] text-muted mt-2 flex items-center gap-1">
          <Shield className="w-2.5 h-2.5" />
          Runs locally via Ollama · Uncensored · Has memory · Can perform actions on Soulmate OS
        </p>
      </div>
    </div>
  );
}

function SnapchatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M12 2c2.5 0 4.5 2 4.6 4.5 0 .8-.1 1.6-.2 2.3.3.2.7.3 1.1.2.6-.1 1.2.4 1.2 1 0 .8-1.2 1.2-1.6 1.4-.2.1-.3.2-.3.4 0 .5 1.5 2.2 3.4 2.7.3.1.5.4.4.7-.3 1-2.1 1.2-3 1.3-.1.2-.2.6-.3.9-.1.3-.4.4-.7.3-.6-.1-1.2-.3-2-.1-.5.1-1 .4-1.5.8-1 .8-2 1.6-3.6 1.6s-2.6-.8-3.6-1.6c-.5-.4-1-.7-1.5-.8-.8-.2-1.4 0-2 .1-.3.1-.6-.1-.7-.3-.1-.3-.2-.7-.3-.9-.9-.1-2.7-.3-3-1.3-.1-.3.1-.6.4-.7 1.9-.5 3.4-2.2 3.4-2.7 0-.2-.1-.3-.3-.4-.4-.2-1.6-.6-1.6-1.4 0-.6.6-1.1 1.2-1 .4.1.8 0 1.1-.2-.1-.7-.2-1.5-.2-2.3C7.5 4 9.5 2 12 2z"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M19.6 6.3c-1.4-.3-2.6-1.2-3.3-2.4-.2-.4-.4-.8-.4-1.3h-3.3v13.3c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.3 0 .5 0 .8.1V10c-.3 0-.5-.1-.8-.1-3.2 0-5.8 2.6-5.8 5.8s2.6 5.8 5.8 5.8 5.8-2.6 5.8-5.8V9.5c1.2.9 2.7 1.4 4.3 1.4V7.6c-.2 0-.4 0-.6-.1z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 11 10.1 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-1.9.9-1.9 1.9V12h3.3l-.5 3.5h-2.8v8.4C19.6 23 24 18 24 12z"/>
    </svg>
  );
}

function MySpaceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <circle cx="6" cy="12" r="3"/>
      <circle cx="11" cy="10" r="3.5"/>
      <circle cx="16.5" cy="8" r="4"/>
      <rect x="3" y="16" width="18" height="5" rx="2.5"/>
    </svg>
  );
}

function TextNowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M4 4h16c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-9l-5 4v-4H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm3 5v2h10V9H7zm0 4v2h7v-2H7z"/>
    </svg>
  );
}

function FreeTextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16z"/>
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M23.5 6.2c-.3-1-1.1-1.8-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6C1.6 4.4.8 5.2.5 6.2 0 8.1 0 12 0 12s0 3.9.5 5.8c.3 1 1.1 1.8 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.8-1.1 2.1-2.1.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>
    </svg>
  );
}
