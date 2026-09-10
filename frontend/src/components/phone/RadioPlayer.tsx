import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAudioCoordinator } from "@/hooks/useAudioCoordinator";
import {
  Radio,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  ChevronUp,
  ChevronDown,
  SkipForward,
  SkipBack,
  List,
  X,
  Mic,
  Music,
  Headphones,
  Loader2,
  Heart,
  Trash2,
  Clock,
  Plus,
} from "lucide-react";

interface Station {
  id: string;
  name: string;
  type: "radio" | "podcast" | "external";
  streamUrl: string;
  externalUrl?: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}

const STATIONS: Station[] = [
  {
    id: "102jamz",
    name: "102 Jamz",
    type: "radio",
    streamUrl: "https://prod-32-195-42-49.amperwave.net/audacy-wjhmfmaac-imc?session-id=20e31d757a02cb862875db60164c2062",
    description: "Hip Hop · Orlando, FL",
    color: "#FF6B00",
    icon: <Radio className="w-5 h-5" />,
  },
  {
    id: "v103",
    name: "V-103 Atlanta",
    type: "radio",
    streamUrl: "https://live.amperwave.net/direct/audacy-wveefmaac-imc",
    externalUrl: "https://www.audacy.com/v103",
    description: "The People's Station · Atlanta, GA",
    color: "#E91E63",
    icon: <Radio className="w-5 h-5" />,
  },
  {
    id: "lofi",
    name: "Lofi Beats",
    type: "radio",
    streamUrl: "http://stream.zeno.fm/hqbrk7skwxhvv",
    description: "Lofi hip hop · Study & chill",
    color: "#9334E6",
    icon: <Headphones className="w-5 h-5" />,
  },
  {
    id: "lofi-panda",
    name: "Lofi Panda",
    type: "radio",
    streamUrl: "https://stream.zeno.fm/umhxwwtke0hvv",
    description: "Hip-hop beats · 24/7",
    color: "#00ACC1",
    icon: <Music className="w-5 h-5" />,
  },
  {
    id: "jre",
    name: "Joe Rogan Experience",
    type: "podcast",
    streamUrl: "https://feeds.megaphone.fm/GLT1412515089",
    description: "Podcast · Latest episodes",
    color: "#E91E63",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "doac",
    name: "Diary of a CEO",
    type: "podcast",
    streamUrl: "https://feeds.megaphone.fm/thediaryofaceo",
    description: "Steven Bartlett · Unfiltered CEO stories",
    color: "#FFD600",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "moonshots",
    name: "Moonshots",
    type: "podcast",
    streamUrl: "https://feeds.megaphone.fm/DVVTS2890392624",
    description: "Peter Diamandis · Future of technology",
    color: "#00BCD4",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "nextwave",
    name: "The Next Wave",
    type: "podcast",
    streamUrl: "https://feeds.megaphone.fm/thenextwave",
    description: "Matt Wolfe · AI & future of technology",
    color: "#FF6F00",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "beyondtomorrow",
    name: "Beyond Tomorrow",
    type: "podcast",
    streamUrl: "https://anchor.fm/s/fa2b1038/podcast/rss",
    description: "Julian Issa · Health, longevity, AI & human potential",
    color: "#00E676",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "lexfridman",
    name: "Lex Fridman Podcast",
    type: "podcast",
    streamUrl: "https://lexfridman.com/feed/podcast/",
    description: "Lex Fridman · AI, science, consciousness & deep conversations",
    color: "#FF1744",
    icon: <Mic className="w-5 h-5" />,
  },
  {
    id: "hiphop-rnb",
    name: "Hip Hop & R&B",
    type: "radio",
    streamUrl: "https://stream.zeno.fm/f3wvbbqmdg8uv",
    description: "Brent Faiyaz · Tory Lanez · A Boogie · Today's R&B & Hip Hop",
    color: "#E91E63",
    icon: <Radio className="w-5 h-5" />,
  },
  {
    id: "gaslight-hiphop",
    name: "Gaslight Hip Hop",
    type: "radio",
    streamUrl: "https://stream.zeno.fm/u993xhfa8f0uv",
    description: "Brent Faiyaz · Kirk Knight · Today's hip hop 24/7",
    color: "#FF5722",
    icon: <Radio className="w-5 h-5" />,
  },
];

interface PodcastEpisode {
  title: string;
  audioUrl: string;
  description: string;
  pubDate: string;
  duration: string;
}

interface SavedSong {
  id: string;
  stationId: string;
  stationName: string;
  stationType: "radio" | "podcast" | "external";
  streamUrl: string;
  episodeTitle?: string;
  episodeAudioUrl?: string;
  description: string;
  color: string;
  savedAt: number;
}

const SAVED_SONGS_KEY = "soulmate_saved_songs";
const CUSTOM_STATIONS_KEY = "soulmate_custom_stations";

function loadSavedSongs(): SavedSong[] {
  try {
    const raw = localStorage.getItem(SAVED_SONGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSavedSongs(songs: SavedSong[]) {
  try {
    localStorage.setItem(SAVED_SONGS_KEY, JSON.stringify(songs));
  } catch {}
}

interface CustomStation {
  id: string;
  name: string;
  streamUrl: string;
  description: string;
  color: string;
}

function loadCustomStations(): CustomStation[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomStations(stations: CustomStation[]) {
  try {
    localStorage.setItem(CUSTOM_STATIONS_KEY, JSON.stringify(stations));
  } catch {}
}

export function RadioPlayer({ embedded = false }: { embedded?: boolean }) {
  const [customStations, setCustomStations] = useState<CustomStation[]>(() => loadCustomStations());
  const [showAddStation, setShowAddStation] = useState(false);
  const [newStationName, setNewStationName] = useState("");
  const [newStationUrl, setNewStationUrl] = useState("");
  const [newStationDesc, setNewStationDesc] = useState("");

  // Merge default + custom stations
  const allStations: Station[] = [
    ...STATIONS,
    ...customStations.map(cs => ({
      id: cs.id,
      name: cs.name,
      type: "radio" as const,
      streamUrl: cs.streamUrl,
      description: cs.description || "Custom station",
      color: cs.color || "#6366f1",
      icon: <Radio className="w-5 h-5" />,
    })),
  ];

  const [currentStation, setCurrentStation] = useState<Station>(allStations[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showStations, setShowStations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [podcastEpisodes, setPodcastEpisodes] = useState<PodcastEpisode[]>([]);
  const [currentEpisode, setCurrentEpisode] = useState<PodcastEpisode | null>(null);
  const [episodeIndex, setEpisodeIndex] = useState(0);

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Universal audio coordination ───────────────────────────────────
  // Uses the shared useAudioCoordinator hook so this widget coordinates
  // with ALL other audio sources (radio, podcasts, voice messages, video
  // calls, walkie-talkie) — only one plays at a time across the app.
  const {
    announcePlay: coordAnnouncePlay,
    announceStop: coordAnnounceStop,
    shouldPause,
    activeSource,
  } = useAudioCoordinator("radio");

  const [savedSongs, setSavedSongs] = useState<SavedSong[]>(() => loadSavedSongs());
  const [showSaved, setShowSaved] = useState(false);
  const [savedListExpanded, setSavedListExpanded] = useState(false);

  const saveCurrentSong = useCallback(() => {
    const song: SavedSong = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      stationId: currentStation.id,
      stationName: currentStation.name,
      stationType: currentStation.type,
      streamUrl: currentStation.streamUrl,
      episodeTitle: currentEpisode?.title,
      episodeAudioUrl: currentEpisode?.audioUrl,
      description: currentStation.description,
      color: currentStation.color,
      savedAt: Date.now(),
    };
    const updated = [song, ...savedSongs];
    setSavedSongs(updated);
    saveSavedSongs(updated);
  }, [currentStation, currentEpisode, savedSongs]);

  const playSavedSong = useCallback((song: SavedSong) => {
    const station = allStations.find((s) => s.id === song.stationId) || {
      id: song.stationId,
      name: song.stationName,
      type: song.stationType,
      streamUrl: song.streamUrl,
      description: song.description,
      color: song.color,
      icon: song.stationType === "podcast" ? <Mic className="w-5 h-5" /> : <Radio className="w-5 h-5" />,
    };
    setCurrentStation(station);
    if (song.episodeAudioUrl && song.episodeTitle) {
      playEpisode({ title: song.episodeTitle, audioUrl: song.episodeAudioUrl, description: song.description, pubDate: "", duration: "" });
    } else {
      playStation(station);
    }
    setShowSaved(false);
  }, []);

  const deleteSavedSong = useCallback((id: string) => {
    const updated = savedSongs.filter((s) => s.id !== id);
    setSavedSongs(updated);
    saveSavedSongs(updated);
  }, [savedSongs]);

  const onDragStart = useCallback((clientX: number, clientY: number) => {
    dragRef.current = { startX: clientX, startY: clientY, origX: pos.x, origY: pos.y };
  }, [pos]);

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }, []);

  const onDragEnd = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientX, e.clientY);
    const handleMouseUp = () => onDragEnd();
    const handleTouchMove = (e: TouchEvent) => { if (e.touches[0]) onDragMove(e.touches[0].clientX, e.touches[0].clientY); };
    const handleTouchEnd = () => onDragEnd();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onDragMove, onDragEnd]);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.volume = muted ? 0 : volume;

    const onPlaying = () => { setLoading(false); setError(null); };
    const onError = () => { setLoading(false); setError("Stream unavailable. Try another station."); setIsPlaying(false); announceStop(); };
    const onWaiting = () => setLoading(true);
    const onEnded = () => {
      if (currentStation.type === "podcast" && podcastEpisodes.length > 0) {
        const next = (episodeIndex + 1) % podcastEpisodes.length;
        setEpisodeIndex(next);
        playEpisode(podcastEpisodes[next]);
      }
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("ended", onEnded);
    };
  }, [volume, muted, currentStation, episodeIndex, podcastEpisodes]);

  // ── Universal coordination: pause when another source starts ─────
  // Listen for "play" messages from other audio sources via the hook.
  useEffect(() => {
    if (shouldPause() && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [shouldPause]);

  // Broadcast a "play" message whenever this widget starts playing
  const announcePlay = useCallback(() => {
    coordAnnouncePlay(currentStation.name);
  }, [coordAnnouncePlay, currentStation]);

  // Broadcast a "stopped" message whenever this widget pauses
  const announceStop = useCallback(() => {
    coordAnnounceStop();
  }, [coordAnnounceStop]);

  useEffect(() => {
    const autoPlay = localStorage.getItem("radio_autoplay_disabled");
    if (autoPlay !== "true") {
      const timer = setTimeout(() => {
        playStation(allStations[0]);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const playStation = useCallback((station: Station) => {
    if (!audioRef.current) return;
    setLoading(true);
    setError(null);
    setCurrentStation(station);

    if (station.type === "radio") {
      audioRef.current.src = station.streamUrl;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
        announcePlay();
      }).catch(() => {
        setError("Could not play stream. The station may be geo-restricted.");
        setLoading(false);
        setIsPlaying(false);
      });
    } else if (station.type === "external") {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      setIsPlaying(false);
      announceStop();
      setLoading(false);
      if (station.externalUrl) {
        window.open(station.externalUrl, "_blank", "noopener,noreferrer");
      }
    } else if (station.type === "podcast") {
      fetchPodcastEpisodes(station.streamUrl);
    }
  }, [announcePlay, announceStop]);

  const fetchPodcastEpisodes = async (feedUrl: string) => {
    setLoading(true);
    setError(null);

    // Method 1: rss2json API (handles CORS, returns JSON)
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok" && data.items && data.items.length > 0) {
          const episodes: PodcastEpisode[] = data.items.map((item: any) => ({
            title: (item.title || "Untitled").replace(/&amp;/g, "&"),
            audioUrl: item.enclosure?.link || item.link || "",
            description: (item.description || "").replace(/<[^>]*>/g, "").slice(0, 200),
            pubDate: item.pubDate || "",
            duration: item.enclosure?.duration || "",
          })).filter((e: PodcastEpisode) => e.audioUrl);

          if (episodes.length > 0) {
            setPodcastEpisodes(episodes);
            setEpisodeIndex(0);
            playEpisode(episodes[0]);
            return;
          }
        }
      }
    } catch {}

    // Method 2: allorigins proxy + XML parse
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) {
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, "text/xml");
          const items = Array.from(xml.querySelectorAll("item")).slice(0, 50);
          if (items.length > 0) {
            const episodes: PodcastEpisode[] = items.map((item) => {
              const enclosure = item.querySelector("enclosure");
              const title = item.querySelector("title")?.textContent || "Untitled";
              const desc = item.querySelector("description")?.textContent || "";
              const pubDate = item.querySelector("pubDate")?.textContent || "";
              const duration = item.querySelector("duration")?.textContent || "";
              return {
                title: title.replace(/&amp;/g, "&"),
                audioUrl: enclosure?.getAttribute("url") || "",
                description: desc.replace(/<[^>]*>/g, "").slice(0, 200),
                pubDate,
                duration,
              };
            }).filter((e) => e.audioUrl);

            if (episodes.length > 0) {
              setPodcastEpisodes(episodes);
              setEpisodeIndex(0);
              playEpisode(episodes[0]);
              return;
            }
          }
        }
      }
    } catch {}

    setError("Could not load podcast feed. Try again in a moment.");
    setLoading(false);
  };

  const playEpisode = (episode: PodcastEpisode) => {
    if (!audioRef.current || !episode.audioUrl) return;
    setLoading(true);
    setCurrentEpisode(episode);
    audioRef.current.src = episode.audioUrl;
    audioRef.current.play().then(() => {
      setIsPlaying(true);
      announcePlay();
    }).catch(() => {
      setError("Could not play episode.");
      setLoading(false);
      setIsPlaying(false);
    });
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      announceStop();
    } else {
      if (audioRef.current.src) {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          announcePlay();
        }).catch(() => {});
      } else {
        playStation(currentStation);
      }
    }
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    setMuted(false);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (audioRef.current) audioRef.current.volume = newMuted ? 0 : volume;
    if (newMuted) {
      // Announce mute so other widgets know this one is muted
    }
  };

  const nextEpisode = () => {
    if (podcastEpisodes.length === 0) return;
    const next = (episodeIndex + 1) % podcastEpisodes.length;
    setEpisodeIndex(next);
    playEpisode(podcastEpisodes[next]);
  };

  const prevEpisode = () => {
    if (podcastEpisodes.length === 0) return;
    const prev = (episodeIndex - 1 + podcastEpisodes.length) % podcastEpisodes.length;
    setEpisodeIndex(prev);
    playEpisode(podcastEpisodes[prev]);
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      {/* Embedded mode — inline card, no floating */}
      {embedded && (
        <div className="space-y-3">
          {/* Main bar */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-alt">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${currentStation.color}30`, color: currentStation.color }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : currentStation.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">
                {currentStation.type === "podcast" && currentEpisode
                  ? currentEpisode.title.slice(0, 40)
                  : currentStation.name}
              </p>
              <p className="text-[10px] text-muted truncate">
                {isPlaying ? (
                  <span className="flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-0.5 h-3 bg-success rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                    </span>
                    {currentStation.description}
                  </span>
                ) : error ? (
                  <span className="text-danger">{error}</span>
                ) : (
                  currentStation.description
                )}
              </p>
            </div>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: currentStation.color, color: "#fff" }}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 px-3">
            <button onClick={toggleMute} className="text-muted hover:text-text">
              <VolumeIcon className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${currentStation.color} ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.1) ${(muted ? 0 : volume) * 100}%)`,
              }}
            />
            <span className="text-[10px] text-muted w-8 text-right">
              {Math.round((muted ? 0 : volume) * 100)}%
            </span>
          </div>

          {/* Podcast episode controls */}
          {currentStation.type === "podcast" && podcastEpisodes.length > 0 && (
            <div className="flex items-center justify-center gap-4 px-3">
              <button onClick={prevEpisode} className="text-muted hover:text-text">
                <SkipBack className="w-4 h-4" />
              </button>
              <span className="text-[10px] text-muted">
                Ep {episodeIndex + 1} of {podcastEpisodes.length}
              </span>
              <button onClick={nextEpisode} className="text-muted hover:text-text">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Save current song button */}
          <button
            onClick={saveCurrentSong}
            className="w-full text-xs px-3 py-2 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center gap-2 hover:bg-pink-500/25 transition-colors"
          >
            <Heart className="w-3 h-3" />
            Save Current {currentStation.type === "podcast" && currentEpisode ? "Episode" : "Station"}
          </button>

          {/* Station list toggle */}
          <button
            onClick={() => setShowStations(!showStations)}
            className="w-full text-xs px-3 py-2 rounded-lg bg-bg-alt flex items-center justify-center gap-2"
          >
            <List className="w-3 h-3" />
            {showStations ? "Hide Stations" : "Switch Station"}
          </button>

          {/* Station list — scrollable */}
          {showStations && (
            <div className="space-y-1 max-h-48 overflow-y-auto px-1">
              {allStations.map((station) => (
                <button
                  key={station.id}
                  onClick={() => {
                    playStation(station);
                    setShowStations(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors",
                    currentStation.id === station.id ? "bg-white/5" : "hover:bg-white/5"
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${station.color}30`, color: station.color }}
                  >
                    {station.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{station.name}</p>
                    <p className="text-[10px] text-muted truncate">{station.description}</p>
                  </div>
                  {currentStation.id === station.id && isPlaying && (
                    <span className="flex gap-0.5">
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" />
                      <span className="w-0.5 h-3 bg-success rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                  {/* Delete custom station */}
                  {customStations.some(cs => cs.id === station.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const updated = customStations.filter(cs => cs.id !== station.id);
                        setCustomStations(updated);
                        saveCustomStations(updated);
                        if (currentStation.id === station.id) {
                          playStation(allStations[0]);
                        }
                      }}
                      className="text-muted hover:text-danger flex-shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Add custom station */}
          {showStations && (
            <div className="border-t border-white/5 pt-2">
              {!showAddStation ? (
                <button
                  onClick={() => setShowAddStation(true)}
                  className="w-full text-xs px-3 py-2 rounded-lg bg-bg-alt flex items-center justify-center gap-2 hover:bg-white/5"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom Station
                </button>
              ) : (
                <div className="space-y-2 p-2 rounded-lg bg-bg-alt">
                  <input
                    value={newStationName}
                    onChange={(e) => setNewStationName(e.target.value)}
                    placeholder="Station name"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    value={newStationUrl}
                    onChange={(e) => setNewStationUrl(e.target.value)}
                    placeholder="Stream URL (https://...)"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent font-mono"
                  />
                  <input
                    value={newStationDesc}
                    onChange={(e) => setNewStationDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!newStationName.trim() || !newStationUrl.trim()) return;
                        const newStation: CustomStation = {
                          id: `custom-${Date.now()}`,
                          name: newStationName.trim(),
                          streamUrl: newStationUrl.trim(),
                          description: newStationDesc.trim() || "Custom station",
                          color: "#6366f1",
                        };
                        const updated = [...customStations, newStation];
                        setCustomStations(updated);
                        saveCustomStations(updated);
                        setNewStationName("");
                        setNewStationUrl("");
                        setNewStationDesc("");
                        setShowAddStation(false);
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setShowAddStation(false); setNewStationName(""); setNewStationUrl(""); setNewStationDesc(""); }}
                      className="flex-1 py-1.5 rounded-lg bg-bg-card text-muted text-xs font-medium hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved songs toggle */}
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="w-full text-xs px-3 py-2 rounded-lg bg-bg-alt flex items-center justify-center gap-2"
          >
            <Heart className="w-3 h-3" />
            {showSaved ? "Hide Saved" : `Saved Songs (${savedSongs.length})`}
          </button>

          {/* Saved songs list — scrollable with toggle */}
          {showSaved && (
            <div className="border-t border-white/5 pt-2">
              {/* Scroll toggle header */}
              {savedSongs.length > 0 && (
                <button
                  onClick={() => setSavedListExpanded(!savedListExpanded)}
                  className="w-full flex items-center justify-between text-[10px] text-muted px-1 pb-1 hover:text-text"
                >
                  <span className="flex items-center gap-1">
                    <Heart className="w-2.5 h-2.5" />
                    {savedSongs.length} saved
                  </span>
                  <span className="flex items-center gap-1">
                    {savedListExpanded ? "Collapse" : "Expand"}
                    {savedListExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </span>
                </button>
              )}
              <div className={cn(
                "space-y-1 overflow-y-auto px-1 no-scrollbar transition-all",
                savedListExpanded ? "max-h-[60vh]" : "max-h-72"
              )}>
                {savedSongs.length === 0 ? (
                  <p className="text-[10px] text-muted text-center py-4">
                    No saved songs yet. Tap "Save Current" to add songs here.
                  </p>
                ) : (
                  savedSongs.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-bg-alt hover:bg-white/5 transition-colors group"
                    >
                      <button
                        onClick={() => playSavedSong(song)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${song.color}30`, color: song.color }}
                        >
                          {song.stationType === "podcast" ? <Mic className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {song.episodeTitle || song.stationName}
                          </p>
                          <p className="text-[10px] text-muted truncate flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {new Date(song.savedAt).toLocaleDateString()} · {song.stationName}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={() => deleteSavedSong(song.id)}
                        className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating mode — original draggable widget */}
      {!embedded && (
        <div
          ref={playerRef}
          className={cn(
            "fixed bottom-16 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 cursor-grab active:cursor-grabbing select-none",
            expanded ? "w-[90vw] max-w-md" : "w-[60vw] max-w-xs"
          )}
          style={{ transform: `translate(calc(-50% + ${pos.x}px), ${pos.y}px)` }}
          onMouseDown={(e) => onDragStart(e.clientX, e.clientY)}
          onTouchStart={(e) => { if (e.touches[0]) onDragStart(e.touches[0].clientX, e.touches[0].clientY); }}
        >
        <div className="card p-3 shadow-2xl border border-white/10">
          {/* Main bar */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${currentStation.color}30`, color: currentStation.color }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : currentStation.icon}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">
                {currentStation.type === "podcast" && currentEpisode
                  ? currentEpisode.title.slice(0, 40)
                  : currentStation.name}
              </p>
              <p className="text-[10px] text-muted truncate">
                {isPlaying ? (
                  <span className="flex items-center gap-1">
                    <span className="flex gap-0.5">
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-0.5 h-3 bg-success rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" style={{ animationDelay: "300ms" }} />
                    </span>
                    {currentStation.description}
                  </span>
                ) : error ? (
                  <span className="text-danger">{error}</span>
                ) : (
                  currentStation.description
                )}
              </p>
            </div>

            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: currentStation.color, color: "#fff" }}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted hover:text-text flex-shrink-0"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {/* Expanded controls — top half: player, bottom half: scrollable side panel */}
          {expanded && (
            <div className="mt-3 pt-3 border-t border-white/5">
              {/* Top half — controls */}
              <div className="space-y-3 pb-3 border-b border-white/5">
                {/* Volume */}
                <div className="flex items-center gap-2">
                  <button onClick={toggleMute} className="text-muted hover:text-text">
                    <VolumeIcon className="w-4 h-4" />
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => changeVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, ${currentStation.color} ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.1) ${(muted ? 0 : volume) * 100}%)`,
                    }}
                  />
                  <span className="text-[10px] text-muted w-8 text-right">
                    {Math.round((muted ? 0 : volume) * 100)}%
                  </span>
                </div>

                {/* Podcast episode controls */}
                {currentStation.type === "podcast" && podcastEpisodes.length > 0 && (
                  <div className="flex items-center justify-center gap-4">
                    <button onClick={prevEpisode} className="text-muted hover:text-text">
                      <SkipBack className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] text-muted">
                      Ep {episodeIndex + 1} of {podcastEpisodes.length}
                    </span>
                    <button onClick={nextEpisode} className="text-muted hover:text-text">
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Save + toggle buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={saveCurrentSong}
                    className="flex-1 text-xs px-2 py-2 rounded-lg bg-pink-500/15 text-pink-400 flex items-center justify-center gap-1.5 hover:bg-pink-500/25 transition-colors"
                  >
                    <Heart className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={() => { setShowStations(!showStations); if (!showSaved) setShowSaved(true); }}
                    className={cn(
                      "flex-1 text-xs px-2 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors",
                      showStations ? "bg-accent/15 text-accent" : "bg-bg-alt text-muted"
                    )}
                  >
                    <List className="w-3 h-3" />
                    Stations
                  </button>
                  <button
                    onClick={() => { setShowSaved(!showSaved); if (!showStations) setShowStations(true); }}
                    className={cn(
                      "flex-1 text-xs px-2 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-colors",
                      showSaved ? "bg-pink-500/15 text-pink-400" : "bg-bg-alt text-muted"
                    )}
                  >
                    <Heart className="w-3 h-3" />
                    Saved ({savedSongs.length})
                  </button>
                </div>
              </div>

              {/* Bottom half — scrollable side panel */}
              <div className="mt-3 max-h-64 overflow-y-auto no-scrollbar">
                {/* Two-column layout: stations on left, saved songs on right */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Left column — Stations */}
                  {showStations && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-muted px-1 pb-1 sticky top-0 bg-bg-card z-10">Stations</p>
                      {allStations.map((station) => (
                        <button
                          key={station.id}
                          onClick={() => {
                            playStation(station);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors",
                            currentStation.id === station.id ? "bg-white/5" : "hover:bg-white/5"
                          )}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: `${station.color}30`, color: station.color }}
                          >
                            {station.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate">{station.name}</p>
                            <p className="text-[9px] text-muted truncate">{station.description}</p>
                          </div>
                          {currentStation.id === station.id && isPlaying && (
                            <span className="flex gap-0.5 flex-shrink-0">
                              <span className="w-0.5 h-2 bg-success rounded-full animate-pulse" />
                              <span className="w-0.5 h-3 bg-success rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                            </span>
                          )}
                          {/* Delete custom station */}
                          {customStations.some(cs => cs.id === station.id) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = customStations.filter(cs => cs.id !== station.id);
                                setCustomStations(updated);
                                saveCustomStations(updated);
                                if (currentStation.id === station.id) {
                                  playStation(allStations[0]);
                                }
                              }}
                              className="text-muted hover:text-danger flex-shrink-0"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </button>
                      ))}

                      {/* Add custom station (floating mode) */}
                      {!showAddStation ? (
                        <button
                          onClick={() => setShowAddStation(true)}
                          className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 text-muted text-[10px]"
                        >
                          <Plus className="w-3 h-3" />
                          Add Custom
                        </button>
                      ) : (
                        <div className="space-y-1 p-1.5 rounded-lg bg-bg-alt">
                          <input
                            value={newStationName}
                            onChange={(e) => setNewStationName(e.target.value)}
                            placeholder="Name"
                            className="w-full px-1.5 py-1 rounded bg-bg-card text-[10px] outline-none focus:ring-1 focus:ring-accent"
                          />
                          <input
                            value={newStationUrl}
                            onChange={(e) => setNewStationUrl(e.target.value)}
                            placeholder="Stream URL"
                            className="w-full px-1.5 py-1 rounded bg-bg-card text-[10px] outline-none focus:ring-1 focus:ring-accent font-mono"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                if (!newStationName.trim() || !newStationUrl.trim()) return;
                                const newStation: CustomStation = {
                                  id: `custom-${Date.now()}`,
                                  name: newStationName.trim(),
                                  streamUrl: newStationUrl.trim(),
                                  description: "Custom station",
                                  color: "#6366f1",
                                };
                                const updated = [...customStations, newStation];
                                setCustomStations(updated);
                                saveCustomStations(updated);
                                setNewStationName("");
                                setNewStationUrl("");
                                setShowAddStation(false);
                              }}
                              className="flex-1 py-1 rounded bg-accent text-white text-[9px] font-medium"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setShowAddStation(false); setNewStationName(""); setNewStationUrl(""); }}
                              className="flex-1 py-1 rounded bg-bg-card text-muted text-[9px] font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Podcast episodes under selected station */}
                      {currentStation.type === "podcast" && podcastEpisodes.length > 0 && (
                        <div className="space-y-1 pt-2 mt-1 border-t border-white/5">
                          <p className="text-[10px] font-semibold text-muted px-1 pb-1">Episodes</p>
                          {podcastEpisodes.slice(0, 20).map((ep, i) => (
                            <button
                              key={i}
                              onClick={() => { setEpisodeIndex(i); playEpisode(ep); }}
                              className={cn(
                                "w-full text-left p-1.5 rounded-lg text-[11px]",
                                i === episodeIndex ? "bg-white/5" : "hover:bg-white/5"
                              )}
                            >
                              <p className="truncate font-medium">{ep.title}</p>
                              <p className="text-[9px] text-muted truncate">{ep.pubDate}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right column — Saved songs */}
                  {showSaved && (
                    <div className="flex flex-col">
                      <button
                        onClick={() => setSavedListExpanded(!savedListExpanded)}
                        className="text-[10px] font-semibold text-pink-400 px-1 pb-1 sticky top-0 bg-bg-card z-10 flex items-center gap-1 w-full justify-between hover:text-pink-300"
                      >
                        <span className="flex items-center gap-1">
                          <Heart className="w-2.5 h-2.5" />
                          Saved Songs ({savedSongs.length})
                        </span>
                        {savedSongs.length > 0 && (
                          savedListExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
                        )}
                      </button>
                      <div className={cn(
                        "space-y-1 overflow-y-auto no-scrollbar transition-all",
                        savedListExpanded ? "max-h-[50vh]" : "max-h-40"
                      )}>
                        {savedSongs.length === 0 ? (
                          <p className="text-[10px] text-muted text-center py-6 px-2">
                            No saved songs yet. Tap "Save" to add songs here.
                          </p>
                        ) : (
                          savedSongs.map((song) => (
                            <div
                              key={song.id}
                              className="flex items-center gap-1.5 p-1.5 rounded-lg bg-bg-alt hover:bg-white/5 transition-colors group"
                            >
                              <button
                                onClick={() => playSavedSong(song)}
                                className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                              >
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: `${song.color}30`, color: song.color }}
                                >
                                  {song.stationType === "podcast" ? <Mic className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium truncate">
                                    {song.episodeTitle || song.stationName}
                                  </p>
                                  <p className="text-[9px] text-muted truncate flex items-center gap-0.5">
                                    <Clock className="w-2 h-2" />
                                    {new Date(song.savedAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => deleteSavedSong(song.id)}
                                className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Default view when neither is toggled */}
                  {!showStations && !showSaved && (
                    <div className="col-span-2 text-center py-4">
                      <p className="text-[10px] text-muted">
                        Tap "Stations" or "Saved" to browse in this panel
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </>
  );
}
