import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useTranslation } from "react-i18next";
import { API_BASE } from "@/lib/api";
import { cn, shortenAddress, copyToClipboard, formatBalance } from "@/lib/utils";
import { Wallet as WalletIcon, Send, Download, QrCode, Copy, Tag, History, Coins, Search, ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign, Plus, KeyRound, Crown, Activity, Zap, TrendingUp, ExternalLink, Rocket, Layers, Droplet, Gift, Users, Clock, Calendar, Flame, Globe, Lock, ArrowLeftRight, Shield, CandlestickChart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { IncentiveTokenABI, IncentiveTokenBytecode } from "@/contracts/IncentiveToken";
import { IncentiveVestingABI, IncentiveVestingBytecode } from "@/contracts/IncentiveVesting";
import { FounderMasterVaultABI, FounderMasterVaultBytecode } from "@/contracts/FounderMasterVault";
import { IncentiveGamingStakingABI, IncentiveGamingStakingBytecode } from "@/contracts/IncentiveGamingStaking";
import { IncentiveUBIABI, IncentiveUBIBytecode } from "@/contracts/IncentiveUBI";
import { IncentiveBridgeABI, IncentiveBridgeBytecode } from "@/contracts/IncentiveBridge";
import { IncentiveEscrowABI, IncentiveEscrowBytecode } from "@/contracts/IncentiveEscrow";
import incentivesCoin from "@/assets/incentives-coin.png";
import { PageHeader } from "@/components/layout/PageShell";

const BSC_RPC = "https://bsc-dataseed.binance.org";
const FEE_PERCENT = 0.005;
const FEE_WALLET = "0x7Fb10c467319Dd4C9CEB3fcF018C2101a0842D8d";

const STABLECOINS: Record<string, { address: string; decimals: number; name: string; icon: string; color: string }> = {
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, name: "Tether USD", icon: "T", color: "#26a17b" },
  USDC: { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, name: "USD Coin", icon: "U", color: "#2775ca" },
  BUSD: { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", decimals: 18, name: "Binance USD", icon: "B", color: "#f0b90b" },
  DAI:  { address: "0x1af3f329e963e609a3a4f2173050835a825754b0", decimals: 18, name: "Dai Stablecoin", icon: "D", color: "#f5ac37" },
  XRP:  { address: "0x1d2f0da169ceb9fc7b44060a82d6566db7460d4f", decimals: 18, name: "XRP", icon: "X", color: "#23292f" },
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
  { symbol: "USDT", ...STABLECOINS.USDT },
  { symbol: "USDC", ...STABLECOINS.USDC },
  { symbol: "BUSD", ...STABLECOINS.BUSD },
  { symbol: "DAI", ...STABLECOINS.DAI },
  { symbol: "XRP", ...STABLECOINS.XRP },
];

interface TxRecord {
  type: string; to: string; amount: string; hash: string;
  direction: "out" | "in"; timestamp: number;
}

type WalletView = "main" | "send" | "receive" | "tags" | "history" | "buy" | "add-funds" | "deploy" | "founder-vault" | "agent-status" | "liquidity" | "ubi" | "swap" | "bridge" | "escrow";

// Use the shared API_BASE from api.ts (https://191.44.121.29.sslip.io)

export function WalletPage() {
  const { walletAddress, walletKey, showAlert, setView: navigateView, isFounder } = useStore();
  const { t } = useTranslation();
  const [view, setView] = useState<WalletView>("main");
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [usdValues, setUsdValues] = useState<Record<string, number>>({});
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [deploying, setDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState("");
  const [vaultData, setVaultData] = useState<any>(null);
  const [stakingData, setStakingData] = useState<any>(null);
  const [agentLogs, setAgentLogs] = useState<any[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const [liqAmountA, setLiqAmountA] = useState("");
  const [liqAmountB, setLiqAmountB] = useState("");
  const [liqApproved, setLiqApproved] = useState(false);
  const [disburseAmount, setDisburseAmount] = useState("");
  const [disburseCategory, setDisburseCategory] = useState("0");
  const [disburseAddr, setDisburseAddr] = useState("");
  const [refillAmount, setRefillAmount] = useState("1000000000");

  // UBI state
  const [ubiData, setUbiData] = useState<any>(null);
  const [ubiRegistered, setUbiRegistered] = useState(false);
  const [ubiEligible, setUbiEligible] = useState(false);
  const [ubiLastClaim, setUbiLastClaim] = useState(0);
  const [ubiRegTime, setUbiRegTime] = useState(0);
  const [ubiClaiming, setUbiClaiming] = useState(false);
  const [ubiRegistering, setUbiRegistering] = useState(false);
  const ubiContractRef = useRef<any>(null);

  // Burn stats
  const [totalBurned, setTotalBurned] = useState(0);
  const [burnRate, setBurnRate] = useState(0.001);

  // Swap state
  const [swapFromToken, setSwapFromToken] = useState("INC");
  const [swapToToken, setSwapToToken] = useState("USDT");
  const [swapFromAmount, setSwapFromAmount] = useState("");
  const [swapToAmount, setSwapToAmount] = useState("");
  const [swapSlippage, setSwapSlippage] = useState(0.5);
  const [swapPriceImpact, setSwapPriceImpact] = useState(0);
  const [swapRouting, setSwapRouting] = useState("");
  const [swapping, setSwapping] = useState(false);

  // Bridge state
  const [bridgeFromToken, setBridgeFromToken] = useState("USDT");
  const [bridgeToToken, setBridgeToToken] = useState("USDC");
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [bridgeRecipient, setBridgeRecipient] = useState("");
  const [bridgeQuote, setBridgeQuote] = useState<any>(null);
  const [bridgeCountry, setBridgeCountry] = useState("US");
  const [bridging, setBridging] = useState(false);
  const [bridgeStats, setBridgeStats] = useState<any>(null);
  const bridgeContractRef = useRef<any>(null);

  // Escrow state
  const [escrowData, setEscrowData] = useState<any>(null);
  const [escrowClaiming, setEscrowClaiming] = useState(false);
  const escrowContractRef = useRef<any>(null);

  // Decentralization stats
  const [decentStats, setDecentStats] = useState<any>(null);

  // KYC tier
  const [kycTier, setKycTier] = useState(0);

  // Trading stats
  const [tradingStats, setTradingStats] = useState<any>(null);

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
        const resp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=binancecoin,ripple&vs_currencies=usd");
        const data = await resp.json();
        const bnbPrice = data.binancecoin?.usd || 0;
        const xrpPrice = data.ripple?.usd || 0;
        const bnbUsd = bnbFormatted * bnbPrice;
        newUsd["BNB"] = bnbUsd;
        total += bnbUsd;
        (window as any).__xrpPrice = xrpPrice;
      } catch { newUsd["BNB"] = 0; }

      if (incContractRef.current) {
        try {
          const incBal = await incContractRef.current.balanceOf(wallet.address);
          const incDecimals = await incContractRef.current.decimals();
          newBalances["INC"] = parseFloat(ethers.formatUnits(incBal, incDecimals));
        } catch { newBalances["INC"] = 0; }
      } else { newBalances["INC"] = 0; }
      newUsd["INC"] = 0;

      const STABLE_SYMS = ["USDT", "USDC", "BUSD", "DAI"];
      for (const sym of STABLE_SYMS) {
        const info = STABLECOINS[sym];
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

      // XRP — has fluctuating price, fetch from CoinGecko
      try {
        const xrpContract = contractsRef.current["XRP"];
        if (xrpContract) {
          const xrpBal = await xrpContract.balanceOf(wallet.address);
          const xrpFormatted = parseFloat(ethers.formatUnits(xrpBal, STABLECOINS.XRP.decimals));
          newBalances["XRP"] = xrpFormatted;
          const xrpPrice = (window as any).__xrpPrice || 0;
          const xrpUsd = xrpFormatted * xrpPrice;
          newUsd["XRP"] = xrpUsd;
          total += xrpUsd;
        } else { newBalances["XRP"] = 0; newUsd["XRP"] = 0; }
      } catch { newBalances["XRP"] = 0; newUsd["XRP"] = 0; }

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

      // Init UBI contract if deployed
      const ubiAddr = localStorage.getItem("inc_ubi_contract");
      if (ubiAddr) {
        ubiContractRef.current = new ethers.Contract(ubiAddr, IncentiveUBIABI, wallet);
      }

      // Init Bridge contract if deployed
      const bridgeAddr = localStorage.getItem("inc_bridge_contract");
      if (bridgeAddr) {
        bridgeContractRef.current = new ethers.Contract(bridgeAddr, IncentiveBridgeABI, wallet);
      }

      // Init Escrow contract if deployed
      const escrowAddr = localStorage.getItem("inc_escrow_contract");
      if (escrowAddr) {
        escrowContractRef.current = new ethers.Contract(escrowAddr, IncentiveEscrowABI, wallet);
      }

      // Fetch burn stats from token contract
      if (incContractRef.current) {
        try {
          const incContract = new ethers.Contract(incAddr!, IncentiveTokenABI, wallet) as any;
          const burned = await incContract.totalBurned();
          setTotalBurned(parseFloat(ethers.formatUnits(burned, 18)));
        } catch {}
      }

      await updateBalances();
      const history = JSON.parse(localStorage.getItem("soulmate_tx_history") || "[]");
      setTxHistory(history);

      try {
        const resp = await fetch(`${API_BASE}/v1/tags/search?q=`, {
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

  // Fetch UBI data
  const fetchUBIData = useCallback(async () => {
    if (!ubiContractRef.current || !walletAddress) return;
    try {
      const ethers = await import("ethers");
      const ubi = ubiContractRef.current;
      const [info, registered, eligible, lastClaim, regTime] = await Promise.all([
        ubi.getUBIInfo(),
        ubi.isRegistered(walletAddress),
        ubi.isEligible(walletAddress),
        ubi.lastClaimTime(walletAddress),
        ubi.registrationTime(walletAddress),
      ]);
      setUbiData({
        poolBalance: parseFloat(ethers.formatUnits(info[0], 18)),
        currentRate: parseFloat(ethers.formatUnits(info[1], 18)),
        nextHalvingTime: Number(info[2]),
        halvingCount: Number(info[3]),
        totalRecipients: Number(info[4]),
        totalDistributed: parseFloat(ethers.formatUnits(info[5], 18)),
      });
      setUbiRegistered(registered);
      setUbiEligible(eligible);
      setUbiLastClaim(Number(lastClaim));
      setUbiRegTime(Number(regTime));
    } catch (e: any) {
      console.error("UBI data fetch failed:", e);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (localStorage.getItem("inc_ubi_contract")) fetchUBIData();
  }, [fetchUBIData]);

  // Fetch bridge stats
  const fetchBridgeStats = useCallback(async () => {
    if (!bridgeContractRef.current) return;
    try {
      const ethers = await import("ethers");
      const stats = await bridgeContractRef.current.getBridgeStats();
      setBridgeStats({
        totalVolume: parseFloat(ethers.formatUnits(stats[0], 18)),
        liquidity: parseFloat(ethers.formatUnits(stats[1], 18)),
        fees: parseFloat(ethers.formatUnits(stats[2], 18)),
        activeBridges: Number(stats[3]),
      });
    } catch (e: any) {
      console.error("Bridge stats fetch failed:", e);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("inc_bridge_contract")) fetchBridgeStats();
  }, [fetchBridgeStats]);

  // Fetch escrow data
  const fetchEscrowData = useCallback(async () => {
    if (!escrowContractRef.current || !walletAddress) return;
    try {
      const ethers = await import("ethers");
      const info = await escrowContractRef.current.getEscrowInfo();
      setEscrowData({
        totalLocked: parseFloat(ethers.formatUnits(info[0], 18)),
        released: parseFloat(ethers.formatUnits(info[1], 18)),
        releasable: parseFloat(ethers.formatUnits(info[2], 18)),
        nextReleaseTime: Number(info[3]),
        monthsElapsed: Number(info[4]),
        monthlyAmount: parseFloat(ethers.formatUnits(info[5], 18)),
      });
    } catch (e: any) {
      console.error("Escrow data fetch failed:", e);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (localStorage.getItem("inc_escrow_contract")) fetchEscrowData();
  }, [fetchEscrowData]);

  // Fetch decentralization stats
  const fetchDecentStats = useCallback(async () => {
    if (!incContractRef.current) return;
    try {
      const ethers = await import("ethers");
      const incAddr = localStorage.getItem("inc_contract");
      if (!incAddr) return;
      const incContract = new ethers.Contract(incAddr, IncentiveTokenABI, walletRef.current);
      const stats = await incContract.getDecentralizationStats();
      setDecentStats({
        eoaBalance: parseFloat(ethers.formatUnits(stats[0], 18)),
        contractBalance: parseFloat(ethers.formatUnits(stats[1], 18)),
        eoaPercentage: Number(stats[2]),
        isMature: stats[3],
      });
    } catch (e: any) {
      console.error("Decent stats fetch failed:", e);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem("inc_contract")) fetchDecentStats();
  }, [fetchDecentStats]);

  useEffect(() => {
    const cards = JSON.parse(localStorage.getItem("soulmate_saved_cards") || "[]");
    setSavedCards(cards);
  }, []);

  useEffect(() => {
    if (!sendTo.startsWith("@") || sendTo.length < 2) { setTagResolveInfo(null); return; }
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/tags/${sendTo.substring(1)}`);
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
        const resp = await fetch(`${API_BASE}/v1/tags/search?q=${encodeURIComponent(tagSearch)}`, {
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
          const resp = await fetch(`${API_BASE}/v1/tags/${sendTo.substring(1)}`);
          if (!resp.ok) { showAlert("danger", `Tag ${sendTo} not found`); return; }
          const data = await resp.json();
          recipientAddress = data.address;
        } catch (e: any) { showAlert("danger", `Failed to resolve tag: ${e.message}`); return; }
      }

      if (!recipientAddress.startsWith("0x") || recipientAddress.length !== 42) {
        showAlert("danger", "Invalid recipient address"); return;
      }

      const sendAmountNum = parseFloat(sendAmount);
      const feeAmount = isFounder ? 0 : sendAmountNum * FEE_PERCENT;
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
      showAlert("success", `Sent ${recipientGets.toFixed(6)} ${sendToken}${isFounder ? " (FOUNDER: 0% fee)" : ` (fee: ${feeAmount.toFixed(6)})`} TX: ${tx.hash.slice(0, 20)}...`);
      setSendTo(""); setSendAmount(""); setView("main");
      await updateBalances();
    } catch (e: any) { showAlert("danger", "Transaction failed: " + e.message); }
    finally { setLoading(false); }
  };

  const handleCreateTag = async () => {
    if (!tagInput.trim()) return showAlert("danger", "Enter a tag name");
    if (!walletAddress) return showAlert("danger", "Wallet not loaded");
    try {
      const resp = await fetch(`${API_BASE}/v1/tags/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024" },
        body: JSON.stringify({ tag: tagInput.trim(), address: walletAddress, owner_name: "" }),
      });
      const data = await resp.json();
      if (!resp.ok) { showAlert("danger", data.detail || "Failed to create tag"); return; }
      showAlert("success", `Tag @${tagInput.trim()} created!`);
      setTagInput("");
      try {
        const resp2 = await fetch(`${API_BASE}/v1/tags/search?q=`, { headers: { "X-API-Token": "soulmate_wallet_2024" } });
        const data2 = await resp2.json();
        setUserTags((data2.tags || []).filter((t: any) => t.address?.toLowerCase() === walletAddress.toLowerCase()));
      } catch {}
    } catch (e: any) { showAlert("danger", "Failed to create tag: " + e.message); }
  };

  const contractsDeployed = typeof window !== "undefined" && !!localStorage.getItem("inc_contract");

  const fetchVaultData = useCallback(async () => {
    const vaultAddr = localStorage.getItem("founder_vault_contract");
    const stakingAddr = localStorage.getItem("inc_staking_contract");
    if (!vaultAddr || !walletRef.current) return;
    try {
      const ethers = await import("ethers");
      const vault = new ethers.Contract(vaultAddr, FounderMasterVaultABI, walletRef.current);
      const overview = await vault.getUnifiedVaultOverview();
      setVaultData({
        reserves: parseFloat(ethers.formatEther(overview[0])),
        locked: parseFloat(ethers.formatEther(overview[1])),
        releasable: parseFloat(ethers.formatEther(overview[2])),
        treasury: parseFloat(ethers.formatEther(overview[3])),
        stakingPool: parseFloat(ethers.formatEther(overview[4])),
      });
      if (stakingAddr) {
        const staking = new ethers.Contract(stakingAddr, IncentiveGamingStakingABI, walletRef.current);
        const info = await staking.getStakingInfo();
        setStakingData({
          totalStaked: parseFloat(ethers.formatEther(info[0])),
          rewardRate: parseFloat(ethers.formatEther(info[1])),
          finishAt: Number(info[2]),
          apy: Number(info[4]) / 100,
        });
      }
    } catch {}
  }, []);

  const fetchAgentStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/v1/agent/status`);
      if (resp.ok) { const d = await resp.json(); setAgentOnline(d.online || false); }
    } catch {}
    try {
      const resp = await fetch(`${API_BASE}/v1/agent/logs`);
      if (resp.ok) { const d = await resp.json(); setAgentLogs(d.logs || []); }
    } catch {}
  }, []);

  useEffect(() => {
    if (contractsDeployed) { fetchVaultData(); fetchAgentStatus(); }
  }, [contractsDeployed, fetchVaultData, fetchAgentStatus]);

  const handleDeploy = async () => {
    if (!walletRef.current) return showAlert("danger", "Wallet not initialized");
    const bnbBal = await providerRef.current?.getBalance(walletRef.current.address);
    const ethers = await import("ethers");
    const bnbFormatted = parseFloat(ethers.formatEther(bnbBal || 0));
    if (bnbFormatted < 0.05) {
      showAlert("warning", `Low BNB balance (${bnbFormatted.toFixed(4)}). You need ~0.1 BNB for deployment gas.`);
    }
    setDeploying(true);
    try {
      const wallet = walletRef.current;
      const toWei = (n: string) => ethers.parseUnits(n, 18);

      setDeployStep("1/25 Deploying IncentiveToken (600B supply, burn, halving)...");
      const TokenFactory = new ethers.ContractFactory(IncentiveTokenABI, IncentiveTokenBytecode, wallet);
      const token = await TokenFactory.deploy(wallet.address) as any;
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      localStorage.setItem("inc_contract", tokenAddr);

      setDeployStep("2/25 Deploying FounderMasterVault...");
      const VaultFactory = new ethers.ContractFactory(FounderMasterVaultABI, FounderMasterVaultBytecode, wallet);
      const vault = await VaultFactory.deploy(tokenAddr) as any;
      await vault.waitForDeployment();
      const vaultAddr = await vault.getAddress();
      localStorage.setItem("founder_vault_contract", vaultAddr);

      setDeployStep("3/25 Deploying IncentiveVesting...");
      const VestingFactory = new ethers.ContractFactory(IncentiveVestingABI, IncentiveVestingBytecode, wallet);
      const vesting = await VestingFactory.deploy(tokenAddr, wallet.address) as any;
      await vesting.waitForDeployment();
      const vestingAddr = await vesting.getAddress();
      localStorage.setItem("inc_vesting_contract", vestingAddr);

      setDeployStep("4/25 Deploying IncentiveGamingStaking...");
      const StakingFactory = new ethers.ContractFactory(IncentiveGamingStakingABI, IncentiveGamingStakingBytecode, wallet);
      const staking = await StakingFactory.deploy(tokenAddr) as any;
      await staking.waitForDeployment();
      const stakingAddr = await staking.getAddress();
      localStorage.setItem("inc_staking_contract", stakingAddr);

      setDeployStep("5/25 Deploying IncentiveUBI (100B pool, auto-halving)...");
      const UBIFactory = new ethers.ContractFactory(IncentiveUBIABI, IncentiveUBIBytecode, wallet);
      const ubi = await UBIFactory.deploy(tokenAddr, vaultAddr) as any;
      await ubi.waitForDeployment();
      const ubiAddr = await ubi.getAddress();
      localStorage.setItem("inc_ubi_contract", ubiAddr);
      ubiContractRef.current = new ethers.Contract(ubiAddr, IncentiveUBIABI, wallet);

      setDeployStep("6/25 Deploying IncentiveBridge (cross-border payments)...");
      const BridgeFactory = new ethers.ContractFactory(IncentiveBridgeABI, IncentiveBridgeBytecode, wallet);
      const bridge = await BridgeFactory.deploy(tokenAddr) as any;
      await bridge.waitForDeployment();
      const bridgeAddr = await bridge.getAddress();
      localStorage.setItem("inc_bridge_contract", bridgeAddr);
      bridgeContractRef.current = new ethers.Contract(bridgeAddr, IncentiveBridgeABI, wallet);

      setDeployStep("7/25 Deploying IncentiveEscrow (74B, 25yr monthly)...");
      const EscrowFactory = new ethers.ContractFactory(IncentiveEscrowABI, IncentiveEscrowBytecode, wallet);
      const escrow = await EscrowFactory.deploy(tokenAddr, wallet.address) as any;
      await escrow.waitForDeployment();
      const escrowAddr = await escrow.getAddress();
      localStorage.setItem("inc_escrow_contract", escrowAddr);
      escrowContractRef.current = new ethers.Contract(escrowAddr, IncentiveEscrowABI, wallet);

      setDeployStep("8/25 Linking vesting to vault...");
      await (await vault.setVestingContract(vestingAddr)).wait();

      setDeployStep("9/25 Linking staking to vault...");
      await (await vault.setStakingContract(stakingAddr)).wait();

      setDeployStep("10/25 Initializing ecosystem reserves (100B staking, 75B marketing)...");
      await (await vault.initializeReserves(toWei("100000000000"), toWei("75000000000"), toWei("0"))).wait();

      setDeployStep("11/25 Initializing trading reserves (25B DEX, 30B MM, 20B exchange, 15B rewards, 10B contingency)...");
      await (await vault.initializeTradingReserves(toWei("25000000000"), toWei("30000000000"), toWei("20000000000"), toWei("15000000000"), toWei("10000000000"))).wait();

      setDeployStep("12/25 Transferring 200B INC to vault (ecosystem + trading)...");
      await (await token.transfer(vaultAddr, toWei("200000000000"))).wait();

      setDeployStep("13/25 Transferring 100B INC to UBI pool...");
      await (await token.transfer(ubiAddr, toWei("100000000000"))).wait();
      await (await ubi.depositToPool(toWei("100000000000"))).wait();

      setDeployStep("14/25 Transferring 75B INC to bridge liquidity...");
      await (await token.transfer(bridgeAddr, toWei("75000000000"))).wait();
      await (await bridge.addLiquidity(tokenAddr, toWei("75000000000"))).wait();

      setDeployStep("15/25 Transferring 74B INC to escrow (25yr lockup)...");
      await (await token.transfer(escrowAddr, toWei("74000000000"))).wait();

      setDeployStep("16/25 Transferring 1B INC to staking pool...");
      await (await token.transfer(stakingAddr, toWei("1000000000"))).wait();

      setDeployStep("17/25 Starting staking reward cycle...");
      await (await staking.notifyRewardFromBalance(toWei("1000000000"))).wait();

      setDeployStep("18/25 Setting UBI initial rate (1000 INC/month)...");
      await (await ubi.setInitialRate(toWei("1000"))).wait();

      setDeployStep("19/25 Adding supported bridge tokens (USDT, USDC, BUSD, DAI, XRP)...");
      await (await bridge.addSupportedToken(STABLECOINS.USDT.address)).wait();
      await (await bridge.addSupportedToken(STABLECOINS.USDC.address)).wait();
      await (await bridge.addSupportedToken(STABLECOINS.BUSD.address)).wait();
      await (await bridge.addSupportedToken(STABLECOINS.DAI.address)).wait();
      await (await bridge.addSupportedToken(STABLECOINS.XRP.address)).wait();

      setDeployStep("20/25 Setting bridge fee rate (0.5%)...");
      await (await bridge.setFeeRate(50)).wait();

      setDeployStep("21/25 Setting KYC tier limits (Tier 0: $100, Tier 1: $1K, Tier 2: $10K)...");
      await (await bridge.setDailyLimit(0, toWei("100"))).wait();
      await (await bridge.setDailyLimit(1, toWei("1000"))).wait();
      await (await bridge.setDailyLimit(2, toWei("10000"))).wait();

      setDeployStep("22/25 Setting founder KYC to Tier 2...");
      await (await bridge.setKYCTier(wallet.address, 2)).wait();
      setKycTier(2);

      setDeployStep("23/25 Adding bridge liquidity for USDT...");
      await (await bridge.addLiquidity(STABLECOINS.USDT.address, toWei("50000000"))).wait();

      setDeployStep("24/25 Adding bridge liquidity for USDC...");
      await (await bridge.addLiquidity(STABLECOINS.USDC.address, toWei("50000000"))).wait();

      setDeployStep("25/25 Finalizing — fetching burn & decentralization stats...");
      const incContract = new ethers.Contract(tokenAddr, IncentiveTokenABI, wallet) as any;
      try {
        const burned = await incContract.totalBurned();
        setTotalBurned(parseFloat(ethers.formatUnits(burned, 18)));
      } catch {}
      try {
        const decent = await incContract.getDecentralizationStats();
        setDecentStats({
          eoaBalance: parseFloat(ethers.formatUnits(decent[0], 18)),
          contractBalance: parseFloat(ethers.formatUnits(decent[1], 18)),
          eoaPercentage: Number(decent[2]),
          isMature: decent[3],
        });
      } catch {}

      incContractRef.current = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
      contractsRef.current["INC"] = incContractRef.current;

      showAlert("success", "All 7 contracts deployed! Token, Vault, Vesting, Staking, UBI, Bridge, and Escrow are live on BSC.");
      setDeployStep("");
      setDeploying(false);
      await updateBalances();
      await fetchVaultData();
      await fetchUBIData();
      fetchBridgeStats();
      fetchEscrowData();
      fetchDecentStats();
      setView("founder-vault");
    } catch (e: any) {
      showAlert("danger", "Deployment failed: " + e.message);
      setDeploying(false);
      setDeployStep("");
    }
  };

  const handleClaimVesting = async () => {
    const vaultAddr = localStorage.getItem("founder_vault_contract");
    if (!vaultAddr || !walletRef.current) return;
    try {
      const ethers = await import("ethers");
      const vault = new ethers.Contract(vaultAddr, FounderMasterVaultABI, walletRef.current);
      const tx = await vault.claimFounderVesting();
      await tx.wait();
      showAlert("success", "Vesting claimed! Tokens sent to your wallet.");
      await fetchVaultData();
      await updateBalances();
    } catch (e: any) { showAlert("danger", "Claim failed: " + e.message); }
  };

  const handleRefillStaking = async () => {
    const vaultAddr = localStorage.getItem("founder_vault_contract");
    if (!vaultAddr || !walletRef.current) return;
    try {
      const ethers = await import("ethers");
      const vault = new ethers.Contract(vaultAddr, FounderMasterVaultABI, walletRef.current);
      const tx = await vault.refillStakingPool(ethers.parseEther(refillAmount));
      await tx.wait();
      showAlert("success", `Refilled ${refillAmount} INC to staking pool!`);
      await fetchVaultData();
    } catch (e: any) { showAlert("danger", "Refill failed: " + e.message); }
  };

  const handleDisburse = async () => {
    const vaultAddr = localStorage.getItem("founder_vault_contract");
    if (!vaultAddr || !walletRef.current || !disburseAddr || !disburseAmount) return;
    try {
      const ethers = await import("ethers");
      const vault = new ethers.Contract(vaultAddr, FounderMasterVaultABI, walletRef.current);
      const tx = await vault.disburseEcosystemFunds(parseInt(disburseCategory), disburseAddr, ethers.parseEther(disburseAmount));
      await tx.wait();
      showAlert("success", "Funds disbursed!");
      setDisburseAmount(""); setDisburseAddr("");
      await fetchVaultData();
    } catch (e: any) { showAlert("danger", "Disbursement failed: " + e.message); }
  };

  const handleTriggerHalving = async () => {
    const tokenAddr = localStorage.getItem("inc_contract");
    if (!tokenAddr || !walletRef.current) return;
    if (!confirm("Trigger annual halving? This halves the emission rate and cannot be undone.")) return;
    try {
      const ethers = await import("ethers");
      const token = new ethers.Contract(tokenAddr, IncentiveTokenABI, walletRef.current);
      const tx = await token.triggerPreHolidayHalving();
      await tx.wait();
      showAlert("success", "Halving executed! Emission rate halved.");
    } catch (e: any) { showAlert("danger", "Halving failed: " + e.message); }
  };

  const handleAddLiquidity = async () => {
    const tokenAddr = localStorage.getItem("inc_contract");
    if (!tokenAddr || !walletRef.current || !liqAmountA || !liqAmountB) return;
    try {
      const ethers = await import("ethers");
      const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
      const routerAbi = ["function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint, uint, uint)"];
      const router = new ethers.Contract(PANCAKE_ROUTER, routerAbi, walletRef.current);
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, walletRef.current);

      if (!liqApproved) {
        const approveTx = await token.approve(PANCAKE_ROUTER, ethers.parseEther(liqAmountA));
        await approveTx.wait();
        setLiqApproved(true);
        showAlert("success", "INC approved for PancakeSwap router!");
        return;
      }

      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const tx = await router.addLiquidityETH(
        tokenAddr,
        ethers.parseEther(liqAmountA),
        0, 0,
        walletRef.current.address,
        deadline,
        { value: ethers.parseEther(liqAmountB) }
      );
      await tx.wait();
      showAlert("success", "Liquidity added! INC/BNB pair created on PancakeSwap.");
      setLiqAmountA(""); setLiqAmountB(""); setLiqApproved(false);
    } catch (e: any) { showAlert("danger", "Liquidity failed: " + e.message); }
  };

  const fmtNum = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  };

  const buyFee = isFounder ? 0 : (parseFloat(buyAmount) || 0) * FEE_PERCENT;
  const buyReceive = (parseFloat(buyAmount) || 0) - buyFee;

  if (!walletAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
          <WalletIcon className="w-8 h-8 text-accent" />
        </div>
        <h3 className="text-xl font-bold mb-2">No Wallet Connected</h3>
        <p className="text-muted text-sm mb-6 max-w-sm">Create a new BSC wallet or import an existing one to send, receive, and manage your crypto.</p>
        <div className="flex gap-3">
          <button onClick={() => navigateView("create-wallet")} className="btn-primary flex items-center gap-2 px-6 py-3">
            <Plus className="w-5 h-5" /> Create Wallet
          </button>
          <button onClick={() => navigateView("import-wallet")} className="btn-secondary flex items-center gap-2 px-6 py-3">
            <KeyRound className="w-5 h-5" /> Import Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        icon={WalletIcon}
        title="Wallet"
        subtitle={`BSC · 7 tokens · ${isFounder ? "0% fee (Founder)" : "0.5% fee"}`}
        accent="from-amber-500 to-orange-500"
        actions={
          <button onClick={updateBalances} disabled={refreshing} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </button>
        }
      />

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
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden" style={{ background: token.color }}>{token.symbol === "INC" ? <img src={incentivesCoin} alt="INC" className="w-full h-full object-cover" /> : token.icon}</div>
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
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setView("swap")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><ArrowLeftRight className="w-4 h-4" /> Swap</button>
          <button onClick={() => setView("bridge")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Globe className="w-4 h-4" /> Send Abroad</button>
        </div>
        {totalBurned > 0 && (
          <div className="card text-center py-2" style={{ background: "linear-gradient(135deg, #ff6b3d15, #ff444410)" }}>
            <p className="text-xs flex items-center justify-center gap-1.5"><Flame className="w-3.5 h-3.5 text-orange-400" /> <span className="text-orange-400 font-medium">{fmtNum(totalBurned)} INC burned forever</span> <span className="text-muted">· Supply: {fmtNum(600000000000 - totalBurned)} INC</span></p>
          </div>
        )}
        {localStorage.getItem("inc_ubi_contract") && (
          <button onClick={() => { setView("ubi"); fetchUBIData(); }} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm w-full" style={{ background: "linear-gradient(135deg, #16a34a15, #22c55e15)" }}>
            <Gift className="w-4 h-4 text-success" /> Universal Basic Income {ubiData ? `· ${ubiData.currentRate.toLocaleString()} INC/mo` : ""}
          </button>
        )}
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setView("buy")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Buy</button>
          <button onClick={() => setView("add-funds")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Add Funds</button>
          <button onClick={() => setView("tags")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Tag className="w-4 h-4" /> Tags</button>
        </div>
        <button onClick={() => setView("history")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm w-full"><History className="w-4 h-4" /> History</button>
        <div className="flex items-center justify-center gap-3 text-xs text-muted pt-2">
          <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-success" /> CLARITY Compliant</span>
          <span>·</span>
          <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-accent" /> KYC Tier {kycTier}</span>
          <span>·</span>
          <span>GENIUS Safe Harbor</span>
        </div>

        {isFounder && (<>
          <div className="border-t border-border my-2" />
          <div className="flex items-center gap-2 text-xs text-accent font-medium mb-1"><Crown className="w-3.5 h-3.5" /> Founder Controls</div>
          <div className="grid grid-cols-2 gap-3">
            {!contractsDeployed && (
              <button onClick={() => setView("deploy")} className="btn-primary flex items-center justify-center gap-2 py-3 text-sm"><Rocket className="w-4 h-4" /> Deploy Contracts</button>
            )}
            {contractsDeployed && (<>
              <button onClick={() => setView("founder-vault")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Layers className="w-4 h-4" /> Founder Vault</button>
              <button onClick={() => setView("agent-status")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Activity className="w-4 h-4" /> Agent Status</button>
              <button onClick={() => setView("liquidity")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Droplet className="w-4 h-4" /> Add Liquidity</button>
              {localStorage.getItem("inc_ubi_contract") && (
                <button onClick={() => { setView("ubi"); fetchUBIData(); }} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Gift className="w-4 h-4 text-success" /> UBI Dashboard</button>
              )}
              {localStorage.getItem("inc_escrow_contract") && (
                <button onClick={() => { setView("escrow"); fetchEscrowData(); }} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Lock className="w-4 h-4" /> Escrow</button>
              )}
            </>)}
          </div>
        </>)}
      </>)}

      {view === "send" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold">Send Crypto</h3></div>
        <div><label className="label">To (address or @tag)</label><input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="0x... or @username" className="w-full" />{tagResolveInfo && (<p className={cn("text-xs mt-1", tagResolveInfo.includes("not found") ? "text-danger" : "text-accent")}>{tagResolveInfo}</p>)}</div>
        <div><label className="label">Token</label><select value={sendToken} onChange={(e) => setSendToken(e.target.value)} className="w-full">{ALL_TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}</select></div>
        <div><label className="label">Amount</label><input type="number" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="0.0000" className="w-full" step="0.0001" /><p className="text-xs text-muted mt-1">Available: {formatBalance(balances[sendToken] || 0)} {sendToken}</p></div>
        {sendAmount && parseFloat(sendAmount) > 0 && (<div className="card text-xs space-y-1"><div className="flex justify-between"><span className="text-muted">You send</span><span>{sendAmount} {sendToken}</span></div><div className="flex justify-between"><span className="text-muted">Fee ({isFounder ? "0% Founder" : "0.5%"})</span><span className={isFounder ? "text-success" : "text-warning"}>{isFounder ? "0" : (parseFloat(sendAmount) * FEE_PERCENT).toFixed(6)} {sendToken}</span></div><div className="flex justify-between font-medium"><span>Recipient gets</span><span className="text-success">{(parseFloat(sendAmount) * (isFounder ? 1 : (1 - FEE_PERCENT))).toFixed(6)} {sendToken}</span></div></div>)}
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
          <div className="text-xs space-y-1 py-2"><div className="flex justify-between"><span className="text-muted">You pay</span><span>${(parseFloat(buyAmount) || 0).toFixed(2)}</span></div><div className="flex justify-between"><span className="text-muted">Fee ({isFounder ? "0% Founder" : "0.5%"})</span><span className={isFounder ? "text-success" : "text-warning"}>${buyFee.toFixed(2)}</span></div><div className="flex justify-between font-medium"><span>You receive</span><span className="text-success">{buyReceive.toFixed(2)} USDT</span></div></div>
          <a href={`https://cash.app/$JustinHawpetoss6/${(parseFloat(buyAmount) || 0).toFixed(2)}?note=${encodeURIComponent(`Buy ${buyReceive.toFixed(2)} USDT — Wallet: ${walletAddress}`)}`} target="_blank" rel="noopener noreferrer" className="btn-primary w-full flex items-center justify-center gap-2 py-3"><DollarSign className="w-5 h-5" /> Pay with Cash App</a>
          <p className="text-xs text-muted text-center">Send ${(parseFloat(buyAmount) || 0).toFixed(2)} via Cash App. USDT will be sent to your wallet after confirmation.</p>
        </div>
      </div>)}

      {view === "add-funds" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← {t("common:actions.back")}</button><h3 className="text-lg font-semibold">{t("wallet:addFunds")}</h3></div>

        <div className="card space-y-3">
          <div><label className="label">{t("wallet:buyAmount")}</label><input type="number" value={fundingAmount} onChange={(e) => setFundingAmount(e.target.value)} className="w-full" step="1" min="1" /></div>
          <div className="bg-accent/10 rounded-lg p-3 text-xs">
            <p className="font-medium text-accent mb-1">{t("wallet:autoConvertsToUSDT")}</p>
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
                const resp = await fetch(`${API_BASE}/v1/wallet/googlepay/deposit`, {
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
            {processingPayment ? t("wallet:processing") : <>Pay ${(parseFloat(fundingAmount) || 0).toFixed(2)} {t("wallet:payWithGooglePay")}</>}
          </button>
        </div>

        {/* Saved Cards */}
        {savedCards.length > 0 && (
          <div className="card">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#00C2A8" }}>C</div>
              {t("wallet:savedCards")}
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
                        const resp = await fetch(`${API_BASE}/v1/wallet/card/deposit`, {
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
            {t("wallet:currentCard")}
          </h4>
          {showNewCardForm ? (
            <div className="space-y-3">
              <div><label className="label">{t("wallet:cardNumber")}</label><input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="1234 5678 9012 3456" className="w-full" maxLength={19} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{t("wallet:expiry")}</label><input value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" className="w-full" maxLength={5} /></div>
                <div><label className="label">{t("wallet:cvc")}</label><input value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="123" className="w-full" maxLength={4} type="password" /></div>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="rounded" />
                {t("wallet:saveCard")}
              </label>
              <button
                onClick={async () => {
                  const amt = parseFloat(fundingAmount) || 0;
                  if (amt < 1) return showAlert("danger", "Enter a valid amount");
                  if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvc.trim()) return showAlert("danger", "Fill in all card details");
                  setProcessingPayment(true);
                  try {
                    const resp = await fetch(`${API_BASE}/v1/wallet/card/deposit`, {
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
                {processingPayment ? t("wallet:processing") : <>Pay ${(parseFloat(fundingAmount) || 0).toFixed(2)} {t("wallet:currentCard")}</>}
              </button>
              <button onClick={() => setShowNewCardForm(false)} className="text-muted text-xs hover:text-white w-full text-center">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowNewCardForm(true)} className="btn-secondary w-full py-3 text-sm flex items-center justify-center gap-2">
              + {t("wallet:addNewCard")}
            </button>
          )}
        </div>

        {/* Hong Kong On-Ramp */}
        <div className="card">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <span className="text-lg">🇭🇰</span> Hong Kong On-Ramp
          </h4>
          <p className="text-xs text-muted mb-3">Buy USDT with HKD via local payment methods (FPS, AlipayHK, WeChat Pay HK, credit/debit card).</p>

          <div className="space-y-3">
            {/* Transak */}
            <div className="bg-bg-alt rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: "#1A73E8" }}>T</div>
                  <div>
                    <p className="text-sm font-medium">Transak</p>
                    <p className="text-xs text-muted">FPS, AlipayHK, Card • Instant</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const amt = parseFloat(fundingAmount) || 0;
                  if (amt < 1) return showAlert("danger", "Enter a valid amount");
                  const params = new URLSearchParams({
                    apiKey: "TRANSAK_API_KEY",
                    cryptoCurrency: "USDT",
                    network: "bsc",
                    walletAddress: walletAddress || "",
                    fiatCurrency: "HKD",
                    fiatAmount: (amt * 7.8).toFixed(0),
                    country: "HK",
                  });
                  window.open(`https://global.transak.com/?${params.toString()}`, "_blank");
                  showAlert("info", "Opening Transak — complete your purchase in the new tab");
                }}
                className="btn-primary w-full py-2.5 text-sm"
              >
                Buy via Transak
              </button>
            </div>

            {/* MoonPay */}
            <div className="bg-bg-alt rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: "#7B61FF" }}>M</div>
                  <div>
                    <p className="text-sm font-medium">MoonPay</p>
                    <p className="text-xs text-muted">Card, Apple Pay, Google Pay • Instant</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const amt = parseFloat(fundingAmount) || 0;
                  if (amt < 1) return showAlert("danger", "Enter a valid amount");
                  const params = new URLSearchParams({
                    apiKey: "pk_live_MoonPayKey",
                    currencyCode: "USDT",
                    baseCurrencyCode: "HKD",
                    baseCurrencyAmount: (amt * 7.8).toFixed(0),
                    walletAddress: walletAddress || "",
                    chain: "bsc",
                  });
                  window.open(`https://buy.moonpay.com/?${params.toString()}`, "_blank");
                  showAlert("info", "Opening MoonPay — complete your purchase in the new tab");
                }}
                className="btn-primary w-full py-2.5 text-sm"
              >
                Buy via MoonPay
              </button>
            </div>

            {/* FPS Bank Transfer */}
            <div className="bg-bg-alt rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ background: "#003366" }}>F</div>
                <div>
                  <p className="text-sm font-medium">FPS Bank Transfer</p>
                  <p className="text-xs text-muted">Faster Payment System • 1-2 business days</p>
                </div>
              </div>
              <div className="text-xs text-muted space-y-1">
                <p>1. Open your banking app and select FPS</p>
                <p>2. Enter the Soulmate FPS ID: <span className="text-white font-mono">123456789</span></p>
                <p>3. Transfer HKD — funds auto-convert to USDT</p>
              </div>
              <button
                onClick={() => {
                  const fpsId = "123456789";
                  navigator.clipboard?.writeText(fpsId);
                  showAlert("success", "FPS ID copied! Transfer HKD to receive USDT.");
                }}
                className="btn-secondary w-full py-2.5 text-sm mt-2"
              >
                Copy FPS ID
              </button>
            </div>
          </div>
        </div>

        <div className="card text-xs text-muted">
          <p className="font-medium text-white mb-1">{t("wallet:receiveCrypto")}</p>
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

      {view === "deploy" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Rocket className="w-5 h-5 text-accent" /> Deploy INC Contracts</h3></div>
        <div className="card space-y-4">
          <div className="bg-accent/10 rounded-xl p-4">
            <p className="text-sm font-medium text-accent mb-2">Unified Founder Master Vault System</p>
            <p className="text-xs text-muted">This will deploy 7 contracts on BSC Mainnet:</p>
            <ul className="text-xs text-muted mt-2 space-y-1">
              <li>1. IncentiveToken (ERC20, 600B supply, burn, halving)</li>
              <li>2. FounderMasterVault (ecosystem + trading reserves)</li>
              <li>3. IncentiveVesting (founder lockup)</li>
              <li>4. IncentiveGamingStaking (Synthetix-style rewards)</li>
              <li>5. IncentiveUBI (Universal Basic Income, 100B, auto-halving)</li>
              <li>6. IncentiveBridge (cross-border payments, KYC, sanctions)</li>
              <li>7. IncentiveEscrow (74B, 25yr monthly release)</li>
            </ul>
          </div>
          <div className="bg-warning/10 rounded-lg p-3 text-xs text-warning">
            <p className="font-medium">⚠ Requirements:</p>
            <p>· Wallet needs ~0.2 BNB for gas (~$60-100)</p>
            <p>· 600B INC minted to your wallet</p>
            <p>· 200B to vault (100B ecosystem + 100B trading)</p>
            <p>· 100B to UBI, 75B to bridge, 74B to escrow, 1B to staking</p>
            <p>· ~150B remains in your wallet (founder EOA, 25%)</p>
          </div>
          {deploying ? (
            <div className="text-center py-6">
              <RefreshCw className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">{deployStep || "Deploying..."}</p>
              <p className="text-xs text-muted mt-1">Do not close this page. Each step takes 3-10 seconds.</p>
            </div>
          ) : (
            <button onClick={handleDeploy} className="btn-primary w-full py-4 flex items-center justify-center gap-2"><Rocket className="w-5 h-5" /> Deploy All Contracts</button>
          )}
        </div>
      </div>)}

      {view === "founder-vault" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Layers className="w-5 h-5 text-accent" /> Founder Vault Dashboard</h3></div>

        {vaultData ? (
          <div className="space-y-4">
            <div className="card">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Crown className="w-4 h-4 text-accent" /> Vault Overview</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Ecosystem Reserves</p><p className="text-lg font-bold">{fmtNum(vaultData.reserves)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Locked in Vesting</p><p className="text-lg font-bold">{fmtNum(vaultData.locked)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Releasable Now</p><p className="text-lg font-bold text-success">{fmtNum(vaultData.releasable)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Staking Pool</p><p className="text-lg font-bold">{fmtNum(vaultData.stakingPool)} INC</p></div>
              </div>
            </div>

            {stakingData && (
              <div className="card">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-accent" /> Staking Status</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Staked</p><p className="text-lg font-bold">{fmtNum(stakingData.totalStaked)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Current APY</p><p className="text-lg font-bold text-success">{stakingData.apy.toFixed(2)}%</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Reward Rate</p><p className="text-lg font-bold">{fmtNum(stakingData.rewardRate)} INC/s</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Cycle Ends</p><p className="text-lg font-bold">{stakingData.finishAt > 0 ? new Date(stakingData.finishAt * 1000).toLocaleDateString() : "N/A"}</p></div>
                </div>
              </div>
            )}

            <div className="card space-y-3">
              <h4 className="font-semibold text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-accent" /> Quick Actions</h4>

              {vaultData.releasable > 0 && (
                <button onClick={handleClaimVesting} className="btn-primary w-full py-3 text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Claim Vesting ({fmtNum(vaultData.releasable)} INC available)</button>
              )}

              <div className="flex gap-2">
                <input value={refillAmount} onChange={(e) => setRefillAmount(e.target.value)} placeholder="Amount INC" className="flex-1 text-sm" />
                <button onClick={handleRefillStaking} className="btn-secondary text-sm px-4">Refill Staking</button>
              </div>

              <button onClick={handleTriggerHalving} className="btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2 text-warning"><Zap className="w-4 h-4" /> Trigger Annual Halving</button>
            </div>

            <div className="card space-y-3">
              <h4 className="font-semibold text-sm">Disburse Ecosystem Funds</h4>
              <div className="space-y-2">
                <select value={disburseCategory} onChange={(e) => setDisburseCategory(e.target.value)} className="w-full text-sm">
                  <option value="0">Staking Reserve</option>
                  <option value="1">Marketing & Partnerships</option>
                  <option value="2">Airdrop & Community</option>
                </select>
                <input value={disburseAddr} onChange={(e) => setDisburseAddr(e.target.value)} placeholder="Recipient address 0x..." className="w-full text-sm" />
                <input value={disburseAmount} onChange={(e) => setDisburseAmount(e.target.value)} placeholder="Amount INC" className="w-full text-sm" />
                <button onClick={handleDisburse} className="btn-secondary w-full text-sm">Disburse Funds</button>
              </div>
            </div>

            <div className="card text-xs space-y-1">
              <p className="font-medium text-white mb-1">Contract Addresses:</p>
              {localStorage.getItem("inc_contract") && <p className="text-muted">Token: {shortenAddress(localStorage.getItem("inc_contract") || "")}</p>}
              {localStorage.getItem("founder_vault_contract") && <p className="text-muted">Vault: {shortenAddress(localStorage.getItem("founder_vault_contract") || "")}</p>}
              {localStorage.getItem("inc_vesting_contract") && <p className="text-muted">Vesting: {shortenAddress(localStorage.getItem("inc_vesting_contract") || "")}</p>}
              {localStorage.getItem("inc_staking_contract") && <p className="text-muted">Staking: {shortenAddress(localStorage.getItem("inc_staking_contract") || "")}</p>}
              {localStorage.getItem("inc_ubi_contract") && <p className="text-muted">UBI: {shortenAddress(localStorage.getItem("inc_ubi_contract") || "")}</p>}
              {localStorage.getItem("inc_bridge_contract") && <p className="text-muted">Bridge: {shortenAddress(localStorage.getItem("inc_bridge_contract") || "")}</p>}
              {localStorage.getItem("inc_escrow_contract") && <p className="text-muted">Escrow: {shortenAddress(localStorage.getItem("inc_escrow_contract") || "")}</p>}
            </div>

            {/* Burn Stats */}
            <div className="card" style={{ background: "linear-gradient(135deg, #ff6b3d08, #ff444405)" }}>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" /> Burn Statistics</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Burned</p><p className="text-lg font-bold text-orange-400">{fmtNum(totalBurned)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Current Supply</p><p className="text-lg font-bold">{fmtNum(600000000000 - totalBurned)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Burn Rate</p><p className="text-lg font-bold">0.1% / transfer</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Net Effect</p><p className="text-lg font-bold text-success">Deflationary</p></div>
              </div>
            </div>

            {/* Bridge Stats */}
            {bridgeStats && (
              <div className="card">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> Bridge Statistics</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Volume</p><p className="text-lg font-bold">{fmtNum(bridgeStats.totalVolume)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Active Liquidity</p><p className="text-lg font-bold">{fmtNum(bridgeStats.liquidity)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Fees → UBI</p><p className="text-lg font-bold text-success">{fmtNum(bridgeStats.fees)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Active Bridges</p><p className="text-lg font-bold">{bridgeStats.activeBridges}</p></div>
                </div>
              </div>
            )}

            {/* Escrow Stats */}
            {escrowData && (
              <div className="card">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-accent" /> Escrow Status</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Locked</p><p className="text-lg font-bold">{fmtNum(escrowData.totalLocked)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Released</p><p className="text-lg font-bold text-success">{fmtNum(escrowData.released)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Releasable</p><p className="text-lg font-bold text-accent">{fmtNum(escrowData.releasable)} INC</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Months Elapsed</p><p className="text-lg font-bold">{escrowData.monthsElapsed} / 300</p></div>
                </div>
                {escrowData.releasable > 0 && (
                  <button onClick={() => { setView("escrow"); fetchEscrowData(); }} className="btn-primary w-full py-3 text-sm mt-3 flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Claim {fmtNum(escrowData.releasable)} INC</button>
                )}
              </div>
            )}

            {/* Decentralization Stats */}
            {decentStats && (
              <div className="card">
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-accent" /> Decentralization (CLARITY Act)</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Founder EOA</p><p className="text-lg font-bold">{fmtNum(decentStats.eoaBalance)} INC</p><p className="text-xs text-muted">{(decentStats.eoaPercentage / 100).toFixed(1)}% of supply</p></div>
                  <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">In Contracts</p><p className="text-lg font-bold">{fmtNum(decentStats.contractBalance)} INC</p></div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className={cn("px-2 py-1 rounded-full font-medium", decentStats.isMature ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                    {decentStats.isMature ? "MATURE — <20% EOA" : "Pre-Maturity — EOA > 20%"}
                  </span>
                  <span className="text-muted">CLARITY Act digital commodity classification</span>
                </div>
              </div>
            )}

            {/* Trading Liquidity Stats */}
            <div className="card">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><CandlestickChart className="w-4 h-4 text-accent" /> Trading Liquidity Allocation</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">DEX Pools</p><p className="text-lg font-bold">25B INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Market Maker</p><p className="text-lg font-bold">30B INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Exchange Reserves</p><p className="text-lg font-bold">20B INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Trading Rewards</p><p className="text-lg font-bold">15B INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Contingency</p><p className="text-lg font-bold">10B INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Trading</p><p className="text-lg font-bold text-accent">100B INC</p></div>
              </div>
            </div>

            {/* Compliance Summary */}
            <div className="card" style={{ background: "linear-gradient(135deg, #22c55e08, #16a34a05)" }}>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Shield className="w-4 h-4 text-success" /> Regulatory Compliance</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted">GENIUS Act</span><span className="text-success">Safe Harbor (not a stablecoin)</span></div>
                <div className="flex justify-between"><span className="text-muted">CLARITY Act</span><span className="text-success">Digital Commodity</span></div>
                <div className="flex justify-between"><span className="text-muted">Founder EOA Ownership</span><span className={decentStats ? (decentStats.eoaPercentage / 100 < 20 ? "text-success" : "text-warning") : "text-muted"}>{decentStats ? `${(decentStats.eoaPercentage / 100).toFixed(1)}%` : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted">KYC/AML</span><span className="text-success">3-Tier System Active</span></div>
                <div className="flex justify-between"><span className="text-muted">Sanctions Screening</span><span className="text-success">On-chain + API</span></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card text-center py-8"><RefreshCw className="w-8 h-8 text-muted mx-auto mb-2 animate-spin" /><p className="text-muted text-sm">Loading vault data...</p></div>
        )}
      </div>)}

      {view === "agent-status" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Activity className="w-5 h-5 text-accent" /> Autonomous Agent Status</h3></div>

        <div className="card">
          <div className="flex items-center gap-3 p-3 bg-bg-alt rounded-xl">
            <div className={cn("w-3 h-3 rounded-full", agentOnline ? "bg-success animate-pulse" : "bg-danger")} />
            <div className="flex-1"><p className="text-sm font-medium">Agent: {agentOnline ? "Online" : "Offline"}</p><p className="text-xs text-muted">Running on VPS · Polls every 30 min</p></div>
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold text-sm mb-3">Agent Tasks</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><TrendingUp className="w-4 h-4 text-success" /> Auto-claim vesting releases</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Droplet className="w-4 h-4 text-accent" /> Refill staking pool when low</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Zap className="w-4 h-4 text-warning" /> Execute annual halving</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><DollarSign className="w-4 h-4 text-success" /> Collect transaction fees</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Gift className="w-4 h-4 text-success" /> Monitor UBI pool health</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Clock className="w-4 h-4 text-accent" /> Auto-trigger UBI halving (every 4 years)</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Lock className="w-4 h-4 text-accent" /> Auto-claim monthly escrow releases</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Globe className="w-4 h-4 text-accent" /> Monitor bridge liquidity & rebalance</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Flame className="w-4 h-4 text-orange-400" /> Track burn rate & supply deflation</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Shield className="w-4 h-4 text-success" /> Monitor CLARITY Act compliance status</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><CandlestickChart className="w-4 h-4 text-accent" /> Manage DEX liquidity & market maker inventory</div>
            <div className="flex items-center gap-2 p-2 bg-bg-alt rounded-lg"><Users className="w-4 h-4 text-accent" /> Process KYC tier upgrade requests</div>
          </div>
        </div>

        <div className="card">
          <h4 className="font-semibold text-sm mb-3">Recent Agent Logs</h4>
          {agentLogs.length === 0 ? (
            <p className="text-muted text-xs">No logs yet. Agent will log actions here once running.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {agentLogs.slice(0, 20).map((log, i) => (
                <div key={i} className="text-xs flex items-center gap-2 p-2 bg-bg-alt rounded">
                  <span className={cn("w-2 h-2 rounded-full flex-shrink-0", log.type?.includes("SUCCESS") ? "bg-success" : log.type?.includes("ERROR") ? "bg-danger" : "bg-accent")} />
                  <span className="text-muted flex-shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className="flex-1 truncate">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={fetchAgentStatus} className="btn-secondary w-full text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Refresh Status</button>
      </div>)}

      {view === "liquidity" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Droplet className="w-5 h-5 text-accent" /> Add Liquidity (PancakeSwap)</h3></div>

        <div className="card space-y-4">
          <div className="bg-accent/10 rounded-xl p-4 text-xs">
            <p className="font-medium text-accent mb-1">Create INC/BNB Liquidity Pool</p>
            <p className="text-muted">Add INC and BNB to PancakeSwap to enable trading. This creates the liquidity pool that DEX aggregators use for price discovery.</p>
          </div>

          <div>
            <label className="label">INC Amount</label>
            <input type="number" value={liqAmountA} onChange={(e) => setLiqAmountA(e.target.value)} placeholder="e.g. 100000000 (100M INC)" className="w-full" />
            <p className="text-xs text-muted mt-1">Available: {formatBalance(balances["INC"] || 0)} INC</p>
          </div>

          <div>
            <label className="label">BNB Amount</label>
            <input type="number" value={liqAmountB} onChange={(e) => setLiqAmountB(e.target.value)} placeholder="e.g. 1.0 BNB" className="w-full" step="0.001" />
            <p className="text-xs text-muted mt-1">Available: {formatBalance(balances["BNB"] || 0)} BNB</p>
          </div>

          {liqAmountA && liqAmountB && (
            <div className="bg-bg-alt rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted">Initial Price:</span><span>1 INC = {(parseFloat(liqAmountB) / parseFloat(liqAmountA)).toFixed(12)} BNB</span></div>
              <div className="flex justify-between"><span className="text-muted">Pool Share:</span><span>100% (first liquidity provider)</span></div>
            </div>
          )}

          {liqApproved ? (
            <button onClick={handleAddLiquidity} className="btn-primary w-full py-3 flex items-center justify-center gap-2"><Droplet className="w-5 h-5" /> Add Liquidity</button>
          ) : (
            <button onClick={handleAddLiquidity} disabled={!liqAmountA || !liqAmountB} className="btn-primary w-full py-3 flex items-center justify-center gap-2">Step 1: Approve INC</button>
          )}
          {liqApproved && <p className="text-xs text-success text-center">✓ INC approved! Click "Add Liquidity" to proceed.</p>}
        </div>

        <div className="card text-xs text-muted">
          <p className="font-medium text-white mb-1">How it works:</p>
          <p>1. Approve PancakeSwap router to spend your INC</p>
          <p>2. Add INC + BNB to create the liquidity pool</p>
          <p>3. Receive LP tokens representing your pool share</p>
          <p>4. Users can now swap BNB ↔ INC on PancakeSwap</p>
          <p>5. Price is determined by the pool ratio (x*y=k)</p>
        </div>
      </div>)}

      {view === "ubi" && (<div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Gift className="w-5 h-5 text-success" /> Universal Basic Income</h3></div>

        {ubiData ? (
          <div className="space-y-4">
            {/* Pool Stats */}
            <div className="card bg-gradient-to-br from-success/10 to-transparent">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Gift className="w-4 h-4 text-success" /> UBI Pool</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Pool Balance</p><p className="text-lg font-bold text-success">{fmtNum(ubiData.poolBalance)} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Monthly Rate</p><p className="text-lg font-bold">{ubiData.currentRate.toLocaleString()} INC</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Recipients</p><p className="text-lg font-bold flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {ubiData.totalRecipients.toLocaleString()}</p></div>
                <div className="bg-bg-alt rounded-lg p-3"><p className="text-xs text-muted">Total Distributed</p><p className="text-lg font-bold">{fmtNum(ubiData.totalDistributed)} INC</p></div>
              </div>
            </div>

            {/* Halving Info */}
            <div className="card">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-accent" /> Halving Schedule</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Current Rate</span><span className="font-mono">{ubiData.currentRate.toLocaleString()} INC/mo</span></div>
                <div className="flex justify-between"><span className="text-muted">Halvings Done</span><span className="font-mono">{ubiData.halvingCount}</span></div>
                {ubiData.nextHalvingTime > 0 && (
                  <div className="flex justify-between"><span className="text-muted">Next Halving</span><span className="font-mono flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {new Date(ubiData.nextHalvingTime * 1000).toLocaleDateString()}</span></div>
                )}
                <div className="bg-bg-alt rounded-lg p-2 text-xs text-muted mt-2">
                  <p>Rate halves every 4 years to ensure 80+ year sustainability:</p>
                  <p className="mt-1">1000 → 500 → 250 → 125 → 62 → 31 → ...</p>
                </div>
              </div>
            </div>

            {/* User Status */}
            <div className="card">
              <h4 className="font-semibold text-sm mb-3">Your UBI Status</h4>
              {!ubiRegistered ? (
                <div className="space-y-3">
                  <div className="bg-warning/10 rounded-lg p-3 text-xs text-warning">
                    <p className="font-medium">Not registered yet</p>
                    <p className="mt-1">Register to start receiving monthly UBI. A 30-day waiting period applies before your first claim to prevent abuse.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!ubiContractRef.current) return showAlert("danger", "UBI contract not loaded");
                      setUbiRegistering(true);
                      try {
                        const tx = await ubiContractRef.current.registerForUBI();
                        await tx.wait();
                        showAlert("success", "Registered for UBI! You can claim in 30 days.");
                        await fetchUBIData();
                      } catch (e: any) { showAlert("danger", "Registration failed: " + e.message); }
                      finally { setUbiRegistering(false); }
                    }}
                    disabled={ubiRegistering}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    {ubiRegistering ? "Registering..." : <><Gift className="w-4 h-4" /> Register for UBI</>}
                  </button>
                </div>
              ) : !ubiEligible ? (
                <div className="bg-warning/10 rounded-lg p-3 text-xs text-warning">
                  <p className="font-medium">Waiting period active</p>
                  <p className="mt-1">Registered on {new Date(ubiRegTime * 1000).toLocaleDateString()}. Eligible in {Math.max(0, Math.ceil((ubiRegTime + 30 * 86400 - Date.now() / 1000) / 86400))} days.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-success/10 rounded-lg p-3 text-xs text-success">
                    <p className="font-medium">✓ Eligible to claim</p>
                    <p className="mt-1">You can claim {ubiData.currentRate.toLocaleString()} INC now.</p>
                    {ubiLastClaim > 0 && <p className="mt-1 text-muted">Last claim: {new Date(ubiLastClaim * 1000).toLocaleDateString()}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      if (!ubiContractRef.current) return showAlert("danger", "UBI contract not loaded");
                      setUbiClaiming(true);
                      try {
                        const tx = await ubiContractRef.current.claimUBI();
                        await tx.wait();
                        showAlert("success", `Claimed ${ubiData.currentRate.toLocaleString()} INC! See you next month.`);
                        await fetchUBIData();
                        await updateBalances();
                      } catch (e: any) { showAlert("danger", "Claim failed: " + e.message); }
                      finally { setUbiClaiming(false); }
                    }}
                    disabled={ubiClaiming}
                    className="btn-primary w-full py-3 flex items-center justify-center gap-2"
                  >
                    {ubiClaiming ? "Claiming..." : <><Gift className="w-4 h-4" /> Claim {ubiData.currentRate.toLocaleString()} INC</>}
                  </button>
                </div>
              )}
            </div>

            {/* Sustainability Forecast */}
            <div className="card">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-accent" /> Sustainability</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted">Current monthly burn</span><span className="font-mono">{fmtNum(ubiData.totalRecipients * ubiData.currentRate)} INC</span></div>
                <div className="flex justify-between"><span className="text-muted">Pool covers (at current rate)</span><span className="font-mono">{ubiData.totalRecipients > 0 ? Math.floor(ubiData.poolBalance / (ubiData.totalRecipients * ubiData.currentRate)) : "∞"} months</span></div>
                <div className="flex justify-between"><span className="text-muted">With halving (80yr projection)</span><span className="font-mono text-success">Sustainable ✓</span></div>
                <div className="bg-bg-alt rounded-lg p-2 mt-2">
                  <p className="text-muted">UBI is funded by 3 sources:</p>
                  <p className="mt-1">1. 100B INC reserve (principal)</p>
                  <p>2. Transaction fees (0.5% auto-routed)</p>
                  <p>3. 10% of staking yield</p>
                </div>
              </div>
            </div>

            {/* Founder Controls */}
            {isFounder && (
              <div className="card space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2"><Crown className="w-4 h-4 text-accent" /> Founder UBI Controls</h4>
                <button
                  onClick={async () => {
                    if (!ubiContractRef.current) return;
                    try {
                      const tx = await ubiContractRef.current.triggerHalving();
                      await tx.wait();
                      showAlert("success", "Halving triggered! UBI rate reduced.");
                      await fetchUBIData();
                    } catch (e: any) { showAlert("danger", "Halving failed: " + e.message); }
                  }}
                  className="btn-ghost w-full py-3 text-sm flex items-center justify-center gap-2 text-warning"
                >
                  <Zap className="w-4 h-4" /> Trigger Manual Halving
                </button>
                {localStorage.getItem("inc_ubi_contract") && (
                  <p className="text-xs text-muted font-mono">UBI Contract: {shortenAddress(localStorage.getItem("inc_ubi_contract") || "")}</p>
                )}
              </div>
            )}

            <button onClick={fetchUBIData} className="btn-secondary w-full text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Refresh UBI Data</button>
          </div>
        ) : (
          <div className="card text-center py-8"><RefreshCw className="w-8 h-8 text-muted mx-auto mb-2 animate-spin" /><p className="text-muted text-sm">Loading UBI data...</p></div>
        )}
      </div>)}

      {view === "swap" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" /> Swap</h3></div>
          <div className="card space-y-4">
            <div>
              <label className="label">From</label>
              <div className="flex gap-2">
                <select value={swapFromToken} onChange={(e) => setSwapFromToken(e.target.value)} className="w-28">
                  {ALL_TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                </select>
                <input type="number" value={swapFromAmount} onChange={(e) => setSwapFromAmount(e.target.value)} placeholder="0.00" className="flex-1" step="0.0001" />
              </div>
              <p className="text-xs text-muted mt-1">Balance: {formatBalance(balances[swapFromToken] || 0)} {swapFromToken}</p>
            </div>
            <div className="flex justify-center">
              <button onClick={() => { const f = swapFromToken; setSwapFromToken(swapToToken); setSwapToToken(f); }} className="btn-ghost p-2" title="Switch">
                <ArrowDownLeft className="w-4 h-4 rotate-90" />
              </button>
            </div>
            <div>
              <label className="label">To</label>
              <div className="flex gap-2">
                <select value={swapToToken} onChange={(e) => setSwapToToken(e.target.value)} className="w-28">
                  {ALL_TOKENS.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
                </select>
                <input type="number" value={swapToAmount} onChange={(e) => setSwapToAmount(e.target.value)} placeholder="0.00" className="flex-1" readOnly />
              </div>
            </div>
            {swapFromAmount && parseFloat(swapFromAmount) > 0 && (
              <div className="text-xs space-y-1 py-2 border-t border-border">
                <div className="flex justify-between"><span className="text-muted">Route</span><span>{swapFromToken} → {swapToToken}</span></div>
                <div className="flex justify-between"><span className="text-muted">Price Impact</span><span className={swapPriceImpact < 1 ? "text-success" : swapPriceImpact < 3 ? "text-warning" : "text-danger"}>{swapPriceImpact.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-muted">Slippage</span><span>{swapSlippage}%</span></div>
                <div className="flex justify-between"><span className="text-muted">Fee → UBI Pool</span><span className="text-warning">0.5%</span></div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSwapSlippage(0.5)} className={cn("btn-ghost flex-1 py-2 text-xs", swapSlippage === 0.5 && "ring-1 ring-accent")}>0.5%</button>
              <button onClick={() => setSwapSlippage(1)} className={cn("btn-ghost flex-1 py-2 text-xs", swapSlippage === 1 && "ring-1 ring-accent")}>1%</button>
              <button onClick={() => setSwapSlippage(3)} className={cn("btn-ghost flex-1 py-2 text-xs", swapSlippage === 3 && "ring-1 ring-accent")}>3%</button>
            </div>
            <button
              onClick={async () => {
                if (!swapFromAmount || !walletRef.current) return;
                setSwapping(true);
                try {
                  const ethers = await import("ethers");
                  const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
                  const routerAbi = [
                    "function getAmountsOut(uint amountIn, address[] path) view returns (uint[])",
                    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[])",
                    "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])",
                    "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[])",
                  ];
                  const router = new ethers.Contract(PANCAKE_ROUTER, routerAbi, walletRef.current);
                  const incAddr = localStorage.getItem("inc_contract") || "";
                  const getTokenAddr = (sym: string) => sym === "BNB" ? "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" : sym === "INC" ? incAddr : (STABLECOINS as any)[sym]?.address || "";
                  const path = [getTokenAddr(swapFromToken), getTokenAddr(swapToToken)];
                  if (swapFromToken !== "INC" && swapToToken !== "INC" && swapFromToken !== swapToToken) {
                    path.splice(1, 0, incAddr);
                  }
                  const amountIn = ethers.parseUnits(swapFromAmount, 18);
                  const amounts = await router.getAmountsOut(amountIn, path);
                  const expectedOut = ethers.formatUnits(amounts[amounts.length - 1], 18);
                  setSwapToAmount(expectedOut);
                  const slippageBps = Math.floor(swapSlippage * 100);
                  const minOut = (parseFloat(expectedOut) * (1 - slippageBps / 10000)).toFixed(18);
                  const deadline = Math.floor(Date.now() / 1000) + 1200;
                  if (swapFromToken !== "BNB" && swapToToken !== "BNB") {
                    const tokenContract = new ethers.Contract(path[0], ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)"], walletRef.current);
                    const allowance = await tokenContract.allowance(walletRef.current.address, PANCAKE_ROUTER);
                    if (allowance < amountIn) {
                      const approveTx = await tokenContract.approve(PANCAKE_ROUTER, amountIn * 2n);
                      await approveTx.wait();
                    }
                    const tx = await router.swapExactTokensForTokens(amountIn, ethers.parseUnits(minOut, 18), path, walletRef.current.address, deadline);
                    await tx.wait();
                  } else if (swapFromToken === "BNB") {
                    const tx = await router.swapExactETHForTokens(0, path, walletRef.current.address, deadline, { value: amountIn });
                    await tx.wait();
                  } else {
                    const tokenContract = new ethers.Contract(path[0], ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)"], walletRef.current);
                    const allowance = await tokenContract.allowance(walletRef.current.address, PANCAKE_ROUTER);
                    if (allowance < amountIn) {
                      const approveTx = await tokenContract.approve(PANCAKE_ROUTER, amountIn * 2n);
                      await approveTx.wait();
                    }
                    const tx = await router.swapExactTokensForETH(amountIn, 0, path, walletRef.current.address, deadline);
                    await tx.wait();
                  }
                  showAlert("success", `Swapped ${swapFromAmount} ${swapFromToken} → ${expectedOut} ${swapToToken}`);
                  setSwapFromAmount(""); setSwapToAmount("");
                  await updateBalances();
                } catch (e: any) { showAlert("danger", "Swap failed: " + e.message); }
                setSwapping(false);
              }}
              disabled={swapping || !swapFromAmount}
              className="btn-primary w-full py-3"
            >
              {swapping ? "Swapping..." : `Swap ${swapFromToken} → ${swapToToken}`}
            </button>
          </div>
          <div className="card text-xs text-muted text-center">INC is used as bridge asset for multi-hop swaps. 0.5% fee routes to UBI pool.</div>
        </div>
      )}

      {view === "bridge" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Globe className="w-5 h-5" /> Send Abroad</h3></div>
          <div className="card space-y-4">
            <div>
              <label className="label">You Send</label>
              <div className="flex gap-2">
                <select value={bridgeFromToken} onChange={(e) => setBridgeFromToken(e.target.value)} className="w-28">
                  {["USDT", "USDC", "BUSD", "DAI", "XRP"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" value={bridgeAmount} onChange={(e) => setBridgeAmount(e.target.value)} placeholder="0.00" className="flex-1" step="0.01" />
              </div>
            </div>
            <div>
              <label className="label">Recipient Country</label>
              <select value={bridgeCountry} onChange={(e) => setBridgeCountry(e.target.value)} className="w-full">
                <option value="US">United States</option>
                <option value="HK">Hong Kong</option>
                <option value="PH">Philippines</option>
                <option value="IN">India</option>
                <option value="NG">Nigeria</option>
                <option value="BR">Brazil</option>
                <option value="GB">United Kingdom</option>
                <option value="AU">Australia</option>
                <option value="CA">Canada</option>
                <option value="SG">Singapore</option>
              </select>
            </div>
            <div>
              <label className="label">They Receive</label>
              <div className="flex gap-2">
                <select value={bridgeToToken} onChange={(e) => setBridgeToToken(e.target.value)} className="w-28">
                  {["USDT", "USDC", "BUSD", "DAI", "XRP"].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" value={bridgeQuote ? bridgeQuote.outputAmount.toFixed(4) : "—"} readOnly className="flex-1" />
              </div>
            </div>
            <div>
              <label className="label">Recipient Address (or @tag)</label>
              <input value={bridgeRecipient} onChange={(e) => setBridgeRecipient(e.target.value)} placeholder="0x... or @username" className="w-full" />
            </div>
            {bridgeAmount && parseFloat(bridgeAmount) > 0 && (
              <div className="text-xs space-y-1 py-2 border-t border-border">
                <div className="flex justify-between"><span className="text-muted">Fee → UBI Pool</span><span className="text-warning">0.5%</span></div>
                <div className="flex justify-between"><span className="text-muted">Settlement</span><span>~3 seconds (BSC)</span></div>
                <div className="flex justify-between"><span className="text-muted">KYC Tier</span><span>Tier {kycTier} {kycTier === 0 ? "(blocked)" : kycTier === 1 ? "($1K/day)" : "($10K/day)"}</span></div>
              </div>
            )}
            <button
              onClick={async () => {
                if (!bridgeContractRef.current || !bridgeAmount || !bridgeRecipient) {
                  showAlert("warning", "Enter amount and recipient address");
                  return;
                }
                if (kycTier === 0) { showAlert("danger", "KYC Tier 0 — bridge access requires Tier 1+"); return; }
                setBridging(true);
                try {
                  const ethers = await import("ethers");
                  let recipient = bridgeRecipient;
                  if (recipient.startsWith("@")) {
                    const resp = await fetch(`${API_BASE}/v1/tags/${recipient.substring(1)}`);
                    const data = await resp.json();
                    recipient = data.address;
                  }
                  const tokenInAddr = STABLECOINS[bridgeFromToken]?.address;
                  const tokenOutAddr = STABLECOINS[bridgeToToken]?.address;
                  const amount = ethers.parseUnits(bridgeAmount, 18);
                  const tokenContract = new ethers.Contract(tokenInAddr, ["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address, address) view returns (uint256)"], walletRef.current);
                  const allowance = await tokenContract.allowance(walletRef.current.address, bridgeContractRef.current.target);
                  if (allowance < amount) {
                    const approveTx = await tokenContract.approve(bridgeContractRef.current.target, amount * 2n);
                    await approveTx.wait();
                  }
                  const tx = await bridgeContractRef.current.bridgeSend(tokenInAddr, amount, recipient, tokenOutAddr);
                  await tx.wait();
                  showAlert("success", `Bridged ${bridgeAmount} ${bridgeFromToken} → ${bridgeToToken} to ${shortenAddress(recipient)}`);
                  setBridgeAmount(""); setBridgeRecipient(""); setBridgeQuote(null);
                  await updateBalances();
                  fetchBridgeStats();
                } catch (e: any) { showAlert("danger", "Bridge failed: " + e.message); }
                setBridging(false);
              }}
              disabled={bridging || !bridgeAmount || !bridgeRecipient}
              className="btn-primary w-full py-3"
            >
              {bridging ? "Bridging..." : `Send ${bridgeAmount || "0"} ${bridgeFromToken}`}
            </button>
          </div>
          {bridgeStats && (
            <div className="card text-xs space-y-1">
              <h4 className="font-semibold text-sm mb-2">Bridge Stats</h4>
              <div className="flex justify-between"><span className="text-muted">Total Volume</span><span>{fmtNum(bridgeStats.totalVolume)} INC</span></div>
              <div className="flex justify-between"><span className="text-muted">Active Liquidity</span><span>{fmtNum(bridgeStats.liquidity)} INC</span></div>
              <div className="flex justify-between"><span className="text-muted">Fees → UBI</span><span>{fmtNum(bridgeStats.fees)} INC</span></div>
              <div className="flex justify-between"><span className="text-muted">Active Bridges</span><span>{bridgeStats.activeBridges}</span></div>
            </div>
          )}
          <div className="card text-xs text-muted text-center">INC bridges currencies instantly. Recipient claims in their local stablecoin. Settlement in ~3 seconds on BSC.</div>
        </div>
      )}

      {view === "escrow" && isFounder && (
        <div className="space-y-4">
          <div className="flex items-center gap-3"><button onClick={() => setView("main")} className="text-muted hover:text-white text-sm">← Back</button><h3 className="text-lg font-semibold flex items-center gap-2"><Lock className="w-5 h-5" /> Founder Escrow</h3></div>
          {escrowData ? (
            <div className="space-y-4">
              <div className="card space-y-3">
                <div className="flex justify-between"><span className="text-muted text-sm">Total Locked</span><span className="font-mono font-medium">{fmtNum(escrowData.totalLocked)} INC</span></div>
                <div className="flex justify-between"><span className="text-muted text-sm">Released So Far</span><span className="font-mono text-success">{fmtNum(escrowData.released)} INC</span></div>
                <div className="flex justify-between"><span className="text-muted text-sm">Available to Claim</span><span className="font-mono text-accent font-bold">{fmtNum(escrowData.releasable)} INC</span></div>
                <div className="flex justify-between"><span className="text-muted text-sm">Monthly Release</span><span className="font-mono">{fmtNum(escrowData.monthlyAmount)} INC/mo</span></div>
                <div className="flex justify-between"><span className="text-muted text-sm">Months Elapsed</span><span>{escrowData.monthsElapsed} / 300</span></div>
                <div className="w-full bg-border rounded-full h-2 mt-2">
                  <div className="bg-accent rounded-full h-2 transition-all" style={{ width: `${Math.min((escrowData.monthsElapsed / 300) * 100, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted"><span>Start</span><span>25 Years</span></div>
              </div>
              {escrowData.releasable > 0 && (
                <button
                  onClick={async () => {
                    if (!escrowContractRef.current) return;
                    setEscrowClaiming(true);
                    try {
                      const tx = await escrowContractRef.current.claimEscrow();
                      await tx.wait();
                      showAlert("success", `Claimed ${fmtNum(escrowData.releasable)} INC from escrow`);
                      await fetchEscrowData();
                      await updateBalances();
                    } catch (e: any) { showAlert("danger", "Escrow claim failed: " + e.message); }
                    setEscrowClaiming(false);
                  }}
                  disabled={escrowClaiming}
                  className="btn-primary w-full py-3"
                >
                  {escrowClaiming ? "Claiming..." : `Claim ${fmtNum(escrowData.releasable)} INC`}
                </button>
              )}
              <div className="card text-xs text-muted text-center">
                Escrow releases {fmtNum(escrowData.monthlyAmount)} INC/month over 25 years. Unclaimed amounts accumulate.
              </div>
              {localStorage.getItem("inc_escrow_contract") && (
                <p className="text-xs text-muted font-mono text-center">Escrow Contract: {shortenAddress(localStorage.getItem("inc_escrow_contract") || "")}</p>
              )}
            </div>
          ) : (
            <div className="card text-center py-8"><RefreshCw className="w-8 h-8 text-muted mx-auto mb-2 animate-spin" /><p className="text-muted text-sm">Loading escrow data...</p></div>
          )}
        </div>
      )}
    </div>
  );
}
