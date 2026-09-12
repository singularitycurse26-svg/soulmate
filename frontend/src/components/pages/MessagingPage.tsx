import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { messagingApi, telegramBridgeApi, mcpApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { registerPageActions } from "@/lib/acelineRegistry";
import { PageHeader } from "@/components/layout/PageShell";
import { useActivity } from "@/lib/useActivity";
import {
  MessageSquare, Send, Phone, Zap, CheckCircle, XCircle,
  Loader2, RefreshCw, QrCode, AlertTriangle, Server, Bot,
  MessageCircle, Radio,
} from "lucide-react";

interface MessagingApp {
  name: string;
  display_name: string;
  enabled: boolean;
  connected: boolean;
  status: string;
  requires_qr: boolean;
  qr_code: string;
  phone_number: string;
  capabilities: string[];
  last_error: string;
}

interface TelegramBridgeStatus {
  initialized: boolean;
  telegram_enabled: boolean;
  bot_configured: boolean;
  uma_available: boolean;
  observer_available: boolean;
}

const APP_ICONS: Record<string, any> = {
  telegram: Send,
  whatsapp: Phone,
  wechat: MessageCircle,
  signal: Radio,
};

export function MessagingPage() {
  const showAlert = useStore((s) => s.showAlert);
  const { track, trackClick } = useActivity("messaging");
  const [apps, setApps] = useState<MessagingApp[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<TelegramBridgeStatus | null>(null);
  const [mcpTools, setMcpTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [sendForm, setSendForm] = useState({ app: "auto", recipient: "", content: "" });
  const [sending, setSending] = useState(false);
  const [received, setReceived] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [appsData, bridgeData, toolsData] = await Promise.all([
        messagingApi.apps().catch(() => ({ apps: [] })),
        telegramBridgeApi.status().catch(() => null),
        mcpApi.tools().catch(() => ({ result: { tools: [] } })),
      ]);
      setApps(appsData?.apps || []);
      if (bridgeData) setBridgeStatus(bridgeData);
      setMcpTools(toolsData?.result?.tools || []);
    } catch (e: any) {
      showAlert("danger", `Failed to load messaging data: ${e.message}`);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const connectApp = useCallback(async (appName: string) => {
    setConnecting(appName);
    trackClick(`connect-${appName}`);
    try {
      const credentials: Record<string, any> = {};
      if (appName === "telegram") {
        const token = prompt("Enter Telegram Bot Token:");
        if (token) credentials.bot_token = token;
      } else if (appName === "signal") {
        const phone = prompt("Enter your Signal phone number (e.g. +1234567890):");
        if (phone) credentials.phone_number = phone;
      }
      const result = await messagingApi.connect(appName, credentials);
      showAlert(
        result.status === "connected" || result.status === "connecting" ? "success" : "danger",
        result.message || `App ${appName}: ${result.status}`
      );
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Connect failed: ${e.message}`);
    }
    setConnecting(null);
  }, [showAlert, loadAll, trackClick]);

  const disconnectApp = useCallback(async (appName: string) => {
    trackClick(`disconnect-${appName}`);
    try {
      await messagingApi.disconnect(appName);
      showAlert("info", `Disconnected from ${appName}`);
      loadAll();
    } catch (e: any) {
      showAlert("danger", `Disconnect failed: ${e.message}`);
    }
  }, [showAlert, loadAll, trackClick]);

  const sendMessage = useCallback(async () => {
    if (!sendForm.recipient || !sendForm.content) {
      showAlert("warning", "Recipient and content are required");
      return;
    }
    setSending(true);
    track("command", "send_message", sendForm.app);
    try {
      const result = await messagingApi.send(
        sendForm.app, sendForm.recipient, sendForm.content
      );
      if (result.status === "sent") {
        showAlert("success", `Message sent (ID: ${result.message_id})`);
        setSendForm({ ...sendForm, content: "" });
      } else {
        showAlert("danger", result.message || "Send failed");
      }
    } catch (e: any) {
      showAlert("danger", `Send failed: ${e.message}`);
    }
    setSending(false);
  }, [sendForm, showAlert, track]);

  const receiveMessages = useCallback(async () => {
    trackClick("receive-messages");
    try {
      const result = await messagingApi.receive("all", "", 50);
      const allMessages: any[] = [];
      for (const [app, msgs] of Object.entries(result)) {
        if (Array.isArray(msgs)) {
          allMessages.push(...msgs.map((m: any) => ({ ...m, app })));
        }
      }
      setReceived(allMessages);
      if (allMessages.length === 0) {
        showAlert("info", "No new messages");
      }
    } catch (e: any) {
      showAlert("danger", `Receive failed: ${e.message}`);
    }
  }, [showAlert, trackClick]);

  const loadChats = useCallback(async () => {
    trackClick("load-chats");
    try {
      const result = await messagingApi.chats("all");
      const allChats: any[] = [];
      for (const [app, chatList] of Object.entries(result)) {
        if (Array.isArray(chatList)) {
          allChats.push(...chatList.map((c: any) => ({ ...c, app })));
        }
      }
      setChats(allChats);
    } catch (e: any) {
      showAlert("danger", `Load chats failed: ${e.message}`);
    }
  }, [showAlert, trackClick]);

  // Register Aceline actions
  useEffect(() => {
    registerPageActions("messaging", [
      {
        id: "send-message",
        label: "Send message",
        description: "Send a message to any connected messaging app",
        category: "control",
        readState: () => ({ apps, sendForm }),
        execute: async () => {
          if (sendForm.recipient && sendForm.content) {
            return await messagingApi.send(sendForm.app, sendForm.recipient, sendForm.content);
          }
          return "Provide recipient and content";
        },
      },
      {
        id: "receive-messages",
        label: "Receive messages",
        description: "Check for new messages from all apps",
        category: "read",
        execute: async () => await messagingApi.receive("all", "", 50),
      },
      {
        id: "list-apps",
        label: "List messaging apps",
        description: "List all connected messaging apps",
        category: "read",
        execute: async () => await messagingApi.apps(),
      },
    ]);
  }, [apps, sendForm]);

  return (
    <div className="space-y-4 animate-fade-in">
      <PageHeader
        icon={MessageSquare}
        title="Messaging Center"
        subtitle="Universal Messaging Adapter — Telegram, WhatsApp, WeChat, Signal + MCP"
        actions={
          <button onClick={loadAll} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        }
      />

      {/* Connected Apps */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Connected Apps</h3>
          <span className="text-xs text-muted-foreground">({apps.length})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {apps.map((app) => {
            const Icon = APP_ICONS[app.name] || MessageSquare;
            return (
              <div key={app.name} className={cn("rounded-lg p-3", app.connected ? "bg-green-400/10" : "bg-bg-secondary")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-5 h-5", app.connected ? "text-green-400" : "text-muted-foreground")} />
                    <div>
                      <div className="text-sm font-medium">{app.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {app.connected ? "Connected" : app.status}
                        {app.phone_number && ` · ${app.phone_number}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {app.connected ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <button
                          onClick={() => disconnectApp(app.name)}
                          className="btn-secondary text-xs px-2 py-1"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <>
                        {app.status === "error" && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                        {app.requires_qr && <QrCode className="w-4 h-4 text-blue-400" />}
                        <button
                          onClick={() => connectApp(app.name)}
                          disabled={connecting === app.name}
                          className="btn-primary text-xs px-2 py-1 flex items-center gap-1"
                        >
                          {connecting === app.name && <Loader2 className="w-3 h-3 animate-spin" />}
                          Connect
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {app.last_error && (
                  <div className="mt-2 text-xs text-red-400">{app.last_error}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Send Message */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Send className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Send Message</h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">App</label>
              <select
                value={sendForm.app}
                onChange={(e) => setSendForm({ ...sendForm, app: e.target.value })}
                className="input text-sm w-full"
              >
                <option value="auto">Auto (best available)</option>
                {apps.filter(a => a.connected).map(a => (
                  <option key={a.name} value={a.name}>{a.display_name}</option>
                ))}
                {apps.filter(a => !a.connected).map(a => (
                  <option key={a.name} value={a.name} disabled>{a.display_name} (not connected)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Recipient</label>
              <input
                type="text"
                value={sendForm.recipient}
                onChange={(e) => setSendForm({ ...sendForm, recipient: e.target.value })}
                placeholder="@username, +1234567890, or chat ID"
                className="input text-sm w-full"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Content</label>
              <input
                type="text"
                value={sendForm.content}
                onChange={(e) => setSendForm({ ...sendForm, content: e.target.value })}
                placeholder="Message content"
                className="input text-sm w-full"
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
            </div>
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !sendForm.recipient || !sendForm.content}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Message
          </button>
        </div>
      </div>

      {/* Received Messages & Chats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold">Received Messages</h3>
            </div>
            <button onClick={receiveMessages} className="btn-secondary text-xs px-2 py-1">
              Check
            </button>
          </div>
          {received.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No messages. Click "Check" to fetch new messages.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {received.map((msg, i) => (
                <div key={i} className="p-2 rounded-lg bg-bg-secondary text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-blue-400">{msg.app}</span>
                    <span className="text-muted-foreground">
                      {new Date(msg.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-foreground">From: </span>
                    {msg.sender}
                  </div>
                  <div className="mt-0.5">{msg.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-semibold">Active Chats</h3>
            </div>
            <button onClick={loadChats} className="btn-secondary text-xs px-2 py-1">
              Load
            </button>
          </div>
          {chats.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 text-center">
              No chats loaded. Click "Load" to fetch active chats.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {chats.map((chat, i) => (
                <div key={i} className="p-2 rounded-lg bg-bg-secondary text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{chat.name || chat.id}</span>
                    <span className="text-blue-400">{chat.app}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Telegram Bridge Status */}
      {bridgeStatus && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">Telegram-Aceline Bridge</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground">Initialized</div>
              <div className={cn("font-bold", bridgeStatus.initialized ? "text-green-400" : "text-red-400")}>
                {bridgeStatus.initialized ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Telegram Enabled</div>
              <div className={cn("font-bold", bridgeStatus.telegram_enabled ? "text-green-400" : "text-red-400")}>
                {bridgeStatus.telegram_enabled ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Bot Configured</div>
              <div className={cn("font-bold", bridgeStatus.bot_configured ? "text-green-400" : "text-red-400")}>
                {bridgeStatus.bot_configured ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">UMA Available</div>
              <div className={cn("font-bold", bridgeStatus.uma_available ? "text-green-400" : "text-red-400")}>
                {bridgeStatus.uma_available ? "Yes" : "No"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MCP Tools */}
      {mcpTools.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold">MCP Tools (Model Context Protocol)</h3>
            <span className="text-xs text-muted-foreground">({mcpTools.length})</span>
          </div>
          <div className="space-y-2">
            {mcpTools.map((tool, i) => (
              <div key={i} className="p-2 rounded-lg bg-bg-secondary text-xs">
                <div className="font-medium text-purple-400">{tool.name}</div>
                <div className="text-muted-foreground mt-0.5">{tool.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
