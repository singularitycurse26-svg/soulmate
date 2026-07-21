import { Mail, Phone, Users, Bot, Shield, Construction } from "lucide-react";

export function PlaceholderPage({ title, icon: Icon, desc }: { title: string; icon: any; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl bg-bg-alt flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-accent" />
      </div>
      <h2 className="text-xl font-bold mb-2">{title}</h2>
      <p className="text-muted text-sm max-w-sm">{desc}</p>
      <div className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Construction className="w-4 h-4" />
        Coming in a future phase
      </div>
    </div>
  );
}

export function EmailPage() {
  return <PlaceholderPage title="Email" icon={Mail} desc="Send and receive emails with your personal Soulmate OS email address. AI-powered summaries, drafts, and organization." />;
}

export function PhonePage() {
  return <PlaceholderPage title="Phone & SMS" icon={Phone} desc="Make calls, send texts, and manage voicemail with your personal phone number. WebRTC calling built in." />;
}

export function ContactsPage() {
  return <PlaceholderPage title="Contacts" icon={Users} desc="Manage your contacts with photos, notes, groups, and cross-device sync. Click to email, call, text, or send crypto." />;
}

export function AIPage() {
  return <PlaceholderPage title="AI Assistant" icon={Bot} desc="Connect your own LLM (OpenAI, Ollama, local). AI can summarize emails, draft replies, transcribe voicemail, and manage your communications." />;
}

export function SecurityPage() {
  return <PlaceholderPage title="Security" icon={Shield} desc="Manage login settings, fingerprint unlock, connected AI apps, API keys, and permissions." />;
}
