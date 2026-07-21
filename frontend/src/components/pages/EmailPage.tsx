import { useState, useEffect } from "react";
import { emailApi } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  Mail, Send, Inbox, PenSquare, X, Loader2, CheckCircle, AlertCircle,
} from "lucide-react";

interface EmailItem {
  id: number;
  from: string;
  subject: string;
  is_read: boolean;
  date: string;
}

export function EmailPage() {
  const { showAlert } = useStore();
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [inbox, setInbox] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"inbox" | "compose" | "read">("inbox");
  const [currentEmail, setCurrentEmail] = useState<any>(null);
  const [settingUp, setSettingUp] = useState(false);

  // Compose form
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const loadAccount = async () => {
    try {
      const data = await emailApi.account();
      if (data.email_address) {
        setEmailAddress(data.email_address);
        const inboxData = await emailApi.inbox();
        setInbox(inboxData.emails || []);
      }
    } catch (e: any) {
      // Not set up yet
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
      // Update read status in list
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
      setTo(""); setSubject(""); setBody("");
      setView("inbox");
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  // No email account set up yet
  if (!emailAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
          <Mail className="w-8 h-8 text-accent" />
        </div>
        <h3 className="text-xl font-bold mb-2">Set Up Your Email</h3>
        <p className="text-muted text-sm max-w-sm mb-6">
          Get your personal Soulmate OS email address. Send and receive emails right from the app.
        </p>
        <button onClick={handleSetup} disabled={settingUp} className="btn-primary flex items-center gap-2">
          {settingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
          {settingUp ? "Creating..." : "Create Email Account"}
        </button>
        <p className="text-xs text-muted mt-4">
          Your address will be username@191.44.121.29.sslip.io
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Email</h2>
          <p className="text-muted text-sm mt-1 font-mono">{emailAddress}</p>
        </div>
        <button onClick={() => setView("compose")} className="btn-primary flex items-center gap-2">
          <PenSquare className="w-4 h-4" /> Compose
        </button>
      </div>

      {/* Inbox view */}
      {view === "inbox" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted mb-2">
            <Inbox className="w-4 h-4" /> Inbox ({inbox.length})
          </div>
          {inbox.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-12 h-12 text-muted mx-auto mb-3" />
              <p className="text-muted">No emails yet. Your inbox is empty.</p>
            </div>
          ) : (
            inbox.map((email) => (
              <button
                key={email.id}
                onClick={() => handleRead(email.id)}
                className={cn(
                  "card w-full text-left flex items-center gap-3 hover:border-accent transition-all",
                  !email.is_read && "border-accent/30"
                )}
              >
                <div className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  email.is_read ? "bg-transparent" : "bg-accent"
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn("truncate", !email.is_read && "font-bold")}>
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="text-xs text-muted truncate">From: {email.from}</p>
                </div>
                <span className="text-xs text-muted flex-shrink-0">{email.date}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Compose view */}
      {view === "compose" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">New Email</h3>
            <button onClick={() => setView("inbox")} className="text-muted hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <label className="label">To</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" className="w-full" />

          <label className="label">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full" />

          <label className="label">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message..." className="w-full h-40" />

          <button onClick={handleSend} className="btn-primary flex items-center gap-2">
            <Send className="w-4 h-4" /> Send Email
          </button>
        </div>
      )}

      {/* Read view */}
      {view === "read" && currentEmail && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setView("inbox")} className="text-muted hover:text-white text-sm">
              ← Back to Inbox
            </button>
          </div>

          <div className="card">
            <h3 className="text-lg font-bold mb-2">{currentEmail.subject || "(no subject)"}</h3>
            <div className="space-y-1 text-sm text-muted mb-4">
              <p>From: {currentEmail.from}</p>
              <p>To: {currentEmail.to}</p>
              <p>Date: {currentEmail.date}</p>
            </div>
            <div className="border-t border-border pt-4 whitespace-pre-wrap text-sm">
              {currentEmail.body || "(empty body)"}
            </div>
          </div>

          <button
            onClick={() => {
              setTo(currentEmail.from);
              setSubject("Re: " + (currentEmail.subject || ""));
              setBody("");
              setView("compose");
            }}
            className="btn-secondary flex items-center gap-2"
          >
            <PenSquare className="w-4 h-4" /> Reply
          </button>
        </div>
      )}
    </div>
  );
}
