import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useStore } from "@/lib/store";
import { useTranslation } from "react-i18next";
import { smsApi, aiApi } from "@/lib/api";
import { cn, copyToClipboard, shortenAddress, formatBalance } from "@/lib/utils";
import { WalkieTalkie } from "@/components/phone/WalkieTalkie";
import { TranslatedMessage } from "@/components/TranslatedMessage";
import {
  Phone,
  Send,
  MessageSquare,
  ArrowLeft,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageCircle,
  Mail,
  Crown,
  Smartphone,
  Radio,
  Coins,
  Copy,
  Check,
  Wallet,
  DollarSign,
  User,
  Lock,
  Settings,
  Edit3,
  Globe,
  Hash,
  Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Crypto constants (same as WalletPage)
const BSC_RPC = "https://bsc-dataseed.binance.org";
const FEE_PERCENT = 0.005;
const FEE_WALLET = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];
const API_BASE = "http://191.44.121.29:8546";

interface SmsStatus {
  allowed: boolean;
  status: string;
  detail: string;
  trial_days: number;
  price_inc: number;
  assigned_number: string | null;
  telegram_connected: boolean;
  telegram_username: string | null;
  preferred_method: string;
  carriers: string[];
}

interface SmsProfile {
  first_name: string;
  last_name: string;
  phone_number: string;
  display_name_type: string;
  wallet_tag: string;
  texting_unlocked: boolean;
}

interface Conversation {
  id: number;
  phone: string;
  name: string | null;
  last_message: string;
  last_at: string;
  unread: number;
}

interface Message {
  id: number;
  from: string | null;
  to: string;
  body: string;
  direction: string;
  status: string;
  date: string;
}

type PhoneTab = "texting" | "walkie" | "whatsapp" | "telegram" | "crypto";
type PhoneView = "main" | "compose" | "conversation" | "subscribe" | "telegram" | "profile-setup" | "profile-settings";

export function PhonePage() {
  const { showAlert, walletAddress, walletKey, pendingTextPhone, setPendingTextPhone, language, translationEnabled, setTranslationEnabled } = useStore();
  const { t } = useTranslation();
  const [tab, setTab] = useState<PhoneTab>("texting");
  const [view, setView] = useState<PhoneView>("main");
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [profile, setProfile] = useState<SmsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activePhone, setActivePhone] = useState("");

  // Compose form
  const [toNumber, setToNumber] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [carrier, setCarrier] = useState("att");
  const [method, setMethod] = useState("email");
  const [sending, setSending] = useState(false);

  // Subscribe form
  const [txHash, setTxHash] = useState("");
  const [subscribing, setSubscribing] = useState(false);

  // Telegram
  const [botUsername, setBotUsername] = useState("");

  // WhatsApp
  const [waPhone, setWaPhone] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waConversations, setWaConversations] = useState<{ id: number; phone: string; name: string; last_message: string; last_at: string; unread: number }[]>([]);
  const [waActiveChat, setWaActiveChat] = useState<string | null>(null);
  const [waMessages, setWaMessages] = useState<Message[]>([]);
  const [waView, setWaView] = useState<"list" | "chat">("list");

  // Telegram
  const [tgConversations, setTgConversations] = useState<{ id: number; username: string; name: string; last_message: string; last_at: string; unread: number }[]>([]);
  const [tgActiveChat, setTgActiveChat] = useState<string | null>(null);
  const [tgMessages, setTgMessages] = useState<Message[]>([]);
  const [tgView, setTgView] = useState<"list" | "chat">("list");
  const [tgMessageBody, setTgMessageBody] = useState("");

  // Texting number display
  const [myTextNumber, setMyTextNumber] = useState("");
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI Auto-Reply
  const lastManualSendRef = useRef<Record<string, number>>({});
  const lastMessageCountRef = useRef<Record<string, number>>({});
  const aiReplyingRef = useRef<Record<string, boolean>>({});
  const [aiReplying, setAiReplying] = useState(false);
  const aiSentMessagesRef = useRef<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const convoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Buy INC — Google Pay & saved cards
  const [incBuyAmount, setIncBuyAmount] = useState("50");
  const [incProcessing, setIncProcessing] = useState(false);
  const [incSavedCards, setIncSavedCards] = useState<any[]>([]);
  const [incShowNewCard, setIncShowNewCard] = useState(false);
  const [incCardNumber, setIncCardNumber] = useState("");
  const [incCardExpiry, setIncCardExpiry] = useState("");
  const [incCardCvc, setIncCardCvc] = useState("");
  const [incSaveCard, setIncSaveCard] = useState(false);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [displayNameType, setDisplayNameType] = useState<"real" | "tag">("real");
  const [walletTag, setWalletTag] = useState("");
  const [userTags, setUserTags] = useState<any[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  // INC Crypto
  const [incBalance, setIncBalance] = useState("0");
  const [incUsdValue, setIncUsdValue] = useState("0");
  const [cryptoTo, setCryptoTo] = useState("");
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [cryptoSending, setCryptoSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const cryptoProviderRef = useRef<ethers.JsonRpcProvider | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [statusData, profileData] = await Promise.all([
        smsApi.status(),
        smsApi.getProfile(),
      ]);
      setStatus(statusData);
      if (profileData.profile) {
        setProfile(profileData.profile);
        setFirstName(profileData.profile.first_name);
        setLastName(profileData.profile.last_name);
        setPhoneNumber(profileData.profile.phone_number);
        setDisplayNameType(profileData.profile.display_name_type as "real" | "tag");
        setWalletTag(profileData.profile.wallet_tag || "");
      }
      if (statusData.allowed) {
        const convos = await smsApi.conversations();
        setConversations(convos.conversations || []);
      }
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle pending text from contacts click
  useEffect(() => {
    if (pendingTextPhone) {
      setTab("texting");
      setActivePhone(pendingTextPhone);
      loadMessages(pendingTextPhone);
      setView("conversation");
      setPendingTextPhone("");
    }
  }, [pendingTextPhone]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load texting number from localStorage or profile
  useEffect(() => {
    const saved = localStorage.getItem("soulmate_text_number");
    if (saved) setMyTextNumber(saved);
  }, []);

  // Load saved cards from localStorage (shared with WalletPage)
  useEffect(() => {
    const cards = JSON.parse(localStorage.getItem("soulmate_saved_cards") || "[]");
    setIncSavedCards(cards);
  }, []);

  // Load user tags for profile display name selector
  useEffect(() => {
    if (walletAddress && view === "profile-setup") {
      fetch(`${API_BASE}/v1/tags/search?q=`, { headers: { "X-API-Token": "soulmate_wallet_2024" } })
        .then((r) => r.json())
        .then((data) => {
          setUserTags((data.tags || []).filter((t: any) => t.address?.toLowerCase() === walletAddress.toLowerCase()));
        })
        .catch(() => {});
    }
  }, [walletAddress, view]);

  // Load INC balance
  const loadIncBalance = useCallback(async () => {
    if (!walletAddress) return;
    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      cryptoProviderRef.current = provider;
      const healthResp = await fetch(`${API_BASE}/v1/health`);
      const health = await healthResp.json();
      const incAddress = health.inc_contract_address;
      if (incAddress) {
        const contract = new ethers.Contract(incAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(walletAddress);
        const decimals = await contract.decimals();
        setIncBalance(formatBalance(ethers.formatUnits(balance, decimals)));
        setIncUsdValue("0.00");
      } else {
        setIncBalance("0");
        setIncUsdValue("0.00");
      }
    } catch {
      setIncBalance("0");
    }
  }, [walletAddress]);

  useEffect(() => {
    if (tab === "crypto") loadIncBalance();
  }, [tab, loadIncBalance]);

  const loadMessages = async (phone: string) => {
    try {
      const data = await smsApi.messages(phone);
      setMessages(data.messages || []);
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSend = async () => {
    if (!toNumber.trim()) return showAlert("danger", t("phone:enterPhoneNumber"));
    if (!messageBody.trim()) return showAlert("danger", t("phone:enterMessage"));
    if (messageBody.length > 160) return showAlert("danger", t("phone:messageTooLong"));
    setSending(true);
    try {
      await smsApi.send(toNumber, messageBody, carrier, method);
      showAlert("success", `Text sent via ${method}!`);
      const sentTo = toNumber;
      lastManualSendRef.current[sentTo] = Date.now();
      setToNumber("");
      setMessageBody("");
      loadStatus();
      if (view === "main") {
        setActivePhone(sentTo);
        loadMessages(sentTo);
        setView("conversation");
      }
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setSending(false);
    }
  };

  // AI Auto-Reply: generate a reply using the AI assistant with persistent memory
  const generateAIReply = async (incomingMessage: string, phone: string): Promise<string | null> => {
    try {
      const userName = profile?.first_name || "me";
      let memoryContext = "";
      try {
        const memData = await aiApi.memories();
        const memories = memData.memories || [];
        const relevant = memories.filter((m: any) =>
          m.content?.toLowerCase().includes(phone.toLowerCase()) ||
          m.content?.toLowerCase().includes("text") ||
          m.content?.toLowerCase().includes("sms") ||
          m.type === "conversation" ||
          m.type === "fact" ||
          m.type === "preference"
        ).slice(0, 10);
        if (relevant.length > 0) {
          memoryContext = relevant.map((m: any) => `- ${m.content}`).join("\n");
        }
      } catch {}
      const prompt = memoryContext
        ? `You are ${userName} texting someone. Here's what you remember:\n${memoryContext}\n\nSomeone just texted you: "${incomingMessage}"\nReply as ${userName} in a casual, natural, short text message (under 160 chars). Don't mention AI or assistants. Just reply naturally. Keep it conversational and friendly.`
        : `Someone texted you this message: "${incomingMessage}". Reply as ${userName} in a casual, natural, short text message (under 160 chars). Don't mention AI or assistants. Just reply naturally as ${userName} would text back. Keep it conversational and friendly.`;
      const data = await aiApi.chat(prompt);
      const reply = data.response?.slice(0, 160) || null;
      if (reply) {
        try {
          aiApi.storeMemory("conversation", `Text exchange with ${phone}: They said "${incomingMessage.slice(0, 80)}", you replied "${reply.slice(0, 80)}"`, 0.5);
        } catch {}
      }
      return reply;
    } catch (e) {
      return null;
    }
  };

  // AI Auto-Reply: check for new incoming messages and auto-reply
  const checkForNewMessages = async (phone: string) => {
    if (aiReplyingRef.current[phone]) return;
    try {
      const data = await smsApi.messages(phone);
      const newMessages = data.messages || [];
      const prevCount = lastMessageCountRef.current[phone] || 0;

      if (newMessages.length > prevCount) {
        setMessages(newMessages);
        const newIncoming = newMessages.filter(
          (m: Message) => m.direction === "in" && newMessages.indexOf(m) >= prevCount
        );

        if (newIncoming.length > 0) {
          const lastManual = lastManualSendRef.current[phone] || 0;
          const elapsed = Date.now() - lastManual;

          if (elapsed >= 180000) {
            // 3 minutes passed — AI auto-reply
            aiReplyingRef.current[phone] = true;
            setAiReplying(true);
            const latestIncoming = newIncoming[newIncoming.length - 1];
            const aiReply = await generateAIReply(latestIncoming.body, phone);
            if (aiReply) {
              aiSentMessagesRef.current.add(aiReply);
              await smsApi.send(phone, aiReply, carrier, method);
              const refreshed = await smsApi.messages(phone);
              setMessages(refreshed.messages || []);
              lastMessageCountRef.current[phone] = (refreshed.messages || []).length;
            } else {
              lastMessageCountRef.current[phone] = newMessages.length;
            }
            aiReplyingRef.current[phone] = false;
            setAiReplying(false);
          } else {
            lastMessageCountRef.current[phone] = newMessages.length;
          }
        } else {
          lastMessageCountRef.current[phone] = newMessages.length;
        }
      }
    } catch (e) {
      // silent fail for polling
    }
  };

  // Poll for new messages when in conversation view
  useEffect(() => {
    if (view === "conversation" && activePhone && status?.allowed) {
      // Initialize message count
      if (lastMessageCountRef.current[activePhone] === undefined) {
        lastMessageCountRef.current[activePhone] = messages.length;
      }
      pollRef.current = setInterval(() => {
        checkForNewMessages(activePhone);
      }, 5000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [view, activePhone, status?.allowed]);

  // Poll for conversation list updates when on main view
  useEffect(() => {
    if (view === "main" && tab === "texting" && status?.allowed) {
      convoPollRef.current = setInterval(async () => {
        try {
          const convos = await smsApi.conversations();
          setConversations(convos.conversations || []);
        } catch (e) {
          // silent
        }
      }, 10000);

      return () => {
        if (convoPollRef.current) clearInterval(convoPollRef.current);
      };
    }
  }, [view, tab, status?.allowed]);

  const handleSubscribe = async () => {
    if (!txHash.trim()) return showAlert("danger", "Enter your INC transaction hash after sending payment");
    setSubscribing(true);
    try {
      await smsApi.subscribe(txHash);
      showAlert("success", "Communications subscription activated!");
      setTxHash("");
      setView("main");
      loadStatus();
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setSubscribing(false);
    }
  };

  const handleConnectTelegram = async () => {
    try {
      const data = await smsApi.connectTelegram();
      setBotUsername(data.bot_username);
      showAlert("info", `Send a message to @${data.bot_username} on Telegram to connect`);
    } catch (e: any) {
      showAlert("danger", e.message);
    }
  };

  const handleSaveProfile = async () => {
    if (!firstName.trim()) return showAlert("danger", "First name is required");
    if (!lastName.trim()) return showAlert("danger", "Last name is required");
    if (!phoneNumber.trim()) return showAlert("danger", "Phone number is required");
    if (!homeAddress.trim()) return showAlert("danger", "Home address is required");
    setSavingProfile(true);
    try {
      await smsApi.saveProfile({
        first_name: firstName, last_name: lastName, phone_number: phoneNumber,
        home_address: homeAddress, display_name_type: displayNameType,
        wallet_tag: displayNameType === "tag" ? walletTag : "",
      });
      showAlert("success", "Profile saved! Communications unlocked.");
      setView("main");
      loadStatus();
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSendInc = async () => {
    if (!walletKey) return showAlert("danger", "Wallet not loaded");
    if (!cryptoTo.trim()) return showAlert("danger", "Enter recipient @tag or address");
    if (!cryptoAmount.trim()) return showAlert("danger", "Enter amount");
    setCryptoSending(true);
    try {
      const provider = cryptoProviderRef.current || new ethers.JsonRpcProvider(BSC_RPC);
      const wallet = new ethers.Wallet(walletKey, provider);
      let recipientAddress = cryptoTo.trim();
      if (recipientAddress.startsWith("@")) {
        const resp = await fetch(`${API_BASE}/v1/tags/${recipientAddress.substring(1)}`);
        if (!resp.ok) { showAlert("danger", `Tag ${recipientAddress} not found`); setCryptoSending(false); return; }
        const data = await resp.json();
        recipientAddress = data.address;
      }
      if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
        showAlert("danger", "Invalid recipient address"); setCryptoSending(false); return;
      }
      const healthResp = await fetch(`${API_BASE}/v1/health`);
      const health = await healthResp.json();
      const incAddress = health.inc_contract_address;
      if (!incAddress) { showAlert("danger", "INC contract not configured"); setCryptoSending(false); return; }
      const contract = new ethers.Contract(incAddress, ERC20_ABI, wallet);
      const decimals = await contract.decimals();
      const sendAmount = parseFloat(cryptoAmount);
      const feeAmount = sendAmount * FEE_PERCENT;
      const recipientGets = sendAmount - feeAmount;
      const value = ethers.parseUnits(recipientGets.toString(), decimals);
      const tx = await contract.transfer(recipientAddress, value);
      if (feeAmount > 0) {
        const feeValue = ethers.parseUnits(feeAmount.toString(), decimals);
        await contract.transfer(FEE_WALLET, feeValue);
      }
      showAlert("success", `Sent ${recipientGets.toFixed(6)} INC (fee: ${feeAmount.toFixed(6)}) Hash: ${tx.hash.slice(0, 20)}...`);
      setCryptoTo(""); setCryptoAmount("");
      loadIncBalance();
    } catch (e: any) {
      showAlert("danger", "Transaction failed: " + e.message);
    } finally {
      setCryptoSending(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    copyToClipboard(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]" style={{ background: "#F3F4F6" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1A73E8" }} />
      </div>
    );
  }

  const needsProfile = !profile && status?.status !== "founder";

  return (
    <div className="min-h-screen -mx-4 -my-4 md:-mx-8 md:-my-8 flex flex-col" style={{ background: "#F3F4F6", color: "#202124" }}>
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
        <h2 className="text-xl font-bold" style={{ color: "#1A73E8" }}>Messages</h2>
        <div className="flex items-center gap-2">
          {profile && <button onClick={() => setView("profile-settings")} className="p-2 rounded-full hover:bg-gray-100"><Settings className="w-5 h-5 text-gray-600" /></button>}
        </div>
      </div>

      {/* Profile Gate */}
      {needsProfile && view !== "profile-setup" && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "#1A73E815" }}>
            <Lock className="w-8 h-8" style={{ color: "#1A73E8" }} />
          </div>
          <p className="font-bold text-lg">Complete Your Profile</p>
          <p className="text-sm text-gray-500 mt-1 mb-4 max-w-sm">Fill out your identity to unlock texting, walkie-talkie, and crypto. Free for 1 year.</p>
          <button onClick={() => setView("profile-setup")} className="px-6 py-3 rounded-lg text-white font-medium flex items-center gap-2" style={{ background: "#1A73E8" }}>
            <User className="w-4 h-4" /> Set Up Profile
          </button>
        </div>
      )}

      {/* Profile Setup Form */}
      {view === "profile-setup" && (
        <div className="max-w-md mx-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="p-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold">Profile Setup</h3>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div><label className="block text-xs font-medium text-gray-500 mb-1">First Name *</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Last Name *</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Real Phone Number *</label><input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+1 555 000 0000" className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm" /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">Home Address * <span className="text-gray-400">(private — never shared)</span></label><textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} placeholder="123 Main St, City, State, ZIP" className="w-full h-20 p-3 border border-gray-300 rounded-lg outline-none focus:border-blue-500 text-sm resize-none" style={{ userSelect: "text" }} /></div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Display Name (shown to text recipients)</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDisplayNameType("real")} className={cn("flex items-center justify-center gap-2 py-3 rounded-lg text-sm transition-all", displayNameType === "real" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                  <User className="w-4 h-4" /> Real Name
                </button>
                <button onClick={() => setDisplayNameType("tag")} className={cn("flex items-center justify-center gap-2 py-3 rounded-lg text-sm transition-all", displayNameType === "tag" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}>
                  <MessageSquare className="w-4 h-4" /> @Tag
                </button>
              </div>
            </div>
            {displayNameType === "tag" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Your Wallet Tag</label>
                {userTags.length > 0 ? (
                  <select value={walletTag} onChange={(e) => setWalletTag(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none">
                    <option value="">Select a tag...</option>
                    {userTags.map((t) => <option key={t.tag} value={t.tag}>@{t.tag}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-gray-400">No wallet tags found. Create one in the Wallet page first, or use your real name.</p>
                )}
              </div>
            )}
            <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-600">
              <p className="font-medium text-gray-800 mb-1">Privacy:</p>
              <p>Your display name ({displayNameType === "real" ? `${firstName || "First"} ${lastName || "Last"}` : walletTag ? `@${walletTag}` : "@tag"}) will be shown to text recipients.</p>
              <p>Your home address is never shared. Free for 1 year, then {status?.price_inc || 1.50} INC/month.</p>
            </div>
            <button onClick={handleSaveProfile} disabled={savingProfile} className="w-full py-3 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: "#1A73E8" }}>
              {savingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {savingProfile ? "Saving..." : "Unlock Communications"}
            </button>
          </div>
        </div>
      )}

      {/* Profile Settings */}
      {view === "profile-settings" && profile && (
        <div className="max-w-md mx-auto p-4 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("main")} className="p-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold">Profile Settings</h3>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#1A73E8" }}><User className="w-5 h-5 text-white" /></div>
              <div><p className="font-medium">{profile.first_name} {profile.last_name}</p><p className="text-xs text-gray-500">{formatPhone(profile.phone_number)}</p></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Display Name Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDisplayNameType("real")} className={cn("py-3 rounded-lg text-sm", displayNameType === "real" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700")}>
                  Real Name ({profile.first_name} {profile.last_name})
                </button>
                <button onClick={() => setDisplayNameType("tag")} className={cn("py-3 rounded-lg text-sm", displayNameType === "tag" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-700")}>
                  @Tag ({profile.wallet_tag || "none"})
                </button>
              </div>
            </div>
            <button onClick={async () => {
              setSavingProfile(true);
              try {
                await smsApi.saveProfile({ first_name: firstName, last_name: lastName, phone_number: phoneNumber, home_address: homeAddress || "stored", display_name_type: displayNameType, wallet_tag: displayNameType === "tag" ? walletTag : "" });
                showAlert("success", "Settings updated!"); loadStatus(); setView("main");
              } catch (e: any) { showAlert("danger", e.message); } finally { setSavingProfile(false); }
            }} disabled={savingProfile} className="w-full py-3 rounded-lg text-white font-bold text-sm" style={{ background: "#1A73E8" }}>{savingProfile ? "Saving..." : "Save Settings"}</button>
          </div>
        </div>
      )}

      {/* Main content — only if profile exists or founder */}
      {!needsProfile && view !== "profile-setup" && view !== "profile-settings" && (
        <>
          {/* Status banner */}
          {status && status.status === "expired" && (
            <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{status.detail}</p>
                <p className="text-xs text-red-600">{status.price_inc} INC/month</p>
              </div>
              <button onClick={() => setView("subscribe")} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: "#1A73E8" }}>Subscribe</button>
            </div>
          )}

          {/* Tab bar — Android style bottom nav */}
          <div className="sticky bottom-0 z-40 flex items-center justify-around bg-white border-t border-gray-200 py-2 px-2">
            <button onClick={() => setTab("texting")} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg", tab === "texting" ? "text-blue-600" : "text-gray-500")}>
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px] font-medium">SMS</span>
            </button>
            <button onClick={() => setTab("whatsapp")} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg", tab === "whatsapp" ? "text-[#25D366]" : "text-gray-500")}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm-2.27-5.86c-.17-.08-.34-.13-.5-.06-.15.07-.24.13-.36.27-.12.14-.4.44-.5.55-.08.08-.16.09-.3.03-.14-.06-.59-.22-1.12-.69-.41-.37-.69-.82-.77-.96-.08-.14-.01-.22.06-.29.06-.06.14-.16.21-.24.07-.08.09-.14.14-.23.05-.09.02-.17-.01-.24-.03-.06-.31-.75-.43-1.02-.11-.26-.22-.23-.31-.23h-.26c-.09 0-.23.03-.36.17-.12.14-.47.46-.47 1.12 0 .66.48 1.3.55 1.39.07.09 1.05 1.6 2.55 2.24.36.15.64.24.85.31.36.11.68.1.94.06.29-.04.88-.36 1-.71.12-.35.12-.65.09-.71-.03-.06-.11-.09-.25-.15z"/></svg>
              <span className="text-[10px] font-medium">WhatsApp</span>
            </button>
            <button onClick={() => setTab("telegram")} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg", tab === "telegram" ? "text-[#0088CC]" : "text-gray-500")}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
              <span className="text-[10px] font-medium">Telegram</span>
            </button>
            <button onClick={() => setTab("walkie")} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg", tab === "walkie" ? "text-purple-600" : "text-gray-500")}>
              <Radio className="w-5 h-5" />
              <span className="text-[10px] font-medium">Walkie</span>
            </button>
            <button onClick={() => setTab("crypto")} className={cn("flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg", tab === "crypto" ? "text-pink-600" : "text-gray-500")}>
              <Coins className="w-5 h-5" />
              <span className="text-[10px] font-medium">INC</span>
            </button>
          </div>

          {/* === TEXTING TAB === */}
          {tab === "texting" && (
            <>
              {view === "subscribe" && (
                <div className="max-w-md mx-auto p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setView("main")} className="p-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
                    <h3 className="text-lg font-bold">Subscribe</h3>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm text-center py-6">
                    <Crown className="w-10 h-10 text-yellow-500 mx-auto mb-2" />
                    <p className="font-bold text-yellow-600">Premium Communications</p>
                    <p className="text-3xl font-bold mt-2">{status?.price_inc || 1.50} INC<span className="text-sm text-gray-500 font-normal">/month</span></p>
                    <p className="text-gray-500 text-sm mt-2">Unlimited texting, walkie-talkie & crypto</p>
                  </div>
                  <div className="bg-white rounded-2xl shadow-sm p-4">
                    <h4 className="font-semibold mb-2">How to Subscribe</h4>
                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Send {status?.price_inc || 1.50} INC to: <code className="text-blue-600">{shortenAddress(FEE_WALLET)}</code></li>
                      <li>Copy your transaction hash</li>
                      <li>Paste it below and click Subscribe</li>
                    </ol>
                    <div className="flex gap-2 mt-3">
                      <input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x... transaction hash" className="flex-1 p-3 border border-gray-300 rounded-lg text-sm" style={{ userSelect: "text" }} />
                      <button onClick={handleSubscribe} disabled={subscribing} className="px-4 py-3 rounded-lg text-white text-sm font-medium" style={{ background: "#1A73E8" }}>{subscribing ? "..." : "Subscribe"}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main texting view — Android Messages style */}
              {view === "main" && status?.allowed && (
                <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
                  {/* Search bar */}
                  <div className="px-4 py-2 bg-white">
                    <div className="relative">
                      <input
                        type="tel"
                        value={toNumber}
                        onChange={(e) => setToNumber(e.target.value)}
                        placeholder="Search or start new message"
                        className="w-full pl-4 pr-4 py-2.5 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  {/* AI Auto-Reply indicator */}
                  <div className="flex items-center gap-2 text-xs text-gray-500 px-4 py-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <Bot className="w-3.5 h-3.5 text-green-500" />
                    <span>AI Auto-Reply active — will respond to incoming texts automatically</span>
                  </div>

                  {/* Your texting number */}
                  <div className="px-4 py-2">
                    <div className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#1A73E815" }}>
                        <Hash className="w-5 h-5" style={{ color: "#1A73E8" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500">Your texting number</p>
                        {editingNumber ? (
                          <div className="flex gap-2 items-center mt-1">
                            <input value={numberInput} onChange={(e) => setNumberInput(e.target.value)} placeholder="+1 555 000 0000" className="text-sm flex-1 p-2 border border-gray-300 rounded-lg" autoFocus />
                            <button onClick={() => { if (numberInput.trim()) { setMyTextNumber(numberInput.trim()); localStorage.setItem("soulmate_text_number", numberInput.trim()); setEditingNumber(false); } }} className="px-3 py-1.5 rounded-lg text-white text-xs font-medium" style={{ background: "#1A73E8" }}>Save</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-sm font-medium font-mono">{myTextNumber || (status?.assigned_number ? formatPhone(status.assigned_number) : profile?.phone_number ? formatPhone(profile.phone_number) : "Not set")}</p>
                            <button onClick={() => { setNumberInput(myTextNumber || ""); setEditingNumber(true); }} className="text-gray-400 hover:text-blue-600"><Edit3 className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Compose new message */}
                  {toNumber.trim() && (
                    <div className="px-4 py-2">
                      <div className="bg-white rounded-xl p-3 shadow-sm space-y-2">
                        {method === "email" && (
                          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg text-sm">
                            {(status?.carriers || ["att", "verizon", "tmobile", "sprint"]).map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        )}
                        <div className="flex gap-2">
                          <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder={t("phone:typeMessage")} className="flex-1 p-3 border border-gray-300 rounded-lg text-sm h-10 resize-none" maxLength={160} style={{ userSelect: "text" }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && toNumber.trim() && messageBody.trim()) { e.preventDefault(); handleSend(); } }} />
                          <span className="text-xs text-gray-400 self-center">{messageBody.length}/160</span>
                          <button onClick={() => setMethod(method === "email" ? "telegram" : "email")} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg" title={method === "email" ? "Switch to Telegram" : "Switch to Email-SMS"}>
                            {method === "email" ? <Mail className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                          </button>
                          <button onClick={handleSend} disabled={sending || !toNumber.trim() || !messageBody.trim()} className="px-4 rounded-lg flex items-center justify-center" style={{ background: "#1A73E8" }}>
                            {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Conversation list — Android Messages style */}
                  <div className="flex-1 overflow-y-auto">
                    {conversations.length > 0 ? (
                      <div className="bg-white">
                        {conversations.map((convo) => {
                          const initials = (convo.name || convo.phone || "?").charAt(0).toUpperCase();
                          const lastTime = convo.last_at?.slice(11, 16) || "";
                          return (
                            <button
                              key={convo.id}
                              onClick={() => { setActivePhone(convo.phone); loadMessages(convo.phone); setView("conversation"); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-50"
                            >
                              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #1A73E8, #4285F4)" }}>
                                <span className="text-white font-bold text-base">{initials}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium truncate">{convo.name || formatPhone(convo.phone)}</p>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{lastTime}</span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">{convo.last_message}</p>
                              </div>
                              {convo.unread > 0 && (
                                <span className="text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#1A73E8" }}>{convo.unread}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <MessageSquare className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-gray-400 text-sm">No conversations yet</p>
                        <p className="text-gray-400 text-xs mt-1">Enter a phone number above to start texting</p>
                      </div>
                    )}
                  </div>

                  {/* FAB */}
                  <button
                    onClick={() => { const input = document.querySelector('input[placeholder="Search or start new message"]') as HTMLInputElement; input?.focus(); }}
                    className="fixed bottom-20 md:bottom-20 right-6 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center z-40"
                    style={{ background: "#1A73E8" }}
                  >
                    <Plus className="w-6 h-6 text-white" />
                  </button>
                </div>
              )}

              {/* Conversation view — Android Messages chat bubbles */}
              {view === "conversation" && status?.allowed && (
                <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
                  {/* Chat header */}
                  <div className="flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 sticky top-14 z-30">
                    <button onClick={() => setView("main")} className="p-2 rounded-full hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #1A73E8, #4285F4)" }}>
                      <span className="text-white font-bold text-sm">{formatPhone(activePhone).charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{formatPhone(activePhone)}</h3>
                      {aiReplying && <span className="flex items-center gap-1 text-xs text-blue-600"><Bot className="w-3 h-3" /> AI replying...</span>}
                    </div>
                    <button
                      onClick={() => setTranslationEnabled(!translationEnabled)}
                      className={cn("p-2 rounded-full transition-colors", translationEnabled ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:bg-gray-100")}
                      title={translationEnabled ? "Auto-translate ON" : "Auto-translate OFF"}
                    >
                      <Globe className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: "#F3F4F6" }}>
                    {messages.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-8">{t("phone:typeMessage")}</p>
                    ) : messages.map((msg, i) => {
                      const prevMsg = messages[i - 1];
                      const showDate = !prevMsg || (msg.date?.slice(0, 10) !== prevMsg.date?.slice(0, 10));
                      const dateStr = msg.date?.slice(0, 10) || "";
                      const isAiReply = msg.direction === "out" && aiSentMessagesRef.current.has(msg.body);
                      return (
                        <div key={i}>
                          {showDate && (
                            <div className="text-center my-3">
                              <span className="text-xs text-gray-400 bg-gray-200 px-3 py-1 rounded-full">{dateStr}</span>
                            </div>
                          )}
                          <div className={cn("flex", msg.direction === "out" ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                                msg.direction === "out"
                                  ? "text-white rounded-br-md"
                                  : "bg-white text-gray-800 rounded-bl-md shadow-sm"
                              )}
                              style={msg.direction === "out" ? { background: "#1A73E8" } : {}}
                            >
                              {msg.direction === "out" ? (
                                <p>{msg.body}</p>
                              ) : (
                                <TranslatedMessage text={msg.body} isOwn={false} />
                              )}
                              <div className={cn("flex items-center gap-1.5 mt-1", msg.direction === "out" ? "text-white/60" : "text-gray-400")}>
                                <span>{msg.date?.slice(11, 16) || ""}</span>
                                {isAiReply && (
                                  <span className="flex items-center gap-0.5 text-[10px] bg-black/10 px-1 py-0.5 rounded">
                                    <Bot className="w-2.5 h-2.5" /> AI
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {aiReplying && (
                      <div className="flex justify-end">
                        <div className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm flex items-center gap-2" style={{ background: "#1A73E830" }}>
                          <Loader2 className="w-3 h-3 text-blue-600 animate-spin" />
                          <span className="text-blue-600 text-xs">AI typing...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick reply bar */}
                  <div className="px-3 py-2 bg-white border-t border-gray-200 flex gap-2 items-end sticky bottom-0">
                    <input
                      type="text"
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder="Text message"
                      className="flex-1 p-3 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-200"
                      maxLength={160}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter" && messageBody.trim() && !sending) { setToNumber(activePhone); handleSend(); } }}
                    />
                    <button
                      onClick={() => { setToNumber(activePhone); handleSend(); }}
                      disabled={sending || !messageBody.trim()}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#1A73E8" }}
                    >
                      {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Locked state */}
              {view === "main" && status && !status.allowed && (
                <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                  <p className="font-bold text-red-600">Communications Locked</p>
                  <p className="text-gray-500 text-sm mt-1 mb-4">{status.detail}</p>
                  <button onClick={() => setView("subscribe")} className="px-6 py-3 rounded-lg text-white font-medium" style={{ background: "#1A73E8" }}>Subscribe for {status.price_inc} INC/month</button>
                </div>
              )}
            </>
          )}

          {/* === WALKIE-TALKIE TAB === */}
          {tab === "walkie" && <WalkieTalkie />}

          {/* === WHATSAPP TAB === */}
          {tab === "whatsapp" && (
            <div className="flex-1 flex flex-col max-w-md mx-auto w-full" style={{ background: "#ECE5DD" }}>
              {waView === "list" && (
                <>
                  {/* WhatsApp header */}
                  <div className="bg-[#075E54] text-white px-4 h-14 flex items-center justify-between sticky top-14 z-30">
                    <h2 className="text-lg font-bold">WhatsApp</h2>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setWaView("chat")} className="p-2 rounded-full hover:bg-white/10"><Plus className="w-5 h-5" /></button>
                    </div>
                  </div>

                  {/* WhatsApp chat list */}
                  <div className="flex-1 overflow-y-auto bg-white">
                    {conversations.length > 0 ? (
                      conversations.map((convo) => (
                        <button
                          key={convo.id}
                          onClick={() => {
                            setWaActiveChat(convo.phone);
                            setWaView("chat");
                            setWaPhone(convo.phone);
                            loadMessages(convo.phone);
                            setWaMessages(messages);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100"
                        >
                          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#25D366" }}>
                            <span className="text-white font-bold text-base">{(convo.name || convo.phone || "?").charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate text-gray-800">{convo.name || formatPhone(convo.phone)}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0">{convo.last_at?.slice(11, 16) || ""}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{convo.last_message}</p>
                          </div>
                          {convo.unread > 0 && (
                            <span className="text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#25D366" }}>{convo.unread}</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <svg className="w-16 h-16 text-[#25D366] mb-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm-2.27-5.86c-.17-.08-.34-.13-.5-.06-.15.07-.24.13-.36.27-.12.14-.4.44-.5.55-.08.08-.16.09-.3.03-.14-.06-.59-.22-1.12-.69-.41-.37-.69-.82-.77-.96-.08-.14-.01-.22.06-.29.06-.06.14-.16.21-.24.07-.08.09-.14.14-.23.05-.09.02-.17-.01-.24-.03-.06-.31-.75-.43-1.02-.11-.26-.22-.23-.31-.23h-.26c-.09 0-.23.03-.36.17-.12.14-.47.46-.47 1.12 0 .66.48 1.3.55 1.39.07.09 1.05 1.6 2.55 2.24.36.15.64.24.85.31.36.11.68.1.94.06.29-.04.88-.36 1-.71.12-.35.12-.65.09-.71-.03-.06-.11-.09-.25-.15z"/></svg>
                        <p className="text-gray-500 text-sm">No chats yet</p>
                        <p className="text-gray-400 text-xs mt-1">Tap + to start a new WhatsApp chat</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {waView === "chat" && (
                <>
                  {/* WhatsApp chat header */}
                  <div className="bg-[#075E54] text-white px-4 h-14 flex items-center gap-3 sticky top-14 z-30">
                    <button onClick={() => setWaView("list")} className="p-2 rounded-full hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#25D366" }}>
                      <span className="text-white font-bold text-sm">{waPhone ? formatPhone(waPhone).charAt(0) : "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{waPhone ? formatPhone(waPhone) : "New Chat"}</h3>
                    </div>
                  </div>

                  {/* WhatsApp chat body */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: "#ECE5DD" }}>
                    <div className="text-center py-2">
                      <span className="text-xs text-gray-500 bg-yellow-100 px-3 py-1 rounded-md">Messages are end-to-end encrypted</span>
                    </div>
                    {messages.length > 0 && messages.map((msg, i) => (
                      <div key={i} className={cn("flex", msg.direction === "out" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm", msg.direction === "out" ? "bg-[#DCF8C6] text-gray-800" : "bg-white text-gray-800")}
                        >
                          <p>{msg.body}</p>
                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <span className="text-[10px] text-gray-400">{msg.date?.slice(11, 16) || ""}</span>
                            {msg.direction === "out" && <CheckCircle2 className="w-3 h-3 text-blue-400" />}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* WhatsApp input bar */}
                  <div className="px-3 py-2 bg-[#F0F0F0] flex gap-2 items-end sticky bottom-0">
                    <input
                      type="text"
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      placeholder="Type a message"
                      className="flex-1 p-3 rounded-full bg-white text-sm outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!waPhone.trim()) return showAlert("danger", "Enter a phone number");
                        const digits = waPhone.replace(/\D/g, "");
                        const text = encodeURIComponent(waMessage || "");
                        window.open(`https://wa.me/${digits}?text=${text}`, "_blank");
                        setWaMessage("");
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#25D366" }}
                    >
                      <Send className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </>
              )}

              {/* WhatsApp new chat form (when no active chat) */}
              {waView === "chat" && !waPhone && (
                <div className="px-4 py-3 bg-white border-b border-gray-200">
                  <input
                    type="tel"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {/* === TELEGRAM TAB === */}
          {tab === "telegram" && (
            <div className="flex-1 flex flex-col max-w-md mx-auto w-full" style={{ background: "#E7EBF0" }}>
              {tgView === "list" && (
                <>
                  {/* Telegram header */}
                  <div className="bg-[#0088CC] text-white px-4 h-14 flex items-center justify-between sticky top-14 z-30">
                    <h2 className="text-lg font-bold">Telegram</h2>
                    <button
                      onClick={handleConnectTelegram}
                      className="p-2 rounded-full hover:bg-white/10"
                      title="Connect Telegram Bot"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Telegram connect info */}
                  {botUsername && (
                    <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs text-blue-700">
                      Send a message to @{botUsername} on Telegram to connect your account
                    </div>
                  )}

                  {/* Telegram chat list */}
                  <div className="flex-1 overflow-y-auto bg-white">
                    {status?.telegram_connected ? (
                      conversations.map((convo) => (
                        <button
                          key={convo.id}
                          onClick={() => {
                            setTgActiveChat(convo.phone);
                            setTgView("chat");
                            loadMessages(convo.phone);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100"
                        >
                          <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#0088CC" }}>
                            <span className="text-white font-bold text-base">{(convo.name || convo.phone || "?").charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate text-gray-800">{convo.name || formatPhone(convo.phone)}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0">{convo.last_at?.slice(11, 16) || ""}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{convo.last_message}</p>
                          </div>
                          {convo.unread > 0 && (
                            <span className="text-white text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#0088CC" }}>{convo.unread}</span>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                        <svg className="w-16 h-16 text-[#0088CC] mb-3" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                        <p className="text-gray-600 font-medium">Connect to Telegram</p>
                        <p className="text-gray-400 text-sm mt-1 mb-4">Link your Telegram account to send and receive messages</p>
                        <button
                          onClick={handleConnectTelegram}
                          className="px-6 py-3 rounded-lg text-white font-medium flex items-center gap-2"
                          style={{ background: "#0088CC" }}
                        >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                          Connect Telegram
                        </button>
                        {botUsername && (
                          <p className="text-xs text-blue-600 mt-3">Bot: @{botUsername}</p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {tgView === "chat" && (
                <>
                  {/* Telegram chat header */}
                  <div className="bg-[#0088CC] text-white px-4 h-14 flex items-center gap-3 sticky top-14 z-30">
                    <button onClick={() => setTgView("list")} className="p-2 rounded-full hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#0088CC" }}>
                      <span className="text-white font-bold text-sm">{tgActiveChat ? formatPhone(tgActiveChat).charAt(0) : "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{tgActiveChat ? formatPhone(tgActiveChat) : "New Chat"}</h3>
                    </div>
                  </div>

                  {/* Telegram messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: "#E7EBF0" }}>
                    {messages.length > 0 ? messages.map((msg, i) => (
                      <div key={i} className={cn("flex", msg.direction === "out" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", msg.direction === "out" ? "bg-[#EFFDDE] text-gray-800" : "bg-white text-gray-800 shadow-sm")}
                        >
                          <p>{msg.body}</p>
                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <span className="text-[10px] text-gray-400">{msg.date?.slice(11, 16) || ""}</span>
                            {msg.direction === "out" && <CheckCircle2 className="w-3 h-3 text-[#0088CC]" />}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-gray-400 text-sm text-center py-8">No messages yet</p>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Telegram input bar */}
                  <div className="px-3 py-2 bg-white flex gap-2 items-end sticky bottom-0">
                    <input
                      type="text"
                      value={tgMessageBody}
                      onChange={(e) => setTgMessageBody(e.target.value)}
                      placeholder="Message"
                      className="flex-1 p-3 rounded-full bg-gray-100 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tgMessageBody.trim() && tgActiveChat) {
                          setToNumber(tgActiveChat);
                          setMessageBody(tgMessageBody);
                          setMethod("telegram");
                          handleSend();
                          setTgMessageBody("");
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        if (tgMessageBody.trim() && tgActiveChat) {
                          setToNumber(tgActiveChat);
                          setMessageBody(tgMessageBody);
                          setMethod("telegram");
                          handleSend();
                          setTgMessageBody("");
                        }
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "#0088CC" }}
                    >
                      <Send className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* === INC CRYPTO TAB === */}
          {tab === "crypto" && (
            <div className="max-w-md mx-auto p-4 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)" }}><span className="text-white font-bold text-sm">I</span></div>
                    <div><p className="font-bold text-gray-800">INC Balance</p><p className="text-xs text-gray-500">Incentives Token</p></div>
                  </div>
                  <div className="text-right"><p className="text-2xl font-bold text-gray-800">{incBalance}</p><p className="text-xs text-gray-500 flex items-center gap-1 justify-end"><DollarSign className="w-3 h-3" />{incUsdValue}</p></div>
                </div>
                <button onClick={loadIncBalance} className="text-xs w-full mt-2 flex items-center justify-center gap-1 text-blue-600 hover:bg-blue-50 py-2 rounded-lg"><Loader2 className="w-3 h-3" /> Refresh</button>
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-800"><Send className="w-4 h-4 text-blue-600" /> Send INC</h3>
                <div className="space-y-3">
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Send To (@tag or 0x address)</label><input value={cryptoTo} onChange={(e) => setCryptoTo(e.target.value)} placeholder="@justin or 0x..." className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500" style={{ userSelect: "text" }} /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Amount (INC)</label><input type="number" value={cryptoAmount} onChange={(e) => setCryptoAmount(e.target.value)} placeholder="0.00" className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500" /></div>
                  {cryptoAmount && parseFloat(cryptoAmount) > 0 && (
                    <div className="bg-gray-100 rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-gray-500">Send Amount</span><span className="text-gray-800">{parseFloat(cryptoAmount).toFixed(6)} INC</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Fee (0.5%)</span><span className="text-gray-800">{(parseFloat(cryptoAmount) * FEE_PERCENT).toFixed(6)} INC</span></div>
                      <div className="flex justify-between font-medium"><span className="text-gray-800">Recipient Gets</span><span className="text-blue-600">{(parseFloat(cryptoAmount) - parseFloat(cryptoAmount) * FEE_PERCENT).toFixed(6)} INC</span></div>
                    </div>
                  )}
                  <button onClick={handleSendInc} disabled={cryptoSending || !cryptoTo.trim() || !cryptoAmount.trim()} className="w-full py-3 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2" style={{ background: "#1A73E8" }}>
                    {cryptoSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}{cryptoSending ? "Sending..." : "Send INC"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-800"><Wallet className="w-4 h-4 text-blue-600" /> Receive INC</h3>
                {walletAddress ? (
                  <>
                    <div className="bg-gray-100 rounded-lg p-3 mb-2"><p className="text-xs text-gray-500 mb-1">Your Wallet Address:</p><p className="font-mono text-sm break-all text-blue-600" style={{ userSelect: "text" }}>{walletAddress}</p></div>
                    <button onClick={() => handleCopy(walletAddress, "addr")} className="w-full text-sm flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">{copied === "addr" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />} Copy Address</button>
                  </>
                ) : <p className="text-gray-500 text-sm">No wallet loaded. Go to Wallet page to set up.</p>}
              </div>

              <div className="bg-white rounded-2xl shadow-sm p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-gray-800"><DollarSign className="w-4 h-4 text-blue-600" /> Buy INC</h3>
                {walletAddress ? (<>
                  <div className="mb-3">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount (USD → USDT)</label>
                    <input type="number" value={incBuyAmount} onChange={(e) => setIncBuyAmount(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500" step="1" min="1" />
                    <p className="text-xs text-gray-500 mt-1">${(parseFloat(incBuyAmount) || 0).toFixed(2)} USD → {(parseFloat(incBuyAmount) || 0).toFixed(2)} USDT</p>
                  </div>

                  <a href="https://cash.app/" target="_blank" rel="noopener noreferrer" className="w-full text-sm flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 mb-3"><DollarSign className="w-4 h-4" /> Open Cash App</a>

                  {/* Google Pay */}
                  <button
                    onClick={async () => {
                      const amt = parseFloat(incBuyAmount) || 0;
                      if (amt < 1) return showAlert("danger", "Enter a valid amount");
                      setIncProcessing(true);
                      try {
                        const resp = await fetch(`${API_BASE}/v1/wallet/googlepay/deposit`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                          body: JSON.stringify({ amount: amt, wallet_address: walletAddress }),
                        });
                        const data = await resp.json();
                        if (resp.ok) {
                          showAlert("success", `${amt} USDT credited! Swap to INC on PancakeSwap.`);
                        } else {
                          showAlert("danger", data.detail || "Payment failed");
                        }
                      } catch (e: any) {
                        showAlert("danger", "Payment error: " + e.message);
                      } finally { setIncProcessing(false); }
                    }}
                    disabled={incProcessing}
                    className="w-full text-sm flex items-center justify-center gap-2 py-2.5 rounded-lg text-white font-medium mb-3"
                    style={{ background: "#1A73E8" }}
                  >
                    {incProcessing ? "Processing..." : <>Pay ${(parseFloat(incBuyAmount) || 0).toFixed(2)} with Google Pay</>}
                  </button>

                  {/* Saved Cards */}
                  {incSavedCards.length > 0 && (
                    <div className="space-y-2 mb-3">
                      <p className="text-xs text-gray-500 font-medium">Saved Cards:</p>
                      {incSavedCards.map((card) => (
                        <div key={card.id} className="flex items-center gap-3 bg-gray-100 rounded-lg p-3">
                          <div className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#00C2A8" }}>C</div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">••••{card.last4}</p>
                            <p className="text-xs text-gray-500">Exp {card.expiry}</p>
                          </div>
                          <button
                            onClick={async () => {
                              const amt = parseFloat(incBuyAmount) || 0;
                              if (amt < 1) return showAlert("danger", "Enter a valid amount");
                              setIncProcessing(true);
                              try {
                                const resp = await fetch(`${API_BASE}/v1/wallet/card/deposit`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                                  body: JSON.stringify({ amount: amt, wallet_address: walletAddress, card_id: card.id }),
                                });
                                const data = await resp.json();
                                if (resp.ok) {
                                  showAlert("success", `${amt} USDT credited! Swap to INC on PancakeSwap.`);
                                } else {
                                  showAlert("danger", data.detail || "Card payment failed");
                                }
                              } catch (e: any) {
                                showAlert("danger", "Payment error: " + e.message);
                              } finally { setIncProcessing(false); }
                            }}
                            disabled={incProcessing}
                            className="text-sm px-4 py-2 rounded-lg text-white font-medium"
                            style={{ background: "#1A73E8" }}
                          >
                            Pay ${(parseFloat(incBuyAmount) || 0).toFixed(2)}
                          </button>
                          <button
                            onClick={() => {
                              const updated = incSavedCards.filter((c) => c.id !== card.id);
                              setIncSavedCards(updated);
                              localStorage.setItem("soulmate_saved_cards", JSON.stringify(updated));
                              showAlert("info", "Card removed");
                            }}
                            className="text-red-500 text-xs hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Card */}
                  {incShowNewCard ? (
                    <div className="space-y-3 mb-3">
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Card Number</label><input value={incCardNumber} onChange={(e) => setIncCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" className="w-full p-3 border border-gray-300 rounded-lg text-sm" maxLength={19} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-500 mb-1">Expiry</label><input value={incCardExpiry} onChange={(e) => setIncCardExpiry(e.target.value)} placeholder="MM/YY" className="w-full p-3 border border-gray-300 rounded-lg text-sm" maxLength={5} /></div>
                        <div><label className="block text-xs font-medium text-gray-500 mb-1">CVC</label><input value={incCardCvc} onChange={(e) => setIncCardCvc(e.target.value)} placeholder="123" className="w-full p-3 border border-gray-300 rounded-lg text-sm" maxLength={4} type="password" /></div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" checked={incSaveCard} onChange={(e) => setIncSaveCard(e.target.checked)} className="rounded" />
                        Save card for future use (Wallet & Phone)
                      </label>
                      <button
                        onClick={async () => {
                          const amt = parseFloat(incBuyAmount) || 0;
                          if (amt < 1) return showAlert("danger", "Enter a valid amount");
                          if (!incCardNumber.trim() || !incCardExpiry.trim() || !incCardCvc.trim()) return showAlert("danger", "Fill in all card details");
                          setIncProcessing(true);
                          try {
                            const resp = await fetch(`${API_BASE}/v1/wallet/card/deposit`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                              body: JSON.stringify({ amount: amt, wallet_address: walletAddress, card_number: incCardNumber.replace(/\s/g, ""), card_expiry: incCardExpiry, card_cvc: incCardCvc, save_card: incSaveCard }),
                            });
                            const data = await resp.json();
                            if (resp.ok) {
                              showAlert("success", `${amt} USDT credited! Swap to INC on PancakeSwap.`);
                              if (incSaveCard && data.card_id) {
                                const newCard = { id: data.card_id, last4: incCardNumber.replace(/\s/g, "").slice(-4), expiry: incCardExpiry };
                                const updated = [...incSavedCards, newCard];
                                setIncSavedCards(updated);
                                localStorage.setItem("soulmate_saved_cards", JSON.stringify(updated));
                              }
                              setIncCardNumber(""); setIncCardExpiry(""); setIncCardCvc(""); setIncSaveCard(false);
                              setIncShowNewCard(false);
                            } else {
                              showAlert("danger", data.detail || "Card payment failed");
                            }
                          } catch (e: any) {
                            showAlert("danger", "Payment error: " + e.message);
                          } finally { setIncProcessing(false); }
                        }}
                        disabled={incProcessing}
                        className="w-full py-3 rounded-lg text-white font-bold text-sm flex items-center justify-center gap-2"
                        style={{ background: "#1A73E8" }}
                      >
                        {incProcessing ? "Processing..." : <>Pay with Current Card</>}
                      </button>
                      <button onClick={() => setIncShowNewCard(false)} className="text-gray-500 text-xs hover:text-gray-800 w-full text-center">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setIncShowNewCard(true)} className="w-full text-sm flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 mb-3">
                      + Add New Current Card
                    </button>
                  )}

                  <div className="bg-gray-100 rounded-lg p-3 text-xs text-gray-600">
                    <p className="font-medium text-gray-800 mb-1">How to buy INC:</p>
                    <p>1. Add funds via Google Pay, Current card, or Cash App</p>
                    <p>2. Funds auto-convert to USDT in your wallet</p>
                    <p>3. Swap USDT → INC on PancakeSwap</p>
                  </div>
                </>) : <p className="text-gray-500 text-sm">Load wallet first to buy INC.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
