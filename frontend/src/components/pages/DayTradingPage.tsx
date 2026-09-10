import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  CandlestickChart, TrendingUp, TrendingDown, Plus, X, RefreshCw,
  ArrowUpCircle, ArrowDownCircle, Wallet, Activity, Eye, Trash2,
  Loader2, Search, ChevronRight,
} from "lucide-react";

interface Ticker {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  amount: number;
  openedAt: number;
}

interface Order {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  total: number;
  status: "filled";
  timestamp: number;
}

const DEFAULT_WATCHLIST = [
  "BNBUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT",
];

const AVAILABLE_SYMBOLS = [
  ...DEFAULT_WATCHLIST,
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "LTCUSDT", "ATOMUSDT",
  "NEARUSDT", "APTUSDT", "FILUSDT", "ARBUSDT", "OPUSDT",
  "INCHUSDT", "PEPEUSDT", "SHIBUSDT", "TRXUSDT", "LDOUSDT",
];

const BINANCE_API = "https://api.binance.com/api/v3";

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function formatVolume(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const PORTFOLIO_KEY = "daytrading_portfolio";
const WATCHLIST_KEY = "daytrading_watchlist";
const ORDERS_KEY = "daytrading_orders";

function loadPortfolio(): { cash: number; positions: Position[] } {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    return raw ? JSON.parse(raw) : { cash: 100000, positions: [] };
  } catch {
    return { cash: 100000, positions: [] };
  }
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePortfolio(p: { cash: number; positions: Position[] }) {
  try { localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(p)); } catch {}
}

function saveWatchlist(w: string[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(w)); } catch {}
}

function saveOrders(o: Order[]) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(o)); } catch {}
}

export function DayTradingPage() {
  const { showAlert } = useStore();
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BNBUSDT");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleInterval, setCandleInterval] = useState<string>("1m");
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [portfolio, setPortfolio] = useState(() => loadPortfolio());
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [tradeAmount, setTradeAmount] = useState("");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [activeTab, setActiveTab] = useState<"chart" | "portfolio" | "orders">("chart");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTickers = useCallback(async () => {
    setLoadingTickers(true);
    try {
      const symbolsParam = JSON.stringify(watchlist);
      const resp = await fetch(`${BINANCE_API}/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`);
      if (resp.ok) {
        const data = await resp.json();
        const map: Record<string, Ticker> = {};
        for (const t of data) {
          map[t.symbol] = {
            symbol: t.symbol,
            price: parseFloat(t.lastPrice),
            priceChange: parseFloat(t.priceChange),
            priceChangePercent: parseFloat(t.priceChangePercent),
            high: parseFloat(t.highPrice),
            low: parseFloat(t.lowPrice),
            volume: parseFloat(t.volume),
            quoteVolume: parseFloat(t.quoteVolume),
          };
        }
        setTickers(map);
      }
    } catch {
      // Binance API may be geo-restricted; try CoinGecko fallback for top coins
      try {
        const resp = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=20&page=1");
        if (resp.ok) {
          const data = await resp.json();
          const map: Record<string, Ticker> = {};
          const symbolMap: Record<string, string> = {
            bitcoin: "BTCUSDT", ethereum: "ETHUSDT", binancecoin: "BNBUSDT",
            solana: "SOLUSDT", ripple: "XRPUSDT", cardano: "ADAUSDT",
            dogecoin: "DOGEUSDT", avalanche: "AVAXUSDT", polkadot: "DOTUSDT",
            chainlink: "LINKUSDT", polygon: "MATICUSDT", litecoin: "LTCUSDT",
          };
          for (const c of data) {
            const sym = symbolMap[c.id] || c.symbol.toUpperCase() + "USDT";
            map[sym] = {
              symbol: sym,
              price: c.current_price,
              priceChange: c.price_change_24h || 0,
              priceChangePercent: c.price_change_percentage_24h || 0,
              high: c.high_24h || c.current_price,
              low: c.low_24h || c.current_price,
              volume: c.total_volume || 0,
              quoteVolume: c.total_volume || 0,
            };
          }
          setTickers(map);
        }
      } catch {}
    } finally {
      setLoadingTickers(false);
    }
  }, [watchlist]);

  const fetchCandles = useCallback(async (symbol: string, interval: string) => {
    setLoadingChart(true);
    try {
      const resp = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=100`);
      if (resp.ok) {
        const data = await resp.json();
        const parsed: Candle[] = data.map((k: any[]) => ({
          time: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        setCandles(parsed);
      }
    } catch {
      // No fallback for candles — show empty chart
      setCandles([]);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  useEffect(() => {
    fetchCandles(selectedSymbol, candleInterval);
  }, [selectedSymbol, candleInterval, fetchCandles]);

  useEffect(() => {
    if (!autoRefresh) return;
    pollRef.current = setInterval(() => {
      fetchTickers();
      fetchCandles(selectedSymbol, candleInterval);
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [autoRefresh, fetchTickers, fetchCandles, selectedSymbol, candleInterval]);

  // Draw candlestick chart
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 10, right: 60, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    ctx.clearRect(0, 0, w, h);

    const prices = candles.flatMap(c => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    const padRange = range * 0.1;
    const min = minPrice - padRange;
    const max = maxPrice + padRange;
    const priceRange = max - min;

    const candleW = chartW / candles.length;
    const bodyW = Math.max(2, candleW * 0.6);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      const price = max - (priceRange / 4) * i;
      ctx.fillText(formatPrice(price), padding.left + chartW + 5, y + 3);
    }

    // Candles
    candles.forEach((c, i) => {
      const x = padding.left + i * candleW + candleW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? "#00e676" : "#ff1744";

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padding.top + ((max - c.high) / priceRange) * chartH);
      ctx.lineTo(x, padding.top + ((max - c.low) / priceRange) * chartH);
      ctx.stroke();

      // Body
      const openY = padding.top + ((max - c.open) / priceRange) * chartH;
      const closeY = padding.top + ((max - c.close) / priceRange) * chartH;
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, Math.min(openY, closeY), bodyW, Math.max(1, Math.abs(closeY - openY)));
    });

    // Current price line
    const lastPrice = candles[candles.length - 1].close;
    const lastY = padding.top + ((max - lastPrice) / priceRange) * chartH;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, lastY);
    ctx.lineTo(padding.left + chartW, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price label
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(padding.left + chartW, lastY - 9, 55, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(formatPrice(lastPrice), padding.left + chartW + 3, lastY + 3);
  }, [candles]);

  const addToWatchlist = (symbol: string) => {
    if (watchlist.includes(symbol)) return;
    const updated = [...watchlist, symbol];
    setWatchlist(updated);
    saveWatchlist(updated);
    setShowAddSymbol(false);
    setSymbolSearch("");
    fetchTickers();
  };

  const removeFromWatchlist = (symbol: string) => {
    const updated = watchlist.filter(s => s !== symbol);
    setWatchlist(updated);
    saveWatchlist(updated);
  };

  const executeTrade = () => {
    const amount = parseFloat(tradeAmount);
    if (!amount || amount <= 0) {
      showAlert("danger", "Enter a valid amount");
      return;
    }
    const ticker = tickers[selectedSymbol];
    if (!ticker) {
      showAlert("danger", "No price data for this symbol");
      return;
    }
    const price = ticker.price;
    const total = amount * price;

    if (tradeSide === "buy") {
      if (total > portfolio.cash) {
        showAlert("danger", "Insufficient cash for this trade");
        return;
      }
      // Check if we already have a position in this symbol
      const existing = portfolio.positions.find(p => p.symbol === selectedSymbol && p.side === "long");
      let newPositions: Position[];
      if (existing) {
        const totalAmount = existing.amount + amount;
        const avgPrice = (existing.entryPrice * existing.amount + price * amount) / totalAmount;
        newPositions = portfolio.positions.map(p =>
          p.id === existing.id ? { ...p, entryPrice: avgPrice, amount: totalAmount } : p
        );
      } else {
        newPositions = [...portfolio.positions, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          symbol: selectedSymbol,
          side: "long" as const,
          entryPrice: price,
          amount,
          openedAt: Date.now(),
        }];
      }
      const newPortfolio = { cash: portfolio.cash - total, positions: newPositions };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      const order: Order = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: selectedSymbol, side: "buy", price, amount, total, status: "filled", timestamp: Date.now(),
      };
      const newOrders = [order, ...orders];
      setOrders(newOrders);
      saveOrders(newOrders);
      setTradeAmount("");
      showAlert("success", `Bought ${amount} ${selectedSymbol.replace("USDT", "")} at $${formatPrice(price)}`);
    } else {
      // Sell — close position
      const pos = portfolio.positions.find(p => p.symbol === selectedSymbol && p.side === "long");
      if (!pos) {
        showAlert("danger", "No position to sell for this symbol");
        return;
      }
      if (amount > pos.amount) {
        showAlert("danger", "Cannot sell more than you hold");
        return;
      }
      const proceeds = amount * price;
      const newPositions = amount === pos.amount
        ? portfolio.positions.filter(p => p.id !== pos.id)
        : portfolio.positions.map(p => p.id === pos.id ? { ...p, amount: p.amount - amount } : p);
      const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      const order: Order = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: selectedSymbol, side: "sell", price, amount, total: proceeds, status: "filled", timestamp: Date.now(),
      };
      const newOrders = [order, ...orders];
      setOrders(newOrders);
      saveOrders(newOrders);
      setTradeAmount("");
      showAlert("success", `Sold ${amount} ${selectedSymbol.replace("USDT", "")} at $${formatPrice(price)}`);
    }
  };

  const closePosition = (posId: string) => {
    const pos = portfolio.positions.find(p => p.id === posId);
    if (!pos) return;
    const ticker = tickers[pos.symbol];
    if (!ticker) {
      showAlert("danger", "No price data to close position");
      return;
    }
    const price = ticker.price;
    const proceeds = pos.amount * price;
    const newPositions = portfolio.positions.filter(p => p.id !== posId);
    const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
    setPortfolio(newPortfolio);
    savePortfolio(newPortfolio);
    const order: Order = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol: pos.symbol, side: "sell", price, amount: pos.amount, total: proceeds, status: "filled", timestamp: Date.now(),
    };
    const newOrders = [order, ...orders];
    setOrders(newOrders);
    saveOrders(newOrders);
    const pnl = (price - pos.entryPrice) * pos.amount;
    showAlert(pnl >= 0 ? "success" : "danger", `Closed ${pos.symbol.replace("USDT", "")} — P&L: $${formatPrice(pnl)}`);
  };

  const resetPortfolio = () => {
    const fresh = { cash: 100000, positions: [] };
    setPortfolio(fresh);
    savePortfolio(fresh);
    setOrders([]);
    saveOrders([]);
    showAlert("info", "Portfolio reset to $100,000");
  };

  const totalPositionValue = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    return sum + (t ? t.price * p.amount : 0);
  }, 0);
  const totalAccountValue = portfolio.cash + totalPositionValue;
  const totalPnL = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    if (!t) return sum;
    return sum + (t.price - p.entryPrice) * p.amount;
  }, 0);

  const selectedTicker = tickers[selectedSymbol];
  const filteredSymbols = AVAILABLE_SYMBOLS.filter(s =>
    !watchlist.includes(s) && s.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  const intervals = [
    { label: "1m", value: "1m" },
    { label: "5m", value: "5m" },
    { label: "15m", value: "15m" },
    { label: "1h", value: "1h" },
    { label: "4h", value: "4h" },
    { label: "1d", value: "1d" },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center">
            <CandlestickChart className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Incentives Day Trading</h1>
            <p className="text-xs text-muted">Live crypto trading · Paper trading with $100K virtual cash</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors",
              autoRefresh ? "bg-success/15 text-success" : "bg-bg-alt text-muted"
            )}
          >
            <Activity className="w-3.5 h-3.5" />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => { fetchTickers(); fetchCandles(selectedSymbol, candleInterval); }}
            className="px-3 py-2 rounded-xl bg-bg-alt text-muted hover:text-text flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loadingTickers && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Account Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-muted" />
            <p className="text-xs text-muted">Account Value</p>
          </div>
          <p className="text-xl font-bold">${formatPrice(totalAccountValue)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-muted" />
            <p className="text-xs text-muted">Cash Available</p>
          </div>
          <p className="text-xl font-bold">${formatPrice(portfolio.cash)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-muted" />
            <p className="text-xs text-muted">Positions Value</p>
          </div>
          <p className="text-xl font-bold">${formatPrice(totalPositionValue)}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            {totalPnL >= 0 ? <TrendingUp className="w-4 h-4 text-success" /> : <TrendingDown className="w-4 h-4 text-danger" />}
            <p className="text-xs text-muted">Unrealized P&L</p>
          </div>
          <p className={cn("text-xl font-bold", totalPnL >= 0 ? "text-success" : "text-danger")}>
            {totalPnL >= 0 ? "+" : ""}${formatPrice(totalPnL)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-alt">
        {[
          { key: "chart" as const, label: "Chart & Trade", icon: CandlestickChart },
          { key: "portfolio" as const, label: "Portfolio", icon: Wallet },
          { key: "orders" as const, label: "Order History", icon: Activity },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.key ? "bg-accent text-white" : "text-muted hover:text-text"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Chart & Trade Tab */}
      {activeTab === "chart" && (
        <div className="grid lg:grid-cols-[1fr_300px] gap-4">
          {/* Left — Chart + Watchlist */}
          <div className="space-y-4">
            {/* Watchlist */}
            <div className="card p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted" />
                  Watchlist
                </h3>
                <button
                  onClick={() => setShowAddSymbol(true)}
                  className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Symbol
                </button>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {watchlist.map(sym => {
                  const t = tickers[sym];
                  if (!t) return (
                    <div key={sym} className="flex items-center justify-between p-2 rounded-lg bg-bg-alt">
                      <span className="text-sm font-medium">{sym.replace("USDT", "")}/USDT</span>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />
                    </div>
                  );
                  return (
                    <div
                      key={sym}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors group",
                        selectedSymbol === sym ? "bg-accent/10" : "hover:bg-bg-alt"
                      )}
                      onClick={() => setSelectedSymbol(sym)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{sym.replace("USDT", "")}/USDT</p>
                          <p className="text-[10px] text-muted">Vol: ${formatVolume(t.quoteVolume)}</p>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <p className="text-sm font-semibold">${formatPrice(t.price)}</p>
                          <p className={cn("text-[10px] font-medium", t.priceChangePercent >= 0 ? "text-success" : "text-danger")}>
                            {t.priceChangePercent >= 0 ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                          </p>
                        </div>
                        {selectedSymbol !== sym && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromWatchlist(sym); }}
                            className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">{selectedSymbol.replace("USDT", "")}/USDT</h3>
                  {selectedTicker && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">${formatPrice(selectedTicker.price)}</span>
                      <span className={cn(
                        "text-sm font-medium px-2 py-0.5 rounded-full",
                        selectedTicker.priceChangePercent >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                      )}>
                        {selectedTicker.priceChangePercent >= 0 ? "+" : ""}{selectedTicker.priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {intervals.map(iv => (
                    <button
                      key={iv.value}
                      onClick={() => setCandleInterval(iv.value)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                        candleInterval === iv.value ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-text"
                      )}
                    >
                      {iv.label}
                    </button>
                  ))}
                </div>
              </div>

              {selectedTicker && (
                <div className="flex gap-4 mb-3 text-xs">
                  <div><span className="text-muted">24h High: </span><span className="font-medium">${formatPrice(selectedTicker.high)}</span></div>
                  <div><span className="text-muted">24h Low: </span><span className="font-medium">${formatPrice(selectedTicker.low)}</span></div>
                  <div><span className="text-muted">24h Vol: </span><span className="font-medium">${formatVolume(selectedTicker.quoteVolume)}</span></div>
                </div>
              )}

              <div className="relative w-full" style={{ height: "350px" }}>
                {loadingChart && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                )}
                {candles.length === 0 && !loadingChart && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
                    No chart data available. Binance API may be geo-restricted in your region.
                  </div>
                )}
                <canvas ref={chartCanvasRef} className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* Right — Trade Panel */}
          <div className="space-y-4">
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <CandlestickChart className="w-4 h-4 text-accent" />
                Place Order
              </h3>

              {/* Buy/Sell toggle */}
              <div className="flex gap-1 p-1 rounded-xl bg-bg-alt mb-3">
                <button
                  onClick={() => setTradeSide("buy")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all",
                    tradeSide === "buy" ? "bg-success text-white" : "text-muted"
                  )}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Buy
                </button>
                <button
                  onClick={() => setTradeSide("sell")}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all",
                    tradeSide === "sell" ? "bg-danger text-white" : "text-muted"
                  )}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Sell
                </button>
              </div>

              {/* Symbol */}
              <div className="mb-3">
                <label className="text-xs text-muted mb-1 block">Symbol</label>
                <div className="px-3 py-2.5 rounded-lg bg-bg-alt text-sm font-medium">
                  {selectedSymbol.replace("USDT", "")}/USDT
                </div>
              </div>

              {/* Price */}
              <div className="mb-3">
                <label className="text-xs text-muted mb-1 block">Current Price</label>
                <div className="px-3 py-2.5 rounded-lg bg-bg-alt text-sm font-medium">
                  ${selectedTicker ? formatPrice(selectedTicker.price) : "—"}
                </div>
              </div>

              {/* Amount */}
              <div className="mb-3">
                <label className="text-xs text-muted mb-1 block">Amount (in coin)</label>
                <input
                  type="number"
                  value={tradeAmount}
                  onChange={(e) => setTradeAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-alt text-sm outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Total */}
              <div className="mb-3 p-3 rounded-lg bg-bg-alt">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Total Cost</span>
                  <span className="font-semibold">
                    ${tradeAmount && selectedTicker ? formatPrice(parseFloat(tradeAmount) * selectedTicker.price) : "0.00"}
                  </span>
                </div>
              </div>

              {/* Quick amount buttons */}
              <div className="flex gap-1 mb-3">
                {[0.25, 0.5, 0.75, 1].map(pct => (
                  <button
                    key={pct}
                    onClick={() => {
                      if (!selectedTicker) return;
                      const usable = tradeSide === "buy"
                        ? portfolio.cash / selectedTicker.price
                        : portfolio.positions.find(p => p.symbol === selectedSymbol)?.amount || 0;
                      setTradeAmount((usable * pct).toFixed(4));
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-bg-alt text-xs text-muted hover:text-text"
                  >
                    {pct * 100}%
                  </button>
                ))}
              </div>

              <button
                onClick={executeTrade}
                disabled={!tradeAmount || !selectedTicker}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-white disabled:opacity-40 transition-all",
                  tradeSide === "buy" ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"
                )}
              >
                {tradeSide === "buy" ? "Buy" : "Sell"} {selectedSymbol.replace("USDT", "")}
              </button>
            </div>

            {/* Current Position for Selected Symbol */}
            {portfolio.positions.filter(p => p.symbol === selectedSymbol).length > 0 && (
              <div className="card p-4">
                <h3 className="text-sm font-semibold mb-2">Your Position</h3>
                {portfolio.positions.filter(p => p.symbol === selectedSymbol).map(pos => {
                  const t = tickers[pos.symbol];
                  const currentPrice = t?.price || 0;
                  const pnl = (currentPrice - pos.entryPrice) * pos.amount;
                  const pnlPct = pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;
                  return (
                    <div key={pos.id} className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Amount</span>
                        <span className="font-medium">{pos.amount} {pos.symbol.replace("USDT", "")}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Entry</span>
                        <span className="font-medium">${formatPrice(pos.entryPrice)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">Current</span>
                        <span className="font-medium">${formatPrice(currentPrice)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">P&L</span>
                        <span className={cn("font-bold", pnl >= 0 ? "text-success" : "text-danger")}>
                          {pnl >= 0 ? "+" : ""}${formatPrice(pnl)} ({pnlPct.toFixed(2)}%)
                        </span>
                      </div>
                      <button
                        onClick={() => closePosition(pos.id)}
                        className="w-full py-2 rounded-lg bg-danger/15 text-danger text-xs font-bold hover:bg-danger/25 transition-colors"
                      >
                        Close Position
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portfolio Tab */}
      {activeTab === "portfolio" && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent" />
              Open Positions ({portfolio.positions.length})
            </h3>
            <button
              onClick={resetPortfolio}
              className="text-xs text-danger hover:text-danger/80 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset Account
            </button>
          </div>

          {portfolio.positions.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">
              No open positions. Buy a coin from the Chart & Trade tab to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {portfolio.positions.map(pos => {
                const t = tickers[pos.symbol];
                const currentPrice = t?.price || 0;
                const value = currentPrice * pos.amount;
                const pnl = (currentPrice - pos.entryPrice) * pos.amount;
                const pnlPct = pos.entryPrice > 0 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;
                return (
                  <div key={pos.id} className="p-3 rounded-xl bg-bg-alt space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{pos.symbol.replace("USDT", "")}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">LONG</span>
                      </div>
                      <button
                        onClick={() => closePosition(pos.id)}
                        className="text-xs text-danger hover:text-danger/80 font-medium"
                      >
                        Close
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-muted">Amount</p>
                        <p className="font-medium">{pos.amount}</p>
                      </div>
                      <div>
                        <p className="text-muted">Entry</p>
                        <p className="font-medium">${formatPrice(pos.entryPrice)}</p>
                      </div>
                      <div>
                        <p className="text-muted">Value</p>
                        <p className="font-medium">${formatPrice(value)}</p>
                      </div>
                      <div>
                        <p className="text-muted">P&L</p>
                        <p className={cn("font-bold", pnl >= 0 ? "text-success" : "text-danger")}>
                          {pnl >= 0 ? "+" : ""}${formatPrice(pnl)}
                          <span className="block text-[10px]">({pnlPct.toFixed(2)}%)</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            Order History ({orders.length})
          </h3>
          {orders.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">
              No orders yet. Your trades will appear here.
            </div>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {orders.map(order => (
                <div key={order.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-alt hover:bg-white/5 transition-colors">
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    order.side === "buy" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                  )}>
                    {order.side === "buy" ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{order.side.toUpperCase()}</span>
                      <span className="text-sm font-medium">{order.symbol.replace("USDT", "")}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">FILLED</span>
                    </div>
                    <p className="text-[10px] text-muted">{formatTime(order.timestamp)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{order.amount} @ ${formatPrice(order.price)}</p>
                    <p className="text-xs text-muted">${formatPrice(order.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Symbol Modal */}
      {showAddSymbol && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4" onClick={() => setShowAddSymbol(false)}>
          <div className="surface w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="font-semibold">Add Symbol to Watchlist</h3>
              <button onClick={() => setShowAddSymbol(false)} className="w-8 h-8 rounded-full bg-bg-alt hover:bg-white/5 flex items-center justify-center">
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  placeholder="Search symbols..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-alt text-sm outline-none focus:ring-1 focus:ring-accent"
                  autoFocus
                />
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {filteredSymbols.length === 0 ? (
                  <p className="text-xs text-muted text-center py-4">No symbols found</p>
                ) : filteredSymbols.map(sym => (
                  <button
                    key={sym}
                    onClick={() => addToWatchlist(sym)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 text-left"
                  >
                    <span className="text-sm font-medium">{sym.replace("USDT", "")}/USDT</span>
                    <ChevronRight className="w-4 h-4 text-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
