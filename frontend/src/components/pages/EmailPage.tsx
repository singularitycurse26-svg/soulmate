import { useState, useEffect } from "react";
import { emailApi, aiApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Mail, Send, Inbox, PenSquare, X, Loader2, Bot, Star, Archive, Trash2,
  Search, ChevronLeft, MoreVertical, Paperclip, Minus,
} from "lucide-react";

interface EmailItem {
  id: number;
  from: string;
  subject: string;
  is_read: boolean;
  date: string;
  body?: string;
  to?: string;
}

const GMAIL_BG = "#F6F8FC";
const GMAIL_SIDEBAR = "#F6F8FC";
const GMAIL_RED = "#EA4335";
const GMAIL_BLUE = "#1A73E8";

export function EmailPage() {
  const { showAlert } = useStore();
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [inbox, setInbox] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"inbox" | "compose" | "read">("inbox");
  const [currentEmail, setCurrentEmail] = useState<any>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState("Inbox");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCompose, setShowCompose] = useState(false);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiReplying, setAiReplying] = useState(false);

  const loadAccount = async () => {
    try {
      const data = await emailApi.account();
      if (data.email_address) {
        setEmailAddress(data.email_address);
        const inboxData = await emailApi.inbox();
        setInbox(inboxData.emails || []);
      }
    } catch (e: any) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccount(); }, []);

  const handleSetup = async () => {
    setSettingUp(true);
    try {
      const data = await emailApi.setup();
      if (data.email_address) {
        setEmailAddress(data.email_address);
        showAlert("success", `Email account created: ${data.email_address}`);
      }
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setSettingUp(false);
    }
  };

  const handleRead = async (id: number) => {
    try {
      const data = await emailApi.read(id);
      setCurrentEmail(data);
      setView("read");
      setInbox(prev => prev.map(e => e.id === id ? { ...e, is_read: true } : e));
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSend = async () => {
    if (!to.trim() || !subject.trim()) return showAlert("danger", "Recipient and subject are required");
    try {
      await emailApi.send(to, subject, body);
      showAlert("success", "Email sent!");
      try { aiApi.storeMemory("email_conversation", `Email to ${to}: ${subject} — ${body.slice(0, 100)}`, 0.5); } catch {}
      setTo(""); setSubject(""); setBody("");
      setShowCompose(false);
      setView("inbox");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleAIReply = async () => {
    if (!currentEmail) return;
    setAiReplying(true);
    try {
      let memoryContext = "";
      try {
        const memData = await aiApi.memories();
        const memories = memData.memories || [];
        const relevant = memories.filter((m: any) =>
          m.content?.toLowerCase().includes(currentEmail.from?.toLowerCase()) ||
          m.content?.toLowerCase().includes("email") ||
          m.type === "fact" || m.type === "preference"
        ).slice(0, 10);
        if (relevant.length > 0) memoryContext = relevant.map((m: any) => `- ${m.content}`).join("\n");
      } catch {}
      const prompt = memoryContext
        ? `You are replying to an email. Here's what you remember:\n${memoryContext}\n\nThe email is from: ${currentEmail.from}\nSubject: ${currentEmail.subject}\nBody: ${currentEmail.body?.slice(0, 500)}\n\nWrite a natural, professional email reply. Don't mention AI.`
        : `Write a reply to this email from ${currentEmail.from}. Subject: ${currentEmail.subject}. Body: ${currentEmail.body?.slice(0, 500)}. Write a natural, professional reply. Don't mention AI.`;
      const data = await aiApi.chat(prompt);
      setTo(currentEmail.from);
      setSubject("Re: " + (currentEmail.subject || ""));
      setBody(data.response || "");
      setShowCompose(true);
      setView("inbox");
      showAlert("success", "AI draft ready — review and send!");
    } catch (e: any) {
      showAlert("danger", "AI reply failed: " + e.message);
    } finally {
      setAiReplying(false);
    }
  };

  const filteredInbox = inbox.filter(e =>
    !searchQuery ||
    e.from?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GMAIL_RED }} />
      </div>
    );
  }

  if (!emailAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${GMAIL_RED}15` }}>
          <Mail className="w-8 h-8" style={{ color: GMAIL_RED }} />
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: "#202124" }}>Set Up Soulmate Email</h3>
        <p className="text-sm max-w-sm mb-6" style={{ color: "#5F6368" }}>
          Get your personal Soulmate Email address. Send and receive emails right from the app.
        </p>
        <button onClick={handleSetup} disabled={settingUp} className="px-6 py-3 rounded-lg text-white font-medium flex items-center gap-2" style={{ background: GMAIL_RED }}>
          {settingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
          {settingUp ? "Creating..." : "Create Email Account"}
        </button>
        <p className="text-xs mt-4" style={{ color: "#5F6368" }}>Your address will be username@191.44.121.29.sslip.io</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8 flex" style={{ background: GMAIL_BG, color: "#202124" }}>
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 p-2 hidden md:flex flex-col gap-1" style={{ background: GMAIL_SIDEBAR }}>
        <button
          onClick={() => { setShowCompose(true); setTo(""); setSubject(""); setBody(""); }}
          className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm hover:shadow-md transition-all mb-4"
          style={{ background: "#C2E7FF", color: "#001D35" }}
        >
          <PenSquare className="w-5 h-5" /> Compose
        </button>
        {[
          { label: "Inbox", icon: Inbox, count: inbox.filter(e => !e.is_read).length },
          { label: "Starred", icon: Star, count: 0 },
          { label: "Sent", icon: Send, count: 0 },
          { label: "Drafts", icon: PenSquare, count: 0 },
          { label: "Archive", icon: Archive, count: 0 },
          { label: "Trash", icon: Trash2, count: 0 },
        ].map((folder) => (
          <button
            key={folder.label}
            onClick={() => { setSelectedFolder(folder.label); setView("inbox"); }}
            className={cn("flex items-center gap-3 px-4 py-2.5 rounded-r-full text-sm font-medium", selectedFolder === folder.label ? "bg-blue-100 text-blue-800 font-bold" : "hover:bg-gray-200")}
          >
            <folder.icon className="w-4 h-4" />
            <span className="flex-1 text-left">{folder.label}</span>
            {folder.count > 0 && <span className="text-xs">{folder.count}</span>}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with search */}
        <div className="flex items-center gap-4 px-4 h-16 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2 flex-1 max-w-2xl">
            <Search className="w-5 h-5 text-gray-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mail"
              className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "#5F6368" }}>{emailAddress}</span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {view === "read" && currentEmail ? (
            <div className="p-6 max-w-3xl">
              <button onClick={() => setView("inbox")} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4">
                <ChevronLeft className="w-5 h-5" /> Back to Inbox
              </button>
              <h1 className="text-2xl font-bold mb-4">{currentEmail.subject || "(no subject)"}</h1>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" style={{ background: GMAIL_RED }}>
                  {(currentEmail.from || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{currentEmail.from}</p>
                  <p className="text-xs text-gray-500">to {currentEmail.to}</p>
                </div>
                <span className="text-xs text-gray-500">{currentEmail.date}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed border-t border-gray-200 pt-4">
                {currentEmail.body || "(empty body)"}
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => { setTo(currentEmail.from); setSubject("Re: " + (currentEmail.subject || "")); setBody(""); setShowCompose(true); }} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-100 flex items-center gap-2">
                  <PenSquare className="w-4 h-4" /> Reply
                </button>
                <button onClick={handleAIReply} disabled={aiReplying} className="px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2" style={{ background: GMAIL_BLUE }}>
                  {aiReplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                  {aiReplying ? "AI thinking..." : "AI Reply"}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl">
              {/* Email list header */}
              <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  <Star className="w-4 h-4 text-gray-400" />
                  <Archive className="w-4 h-4 text-gray-400" />
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </div>
                <span className="text-sm font-medium">{selectedFolder}</span>
              </div>
              {/* Email list */}
              {filteredInbox.length === 0 ? (
                <div className="text-center py-20">
                  <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No emails in {selectedFolder}</p>
                </div>
              ) : filteredInbox.map((email) => (
                <button
                  key={email.id}
                  onClick={() => handleRead(email.id)}
                  className="w-full flex items-center gap-3 px-6 py-2.5 hover:shadow-md transition-all border-b border-gray-100 text-left group"
                >
                  <input type="checkbox" className="rounded opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />
                  <Star className="w-4 h-4 text-gray-400 hover:text-yellow-500 flex-shrink-0" />
                  <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0", !email.is_read && "opacity-100")} style={{ background: GMAIL_RED }}>
                    {(email.from || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="w-40 flex-shrink-0">
                    <p className={cn("text-sm truncate", !email.is_read ? "font-bold" : "font-normal")}>{email.from}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm truncate", !email.is_read ? "font-bold" : "font-normal")}>
                      {email.subject || "(no subject)"}
                      {email.body && <span className="font-normal text-gray-500"> — {email.body.slice(0, 80)}</span>}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">{email.date?.slice(5, 10)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Compose Window */}
      {showCompose && (
        <div className="fixed bottom-0 right-4 md:right-8 w-full max-w-md bg-white rounded-t-lg shadow-2xl z-50 flex flex-col" style={{ height: "70vh" }}>
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-white rounded-t-lg">
            <span className="text-sm font-medium">New Message</span>
            <div className="flex items-center gap-2">
              <button className="p-1 hover:bg-white/10 rounded"><Minus className="w-4 h-4" /></button>
              <button onClick={() => setShowCompose(false)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 flex flex-col p-4 gap-2 overflow-y-auto">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="w-full text-sm border-b border-gray-200 pb-2 outline-none" />
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full text-sm border-b border-gray-200 pb-2 outline-none" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." className="flex-1 text-sm outline-none resize-none" />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded"><Paperclip className="w-4 h-4 text-gray-600" /></button>
            </div>
            <button onClick={handleSend} className="px-6 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2" style={{ background: GMAIL_BLUE }}>
              <Send className="w-4 h-4" /> Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
