import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { datingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TranslatedMessage } from "@/components/TranslatedMessage";
import { useMessageTranslation, getLangFlag } from "@/hooks/useMessageTranslation";
import {
  Heart, X, Star, Zap, RotateCcw, ChevronLeft, Send, Image as ImageIcon,
  Settings, User, MessageCircle, Flame, Sparkles, Globe,
} from "lucide-react";

interface DatingProfile {
  id: number;
  name: string;
  age: number;
  bio: string;
  interests: string[];
  photos: string[];
  distance: number;
  gender: string;
}

interface Match {
  id: number;
  name: string;
  avatar?: string;
  last_message?: string;
  created_at: string;
}

interface MatchMessage {
  id: number;
  sender_id: number;
  text: string;
  created_at: string;
  source_lang?: string;
}

type DatingView = "swipe" | "matches" | "chat" | "profile" | "fb-dating" | "setup";

const TINDER_PINK = "#FD3F73";
const TINDER_GRADIENT = "linear-gradient(135deg, #FD267D, #FF6036)";
const FB_DATING_PINK = "#F35369";

export function DatingPage() {
  const { showAlert, authEmail, language, translationEnabled, setTranslationEnabled } = useStore();
  const [view, setView] = useState<DatingView>("swipe");
  const [mode, setMode] = useState<"tinder" | "fb">("tinder");
  const [profile, setProfile] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<DatingProfile[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMatchPopup, setShowMatchPopup] = useState<DatingProfile | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);

  // Setup form
  const [formBio, setFormBio] = useState("");
  const [formAge, setFormAge] = useState(18);
  const [formGender, setFormGender] = useState("male");
  const [formLooking, setFormLooking] = useState("women");
  const [formInterests, setFormInterests] = useState<string[]>([]);
  const [formPhotos, setFormPhotos] = useState<string[]>([]);
  const [formLocation, setFormLocation] = useState("");
  const [interestInput, setInterestInput] = useState("");
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const data = await datingApi.getProfile();
      if (data.profile) {
        setProfile(data.profile);
        return data.profile;
      } else {
        setView("setup");
        return null;
      }
    } catch {
      setView("setup");
      return null;
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const data = await datingApi.getSuggestions();
      setSuggestions(data.suggestions || []);
      setCurrentIdx(0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const loadMatches = useCallback(async () => {
    try {
      const data = await datingApi.getMatches();
      setMatches(data.matches || []);
    } catch {
      setMatches([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const p = await loadProfile();
      if (p) {
        await loadSuggestions();
        await loadMatches();
      }
      setLoading(false);
    })();
  }, [loadProfile, loadSuggestions, loadMatches]);

  const handleSwipe = async (direction: "like" | "pass" | "superlike") => {
    const current = suggestions[currentIdx];
    if (!current) return;
    try {
      if (direction === "like") await datingApi.likeUser(current.id);
      else if (direction === "pass") await datingApi.passUser(current.id);
      else if (direction === "superlike") await datingApi.superLikeUser(current.id);

      // Check for match
      if (direction === "like" || direction === "superlike") {
        const matchData = await datingApi.getMatches();
        const newMatch = (matchData.matches || []).find((m: Match) => m.id === current.id);
        if (newMatch) {
          setShowMatchPopup(current);
          setMatches(matchData.matches || []);
        }
      }
      setCurrentIdx(currentIdx + 1);
      setPhotoIdx(0);
      setDragX(0);
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSaveProfile = async () => {
    if (formPhotos.length === 0) { showAlert("danger", "Add at least one photo"); return; }
    setSaving(true);
    try {
      await datingApi.createProfile({
        bio: formBio,
        interests: formInterests,
        age: formAge,
        gender: formGender,
        looking_for: formLooking,
        photos: formPhotos,
        location: formLocation,
      });
      showAlert("success", "Dating profile created!");
      await loadProfile();
      await loadSuggestions();
      setView("swipe");
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setSaving(false);
    }
  };

  const loadMessages = async (match: Match) => {
    setActiveMatch(match);
    setView("chat");
    try {
      const data = await datingApi.getMatchMessages(match.id);
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeMatch) return;
    try {
      await datingApi.sendMatchMessage(activeMatch.id, messageText, language);
      setMessages([...messages, { id: Date.now(), sender_id: 0, text: messageText, created_at: new Date().toISOString(), source_lang: language }]);
      setMessageText("");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setDragging(true);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    (window as any)._dragStartX = clientX;
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const startX = (window as any)._dragStartX;
    setDragX(clientX - startX);
  };

  const handleDragEnd = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 120) handleSwipe("like");
    else if (dragX < -120) handleSwipe("pass");
    else setDragX(0);
  };

  const getAvatar = (name?: string) => (name || "U").charAt(0).toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${TINDER_PINK} transparent transparent transparent` }} />
      </div>
    );
  }

  // Setup view
  if (view === "setup") {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: TINDER_GRADIENT, color: "white" }}>
        <div className="max-w-md mx-auto p-6 min-h-screen flex flex-col">
          <h1 className="text-3xl font-bold text-center mb-2">Set Up Your Dating Profile</h1>
          <p className="text-center text-white/80 mb-6">This is separate from your Soulmate Social profile</p>
          <div className="bg-white rounded-2xl p-6 text-gray-900 space-y-4 flex-1 overflow-y-auto">
            <div>
              <label className="block text-sm font-medium mb-2">Photos (URLs)</label>
              <div className="grid grid-cols-3 gap-2">
                {formPhotos.map((img, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setFormPhotos(formPhotos.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center text-white text-xs">✕</button>
                  </div>
                ))}
                <button onClick={() => { const url = prompt("Photo URL:"); if (url) setFormPhotos([...formPhotos, url]); }} className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center hover:border-pink-500">
                  <span className="text-2xl text-gray-400">+</span>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bio</label>
              <textarea value={formBio} onChange={(e) => setFormBio(e.target.value)} placeholder="Tell us about yourself..." rows={3} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-pink-500 resize-none text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Age</label>
                <input type="number" value={formAge} onChange={(e) => setFormAge(parseInt(e.target.value) || 18)} min={18} max={100} className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-pink-500" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gender</label>
                <select value={formGender} onChange={(e) => setFormGender(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Looking For</label>
              <select value={formLooking} onChange={(e) => setFormLooking(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg outline-none">
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="everyone">Everyone</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Interests</label>
              <div className="flex gap-2 mb-2">
                <input value={interestInput} onChange={(e) => setInterestInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && interestInput.trim()) { setFormInterests([...formInterests, interestInput.trim()]); setInterestInput(""); } }} placeholder="Add interest..." className="flex-1 p-2 border border-gray-300 rounded-lg outline-none text-sm" />
                <button onClick={() => { if (interestInput.trim()) { setFormInterests([...formInterests, interestInput.trim()]); setInterestInput(""); } }} className="px-3 rounded-lg bg-pink-500 text-white text-sm">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formInterests.map((interest, i) => (
                  <span key={i} className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium flex items-center gap-1">
                    {interest}
                    <button onClick={() => setFormInterests(formInterests.filter((_, idx) => idx !== i))} className="text-pink-400 hover:text-pink-600">✕</button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Location</label>
              <input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="City, State" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-pink-500" />
            </div>
            <button onClick={handleSaveProfile} disabled={saving} className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: TINDER_GRADIENT }}>
              {saving ? "Saving..." : "Create Dating Profile"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Chat view
  if (view === "chat" && activeMatch) {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8 flex flex-col" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => { setView("matches"); setActiveMatch(null); }} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold overflow-hidden" style={{ background: TINDER_GRADIENT }}>
            {activeMatch.avatar ? <img src={activeMatch.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(activeMatch.name)}
          </div>
          <div className="flex-1">
            <p className="font-bold">{activeMatch.name}</p>
            <p className="text-xs text-gray-500">Active now</p>
          </div>
          <button
            onClick={() => setTranslationEnabled(!translationEnabled)}
            className={cn("p-2 rounded-full transition-colors", translationEnabled ? "text-pink-500 bg-pink-50" : "text-gray-400 hover:bg-gray-100")}
            title={translationEnabled ? "Auto-translate ON" : "Auto-translate OFF"}
          >
            <Globe className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-w-2xl mx-auto w-full">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Sparkles className="w-10 h-10 text-pink-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">You matched! Say hello 👋</p>
            </div>
          ) : messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.sender_id === 0 ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm", msg.sender_id === 0 ? "text-white rounded-br-md" : "bg-white text-gray-900 rounded-bl-md shadow-sm")} style={msg.sender_id === 0 ? { background: TINDER_GRADIENT } : {}}>
                {msg.sender_id === 0 ? (
                  <p>{msg.text}</p>
                ) : (
                  <TranslatedMessage text={msg.text} sourceLang={msg.source_lang} isOwn={false} />
                )}
                <p className={cn("text-xs mt-1", msg.sender_id === 0 ? "text-white/70" : "text-gray-400")}>{msg.created_at?.slice(11, 16)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <button className="p-2 rounded-full hover:bg-gray-100"><ImageIcon className="w-5 h-5 text-gray-500" /></button>
            <input value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }} placeholder="Type a message..." className="flex-1 p-3 rounded-full bg-gray-100 outline-none text-sm" />
            <button onClick={handleSendMessage} disabled={!messageText.trim()} className="w-10 h-10 rounded-full flex items-center justify-center text-white disabled:opacity-40" style={{ background: TINDER_GRADIENT }}>
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Matches view
  if (view === "matches") {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setView("swipe")} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">Matches</h2>
        </div>
        <div className="max-w-2xl mx-auto p-4">
          {matches.length === 0 ? (
            <div className="text-center py-16">
              <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No matches yet. Keep swiping!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {matches.map((match) => (
                <button key={match.id} onClick={() => loadMessages(match)} className="relative aspect-[3/4] rounded-2xl overflow-hidden group">
                  <div className="w-full h-full flex items-center justify-center text-white font-bold text-4xl" style={{ background: TINDER_GRADIENT }}>
                    {match.avatar ? <img src={match.avatar} alt="" className="w-full h-full object-cover" /> : getAvatar(match.name)}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                    <p className="text-white font-bold text-sm">{match.name}</p>
                    {match.last_message && <p className="text-white/70 text-xs truncate">{match.last_message}</p>}
                  </div>
                  <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/10 transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Profile/settings view
  if (view === "profile") {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => setView("swipe")} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg">My Dating Profile</h2>
        </div>
        <div className="max-w-md mx-auto p-4 space-y-4">
          {profile && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="aspect-square flex items-center justify-center text-white font-bold text-6xl" style={{ background: TINDER_GRADIENT }}>
                {profile.photos?.[0] ? <img src={profile.photos[0]} alt="" className="w-full h-full object-cover" /> : getAvatar(profile.name || authEmail)}
              </div>
              <div className="p-4">
                <h3 className="font-bold text-lg">{profile.name || authEmail}, {profile.age}</h3>
                <p className="text-sm text-gray-600 mt-1">{profile.bio}</p>
                {profile.interests && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {profile.interests.map((interest: string, i: number) => (
                      <span key={i} className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium">{interest}</span>
                    ))}
                  </div>
                )}
                <button onClick={() => setView("setup")} className="w-full mt-4 py-2.5 rounded-lg border-2 border-gray-300 font-medium text-sm hover:bg-gray-100">Edit Profile</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Facebook Dating view
  if (view === "fb-dating") {
    return (
      <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8" style={{ background: "#F0F2F5", color: "#050505" }}>
        <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
          <button onClick={() => { setView("swipe"); setMode("tinder"); }} className="p-2 rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="font-bold text-lg flex items-center gap-2"><Heart className="w-5 h-5" style={{ color: FB_DATING_PINK }} /> Dating</h2>
        </div>
        <div className="max-w-md mx-auto p-4 space-y-4">
          {/* Your dating profile card */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="h-32 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${FB_DATING_PINK}, #FF7A9A)` }}>
              <Heart className="w-12 h-12 text-white" />
            </div>
            <div className="p-4">
              <h3 className="font-bold">{profile?.name || authEmail}</h3>
              <button onClick={() => setView("setup")} className="text-sm font-medium mt-1" style={{ color: FB_DATING_PINK }}>Edit Dating Profile</button>
            </div>
          </div>

          {/* Suggested matches — Facebook Dating style vertical cards */}
          <h3 className="font-bold text-sm text-gray-500">Suggested For You</h3>
          {suggestions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-8 text-center text-gray-500">No suggestions right now. Check back later!</div>
          ) : suggestions.map((sugg) => (
            <div key={sugg.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="aspect-[4/5] relative">
                <img src={sugg.photos?.[0] || "https://via.placeholder.com/400x500?text=No+Photo"} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <h3 className="text-white font-bold text-xl">{sugg.name}, {sugg.age}</h3>
                  <p className="text-white/80 text-sm">{sugg.distance} miles away</p>
                </div>
              </div>
              <div className="p-4">
                {sugg.bio && <p className="text-sm text-gray-700 mb-2">{sugg.bio}</p>}
                {sugg.interests && sugg.interests.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {sugg.interests.slice(0, 4).map((interest, i) => (
                      <span key={i} className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">{interest}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { datingApi.passUser(sugg.id); setSuggestions(suggestions.filter(s => s.id !== sugg.id)); }} className="flex-1 py-2.5 rounded-lg border-2 border-gray-300 font-medium text-sm hover:bg-gray-100">Pass</button>
                  <button onClick={() => { datingApi.likeUser(sugg.id); setSuggestions(suggestions.filter(s => s.id !== sugg.id)); }} className="flex-1 py-2.5 rounded-lg text-white font-medium text-sm" style={{ background: FB_DATING_PINK }}>Interested</button>
                </div>
              </div>
            </div>
          ))}

          {/* Likes you section */}
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <h3 className="font-bold text-sm mb-2">Likes You</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="aspect-square rounded-xl bg-gray-200 flex items-center justify-center">
                <span className="text-gray-400 text-sm">Premium</span>
              </div>
              <div className="aspect-square rounded-xl bg-gray-200 flex items-center justify-center">
                <span className="text-gray-400 text-sm">Premium</span>
              </div>
            </div>
            <button className="w-full mt-3 py-2 rounded-lg text-sm font-bold text-white" style={{ background: FB_DATING_PINK }}>Unlock with Premium</button>
          </div>
        </div>
      </div>
    );
  }

  // Main swipe view (Tinder)
  const current = suggestions[currentIdx];
  const rotation = dragX / 20;
  const likeOpacity = Math.max(0, dragX / 100);
  const passOpacity = Math.max(0, -dragX / 100);

  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8 flex flex-col" style={{ background: TINDER_GRADIENT, color: "white" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14">
        <button onClick={() => setView("profile")} className="p-2"><User className="w-6 h-6" /></button>
        <button onClick={() => setView("swipe")} className="text-2xl font-bold flex items-center gap-1">
          <Flame className="w-6 h-6" /> Soulmate
        </button>
        <button onClick={() => { setMode("fb"); setView("fb-dating"); }} className="p-2"><Heart className="w-6 h-6" /></button>
      </div>

      {/* Card stack */}
      <div className="flex-1 flex items-center justify-center px-4 relative">
        {suggestions.length === 0 || currentIdx >= suggestions.length ? (
          <div className="text-center">
            <Flame className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-xl font-bold">No more profiles</p>
            <p className="text-white/70 text-sm mt-2">Check back later for more suggestions!</p>
            <button onClick={loadSuggestions} className="mt-4 px-6 py-2 rounded-full bg-white text-pink-500 font-bold text-sm">Refresh</button>
          </div>
        ) : (
          <div className="relative w-full max-w-sm">
            {/* Back cards */}
            {suggestions.slice(currentIdx + 1, currentIdx + 3).map((card, i) => (
              <div key={card.id} className="absolute inset-0 bg-white rounded-2xl shadow-2xl overflow-hidden" style={{ transform: `scale(${1 - (i + 1) * 0.05}) translateY(${(i + 1) * 12}px)`, zIndex: -i - 1 }}>
                <img src={card.photos?.[0] || "https://via.placeholder.com/400x600?text=No+Photo"} alt="" className="w-full h-full object-cover" />
              </div>
            ))}

            {/* Current card */}
            <div
              className="relative bg-white rounded-2xl shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
              style={{
                transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                transition: dragging ? "none" : "transform 0.3s ease",
                touchAction: "none",
              }}
              onMouseDown={handleDragStart}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={handleDragStart}
              onTouchMove={handleDragMove}
              onTouchEnd={handleDragEnd}
            >
              {/* Photo */}
              <div className="aspect-[3/4] relative">
                <img src={current.photos?.[photoIdx] || "https://via.placeholder.com/400x600?text=No+Photo"} alt="" className="w-full h-full object-cover" />

                {/* Photo navigation */}
                {current.photos && current.photos.length > 1 && (
                  <>
                    <div className="absolute top-2 left-2 right-2 flex gap-1">
                      {current.photos.map((_, i) => (
                        <div key={i} className={cn("h-1 flex-1 rounded-full", i === photoIdx ? "bg-white" : "bg-white/40")} />
                      ))}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setPhotoIdx(Math.max(0, photoIdx - 1)); }} className="absolute left-0 top-0 bottom-0 w-1/3" />
                    <button onClick={(e) => { e.stopPropagation(); setPhotoIdx(Math.min(current.photos.length - 1, photoIdx + 1)); }} className="absolute right-0 top-0 bottom-0 w-1/3" />
                  </>
                )}

                {/* Like/Pass overlays */}
                <div className="absolute top-8 left-8 border-4 border-green-400 rounded-xl px-3 py-1 text-green-400 font-bold text-2xl" style={{ opacity: likeOpacity }}>
                  LIKE
                </div>
                <div className="absolute top-8 right-8 border-4 border-red-400 rounded-xl px-3 py-1 text-red-400 font-bold text-2xl" style={{ opacity: passOpacity }}>
                  NOPE
                </div>

                {/* Info */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <h2 className="text-white text-2xl font-bold">{current.name}, {current.age}</h2>
                  <p className="text-white/80 text-sm flex items-center gap-1">📍 {current.distance} miles away</p>
                  {current.bio && <p className="text-white/70 text-sm mt-1 line-clamp-2">{current.bio}</p>}
                  {current.interests && current.interests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {current.interests.slice(0, 3).map((interest, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white/20 rounded-full text-white text-xs font-medium">{interest}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {current && currentIdx < suggestions.length && (
        <div className="flex items-center justify-center gap-3 pb-6">
          <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Rewind (Premium)">
            <RotateCcw className="w-5 h-5 text-yellow-500" />
          </button>
          <button onClick={() => handleSwipe("pass")} className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
            <X className="w-7 h-7 text-red-500" />
          </button>
          <button onClick={() => handleSwipe("superlike")} className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Super Like">
            <Star className="w-5 h-5 text-blue-500" />
          </button>
          <button onClick={() => handleSwipe("like")} className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
            <Heart className="w-7 h-7 text-green-500" />
          </button>
          <button className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform" title="Boost (Premium)">
            <Zap className="w-5 h-5 text-purple-500" />
          </button>
        </div>
      )}

      {/* Bottom nav */}
      <div className="flex items-center justify-around pb-4 pt-2 border-t border-white/10">
        <button onClick={() => setView("swipe")} className="flex flex-col items-center gap-1">
          <Flame className="w-6 h-6" />
          <span className="text-xs">Swipe</span>
        </button>
        <button onClick={() => { setView("matches"); loadMatches(); }} className="flex flex-col items-center gap-1">
          <MessageCircle className="w-6 h-6" />
          <span className="text-xs">Matches</span>
        </button>
        <button onClick={() => setView("profile")} className="flex flex-col items-center gap-1">
          <User className="w-6 h-6" />
          <span className="text-xs">Profile</span>
        </button>
      </div>

      {/* Match popup */}
      {showMatchPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" style={{ background: TINDER_GRADIENT }} onClick={() => setShowMatchPopup(null)}>
          <div className="text-center" onClick={(e) => e.stopPropagation()}>
            <h1 className="text-4xl font-bold text-white mb-8">It's a Match!</h1>
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="w-28 h-28 rounded-full border-4 border-white overflow-hidden">
                <img src={profile?.photos?.[0] || "https://via.placeholder.com/200?text=You"} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="w-28 h-28 rounded-full border-4 border-white overflow-hidden">
                <img src={showMatchPopup.photos?.[0] || "https://via.placeholder.com/200?text=Match"} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <p className="text-white/80 mb-6">You and {showMatchPopup.name} liked each other!</p>
            <button onClick={() => { loadMessages({ id: showMatchPopup.id, name: showMatchPopup.name, avatar: showMatchPopup.photos?.[0] }); setShowMatchPopup(null); }} className="px-8 py-3 rounded-full bg-white text-pink-500 font-bold mb-3 block w-full max-w-xs mx-auto">
              Send a Message
            </button>
            <button onClick={() => setShowMatchPopup(null)} className="px-8 py-3 rounded-full border-2 border-white text-white font-medium block w-full max-w-xs mx-auto">
              Keep Swiping
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
