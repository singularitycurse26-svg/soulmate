import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  CandlestickChart, TrendingUp, TrendingDown, Plus, X, RefreshCw,
  ArrowUpCircle, ArrowDownCircle, Wallet, Activity, Eye, Trash2,
  Loader2, Search, ChevronRight, Bot, Target, Shield,
  Grid3x3, BarChart3, Brain, Settings, Play, Pause, Layers,
  DollarSign, AlertTriangle, Pencil, Eraser, TrendingUp as TrendIcon,
  Minus, Square, Type,
} from "lucide-react";
import { ProChart, type ChartIndicators, type ChartType, type Drawing } from "@/components/trading/ProChart";
import { OrderBookWidget } from "@/components/trading/OrderBookWidget";
import { OrderFlowWidget } from "@/components/trading/OrderFlowWidget";
import { AIIndicatorsWidget } from "@/components/trading/AIIndicatorsWidget";
import { SmartTradeTerminal, type SmartTradeOptions } from "@/components/trading/SmartTradeTerminal";
import { DCABotPanel, type DCABot } from "@/components/trading/DCABotPanel";
import { rsi, macd, bollingerBands, type Candle } from "@/lib/indicators";

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

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

interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  amount: number;
  openedAt: number;
  takeProfit?: number;
  stopLoss?: number;
  trailingStop?: number;
  trailingTakeProfit?: number;
}

interface Order {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  price: number;
  amount: number;
  total: number;
  status: "filled" | "pending" | "cancelled";
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const BINANCE_API = "https://api.binance.com/api/v3";

// ── Incentives Inc. stablecoin (INC) ─────────────────────────────
// INC is the native stablecoin of the Incentives Inc. ecosystem.
// It's not listed on Binance, so we generate simulated price data
// pegged to $1.00 with small realistic fluctuations.
const INC_SYMBOL = "INCUSDT";
const INC_BASE_PRICE = 1.00;
const INC_VOLATILITY = 0.005; // 0.5% max fluctuation per tick

// Simulated INC price history (seeded for consistency)
let incPriceHistory: number[] = [];
let incLastPrice = INC_BASE_PRICE;

function generateINCPrice(): number {
  // Random walk around $1.00 with mean reversion
  const drift = (INC_BASE_PRICE - incLastPrice) * 0.1; // mean reversion
  const noise = (Math.random() - 0.5) * INC_VOLATILITY * 2;
  incLastPrice = Math.max(0.95, Math.min(1.05, incLastPrice + drift + noise));
  return incLastPrice;
}

function generateINCCandles(interval: string, count: number = 200): Candle[] {
  const intervalMs: Record<string, number> = {
    "1m": 60000, "5m": 300000, "15m": 900000, "30m": 1800000,
    "1h": 3600000, "4h": 14400000, "1d": 86400000,
  };
  const ms = intervalMs[interval] || 900000;
  const now = Date.now();
  const candles: Candle[] = [];
  let price = INC_BASE_PRICE;

  for (let i = count - 1; i >= 0; i--) {
    const time = now - i * ms;
    const open = price;
    const change = (Math.random() - 0.5) * INC_VOLATILITY * 2;
    const close = Math.max(0.95, Math.min(1.05, open + change));
    const high = Math.max(open, close) + Math.random() * INC_VOLATILITY;
    const low = Math.min(open, close) - Math.random() * INC_VOLATILITY;
    const volume = 100000 + Math.random() * 500000;
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  incLastPrice = price;
  return candles;
}

function generateINCTicker(): Ticker {
  const price = generateINCPrice();
  const change = price - INC_BASE_PRICE;
  const changePercent = (change / INC_BASE_PRICE) * 100;
  return {
    symbol: INC_SYMBOL,
    price,
    priceChange: change,
    priceChangePercent: changePercent,
    high: Math.max(price, INC_BASE_PRICE) + 0.002,
    low: Math.min(price, INC_BASE_PRICE) - 0.002,
    volume: 1000000 + Math.random() * 5000000,
    quoteVolume: 1000000 + Math.random() * 5000000,
  };
}

const DEFAULT_WATCHLIST = [
  "BNBUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "AVAXUSDT", INC_SYMBOL,
];

const AVAILABLE_SYMBOLS = [
  ...DEFAULT_WATCHLIST,
  "DOTUSDT", "LINKUSDT", "MATICUSDT", "LTCUSDT", "ATOMUSDT",
  "NEARUSDT", "APTUSDT", "FILUSDT", "ARBUSDT", "OPUSDT",
  "INCHUSDT", "PEPEUSDT", "SHIBUSDT", "TRXUSDT", "LDOUSDT",
];
// Note: INC (Incentives stablecoin) is already in DEFAULT_WATCHLIST

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const LAYOUTS = [
  { key: "simple", label: "Simple", desc: "Chart + Order Form" },
  { key: "advanced", label: "Advanced", desc: "Full trading terminal" },
  { key: "terminal", label: "Terminal", desc: "Data-intensive analysis" },
  { key: "cryptowatch", label: "Cryptowatch", desc: "Chart-focused" },
] as const;

type LayoutKey = typeof LAYOUTS[number]["key"];

const PORTFOLIO_KEY = "daytrading_portfolio_v3";
const WATCHLIST_KEY = "daytrading_watchlist_v3";
const ORDERS_KEY = "daytrading_orders_v3";
const DCA_BOTS_KEY = "daytrading_dca_bots_v3";
const DRAWINGS_KEY = "daytrading_drawings_v3";
const LAYOUT_KEY = "daytrading_layout_v3";

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// Storage
// ═══════════════════════════════════════════════════════════════════

function loadPortfolio(): { cash: number; positions: Position[] } {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    return raw ? JSON.parse(raw) : { cash: 100000, positions: [] };
  } catch { return { cash: 100000, positions: [] }; }
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_WATCHLIST;
  } catch { return DEFAULT_WATCHLIST; }
}

function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadDCABots(): DCABot[] {
  try {
    const raw = localStorage.getItem(DCA_BOTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadDrawings(): Record<string, Drawing[]> {
  try {
    const raw = localStorage.getItem(DRAWINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadLayout(): LayoutKey {
  try {
    return (localStorage.getItem(LAYOUT_KEY) as LayoutKey) || "advanced";
  } catch { return "advanced"; }
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
function saveDCABots(b: DCABot[]) {
  try { localStorage.setItem(DCA_BOTS_KEY, JSON.stringify(b)); } catch {}
}
function saveDrawings(d: Record<string, Drawing[]>) {
  try { localStorage.setItem(DRAWINGS_KEY, JSON.stringify(d)); } catch {}
}
function saveLayout(l: LayoutKey) {
  try { localStorage.setItem(LAYOUT_KEY, l); } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════

export function DayTradingPage() {
  const { showAlert } = useStore();
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BNBUSDT");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candleInterval, setCandleInterval] = useState<string>("15m");
  const [loadingTickers, setLoadingTickers] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
  const [portfolio, setPortfolio] = useState(() => loadPortfolio());
  const [orders, setOrders] = useState<Order[]>(() => loadOrders());
  const [dcaBots, setDCABots] = useState<DCABot[]>(() => loadDCABots());
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [layout, setLayout] = useState<LayoutKey>(() => loadLayout());
  const [activeTab, setActiveTab] = useState<"trade" | "portfolio" | "orders" | "bots">("trade");
  const [watchlistTab, setWatchlistTab] = useState<"all" | "gainers" | "losers">("all");

  // Chart settings
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [drawMode, setDrawMode] = useState<string | null>(null);
  const [drawingsBySymbol, setDrawingsBySymbol] = useState<Record<string, Drawing[]>>(() => loadDrawings());

  const [indicators, setIndicators] = useState<ChartIndicators>({
    sma: true, ema: true, bollinger: false, rsi: true, macd: true,
    volume: true, stochastic: false, vwap: true, atr: false, adx: false,
  });

  // Widget visibility per layout
  const [widgets, setWidgets] = useState({
    orderBook: true, orderFlow: true, ai: true, smartTrade: true, dca: false,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentDrawings = drawingsBySymbol[selectedSymbol] || [];
  const selectedTicker = tickers[selectedSymbol];

  // ── Data fetching ────────────────────────────────────────────────
  const fetchTickers = useCallback(async () => {
    setLoadingTickers(true);
    // Filter out INC (not on Binance) — handle separately
    const binanceSymbols = watchlist.filter(s => s !== INC_SYMBOL);
    try {
      const symbolsParam = JSON.stringify(binanceSymbols);
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
        // Add INC stablecoin simulated data
        if (watchlist.includes(INC_SYMBOL)) {
          map[INC_SYMBOL] = generateINCTicker();
        }
        setTickers(map);
      }
    } catch {
      try {
        const resp = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=20&page=1");
        if (resp.ok) {
          const data = await resp.json();
          const map: Record<string, Ticker> = {};
          const symbolMap: Record<string, string> = {
            bitcoin: "BTCUSDT", ethereum: "ETHUSDT", binancecoin: "BNBUSDT",
            solana: "SOLUSDT", ripple: "XRPUSDT", cardano: "ADAUSDT",
            dogecoin: "DOGEUSDT", avalanche: "AVAXUSDT",
          };
          for (const c of data) {
            const sym = symbolMap[c.id] || c.symbol.toUpperCase() + "USDT";
            map[sym] = {
              symbol: sym, price: c.current_price,
              priceChange: c.price_change_24h || 0,
              priceChangePercent: c.price_change_percentage_24h || 0,
              high: c.high_24h || c.current_price,
              low: c.low_24h || c.current_price,
              volume: c.total_volume || 0, quoteVolume: c.total_volume || 0,
            };
          }
          // Add INC stablecoin simulated data
          if (watchlist.includes(INC_SYMBOL)) {
            map[INC_SYMBOL] = generateINCTicker();
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
    // INC stablecoin — generate simulated candles
    if (symbol === INC_SYMBOL) {
      const simulated = generateINCCandles(interval, 200);
      setCandles(simulated);
      setLoadingChart(false);
      return;
    }
    try {
      const resp = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=200`);
      if (resp.ok) {
        const data = await resp.json();
        const parsed: Candle[] = data.map((k: any[]) => ({
          time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
        }));
        setCandles(parsed);
      }
    } catch {
      setCandles([]);
    } finally {
      setLoadingChart(false);
    }
  }, []);

  useEffect(() => { fetchTickers(); }, [fetchTickers]);
  useEffect(() => { fetchCandles(selectedSymbol, candleInterval); }, [selectedSymbol, candleInterval, fetchCandles]);

  useEffect(() => {
    if (!autoRefresh) return;
    pollRef.current = setInterval(() => {
      fetchTickers();
      fetchCandles(selectedSymbol, candleInterval);
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [autoRefresh, fetchTickers, fetchCandles, selectedSymbol, candleInterval]);

  // ── DCA Bot auto-execution ───────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      for (const bot of dcaBots) {
        if (!bot.active) continue;
        const ticker = tickers[bot.symbol];
        if (!ticker) continue;

        const existingPos = portfolio.positions.find(p => p.symbol === bot.symbol && p.side === "long");

        // Check start condition
        let shouldStart = true;
        if (bot.startCondition !== "none" && candles.length > 30) {
          if (bot.startCondition === "rsi") {
            const rsiVals = rsi(candles);
            const lastRSI = rsiVals[rsiVals.length - 1];
            shouldStart = !isNaN(lastRSI) && lastRSI < 45;
          } else if (bot.startCondition === "macd") {
            const macdData = macd(candles);
            const lastMACD = macdData.histogram[macdData.histogram.length - 1];
            shouldStart = !isNaN(lastMACD) && lastMACD > 0;
          } else if (bot.startCondition === "bb") {
            const bb = bollingerBands(candles);
            shouldStart = ticker.price < bb.lower[bb.lower.length - 1];
          }
        }

        if (!existingPos && bot.totalInvested === 0 && shouldStart) {
          const amount = bot.baseOrder / ticker.price;
          if (bot.baseOrder <= portfolio.cash) {
            const newPortfolio = {
              cash: portfolio.cash - bot.baseOrder,
              positions: [...portfolio.positions, {
                id: `pos-${Date.now()}`, symbol: bot.symbol, side: "long" as const,
                entryPrice: ticker.price, amount, openedAt: Date.now(),
                takeProfit: ticker.price * (1 + bot.takeProfit / 100),
                stopLoss: ticker.price * (1 - bot.stopLoss / 100),
              }],
            };
            setPortfolio(newPortfolio);
            savePortfolio(newPortfolio);
            const updatedBots = dcaBots.map(b => b.id === bot.id ? {
              ...b, totalInvested: b.totalInvested + bot.baseOrder,
            } : b);
            setDCABots(updatedBots);
            saveDCABots(updatedBots);
          }
        } else if (existingPos) {
          // TP check
          if (ticker.price >= (existingPos.takeProfit || existingPos.entryPrice * 1.03)) {
            const proceeds = existingPos.amount * ticker.price;
            const newPositions = portfolio.positions.filter(p => p.id !== existingPos.id);
            const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
            setPortfolio(newPortfolio);
            savePortfolio(newPortfolio);
            const profit = (ticker.price - existingPos.entryPrice) * existingPos.amount;
            const updatedBots = dcaBots.map(b => b.id === bot.id ? {
              ...b, totalInvested: 0, totalProfit: b.totalProfit + profit, deals: b.deals + 1,
            } : b);
            setDCABots(updatedBots);
            saveDCABots(updatedBots);
            const order: Order = {
              id: `ord-${Date.now()}`, symbol: bot.symbol, side: "sell",
              type: "market", price: ticker.price, amount: existingPos.amount,
              total: proceeds, status: "filled", timestamp: Date.now(),
            };
            const newOrders = [order, ...orders];
            setOrders(newOrders);
            saveOrders(newOrders);
          }
          // SL check
          else if (ticker.price <= (existingPos.stopLoss || existingPos.entryPrice * 0.9)) {
            const proceeds = existingPos.amount * ticker.price;
            const newPositions = portfolio.positions.filter(p => p.id !== existingPos.id);
            const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
            setPortfolio(newPortfolio);
            savePortfolio(newPortfolio);
            const loss = (ticker.price - existingPos.entryPrice) * existingPos.amount;
            const updatedBots = dcaBots.map(b => b.id === bot.id ? {
              ...b, totalInvested: 0, totalProfit: b.totalProfit + loss, deals: b.deals + 1,
            } : b);
            setDCABots(updatedBots);
            saveDCABots(updatedBots);
          }
          // Safety order check
          else if (ticker.price < existingPos.entryPrice * (1 - bot.priceDeviation / 100)) {
            const safetyAmount = bot.safetyOrder / ticker.price;
            const totalAmount = existingPos.amount + safetyAmount;
            const avgPrice = (existingPos.entryPrice * existingPos.amount + ticker.price * safetyAmount) / totalAmount;
            const newPositions = portfolio.positions.map(p => p.id === existingPos.id ? {
              ...p, entryPrice: avgPrice, amount: totalAmount,
              takeProfit: avgPrice * (1 + bot.takeProfit / 100),
              stopLoss: avgPrice * (1 - bot.stopLoss / 100),
            } : p);
            if (bot.safetyOrder <= portfolio.cash) {
              const newPortfolio = { cash: portfolio.cash - bot.safetyOrder, positions: newPositions };
              setPortfolio(newPortfolio);
              savePortfolio(newPortfolio);
              const updatedBots = dcaBots.map(b => b.id === bot.id ? {
                ...b, totalInvested: b.totalInvested + bot.safetyOrder,
              } : b);
              setDCABots(updatedBots);
              saveDCABots(updatedBots);
            }
          }
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, dcaBots, tickers, portfolio, orders, candles]);

  // ── Watchlist management ─────────────────────────────────────────
  const addToWatchlist = (sym: string) => {
    if (watchlist.includes(sym)) return;
    const updated = [...watchlist, sym];
    setWatchlist(updated);
    saveWatchlist(updated);
    setShowAddSymbol(false);
    setSymbolSearch("");
    fetchTickers();
  };

  const removeFromWatchlist = (sym: string) => {
    const updated = watchlist.filter(s => s !== sym);
    setWatchlist(updated);
    saveWatchlist(updated);
  };

  // ── Drawing management ──────────────────────────────────────────
  const handleDrawingsChange = (newDrawings: Drawing[]) => {
    const updated = { ...drawingsBySymbol, [selectedSymbol]: newDrawings };
    setDrawingsBySymbol(updated);
    saveDrawings(updated);
  };

  const clearDrawings = () => {
    const updated = { ...drawingsBySymbol, [selectedSymbol]: [] };
    setDrawingsBySymbol(updated);
    saveDrawings(updated);
  };

  // ── Trading ──────────────────────────────────────────────────────
  const executeSmartTrade = (opts: SmartTradeOptions) => {
    const ticker = tickers[selectedSymbol];
    if (!ticker) { showAlert("danger", "No price data"); return; }
    const price = opts.orderType === "market" ? ticker.price : (opts.price || ticker.price);
    const total = opts.amount * price;

    if (opts.side === "buy") {
      if (total > portfolio.cash) { showAlert("danger", "Insufficient cash"); return; }
      const firstTP = opts.takeProfitTargets[0]?.price;
      const newPos: Position = {
        id: `pos-${Date.now()}`, symbol: selectedSymbol, side: "long",
        entryPrice: price, amount: opts.amount, openedAt: Date.now(),
        takeProfit: firstTP, stopLoss: opts.stopLoss,
        trailingStop: opts.trailingStopLoss ? opts.trailingOffset : undefined,
        trailingTakeProfit: opts.trailingTakeProfit ? opts.trailingOffset : undefined,
      };
      const newPortfolio = { cash: portfolio.cash - total, positions: [...portfolio.positions, newPos] };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      const orderTypeLabel = opts.orderType === "market" ? "Market" : opts.orderType === "limit" ? "Limit" : "Conditional";
      showAlert("success", `${orderTypeLabel} Buy ${opts.amount} ${selectedSymbol.replace("USDT", "")} @ $${formatPrice(price)}`);
    } else {
      const pos = portfolio.positions.find(p => p.symbol === selectedSymbol);
      if (!pos) { showAlert("danger", "No position to sell"); return; }
      if (opts.amount > pos.amount) { showAlert("danger", "Cannot sell more than held"); return; }
      const proceeds = opts.amount * price;
      const newPositions = opts.amount === pos.amount
        ? portfolio.positions.filter(p => p.id !== pos.id)
        : portfolio.positions.map(p => p.id === pos.id ? { ...p, amount: p.amount - opts.amount } : p);
      const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      const pnl = (price - pos.entryPrice) * opts.amount;
      showAlert(pnl >= 0 ? "success" : "danger", `Sold ${opts.amount} ${selectedSymbol.replace("USDT", "")} — P&L: $${formatPrice(pnl)}`);
    }

    const order: Order = {
      id: `ord-${Date.now()}`, symbol: selectedSymbol, side: opts.side,
      type: opts.orderType, price, amount: opts.amount, total,
      status: "filled", timestamp: Date.now(),
    };
    const newOrders = [order, ...orders];
    setOrders(newOrders);
    saveOrders(newOrders);
  };

  const closePosition = (posId: string) => {
    const pos = portfolio.positions.find(p => p.id === posId);
    if (!pos) return;
    const ticker = tickers[pos.symbol];
    if (!ticker) { showAlert("danger", "No price data"); return; }
    const proceeds = pos.amount * ticker.price;
    const newPositions = portfolio.positions.filter(p => p.id !== posId);
    const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
    setPortfolio(newPortfolio);
    savePortfolio(newPortfolio);
    const pnl = (ticker.price - pos.entryPrice) * pos.amount;
    const order: Order = {
      id: `ord-${Date.now()}`, symbol: pos.symbol, side: "sell",
      type: "market", price: ticker.price, amount: pos.amount, total: proceeds,
      status: "filled", timestamp: Date.now(),
    };
    const newOrders = [order, ...orders];
    setOrders(newOrders);
    saveOrders(newOrders);
    showAlert(pnl >= 0 ? "success" : "danger", `Closed ${pos.symbol.replace("USDT", "")} — P&L: $${formatPrice(pnl)}`);
  };

  const resetPortfolio = () => {
    const fresh = { cash: 100000, positions: [] };
    setPortfolio(fresh);
    savePortfolio(fresh);
    setOrders([]);
    saveOrders([]);
    setDCABots([]);
    saveDCABots([]);
    showAlert("info", "Portfolio reset to $100,000");
  };

  // ── Layout switching ────────────────────────────────────────────
  const applyLayout = (key: LayoutKey) => {
    setLayout(key);
    saveLayout(key);
    if (key === "simple") {
      setWidgets({ orderBook: false, orderFlow: false, ai: false, smartTrade: true, dca: false });
    } else if (key === "advanced") {
      setWidgets({ orderBook: true, orderFlow: true, ai: true, smartTrade: true, dca: true });
    } else if (key === "terminal") {
      setWidgets({ orderBook: true, orderFlow: true, ai: true, smartTrade: false, dca: false });
    } else if (key === "cryptowatch") {
      setWidgets({ orderBook: true, orderFlow: false, ai: false, smartTrade: false, dca: false });
    }
  };

  // ── Computed ─────────────────────────────────────────────────────
  const totalPositionValue = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    return sum + (t ? t.price * p.amount : 0);
  }, 0);
  const totalAccountValue = portfolio.cash + totalPositionValue;
  const totalPnL = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    return sum + (t ? (t.price - p.entryPrice) * p.amount : 0);
  }, 0);

  const sortedWatchlist = useMemo(() => {
    const tickersList = watchlist.map(s => tickers[s]).filter(Boolean);
    if (watchlistTab === "gainers") return tickersList.sort((a, b) => b.priceChangePercent - a.priceChangePercent);
    if (watchlistTab === "losers") return tickersList.sort((a, b) => a.priceChangePercent - b.priceChangePercent);
    return tickersList;
  }, [watchlist, tickers, watchlistTab]);

  const filteredSymbols = AVAILABLE_SYMBOLS.filter(s =>
    !watchlist.includes(s) && s.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  // ── Drawing tools ───────────────────────────────────────────────
  const drawingTools = [
    { mode: "trendline", icon: TrendIcon, label: "Trend Line" },
    { mode: "horizontal", icon: Minus, label: "Horizontal Line" },
    { mode: "fibonacci", icon: Plus, label: "Fibonacci" },
    { mode: "rectangle", icon: Square, label: "Rectangle" },
  ];

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center">
            <CandlestickChart className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Incentives Day Trading Pro</h1>
            <p className="text-xs text-muted">Kraken × Pyonix × 3Commas hybrid · INC stablecoin · Order flow · AI indicators</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Layout selector */}
          <select
            value={layout}
            onChange={(e) => applyLayout(e.target.value as LayoutKey)}
            className="px-3 py-2 rounded-xl bg-bg-alt text-xs font-medium outline-none cursor-pointer"
          >
            {LAYOUTS.map(l => (
              <option key={l.key} value={l.key}>{l.label} — {l.desc}</option>
            ))}
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn("px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5",
              autoRefresh ? "bg-success/15 text-success" : "bg-bg-alt text-muted")}
          >
            <Activity className="w-3.5 h-3.5" />
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
          <button
            onClick={() => { fetchTickers(); fetchCandles(selectedSymbol, candleInterval); }}
            className="px-3 py-2 rounded-xl bg-bg-alt text-muted hover:text-text flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loadingTickers && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Account Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Account Value</p>
          </div>
          <p className="text-lg font-bold font-mono">${formatPrice(totalAccountValue)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Cash</p>
          </div>
          <p className="text-lg font-bold font-mono">${formatPrice(portfolio.cash)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Positions</p>
          </div>
          <p className="text-lg font-bold font-mono">${formatPrice(totalPositionValue)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            {totalPnL >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-danger" />}
            <p className="text-[10px] text-muted">Unrealized P&L</p>
          </div>
          <p className={cn("text-lg font-bold font-mono", totalPnL >= 0 ? "text-success" : "text-danger")}>
            {totalPnL >= 0 ? "+" : ""}${formatPrice(totalPnL)}
          </p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Active Bots</p>
          </div>
          <p className="text-lg font-bold font-mono">{dcaBots.filter(b => b.active).length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-alt">
        {[
          { key: "trade" as const, label: "Trade", icon: CandlestickChart },
          { key: "portfolio" as const, label: "Portfolio", icon: Wallet },
          { key: "orders" as const, label: "Orders", icon: Activity },
          { key: "bots" as const, label: "Bots", icon: Bot },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn("flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all",
                activeTab === tab.key ? "bg-accent text-white" : "text-muted hover:text-text")}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Trade Tab */}
      {activeTab === "trade" && (
        <div className="grid lg:grid-cols-[200px_1fr_300px] gap-3">
          {/* Left — Watchlist */}
          <div className="card p-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-xs font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-muted" />
                Watchlist
              </h3>
              <button onClick={() => setShowAddSymbol(true)} className="text-muted hover:text-accent">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Watchlist tabs */}
            <div className="flex gap-0.5 mb-2 p-0.5 rounded-lg bg-bg-alt">
              {[
                { key: "all" as const, label: "All" },
                { key: "gainers" as const, label: "↑" },
                { key: "losers" as const, label: "↓" },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setWatchlistTab(t.key)}
                  className={cn("flex-1 py-1 rounded text-[10px] font-medium",
                    watchlistTab === t.key ? "bg-accent/20 text-accent" : "text-muted")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="space-y-0.5 max-h-[60vh] overflow-y-auto no-scrollbar">
              {sortedWatchlist.map(t => (
                <button
                  key={t.symbol}
                  onClick={() => setSelectedSymbol(t.symbol)}
                  className={cn("w-full flex items-center justify-between p-1.5 rounded-lg transition-colors group",
                    selectedSymbol === t.symbol ? "bg-accent/10" : "hover:bg-bg-alt")}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium font-mono flex items-center gap-1">
                      {t.symbol.replace("USDT", "")}
                      {t.symbol === INC_SYMBOL && <span className="text-[7px] px-1 py-0.5 rounded bg-pink-500/20 text-pink-400 font-bold">INC</span>}
                    </p>
                    <p className={cn("text-[9px] font-mono", t.priceChangePercent >= 0 ? "text-success" : "text-danger")}>
                      {t.priceChangePercent >= 0 ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-right font-mono">${formatPrice(t.price)}</p>
                  {selectedSymbol !== t.symbol && (
                    <span onClick={(e) => { e.stopPropagation(); removeFromWatchlist(t.symbol); }} className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 ml-1">
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Center — Chart + Tools */}
          <div className="space-y-2">
            <div className="card p-3">
              {/* Symbol header */}
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold font-mono">{selectedSymbol.replace("USDT", "")}/USDT</h3>
                  {selectedSymbol === INC_SYMBOL && (
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 border border-pink-500/30">
                      INCENTIVES STABLECOIN
                    </span>
                  )}
                  {selectedTicker && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono">${formatPrice(selectedTicker.price)}</span>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full font-mono",
                        selectedTicker.priceChangePercent >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                        {selectedTicker.priceChangePercent >= 0 ? "+" : ""}{selectedTicker.priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {INTERVALS.map(iv => (
                    <button
                      key={iv.value}
                      onClick={() => setCandleInterval(iv.value)}
                      className={cn("px-2 py-0.5 rounded text-[10px] font-medium font-mono",
                        candleInterval === iv.value ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-text")}
                    >
                      {iv.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 24h stats */}
              {selectedTicker && (
                <div className="flex gap-4 mb-2 text-[10px] text-muted font-mono">
                  <span>H: <span className="text-text">${formatPrice(selectedTicker.high)}</span></span>
                  <span>L: <span className="text-text">${formatPrice(selectedTicker.low)}</span></span>
                  <span>Vol: <span className="text-text">${formatVolume(selectedTicker.quoteVolume)}</span></span>
                </div>
              )}

              {/* Chart type + Drawing tools + Indicators */}
              <div className="flex flex-wrap items-center gap-1 mb-2">
                {/* Chart type */}
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-bg-alt">
                  {[
                    { type: "candle" as ChartType, label: "Candles" },
                    { type: "line" as ChartType, label: "Line" },
                    { type: "area" as ChartType, label: "Area" },
                    { type: "heikin_ashi" as ChartType, label: "HA" },
                  ].map(ct => (
                    <button
                      key={ct.type}
                      onClick={() => setChartType(ct.type)}
                      className={cn("px-2 py-0.5 rounded text-[10px] font-medium",
                        chartType === ct.type ? "bg-accent/20 text-accent" : "text-muted")}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>

                {/* Drawing tools */}
                <div className="flex gap-0.5 p-0.5 rounded-lg bg-bg-alt">
                  {drawingTools.map(tool => {
                    const Icon = tool.icon;
                    return (
                      <button
                        key={tool.mode}
                        onClick={() => setDrawMode(drawMode === tool.mode ? null : tool.mode)}
                        className={cn("w-6 h-6 rounded flex items-center justify-center",
                          drawMode === tool.mode ? "bg-accent/20 text-accent" : "text-muted hover:text-text")}
                        title={tool.label}
                      >
                        <Icon className="w-3 h-3" />
                      </button>
                    );
                  })}
                  <button
                    onClick={clearDrawings}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-danger"
                    title="Clear drawings"
                  >
                    <Eraser className="w-3 h-3" />
                  </button>
                </div>

                {/* Indicator toggles */}
                <div className="flex flex-wrap gap-0.5">
                  {[
                    { key: "sma" as const, label: "SMA", color: "text-amber-400" },
                    { key: "ema" as const, label: "EMA", color: "text-cyan-400" },
                    { key: "bollinger" as const, label: "BB", color: "text-indigo-400" },
                    { key: "vwap" as const, label: "VWAP", color: "text-fuchsia-400" },
                    { key: "volume" as const, label: "Vol", color: "text-success" },
                    { key: "rsi" as const, label: "RSI", color: "text-purple-400" },
                    { key: "macd" as const, label: "MACD", color: "text-cyan-400" },
                    { key: "stochastic" as const, label: "Stoch", color: "text-orange-400" },
                    { key: "atr" as const, label: "ATR", color: "text-red-400" },
                    { key: "adx" as const, label: "ADX", color: "text-green-400" },
                  ].map(ind => (
                    <button
                      key={ind.key}
                      onClick={() => setIndicators(prev => ({ ...prev, [ind.key]: !prev[ind.key] }))}
                      className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-all",
                        indicators[ind.key] ? `bg-white/10 ${ind.color}` : "bg-bg-alt text-muted")}
                    >
                      {ind.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="relative">
                {loadingChart && candles.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                )}
                {candles.length === 0 && !loadingChart && (
                  <div className="flex items-center justify-center h-48 text-muted text-sm">
                    No chart data. Binance API may be geo-restricted.
                  </div>
                )}
                <ProChart
                  candles={candles}
                  indicators={indicators}
                  chartType={chartType}
                  height={380}
                  showRSI={indicators.rsi}
                  showMACD={indicators.macd}
                  drawings={currentDrawings}
                  onDrawingsChange={handleDrawingsChange}
                  drawMode={drawMode}
                  symbol={selectedSymbol}
                />
              </div>
            </div>

            {/* Widget toggle bar */}
            <div className="flex flex-wrap gap-1">
              {([
                { show: widgets.orderBook, set: (v: boolean) => setWidgets(w => ({ ...w, orderBook: v })), label: "Order Book", icon: Layers },
                { show: widgets.orderFlow, set: (v: boolean) => setWidgets(w => ({ ...w, orderFlow: v })), label: "Order Flow", icon: Activity },
                { show: widgets.ai, set: (v: boolean) => setWidgets(w => ({ ...w, ai: v })), label: "AI Indicators", icon: Brain },
                { show: widgets.smartTrade, set: (v: boolean) => setWidgets(w => ({ ...w, smartTrade: v })), label: "Smart Trade", icon: Target },
                { show: widgets.dca, set: (v: boolean) => setWidgets(w => ({ ...w, dca: v })), label: "DCA Bot", icon: Bot },
              ] as const).map((w, i) => (
                <button
                  key={i}
                  onClick={() => w.set(!w.show)}
                  className={cn("px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1",
                    w.show ? "bg-accent/15 text-accent" : "bg-bg-alt text-muted")}
                >
                  <w.icon className="w-3 h-3" />
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right — Widget panels */}
          <div className="space-y-2 max-h-[80vh] overflow-y-auto no-scrollbar">
            {widgets.orderBook && <OrderBookWidget symbol={selectedSymbol} currentPrice={selectedTicker?.price || 0} />}
            {widgets.orderFlow && <OrderFlowWidget symbol={selectedSymbol} candles={candles} />}
            {widgets.ai && <AIIndicatorsWidget candles={candles} ticker={selectedTicker} />}
            {widgets.smartTrade && (
              <SmartTradeTerminal
                symbol={selectedSymbol}
                ticker={selectedTicker}
                portfolio={portfolio}
                onExecute={executeSmartTrade}
              />
            )}
            {widgets.dca && (
              <DCABotPanel
                symbol={selectedSymbol}
                ticker={selectedTicker}
                bots={dcaBots}
                setBots={setDCABots}
                portfolio={portfolio}
                candles={candles}
              />
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
            <button onClick={resetPortfolio} className="text-xs text-danger hover:text-danger/80 flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" />
              Reset Account
            </button>
          </div>
          {portfolio.positions.length === 0 ? (
            <div className="text-center py-12 text-muted text-sm">No open positions. Buy a coin from the Trade tab.</div>
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
                        <span className="font-bold text-sm font-mono">{pos.symbol.replace("USDT", "")}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">LONG</span>
                        {pos.takeProfit && <span className="text-[10px] text-success font-mono">TP: ${formatPrice(pos.takeProfit)}</span>}
                        {pos.stopLoss && <span className="text-[10px] text-danger font-mono">SL: ${formatPrice(pos.stopLoss)}</span>}
                      </div>
                      <button onClick={() => closePosition(pos.id)} className="text-xs text-danger hover:text-danger/80 font-medium">Close</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs font-mono">
                      <div><p className="text-muted">Amount</p><p className="font-medium">{pos.amount.toFixed(6)}</p></div>
                      <div><p className="text-muted">Entry</p><p className="font-medium">${formatPrice(pos.entryPrice)}</p></div>
                      <div><p className="text-muted">Value</p><p className="font-medium">${formatPrice(value)}</p></div>
                      <div>
                        <p className="text-muted">P&L</p>
                        <p className={cn("font-bold", pnl >= 0 ? "text-success" : "text-danger")}>
                          {pnl >= 0 ? "+" : ""}${formatPrice(pnl)}<span className="block text-[10px]">({pnlPct.toFixed(2)}%)</span>
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
            <div className="text-center py-12 text-muted text-sm">No orders yet.</div>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {orders.map(order => (
                <div key={order.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-alt hover:bg-white/5">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    order.side === "buy" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                    {order.side === "buy" ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{order.side.toUpperCase()}</span>
                      <span className="text-sm font-medium font-mono">{order.symbol.replace("USDT", "")}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success">FILLED</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-card text-muted">{order.type}</span>
                    </div>
                    <p className="text-[10px] text-muted">{formatTime(order.timestamp)}</p>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-sm font-medium">{order.amount.toFixed(6)} @ ${formatPrice(order.price)}</p>
                    <p className="text-xs text-muted">${formatPrice(order.total)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bots Tab */}
      {activeTab === "bots" && (
        <div className="space-y-3">
          <DCABotPanel
            symbol={selectedSymbol}
            ticker={selectedTicker}
            bots={dcaBots}
            setBots={setDCABots}
            portfolio={portfolio}
            candles={candles}
          />
          {dcaBots.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-3">All Bots Overview</h3>
              <div className="space-y-2">
                {dcaBots.map(bot => {
                  const t = tickers[bot.symbol];
                  return (
                    <div key={bot.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-alt">
                      <div>
                        <p className="text-sm font-semibold">{bot.name}</p>
                        <p className="text-[10px] text-muted font-mono">{bot.symbol.replace("USDT", "")} · {bot.active ? "Active" : "Paused"}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs text-right font-mono">
                        <div><p className="text-muted text-[9px]">Invested</p><p className="font-medium">${formatPrice(bot.totalInvested)}</p></div>
                        <div><p className="text-muted text-[9px]">Profit</p><p className={cn("font-medium", bot.totalProfit >= 0 ? "text-success" : "text-danger")}>${formatPrice(bot.totalProfit)}</p></div>
                        <div><p className="text-muted text-[9px]">Deals</p><p className="font-medium">{bot.deals}</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Symbol Modal */}
      {showAddSymbol && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] px-4" onClick={() => setShowAddSymbol(false)}>
          <div className="surface w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="font-semibold">Add Symbol</h3>
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
                {filteredSymbols.map(sym => (
                  <button
                    key={sym}
                    onClick={() => addToWatchlist(sym)}
                    className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 text-left"
                  >
                    <span className="text-sm font-medium font-mono">{sym.replace("USDT", "")}/USDT</span>
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
