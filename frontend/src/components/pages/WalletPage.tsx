import { useState } from "react";
import { useStore } from "@/lib/store";
import { walletApi } from "@/lib/api";
import { cn, shortenAddress, copyToClipboard, formatBalance } from "@/lib/utils";
import { Wallet as WalletIcon, Send, Download, QrCode, Copy, Tag, History, Coins } from "lucide-react";

export function WalletPage() {
  const { walletAddress, showAlert, setActivePage } = useStore();
  const [view, setView] = useState<"main" | "send" | "receive">("main");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken] = useState("BNB");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const tokens = ["BNB", "INC", "USDT", "USDC", "BUSD", "DAI"];

  const handleSend = async () => {
    if (!sendTo || !sendAmount) return showAlert("danger", "Enter address and amount");
    setLoading(true);
    try {
      const data = await walletApi.send(sendTo, sendAmount, sendToken, walletAddress);
      if (data.tx_hash) {
        showAlert("success", `Sent! TX: ${data.tx_hash.slice(0, 20)}...`);
        setSendTo("");
        setSendAmount("");
        setView("main");
      } else {
        showAlert("danger", data.detail || "Send failed");
      }
    } catch (e: any) {
      showAlert("danger", e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <WalletIcon className="w-12 h-12 text-muted mb-3" />
        <h3 className="text-lg font-bold mb-2">No Wallet Connected</h3>
        <p className="text-muted text-sm mb-4">Create or import a wallet to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Wallet</h2>
        <p className="text-muted text-sm mt-1">BSC · INC Token · 0.5% fee</p>
      </div>

      {view === "main" && (
        <>
          {/* Address card */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted">Wallet Address</span>
              <button
                onClick={() => {
                  copyToClipboard(walletAddress);
                  showAlert("info", "Address copied");
                }}
                className="text-muted hover:text-white"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="font-mono text-sm break-all">{walletAddress}</p>
          </div>

          {/* Token balances */}
          <div className="card">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Coins className="w-5 h-5 text-warning" /> Balances
            </h3>
            <div className="space-y-2">
              {tokens.map((token) => (
                <div key={token} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="font-medium">{token}</span>
                  <span className="font-mono text-muted">{formatBalance(balances[token] || 0)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setView("send")} className="btn-primary flex items-center justify-center gap-2 py-4">
              <Send className="w-5 h-5" /> Send
            </button>
            <button onClick={() => setView("receive")} className="btn-secondary flex items-center justify-center gap-2 py-4">
              <Download className="w-5 h-5" /> Receive
            </button>
          </div>

          <button onClick={() => setActivePage("dashboard")} className="btn-ghost w-full text-sm">
            ← Back to Dashboard
          </button>
        </>
      )}

      {view === "send" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Send Crypto</h3>

          <div>
            <label className="label">To (address or @tag)</label>
            <input
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="0x... or @username"
              className="w-full"
            />
          </div>

          <div>
            <label className="label">Token</label>
            <select value={sendToken} onChange={(e) => setSendToken(e.target.value)} className="w-full">
              {tokens.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Amount</label>
            <input
              type="number"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              placeholder="0.0000"
              className="w-full"
              step="0.0001"
            />
          </div>

          <button onClick={handleSend} disabled={loading} className="btn-primary w-full">
            {loading ? "Sending..." : "Send"}
          </button>
          <button onClick={() => setView("main")} className="btn-ghost w-full text-sm">
            ← Back
          </button>
        </div>
      )}

      {view === "receive" && (
        <div className="space-y-4 text-center">
          <h3 className="text-lg font-semibold">Receive Crypto</h3>
          <p className="text-muted text-sm">Share this address to receive funds</p>

          <div className="card flex flex-col items-center gap-3 py-6">
            <div className="w-48 h-48 bg-white rounded-xl p-3 flex items-center justify-center">
              <QrCode className="w-full h-full text-black" />
            </div>
            <p className="font-mono text-sm break-all px-4">{walletAddress}</p>
            <button
              onClick={() => {
                copyToClipboard(walletAddress);
                showAlert("info", "Address copied");
              }}
              className="btn-secondary flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copy Address
            </button>
          </div>

          <button onClick={() => setView("main")} className="btn-ghost w-full text-sm">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
