import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { cn, shortenAddress, copyToClipboard, formatBalance } from "@/lib/utils";
import { Wallet as WalletIcon, Send, Download, QrCode, Copy, Tag, History, Coins, Search, ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BSC_RPC = "https://bsc-dataseed.binance.org";
const FEE_PERCENT = 0.005;
const FEE_WALLET = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";

const STABLECOINS: Record<string, { address: string; decimals: number; name: string; icon: string; color: string }> = {
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, name: "Tether USD", icon: "T", color: "#26a17b" },
  USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, name: "USD Coin", icon: "U", color: "#2775ca" },
  BUSD: { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18, name: "Binance USD", icon: "B", color: "#f0b90b" },
  DAI:  { address: "0x1af3f329e963e609a3a4f2173050835a825754b0", decimals: 18, name: "Dai Stablecoin", icon: "D", color: "#f5ac37" },
};

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

interface TokenInfo {
  symbol: string; name: string; decimals: number; native?: boolean;
  icon: string; color: string; address?: string;
}

const ALL_TOKENS: TokenInfo[] = [
  { symbol: "BNB", name: "Binance Coin", decimals: 18, native: true, icon: "B", color: "#f0b90b" },
  { symbol: "INC", name: "Incentives", decimals: 18, icon: "I", color: "linear-gradient(135deg, #ff6b9d, #c44dff)" },
  { symbol: "USDT", name: "Tether USD", decimals: 18, icon: "T", color: "#26a17b", ...STABLECOINS.USDT },
  { symbol: "USDC", name: "USD Coin", decimals: 18, icon: "U", color: "#2775ca", ...STABLECOINS.USDC },
  { symbol: "BUSD", name: "Binance USD", decimals: 18, icon: "B", color: "#f0b90b", ...STABLECOINS.BUSD },
  { symbol: "DAI", name: "Dai Stablecoin", decimals: 18, icon: "D", color: "#f5ac37", ...STABLECOINS.DAI },
];

interface TxRecord {
  type: string; to: string; amount: string; hash: string;
  direction: "out" | "in"; timestamp: number;
}

type WalletView = "main" | "send" | "receive" | "tags" | "history" | "buy" | "add-funds";

const getApiBase = () => {
  const isDev = import.meta.env.DEV;
  return isDev ? "" : "http://191.44.121.29:8546";
};

export function WalletPage() {
  const { walletAddress, walletKey, showAlert } = useStore();
  const [view, setView] = useState<WalletView>("main");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [usdValues, setUsdValues] = useState<Record<string, number>>({});
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendToken, setSendToken] = useState("BNB");
  const [tagResolveInfo, setTagResolveInfo] = useState<string | null>(null);

  const [tagInput, setTagInput] = useState("");
  const [userTags, setUserTags] = useState<any[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [tagSearchResults, setTagSearchResults] = useState<any[]>([]);

  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [buyAmount, setBuyAmount] = useState("50");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [fundingAmount, setFundingAmount] = useState("50");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [savedCards, setSavedCards] = useState<any[]>([]);
  const [showNewCardForm, setShowNewCardForm] = useState(false);

  const walletRef = useRef<any>(null);
  const providerRef = useRef<any>(null);
  const contractsRef = useRef<Record<string, any>>({});
  const incContractRef = useRef<any>(null);

  const updateBalances = useCallback(async () => {
    if (!walletRef.current || !providerRef.current) return;
    setRefreshing(true);
    try {
      const ethers = await import("ethers");
      const wallet = walletRef.current;
      const provider = providerRef.current;
      const newBalances: Record<string, number> = {};
      const newUsd: Record<string, number> = {};
      let total = 0;

      const bnbBal = await provider.getBalance(wallet.address);
      const bnbFormatted = parseFloat(ethers.formatEther(bnbBal));
      newBalances["BNB"] = bnbFormatted;

      try {
        const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd");
        const data = await resp.json();
        const price = data.binancecoin?.usd || 0;
        const bnbUsd = bnbFormatted * price;
        newUsd["BNB"] = bnbUsd;
        total += bnbUsd;
      } catch { newUsd["BNB"] = 0; }

      if (incContractRef.current) {
        try {
          const incBal = await incContractRef.current.balanceOf(wallet.address);
          const incDecimals = await incContractRef.current.decimals();
          newBalances["INC"] = parseFloat(ethers.formatUnits(incBal, incDecimals));
        } catch { newBalances["INC"] = 0; }
      } else { newBalances["INC"] = 0; }
      newUsd["INC"] = 0;

      for (const [sym, info] of Object.entries(STABLECOINS)) {
        try {
          const contract = contractsRef.current[sym];
          if (!contract) { newBalances[sym] = 0; newUsd[sym] = 0; continue; }
          const bal = await contract.balanceOf(wallet.address);
          const formatted = parseFloat(ethers.formatUnits(bal, info.decimals));
          newBalances[sym] = formatted;
          newUsd[sym] = formatted;
          total += formatted;
        } catch { newBalances[sym] = 0; newUsd[sym] = 0; }
      }

      setBalances(newBalances);
      setUsdValues(newUsd);
      setTotalUsd(total);
    } catch (e: any) {
      showAlert("danger", "Failed to load balances: " + e.message);
    } finally {
      setRefreshing(false);
    }
  }, [showAlert]);

  const initWallet = useCallback(async () => {
    if (!walletKey || !walletAddress) return;
    try {
      const ethers = await import("ethers");
      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      const wallet = new ethers.Wallet(walletKey, provider);
      providerRef.current = provider;
      walletRef.current = wallet;

      for (const [sym, info] of Object.entries(STABLECOINS)) {
        contractsRef.current[sym] = new ethers.Contract(info.address, ERC20_ABI, wallet);
      }

      const incAddr = localStorage.getItem("inc_contract");
      if (incAddr) {
        incContractRef.current = new ethers.Contract(incAddr, ERC20_ABI, wallet);
        contractsRef.current["INC"] = incContractRef.current;
      }

      await updateBalances();
      const history = JSON.parse(localStorage.getItem("soulmate_tx_history") || "[]");
      setTxHistory(history);

      try {
        const resp = await fetch(`${getApiBase()}/v1/tags/search?q=`, {
          headers: { "X-API-Token": "soulmate_wallet_2024" },
        });
        const data = await resp.json();
        const filtered = (data.tags || []).filter((t: any) =>
          t.address?.toLowerCase() === walletAddress.toLowerCase()
        );
        setUserTags(filtered);
      } catch {}
    } catch (e: any) {
      showAlert("danger", "Failed to init wallet: " + e.message);
    }
  }, [walletKey, walletAddress, updateBalances, showAlert]);

  useEffect(() => { initWallet(); }, [initWallet]);

  useEffect(() => {
    const cards = JSON.parse(localStorage.getItem("soulmate_saved_cards") || "[]");
    setSavedCards(cards);
  }, []);

  useEffect(() => {
    if (!sendTo.startsWith("@") || sendTo.length < 2) { setTagResolveInfo(null); return; }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`${getApiBase()}/v1/tags/${sendTo.substring(1)}`);
        if (resp.ok) {
          const data = await resp.json();
          setTagResolveInfo(`${data.tag} → ${shortenAddress(data.address)}`);
        } else { setTagResolveInfo(`Tag ${sendTo} not found`); }
      } catch { setTagResolveInfo(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [sendTo]);

  useEffect(() => {
    if (!tagSearch) { setTagSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`${getApiBase()}/v1/tags/search?q=${encodeURIComponent(tagSearch)}`, {
          headers: { "X-API-Token": "soulmate_wallet_2024" },
        });
        const data = await resp.json();
        setTagSearchResults(data.tags || []);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [tagSearch]);

  const saveTx = (tx: TxRecord) => {
    const history = JSON.parse(localStorage.getItem("soulmate_tx_history") || "[]");
    history.unshift(tx);
    localStorage.setItem("soulmate_tx_history", JSON.stringify(history.slice(0, 50)));
    setTxHistory(history.slice(0, 50));
  };

  const handleSend = async () => {
    if (!sendTo || !sendAmount) return showAlert("danger", "Enter address and amount");
    if (!walletRef.current) return showAlert("danger", "Wallet not initialized");
    setLoading(true);
    try {
      const ethers = await import("ethers");
      const wallet = walletRef.current;
      let recipientAddress = sendTo;

      if (sendTo.startsWith("@")) {
        try {
          const resp = await fetch(`${getApiBase()}/v1/tags/${sendTo.substring(1)}`);
          if (!resp.ok) { showAlert("danger", `Tag ${sendTo} not found`); return; }
          const data = await resp.json();
          recipientAddress = data.address;
        } catch (e: any) { showAlert("danger", `Failed to resolve tag: ${e.message}`); return; }
      }

      if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
        showAlert("danger", "Invalid recipient address"); return;
      }

      const sendAmountNum = parseFloat(sendAmount);
      const feeAmount = sendAmountNum * FEE_PERCENT;
      const recipientGets = sendAmountNum - feeAmount;
      let tx; let feeTx = null;

      if (sendToken === "BNB") {
        const value = ethers.parseEther(recipientGets.toString());
        tx = await wallet.sendTransaction({ to: recipientAddress, value });
        if (feeAmount > 0) {
          feeTx = await wallet.sendTransaction({ to: FEE_WALLET, value: ethers.parseEther(feeAmount.toString()) });
        }
      } else if (sendToken === "INC") {
        if (!incContractRef.current) { showAlert("danger", "INC contract not configured"); return; }
        const decimals = await incContractRef.current.decimals();
        tx = await incContractRef.current.transfer(recipientAddress, ethers.parseUnits(recipientGets.toString(), decimals));
        if (feeAmount > 0) feeTx = await incContractRef.current.transfer(FEE_WALLET, ethers.parseUnits(feeAmount.toString(), decimals));
      } else {
        const contract = contractsRef.current[sendToken.toUpperCase()];
        if (!contract) { showAlert("danger", `${sendToken} contract not loaded`); return; }
        const info = STABLECOINS[sendToken.toUpperCase()];
        tx = await contract.transfer(recipientAddress, ethers.parseUnits(recipientGets.toString(), info.decimals));
        if (feeAmount > 0) feeTx = await contract.transfer(FEE_WALLET, ethers.parseUnits(feeAmount.toString(), info.decimals));
      }

      await tx.wait();
      saveTx({ type: sendToken.toUpperCase(), to: recipientAddress, amount: sendAmount, hash: tx.hash, direction: "out", timestamp: Date.now() });
      showAlert("success", `Sent ${recipientGets.toFixed(6)} ${sendToken} (fee: ${feeAmount.toFixed(6)}) TX: ${tx.hash.slice(0, 20)}...`);
      setSendTo(""); setSendAmount(""); setView("main");
      await updateBalances();
    } catch (e: any) { showAlert("danger", "Transaction failed: " + e.message); }
    finally { setLoading(false); }
  };

  const handleCreateTag = async () => {
    if (!tagInput.trim()) return showAlert("danger", "Enter a tag name");
    if (!walletAddress) return showAlert("danger", "Wallet not loaded");
    try {
      const resp = await fetch(`${getApiBase()}/v1/tags/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024" },
        body: JSON.stringify({ tag: tagInput.trim(), address: walletAddress, owner_name: "" }),
      });
      const data = await resp.json();
      if (!resp.ok) { showAlert("danger", data.detail || "Failed to create tag"); return; }
      showAlert("success", `Tag @${tagInput.trim()} created!`);
      setTagInput("");
      try {
        const resp2 = await fetch(`${getApiBase()}/v1/tags/search?q=`, { headers: { "X-API-Token": "soulmate_wallet_2024" } });
        const data2 = await resp2.json();
        setUserTags((data2.tags || []).filter((t: any) => t.address?.toLowerCase() === walletAddress.toLowerCase()));
      } catch {}
    } catch (e: any) { showAlert("danger", "Failed to create tag: " + e.message); }
  };

  const buyFee = (parseFloat(buyAmount) || 0) * FEE_PERCENT;
  const buyReceive = (parseFloat(buyAmount) || 0) - buyFee;

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Wallet</h2>
          <p className="text-muted text-sm mt-1">BSC · 6 tokens · 0.5% fee</p>
        </div>
        <button onClick={updateBalances} disabled={refreshing} className="btn-secondary p-2" title="Refresh">
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="card bg-gradient-to-br from-accent/10 to-transparent">
        <p className="text-xs text-muted mb-1">Total Balance</p>
        <p className="text-3xl font-bold">${totalUsd.toFixed(2)}</p>
        <div className="flex items-center gap-2 mt-2">
          <p className="text-xs text-muted font-mono">{shortenAddress(walletAddress, 8)}</p>
          <button onClick={() => { copyToClipboard(walletAddress); showAlert("info", "Address copied"); }} className="text-muted hover:text-white">
            <Copy className="w-3 h-3" />
          </button>
        </div>
      </div>

      {view === "main" && (<>
        <div className="card">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="w-5 h-5 text-warning" /> Balances</h3>
          <div className="space-y-2">
            {ALL_TOKENS.map((token) => (
              <div key={token.symbol} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: token.color }}>{token.icon}</div>
                  <div><p className="font-medium text-sm">{token.symbol}</p><p className="text-xs text-muted">{token.name}</p></div>
                </div>
                <div className="text-right"><p className="font-mono text-sm">{formatBalance(balances[token.symbol] || 0)}</p><p className="text-xs text-muted">${(usdValues[token.symbol] || 0).toFixed(2)}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setView("send")} className="btn-primary flex items-center justify-center gap-2 py-4"><Send className="w-5 h-5" /> Send</button>
          <button onClick={() => setView("receive")} className="btn-secondary flex items-center justify-center gap-2 py-4"><Download className="w-5 h-5" /> Receive</button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setView("buy")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Buy</button>
          <button onClick={() => setView("add-funds")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Add Funds</button>
          <button onClick={() => setView("tags")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Tag className="w-4 h-4" /> Tags</button>
        </div>
        <button onClick={() => setView("history")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm w-full"><History className="w-4 h-4" /> History</button>
      </>)}

      {view === "send" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Send Crypto</h3></div>
        <div><label className="label">To (address or @tag)</label><input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x... or @username" className="w-full" />{tagResolveInfo && (<p className={cn("text-xs mt-1", tagResolveInfo.includes("not found") ? "text-danger" : "text-accent")}>{tagResolveInfo}</p>)}</div>
        <div><label className="label">Token</label><select value={sendToken} onChange={(e) => setSendToken(e.target.value)} className="w-full">{ALL_TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}</select></div>
        <div><label className="label">Amount</label><input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.0000" className="w-full" step="0.0001" /><p className="text-xs text-muted mt-1">Available: {formatBalance(balances[sendToken] || 0)} {sendToken}</p></div>
        {sendAmount && parseFloat(sendAmount) > 0 && (<div className="card text-xs space-y-1"><div className="flex justify-between"><span className="text-muted">You send</span><span>{sendAmount} {sendToken}</span></div><div className="flex justify-between"><span className="text-muted">Fee (0.5%)</span><span className="text-warning">{(parseFloat(sendAmount) * FEE_PERCENT).toFixed(6)} {sendToken}</span></div><div className="flex justify-between font-medium"><span>Recipient gets</span><span className="text-success">{(parseFloat(sendAmount) * (1 - FEE_PERCENT)).toFixed(6)} {sendToken}</span></div></div>)}
        <button onClick={handleSend} disabled={loading} className="btn-primary w-full py-3">{loading ? "Sending..." : "Send"}</button>
      </div>)}

      {view === "receive" && (<div className="space-y-4 text-center">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Receive Crypto</h3></div>
        <p className="text-muted text-sm">Share this address to receive funds on BSC</p>
        <div className="card flex flex-col items-center gap-3 py-6"><div className="w-48 h-48 bg-white rounded-xl p-3 flex items-center justify-center"><QrCode className="w-full h-full text-black" /></div><p className="font-mono text-sm break-all px-4">{walletAddress}</p><button onClick={() => { copyToClipboard(walletAddress); showAlert("info", "Address copied"); }} className="btn-secondary flex items-center gap-2"><Copy className="w-4 h-4" /> Copy Address</button></div>
      </div>)}

      {view === "buy" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Buy Crypto</h3></div>
        <div className="card space-y-3">
          <div><label className="label">Amount (USD)</label><input type="number" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} className="w-full" step="1" min="1" /></div>
          <div className="text-xs space-y-1 py-2"><div className="flex justify-between"><span className="text-muted">You pay</span><span>${(parseFloat(buyAmount) || 0).toFixed(2)}</span></div><div className="flex justify-between"><span className="text-muted">Fee (0.5%)</span><span className="text-warning">${buyFee.toFixed(2)}</span></div><div className="flex justify-between font-medium"><span>You receive</span><span className="text-success">{buyReceive.toFixed(2)} USDT</span></div></div>
          <a href={`https://cash.app/$JustinHawpetoss6/${(parseFloat(buyAmount) || 0).toFixed(2)}?note=${encodeURIComponent(`Buy ${buyReceive.toFixed(2)} USDT — Wallet: ${walletAddress}`)}`} target="_blank" rel="noopener noreferrer" className="btn-primary w-full flex items-center justify-center gap-2 py-3"><DollarSign className="w-5 h-5" /> Pay with Cash App</a>
          <p className="text-xs text-muted text-center">Send ${(parseFloat(buyAmount) || 0).toFixed(2)} via Cash App. USDT will be sent to your wallet after confirmation.</p>
        </div>
      </div>)}

      {view === "add-funds" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Add Funds</h3></div>

        <div className="card space-y-3">
          <div><label className="label">Amount (USD)</label><input type="number" value={fundingAmount} onChange={(e) => setFundingAmount(e.target.value)} className="w-full" step="1" min="1" /></div>
          <div className="bg-accent/10 rounded-lg p-3 text-xs">
            <p className="font-medium text-accent mb-1">Auto-converts to USDT</p>
            <p className="text-muted">${(parseFloat(fundingAmount) || 0).toFixed(2)} USD → {(parseFloat(fundingAmount) || 0).toFixed(2)} USDT in your wallet</p>
          </div>
        </div>

        {/* Google Pay */}
        <div className="card">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google Pay
          </h4>
          <p className="text-xs text-muted mb-3">Pay with Google Pay (built into Android). Funds auto-convert to USDT.</p>
          <button
            onClick={async () => {
              const amt = parseFloat(fundingAmount) || 0;
              if (amt < 1) return showAlert("danger", "Enter a valid amount");
              setProcessingPayment(true);
              try {
                const resp = await fetch(`${getApiBase()}/v1/wallet/googlepay/deposit`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                  body: JSON.stringify({ amount: amt, wallet_address: walletAddress }),
                });
                const data = await resp.json();
                if (resp.ok) {
                  showAlert("success", `Payment initiated! ${amt} USDT will be credited to your wallet.`);
                  setView("main");
                } else {
                  showAlert("danger", data.detail || "Payment failed");
                }
              } catch (e: any) {
                showAlert("danger", "Payment error: " + e.message);
              } finally { setProcessingPayment(false); }
            }}
            disabled={processingPayment}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            {processingPayment ? "Processing..." : <>Pay ${(parseFloat(fundingAmount) || 0).toFixed(2)} with Google Pay</>}
          </button>
        </div>

        {/* Saved Cards */}
        {savedCards.length > 0 && (
          <div className="card">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#00C2A8" }}>C</div>
              Saved Cards
            </h4>
            <div className="space-y-2">
              {savedCards.map((card) => (
                <div key={card.id} className="flex items-center gap-3 bg-bg-alt rounded-lg p-3">
                  <div className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#00C2A8" }}>C</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">••••{card.last4}</p>
                    <p className="text-xs text-muted">Exp {card.expiry}</p>
                  </div>
                  <button
                    onClick={async () => {
                      const amt = parseFloat(fundingAmount) || 0;
                      if (amt < 1) return showAlert("danger", "Enter a valid amount");
                      setProcessingPayment(true);
                      try {
                        const resp = await fetch(`${getApiBase()}/v1/wallet/card/deposit`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                          body: JSON.stringify({ amount: amt, wallet_address: walletAddress, card_id: card.id }),
                        });
                        const data = await resp.json();
                        if (resp.ok) {
                          showAlert("success", `Payment processed! ${amt} USDT credited to your wallet.`);
                          setView("main");
                        } else {
                          showAlert("danger", data.detail || "Card payment failed");
                        }
                      } catch (e: any) {
                        showAlert("danger", "Payment error: " + e.message);
                      } finally { setProcessingPayment(false); }
                    }}
                    disabled={processingPayment}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    Pay ${(parseFloat(fundingAmount) || 0).toFixed(2)}
                  </button>
                  <button
                    onClick={() => {
                      const updated = savedCards.filter((c) => c.id !== card.id);
                      setSavedCards(updated);
                      localStorage.setItem("soulmate_saved_cards", JSON.stringify(updated));
                      showAlert("info", "Card removed");
                    }}
                    className="text-danger text-xs hover:underline"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Card — New Card Entry */}
        <div className="card">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#00C2A8" }}>C</div>
            Current Card
          </h4>
          {showNewCardForm ? (
            <div className="space-y-3">
              <div><label className="label">Card Number</label><input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" className="w-full" maxLength={19} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Expiry</label><input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" className="w-full" maxLength={5} /></div>
                <div><label className="label">CVC</label><input value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" className="w-full" maxLength={4} type="password" /></div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="rounded" />
                Save card for future use (Wallet & Phone)
              </label>
              <button
                onClick={async () => {
                  const amt = parseFloat(fundingAmount) || 0;
                  if (amt < 1) return showAlert("danger", "Enter a valid amount");
                  if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvc.trim()) return showAlert("danger", "Fill in all card details");
                  setProcessingPayment(true);
                  try {
                    const resp = await fetch(`${getApiBase()}/v1/wallet/card/deposit`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024", "X-Session-Token": localStorage.getItem("session_token") || "" },
                      body: JSON.stringify({ amount: amt, wallet_address: walletAddress, card_number: cardNumber.replace(/\s/g, ""), card_expiry: cardExpiry, card_cvc: cardCvc, save_card: saveCard }),
                    });
                    const data = await resp.json();
                    if (resp.ok) {
                      showAlert("success", `Payment processed! ${amt} USDT credited to your wallet.`);
                      if (saveCard && data.card_id) {
                        const newCard = { id: data.card_id, last4: cardNumber.replace(/\s/g, "").slice(-4), expiry: cardExpiry };
                        const updated = [...savedCards, newCard];
                        setSavedCards(updated);
                        localStorage.setItem("soulmate_saved_cards", JSON.stringify(updated));
                      }
                      setCardNumber(""); setCardExpiry(""); setCardCvc(""); setSaveCard(false);
                      setShowNewCardForm(false);
                      setView("main");
                    } else {
                      showAlert("danger", data.detail || "Card payment failed");
                    }
                  } catch (e: any) {
                    showAlert("danger", "Payment error: " + e.message);
                  } finally { setProcessingPayment(false); }
                }}
                disabled={processingPayment}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2"
              >
                {processingPayment ? "Processing..." : <>Pay ${(parseFloat(fundingAmount) || 0).toFixed(2)} with Current Card</>}
              </button>
              <button onClick={() => setShowNewCardForm(false)} className="text-muted text-xs hover:text-white w-full text-center">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowNewCardForm(true)} className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2">
              + Add New Card
            </button>
          )}
        </div>

        <div className="card text-xs text-muted">
          <p className="font-medium text-white mb-1">How it works:</p>
          <p>1. Enter the amount you want to add</p>
          <p>2. Pay with Google Pay or your Current debit card</p>
          <p>3. Funds auto-convert to USDT stablecoin in your wallet</p>
          <p>4. Use USDT for gas fees, swaps, or anything on BSC</p>
        </div>
      </div>)}

      {view === "tags" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">@Tags</h3></div>
        <div className="card space-y-3"><p className="text-sm text-muted">Create a custom @tag so others can send you crypto without your address.</p><div className="flex gap-2"><input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="mytag" className="flex-1" onKeyDown={(e) => e.key === "Enter" && handleCreateTag()} /><button onClick={handleCreateTag} className="btn-primary text-sm">Create</button></div></div>
        <div className="card"><h4 className="font-medium text-sm mb-2">Your Tags</h4>{userTags.length === 0 ? (<p className="text-xs text-muted">No tags created yet</p>) : (<div className="space-y-2">{userTags.map((t, i) => (<div key={i} onClick={() => { copyToClipboard(t.address); showAlert("info", "Address copied"); }} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-bg-alt rounded-lg px-2"><div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "linear-gradient(135deg, #ff6b9d, #c44dff)" }}>@</div><div><p className="font-medium text-sm">{t.tag}</p><p className="text-xs text-muted">{shortenAddress(t.address)}</p></div></div>))}</div>)}</div>
        <div className="card"><h4 className="font-medium text-sm mb-2">Search Tags</h4><div className="relative mb-2"><Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" /><input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search @tags..." className="w-full pl-9" /></div>{tagSearchResults.length > 0 && (<div className="space-y-2">{tagSearchResults.map((t, i) => (<div key={i} onClick={() => { copyToClipboard(t.address); showAlert("info", "Address copied"); }} className="flex items-center gap-3 py-2 cursor-pointer hover:bg-bg-alt rounded-lg px-2"><div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: "linear-gradient(135deg, #ff6b9d, #c44dff)" }}>@</div><div><p className="font-medium text-sm">{t.tag}</p><p className="text-xs text-muted">{shortenAddress(t.address)}</p></div></div>))}</div>)}</div>
      </div>)}

      {view === "history" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Transaction History</h3></div>
        {txHistory.length === 0 ? (<div className="card text-center py-8"><History className="w-8 h-8 text-muted mx-auto mb-2" /><p className="text-muted text-sm">No transactions yet</p></div>) : (<div className="space-y-2"><AnimatePresence>{txHistory.map((tx, i) => (<motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="card flex items-center gap-3 py-3"><div className={cn("w-10 h-10 rounded-full flex items-center justify-center", tx.direction === "out" ? "bg-danger/10" : "bg-success/10")}>{tx.direction === "out" ? <ArrowUpRight className="w-5 h-5 text-danger" /> : <ArrowDownLeft className="w-5 h-5 text-success" />}</div><div className="flex-1"><p className="text-sm font-medium">{tx.direction === "out" ? "Sent" : "Received"} {tx.type}</p><p className="text-xs text-muted font-mono">{tx.hash.slice(0, 18)}...</p></div><div className={cn("text-sm font-mono font-medium", tx.direction === "out" ? "text-danger" : "text-success")}>{tx.direction === "out" ? "-" : "+"}{tx.amount} {tx.type}</div></motion.div>))}</AnimatePresence></div>)}
      </div>)}
    </div>
  );
}
