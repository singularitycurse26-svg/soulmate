import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useTranslation } from "react-i18next";
import { API_BASE } from "@/lib/api";
import { cn, shortenAddress, copyToClipboard, formatBalance } from "@/lib/utils";
import { Wallet as WalletIcon, Send, Download, QrCode, Copy, Tag, History, Coins, Search, ArrowUpRight, ArrowDownLeft, RefreshCw, DollarSign, Plus, KeyRound, Crown, Activity, Zap, TrendingUp, ExternalLink, Rocket, Layers, Droplet } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { IncentiveTokenABI, IncentiveTokenBytecode } from "@/contracts/IncentiveToken";
import { IncentiveVestingABI, IncentiveVestingBytecode } from "@/contracts/IncentiveVesting";
import { FounderMasterVaultABI, FounderMasterVaultBytecode } from "@/contracts/FounderMasterVault";
import { IncentiveGamingStakingABI, IncentiveGamingStakingBytecode } from "@/contracts/IncentiveGamingStaking";
import incentivesCoin from "@/assets/incentives-coin.png";

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
  { symbol: "USDT", name: "Tether USD", decimals: 18, icon: "T", color: "#26a17b", ...STABLECOINS.USDT },
  { symbol: "USDC", name: "USD Coin", decimals: 18, icon: "U", color: "#2775ca", ...STABLECOINS.USDC },
  { symbol: "BUSD", name: "Binance USD", decimals: 18, icon: "B", color: "#f0b90b", ...STABLECOINS.BUSD },
  { symbol: "DAI", name: "Dai Stablecoin", decimals: 18, icon: "D", color: "#f5ac37", ...STABLECOINS.DAI },
  { symbol: "XRP", name: "XRP", decimals: 18, icon: "X", color: "#23292f", ...STABLECOINS.XRP },
];

interface TxRecord {
  type: string; to: string; amount: string; hash: string;
  direction: "out" | "in"; timestamp: number;
}

type WalletView = "main" | "send" | "receive" | "tags" | "history" | "buy" | "add-funds" | "deploy" | "founder-vault" | "agent-status" | "liquidity";

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

      setDeployStep("1/11 Deploying IncentiveToken...");
      const TokenFactory = new ethers.ContractFactory(IncentiveTokenABI, IncentiveTokenBytecode, wallet);
      const token = await TokenFactory.deploy(wallet.address);
      await token.waitForDeployment();
      const tokenAddr = await token.getAddress();
      localStorage.setItem("inc_contract", tokenAddr);

      setDeployStep("2/11 Deploying FounderMasterVault...");
      const VaultFactory = new ethers.ContractFactory(FounderMasterVaultABI, FounderMasterVaultBytecode, wallet);
      const vault = await VaultFactory.deploy(tokenAddr);
      await vault.waitForDeployment();
      const vaultAddr = await vault.getAddress();
      localStorage.setItem("founder_vault_contract", vaultAddr);

      setDeployStep("3/11 Deploying IncentiveVesting...");
      const VestingFactory = new ethers.ContractFactory(IncentiveVestingABI, IncentiveVestingBytecode, wallet);
      const vesting = await VestingFactory.deploy(tokenAddr, wallet.address);
      await vesting.waitForDeployment();
      const vestingAddr = await vesting.getAddress();
      localStorage.setItem("inc_vesting_contract", vestingAddr);

      setDeployStep("4/11 Deploying IncentiveGamingStaking...");
      const StakingFactory = new ethers.ContractFactory(IncentiveGamingStakingABI, IncentiveGamingStakingBytecode, wallet);
      const staking = await StakingFactory.deploy(tokenAddr);
      await staking.waitForDeployment();
      const stakingAddr = await staking.getAddress();
      localStorage.setItem("inc_staking_contract", stakingAddr);

      setDeployStep("5/11 Linking vesting to vault...");
      await (await vault.setVestingContract(vestingAddr)).wait();

      setDeployStep("6/11 Linking staking to vault...");
      await (await vault.setStakingContract(stakingAddr)).wait();

      setDeployStep("7/11 Initializing reserves...");
      await (await vault.initializeReserves(toWei("200000000000"), toWei("150000000000"), toWei("100000000000"))).wait();

      setDeployStep("8/11 Transferring 450B INC to vault...");
      await (await token.transfer(vaultAddr, toWei("450000000000"))).wait();

      setDeployStep("9/11 Transferring 250B INC to vesting...");
      await (await token.transfer(vestingAddr, toWei("250000000000"))).wait();

      setDeployStep("10/11 Transferring 1B INC to staking...");
      await (await token.transfer(stakingAddr, toWei("1000000000"))).wait();

      setDeployStep("11/11 Starting first reward cycle...");
      await (await staking.notifyRewardFromBalance(toWei("1000000000"))).wait();

      incContractRef.current = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
      contractsRef.current["INC"] = incContractRef.current;

      showAlert("success", "All contracts deployed! Token, Vault, Vesting, and Staking are live on BSC.");
      setDeployStep("");
      setDeploying(false);
      await updateBalances();
      await fetchVaultData();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Wallet</h2>
          <p className="text-muted text-sm mt-1">BSC · 7 tokens · {isFounder ? "0% fee (Founder)" : "0.5% fee"}</p>
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
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setView("buy")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Buy</button>
          <button onClick={() => setView("add-funds")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><DollarSign className="w-4 h-4" /> Add Funds</button>
          <button onClick={() => setView("tags")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm"><Tag className="w-4 h-4" /> Tags</button>
        </div>
        <button onClick={() => setView("history")} className="btn-ghost flex items-center justify-center gap-2 py-3 text-sm w-full"><History className="w-4 h-4" /> History</button>

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
            <p className="text-xs text-muted">This will deploy 4 contracts on BSC Mainnet:</p>
            <ul className="text-xs text-muted mt-2 space-y-1">
              <li>1. IncentiveToken (ERC20, 1T supply, halving)</li>
              <li>2. FounderMasterVault (reserves + vesting + treasury)</li>
              <li>3. IncentiveVesting (250B, 5yr quarterly)</li>
              <li>4. IncentiveGamingStaking (Synthetix-style rewards)</li>
            </ul>
          </div>
          <div className="bg-warning/10 rounded-lg p-3 text-xs text-warning">
            <p className="font-medium">⚠ Requirements:</p>
            <p>· Wallet needs ~0.1 BNB for gas (~$30-50)</p>
            <p>· All token supply (1T INC) minted to your wallet</p>
            <p>· 450B sent to vault, 250B to vesting, 1B to staking</p>
            <p>· Remaining ~299B stays in your wallet as treasury</p>
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
    </div>
  );
}
