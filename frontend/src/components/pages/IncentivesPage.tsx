import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@/lib/store";
import { API_BASE } from "@/lib/api";
import {
  Coins, TrendingUp, TrendingDown, DollarSign, BarChart3,
  Clock, Trophy, Newspaper, Crown, Activity, Zap, Users,
  ExternalLink, RefreshCw, Plus, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const BSC_RPC = "https://bsc-dataseed.binance.org";
const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const STAKING_ABI = [
  "function totalSupply() view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function finishAt() view returns (uint256)",
  "function getStakingInfo() view returns (uint256, uint256, uint256, uint256, uint256)",
];

interface PriceData { usd: number; change24h: number; }
interface StatsData { marketCap: number; circulatingSupply: number; totalSupply: number; volume24h: number; }
interface DailyData { date: string; buys: number; sells: number; volume: number; }
interface HalvingData { currentRate: number; lastHalving: number; count: number; nextHalvingTime: number; history: { date: string; rateBefore: number; rateAfter: number }[]; }
interface NewsItem { id: string; timestamp: number; title: string; body: string; source: string; }
interface LeaderboardEntry { address: string; amount: string; lastStake: number; }
interface AgentLog { timestamp: string; type: string; message: string; }

function formatNumber(n: number | undefined | null, decimals = 2): string {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1e9) return (n / 1e9).toFixed(decimals) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(decimals) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(decimals) + "K";
  return n.toFixed(decimals);
}

function shortenAddr(addr: string): string {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function IncentivesPage() {
  const { isFounder, setActivePage, showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [price, setPrice] = useState<PriceData>({ usd: 0, change24h: 0 });
  const [stats, setStats] = useState<StatsData>({ marketCap: 0, circulatingSupply: 0, totalSupply: 1e12, volume24h: 0 });
  const [daily, setDaily] = useState<DailyData[]>([]);
  const [halving, setHalving] = useState<HalvingData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stakingInfo, setStakingInfo] = useState<{ totalStaked: number; apy: number; finishAt: number; rewardRate: number } | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const [showPostNews, setShowPostNews] = useState(false);
  const [newsTitle, setNewsTitle] = useState("");
  const [newsBody, setNewsBody] = useState("");
  const [vaultOverview, setVaultOverview] = useState<{ reserves: number; locked: number; releasable: number; treasury: number; stakingPool: number } | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval>>();

  const incAddress = typeof window !== "undefined" ? localStorage.getItem("inc_contract") : "";
  const stakingAddress = typeof window !== "undefined" ? localStorage.getItem("inc_staking_contract") : "";
  const vaultAddress = typeof window !== "undefined" ? localStorage.getItem("founder_vault_contract") : "";

  const fetchAllData = useCallback(async () => {
    setRefreshing(true);
    const promises: Promise<void>[] = [];

    // Backend API data
    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/price`);
        if (resp.ok) { const d = await resp.json(); setPrice({ usd: d.usd || 0, change24h: d.change_24h || 0 }); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/stats`);
        if (resp.ok) { const d = await resp.json(); setStats(d); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/daily`);
        if (resp.ok) { const d = await resp.json(); setDaily(d.daily || []); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/halvings`);
        if (resp.ok) { const d = await resp.json(); setHalving(d); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/news`);
        if (resp.ok) { const d = await resp.json(); setNews(d.news || []); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/incentives/staking/leaderboard`);
        if (resp.ok) { const d = await resp.json(); setLeaderboard(d.leaderboard || []); }
      } catch {}
    })());

    // On-chain staking data
    if (stakingAddress) {
      promises.push((async () => {
        try {
          const ethers = await import("ethers");
          const provider = new ethers.JsonRpcProvider(BSC_RPC);
          const contract = new ethers.Contract(stakingAddress, STAKING_ABI, provider);
          const info = await contract.getStakingInfo();
          const totalStaked = parseFloat(ethers.formatEther(info[0]));
          const rewardRate = parseFloat(ethers.formatEther(info[1]));
          const finishAt = Number(info[2]);
          const apy = Number(info[4]) / 100;
          setStakingInfo({ totalStaked, apy, finishAt, rewardRate });
        } catch {}
      })());
    }

    // Agent status + logs
    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/agent/status`);
        if (resp.ok) { const d = await resp.json(); setAgentOnline(d.online || false); }
      } catch {}
    })());

    promises.push((async () => {
      try {
        const resp = await fetch(`${API_BASE}/v1/agent/logs`);
        if (resp.ok) { const d = await resp.json(); setAgentLogs(d.logs || []); }
      } catch {}
    })());

    // Founder vault overview (on-chain)
    if (vaultAddress && incAddress && isFounder) {
      promises.push((async () => {
        try {
          const ethers = await import("ethers");
          const provider = new ethers.JsonRpcProvider(BSC_RPC);
          const vaultAbi = ["function getUnifiedVaultOverview() view returns (uint256, uint256, uint256, uint256, uint256)"];
          const contract = new ethers.Contract(vaultAddress, vaultAbi, provider);
          const overview = await contract.getUnifiedVaultOverview();
          setVaultOverview({
            reserves: parseFloat(ethers.formatEther(overview[0])),
            locked: parseFloat(ethers.formatEther(overview[1])),
            releasable: parseFloat(ethers.formatEther(overview[2])),
            treasury: parseFloat(ethers.formatEther(overview[3])),
            stakingPool: parseFloat(ethers.formatEther(overview[4])),
          });
        } catch {}
      })());
    }

    await Promise.race([
      Promise.all(promises),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
    setLoading(false);
    setDataLoaded(true);
    setRefreshing(false);
  }, [stakingAddress, vaultAddress, incAddress, isFounder]);

  useEffect(() => {
    fetchAllData();
    const timeout = setTimeout(() => { setLoading(false); setDataLoaded(true); }, 5000);
    refreshTimer.current = setInterval(fetchAllData, 30000);
    return () => { clearTimeout(timeout); if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchAllData]);

  const handlePostNews = async () => {
    if (!newsTitle || !newsBody) return showAlert("danger", "Enter title and body");
    try {
      const resp = await fetch(`${API_BASE}/v1/incentives/news`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Token": "soulmate_wallet_2024" },
        body: JSON.stringify({ title: newsTitle, body: newsBody }),
      });
      if (resp.ok) {
        showAlert("success", "News posted!");
        setNewsTitle(""); setNewsBody(""); setShowPostNews(false);
        fetchAllData();
      } else {
        showAlert("danger", "Failed to post news");
      }
    } catch { showAlert("danger", "Failed to post news"); }
  };

  if (loading && !dataLoaded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-accent animate-spin" />
        <p className="text-muted text-sm">Loading Incentives Hub...</p>
      </div>
    );
  }

  const priceChangeColor = price.change24h >= 0 ? "text-success" : "text-danger";
  const maxBarHeight = 120;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Coins className="w-7 h-7 text-accent" />
            Incentives Hub
          </h1>
          <p className="text-muted text-sm mt-1">Live INC token analytics, staking, halving tracker & news</p>
        </div>
        <button onClick={fetchAllData} disabled={refreshing} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Section 1: INC Market Overview */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-accent" />
          INC Market Overview
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-bg-alt rounded-xl p-4">
            <p className="text-muted text-xs mb-1">Current Price</p>
            <p className="text-2xl font-bold">${(price.usd ?? 0).toFixed(8)}</p>
            <p className={`text-sm ${priceChangeColor} flex items-center gap-1 mt-1`}>
              {(price.change24h ?? 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(price.change24h ?? 0).toFixed(2)}% (24h)
            </p>
          </div>
          <div className="bg-bg-alt rounded-xl p-4">
            <p className="text-muted text-xs mb-1">Market Cap</p>
            <p className="text-2xl font-bold">${formatNumber(stats.marketCap)}</p>
          </div>
          <div className="bg-bg-alt rounded-xl p-4">
            <p className="text-muted text-xs mb-1">24h Volume</p>
            <p className="text-2xl font-bold">${formatNumber(stats.volume24h)}</p>
          </div>
          <div className="bg-bg-alt rounded-xl p-4">
            <p className="text-muted text-xs mb-1">Total Supply</p>
            <p className="text-2xl font-bold">1T INC</p>
          </div>
        </div>
        {incAddress && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-muted">Token Contract:</span>
            <a href={`https://bscscan.com/token/${incAddress}`} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1">
              {shortenAddr(incAddress)} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Section 2: Daily Trading Activity */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          Daily Trading Activity
        </h2>
        {daily.length > 0 ? (
          <>
            <div className="flex items-end gap-1 h-32 mb-4 overflow-x-auto">
              {daily.slice(-30).map((d, i) => {
                const maxVol = Math.max(...daily.map(x => Math.max(x.buys, x.sells)), 1);
                const buyH = (d.buys / maxVol) * maxBarHeight;
                const sellH = (d.sells / maxVol) * maxBarHeight;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ width: 16 }}>
                    <div className="w-full bg-success rounded-t" style={{ height: buyH }} title={`Buys: ${formatNumber(d.buys)}`} />
                    <div className="w-full bg-danger rounded-b" style={{ height: sellH }} title={`Sells: ${formatNumber(d.sells)}`} />
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-success rounded" /> Buys</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 bg-danger rounded" /> Sells</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Today's Buys</p>
                <p className="text-lg font-bold text-success">{formatNumber(daily[daily.length - 1]?.buys || 0)} INC</p>
              </div>
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Today's Sells</p>
                <p className="text-lg font-bold text-danger">{formatNumber(daily[daily.length - 1]?.sells || 0)} INC</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">No trading data available yet. Data will appear once INC is actively traded.</p>
        )}
      </div>

      {/* Section 3: Halving Tracker */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Halving Tracker
        </h2>
        {halving ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-bg-alt rounded-xl p-4">
                <p className="text-muted text-xs mb-1">Current Emission Rate</p>
                <p className="text-xl font-bold">{halving.currentRate} bps</p>
              </div>
              <div className="bg-bg-alt rounded-xl p-4">
                <p className="text-muted text-xs mb-1">Halvings Executed</p>
                <p className="text-xl font-bold">{halving.count}</p>
              </div>
              <div className="bg-bg-alt rounded-xl p-4">
                <p className="text-muted text-xs mb-1">Next Halving</p>
                <p className="text-xl font-bold">
                  {halving.nextHalvingTime > 0
                    ? new Date(halving.nextHalvingTime * 1000).toLocaleDateString()
                    : "TBD"}
                </p>
              </div>
            </div>
            {halving.nextHalvingTime > 0 && (
              <CountdownTimer targetTime={halving.nextHalvingTime * 1000} />
            )}
            {halving.history && halving.history.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Rate Before</th>
                      <th className="text-right py-2">Rate After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {halving.history.map((h, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{h.date}</td>
                        <td className="text-right py-2">{h.rateBefore} bps</td>
                        <td className="text-right py-2 text-accent">{h.rateAfter} bps</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted text-sm">Halving data will appear after contract deployment.</p>
        )}
      </div>

      {/* Section 4: Staking Leaderboard */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Staking Leaderboard
        </h2>
        {stakingInfo ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-bg-alt rounded-xl p-4">
              <p className="text-muted text-xs mb-1">Total Staked</p>
              <p className="text-xl font-bold">{formatNumber(stakingInfo.totalStaked)} INC</p>
            </div>
            <div className="bg-bg-alt rounded-xl p-4">
              <p className="text-muted text-xs mb-1">Current APY</p>
              <p className="text-xl font-bold text-success">{(stakingInfo.apy ?? 0).toFixed(2)}%</p>
            </div>
            <div className="bg-bg-alt rounded-xl p-4">
              <p className="text-muted text-xs mb-1">Reward Rate</p>
              <p className="text-xl font-bold">{formatNumber(stakingInfo.rewardRate)} INC/s</p>
            </div>
            <div className="bg-bg-alt rounded-xl p-4">
              <p className="text-muted text-xs mb-1">Cycle Ends</p>
              <p className="text-xl font-bold">
                {stakingInfo.finishAt > 0 ? new Date(stakingInfo.finishAt * 1000).toLocaleDateString() : "N/A"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm mb-4">Staking contract not deployed yet.</p>
        )}
        {leaderboard.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2">Rank</th>
                  <th className="text-left py-2">Address</th>
                  <th className="text-right py-2">Staked</th>
                  <th className="text-right py-2">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry, i) => {
                  const amount = parseFloat(entry.amount) / 1e18;
                  const pct = stakingInfo && stakingInfo.totalStaked > 0 ? (amount / stakingInfo.totalStaked) * 100 : 0;
                  return (
                    <tr key={i} className={`border-b border-border/50 ${i === 0 ? "bg-accent/5" : ""}`}>
                      <td className="py-2">
                        <span className={`flex items-center gap-1 ${i === 0 ? "text-accent font-bold" : ""}`}>
                          {i === 0 && <Crown className="w-3 h-3" />} {i + 1}
                        </span>
                      </td>
                      <td className="py-2">
                        <a href={`https://bscscan.com/address/${entry.address}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {shortenAddr(entry.address)}
                        </a>
                      </td>
                      <td className="text-right py-2">{formatNumber(amount)} INC</td>
                      <td className="text-right py-2 text-muted">{(pct ?? 0).toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-sm">No stakers yet. Be the first to stake INC!</p>
        )}
      </div>

      {/* Section 5: INC News Feed */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-accent" />
            INC News Feed
          </h2>
          {isFounder && (
            <button onClick={() => setShowPostNews(!showPostNews)} className="btn-secondary text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" /> Post News
            </button>
          )}
        </div>
        {showPostNews && (
          <div className="mb-4 space-y-2 p-4 bg-bg-alt rounded-xl">
            <input
              value={newsTitle}
              onChange={(e) => setNewsTitle(e.target.value)}
              placeholder="News title..."
              className="w-full"
            />
            <textarea
              value={newsBody}
              onChange={(e) => setNewsBody(e.target.value)}
              placeholder="News body..."
              className="w-full min-h-[80px]"
            />
            <button onClick={handlePostNews} className="btn-primary text-sm">Publish</button>
          </div>
        )}
        {news.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {news.map((item) => (
              <div key={item.id} className="p-4 bg-bg-alt rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <span className="text-xs text-muted">{timeAgo(item.timestamp)}</span>
                </div>
                <p className="text-sm text-muted">{item.body}</p>
                <span className="text-xs text-accent mt-1 inline-block">Source: {item.source}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted text-sm">No news yet. Check back for INC updates!</p>
        )}
      </div>

      {/* Section 6: Founder Admin Panel (founder only) */}
      {isFounder && (
        <div className="card p-6 border-accent/30">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-accent" />
            Founder Admin Panel
          </h2>

          {/* Agent Status */}
          <div className="flex items-center gap-3 mb-4 p-3 bg-bg-alt rounded-xl">
            <Activity className={`w-5 h-5 ${agentOnline ? "text-success" : "text-danger"}`} />
            <div className="flex-1">
              <p className="text-sm font-medium">Autonomous Agent: {agentOnline ? "Online" : "Offline"}</p>
              {agentLogs.length > 0 && (
                <p className="text-xs text-muted">Last action: {agentLogs[0]?.message?.slice(0, 60)}...</p>
              )}
            </div>
            <button onClick={() => setActivePage("wallet")} className="btn-secondary text-xs">
              View Wallet
            </button>
          </div>

          {/* Vault Overview */}
          {vaultOverview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Reserves</p>
                <p className="text-lg font-bold">{formatNumber(vaultOverview.reserves)} INC</p>
              </div>
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Locked in Vesting</p>
                <p className="text-lg font-bold">{formatNumber(vaultOverview.locked)} INC</p>
              </div>
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Releasable Now</p>
                <p className="text-lg font-bold text-success">{formatNumber(vaultOverview.releasable)} INC</p>
              </div>
              <div className="bg-bg-alt rounded-lg p-3">
                <p className="text-muted text-xs">Treasury (EOA)</p>
                <p className="text-lg font-bold">{formatNumber(vaultOverview.treasury)} INC</p>
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => setActivePage("wallet")} className="p-3 bg-bg-alt rounded-xl text-sm hover:bg-accent/10 transition-all text-center">
              <Coins className="w-5 h-5 mx-auto mb-1 text-accent" />
              Founder Vault
            </button>
            <button onClick={() => setActivePage("wallet")} className="p-3 bg-bg-alt rounded-xl text-sm hover:bg-accent/10 transition-all text-center">
              <Activity className="w-5 h-5 mx-auto mb-1 text-accent" />
              Agent Status
            </button>
            <button onClick={() => setActivePage("wallet")} className="p-3 bg-bg-alt rounded-xl text-sm hover:bg-accent/10 transition-all text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-accent" />
              Liquidity Helper
            </button>
            <button onClick={() => setActivePage("wallet")} className="p-3 bg-bg-alt rounded-xl text-sm hover:bg-accent/10 transition-all text-center">
              <Users className="w-5 h-5 mx-auto mb-1 text-accent" />
              Deploy Contracts
            </button>
          </div>

          {/* Contract Addresses */}
          {incAddress && (
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted">Token:</span>
                <a href={`https://bscscan.com/address/${incAddress}`} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1">
                  {shortenAddr(incAddress)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {vaultAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-muted">Vault:</span>
                  <a href={`https://bscscan.com/address/${vaultAddress}`} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1">
                    {shortenAddr(vaultAddress)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {stakingAddress && (
                <div className="flex items-center gap-2">
                  <span className="text-muted">Staking:</span>
                  <a href={`https://bscscan.com/address/${stakingAddress}`} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1">
                    {shortenAddr(stakingAddress)} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Recent Agent Logs */}
          {agentLogs.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold mb-2">Recent Agent Actions</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {agentLogs.slice(0, 10).map((log, i) => (
                  <div key={i} className="text-xs flex items-center gap-2 p-2 bg-bg-alt rounded">
                    <span className={`w-2 h-2 rounded-full ${
                      log.type.includes("SUCCESS") ? "bg-success" :
                      log.type.includes("ERROR") ? "bg-danger" :
                      log.type.includes("WARNING") ? "bg-warning" : "bg-accent"
                    }`} />
                    <span className="text-muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    <span className="flex-1 truncate">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CountdownTimer({ targetTime }: { targetTime: number }) {
  const [timeLeft, setTimeLeft] = useState(targetTime - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(targetTime - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (timeLeft <= 0) return <p className="text-accent font-semibold">Halving epoch is here!</p>;

  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return (
    <div className="flex items-center gap-4 p-4 bg-bg-alt rounded-xl">
      <Clock className="w-5 h-5 text-accent" />
      <div className="flex gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{days}</p>
          <p className="text-xs text-muted">Days</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{hours}</p>
          <p className="text-xs text-muted">Hours</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{minutes}</p>
          <p className="text-xs text-muted">Minutes</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-accent">{seconds}</p>
          <p className="text-xs text-muted">Seconds</p>
        </div>
      </div>
    </div>
  );
}
