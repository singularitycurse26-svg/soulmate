import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  CandlestickChart, TrendingUp, TrendingDown, Plus, X, RefreshCw,
  ArrowUpCircle, ArrowDownCircle, Wallet, Activity, Eye, Trash2,
  Loader2, Search, ChevronRight, Bot, Zap, Target, Shield,
  Grid3x3, BarChart3, Brain, Settings, Play, Pause, Layers,
  ArrowUpDown, DollarSign, Percent, Clock, AlertTriangle,
} from "lucide-react";

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

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
}

interface Trade {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
}

interface OrderBookLevel {
  price: number;
  qty: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
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
  type: "market" | "limit" | "stop" | "stop_limit" | "oco";
  price: number;
  stopPrice?: number;
  amount: number;
  total: number;
  status: "filled" | "pending" | "cancelled";
  timestamp: number;
  takeProfit?: number;
  stopLoss?: number;
}

interface DCABot {
  id: string;
  name: string;
  symbol: string;
  active: boolean;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  priceDeviation: number;
  takeProfit: number;
  stopLoss: number;
  trailingTakeProfit: boolean;
  totalInvested: number;
  totalProfit: number;
  deals: number;
  createdAt: number;
}

interface SmartTrade {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entryPrice: number;
  amount: number;
  takeProfitTargets: { price: number; percent: number }[];
  stopLoss: number;
  trailingTakeProfit: boolean;
  trailingStopLoss: boolean;
  trailingOffset: number;
  status: "active" | "completed" | "cancelled";
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const BINANCE_API = "https://api.binance.com/api/v3";

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

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "30m", value: "30m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const PORTFOLIO_KEY = "daytrading_portfolio_v2";
const WATCHLIST_KEY = "daytrading_watchlist_v2";
const ORDERS_KEY = "daytrading_orders_v2";
const DCA_BOTS_KEY = "daytrading_dca_bots";
const SMART_TRADES_KEY = "daytrading_smart_trades";

// ═══════════════════════════════════════════════════════════════════
// Utility Functions
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
// Technical Indicators
// ═══════════════════════════════════════════════════════════════════

function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { result.push(NaN); continue; }
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

function macd(candles: Candle[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

function bollingerBands(candles: Candle[], period: number = 20, stdDev: number = 2) {
  const closes = candles.map(c => c.close);
  const smaValues = sma(closes, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const middle: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { upper.push(NaN); lower.push(NaN); middle.push(NaN); continue; }
    const mean = smaValues[i];
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mean) ** 2;
    const std = Math.sqrt(variance / period);
    middle.push(mean);
    upper.push(mean + std * stdDev);
    lower.push(mean - std * stdDev);
  }
  return { upper, middle, lower };
}

// ═══════════════════════════════════════════════════════════════════
// Storage Helpers
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

function loadSmartTrades(): SmartTrade[] {
  try {
    const raw = localStorage.getItem(SMART_TRADES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
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
function saveSmartTrades(s: SmartTrade[]) {
  try { localStorage.setItem(SMART_TRADES_KEY, JSON.stringify(s)); } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// Pro Chart Component (candlestick + volume + indicators)
// ═══════════════════════════════════════════════════════════════════

interface ProChartProps {
  candles: Candle[];
  indicators: { sma: boolean; ema: boolean; bollinger: boolean; rsi: boolean; macd: boolean; volume: boolean };
  height?: number;
  showRSI: boolean;
  showMACD: boolean;
}

function ProChart({ candles, indicators, height = 400, showRSI, showMACD }: ProChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rsiCanvasRef = useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = useRef<HTMLCanvasElement>(null);

  // Calculate indicators
  const sma7 = useMemo(() => candles.length > 7 ? sma(candles.map(c => c.close), 7) : [], [candles]);
  const sma25 = useMemo(() => candles.length > 25 ? sma(candles.map(c => c.close), 25) : [], [candles]);
  const ema9 = useMemo(() => candles.length > 9 ? ema(candles.map(c => c.close), 9) : [], [candles]);
  const bb = useMemo(() => candles.length > 20 ? bollingerBands(candles) : null, [candles]);
  const rsiValues = useMemo(() => candles.length > 14 ? rsi(candles) : [], [candles]);
  const macdData = useMemo(() => candles.length > 26 ? macd(candles) : null, [candles]);

  // Draw main chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const padR = 65;
    const padL = 8;
    const padT = 10;
    const volH = indicators.volume ? 60 : 0;
    const chartH = h - padT - 20 - volH;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    const prices = candles.flatMap(c => [c.high, c.low]);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    minP -= range * 0.05;
    maxP += range * 0.05;
    const pRange = maxP - minP;

    const candleW = chartW / candles.length;
    const bodyW = Math.max(1.5, candleW * 0.65);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.font = "10px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i <= 5; i++) {
      const y = padT + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      const price = maxP - (pRange / 5) * i;
      ctx.fillText(formatPrice(price), padL + chartW + 4, y + 3);
    }

    // Bollinger Bands
    if (indicators.bollinger && bb) {
      ctx.fillStyle = "rgba(99, 102, 241, 0.06)";
      ctx.beginPath();
      for (let i = 0; i < bb.upper.length; i++) {
        if (isNaN(bb.upper[i])) continue;
        const x = padL + i * candleW + candleW / 2;
        const y = padT + ((maxP - bb.upper[i]) / pRange) * chartH;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = bb.lower.length - 1; i >= 0; i--) {
        if (isNaN(bb.lower[i])) continue;
        const x = padL + i * candleW + candleW / 2;
        const y = padT + ((maxP - bb.lower[i]) / pRange) * chartH;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      [bb.upper, bb.middle, bb.lower].forEach((band, idx) => {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < band.length; i++) {
          if (isNaN(band[i])) continue;
          const x = padL + i * candleW + candleW / 2;
          const y = padT + ((maxP - band[i]) / pRange) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // SMA lines
    if (indicators.sma) {
      if (sma7.length === candles.length) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < sma7.length; i++) {
          if (isNaN(sma7[i])) continue;
          const x = padL + i * candleW + candleW / 2;
          const y = padT + ((maxP - sma7[i]) / pRange) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (sma25.length === candles.length) {
        ctx.strokeStyle = "#8b5cf6";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < sma25.length; i++) {
          if (isNaN(sma25[i])) continue;
          const x = padL + i * candleW + candleW / 2;
          const y = padT + ((maxP - sma25[i]) / pRange) * chartH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // EMA line
    if (indicators.ema && ema9.length === candles.length) {
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ema9.length; i++) {
        if (isNaN(ema9[i])) continue;
        const x = padL + i * candleW + candleW / 2;
        const y = padT + ((maxP - ema9[i]) / pRange) * chartH;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Candles
    candles.forEach((c, i) => {
      const x = padL + i * candleW + candleW / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? "#00e676" : "#ff1744";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT + ((maxP - c.high) / pRange) * chartH);
      ctx.lineTo(x, padT + ((maxP - c.low) / pRange) * chartH);
      ctx.stroke();

      const openY = padT + ((maxP - c.open) / pRange) * chartH;
      const closeY = padT + ((maxP - c.close) / pRange) * chartH;
      ctx.fillStyle = color;
      ctx.fillRect(x - bodyW / 2, Math.min(openY, closeY), bodyW, Math.max(1, Math.abs(closeY - openY)));
    });

    // Current price line
    const lastPrice = candles[candles.length - 1].close;
    const lastY = padT + ((maxP - lastPrice) / pRange) * chartH;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padL, lastY);
    ctx.lineTo(padL + chartW, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#6366f1";
    ctx.fillRect(padL + chartW, lastY - 9, 58, 18);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.fillText(formatPrice(lastPrice), padL + chartW + 3, lastY + 3);

    // Volume bars
    if (indicators.volume && volH > 0) {
      const volTop = padT + chartH + 10;
      const maxVol = Math.max(...candles.map(c => c.volume));
      candles.forEach((c, i) => {
        const x = padL + i * candleW + candleW / 2;
        const barH = (c.volume / maxVol) * (volH - 10);
        const isUp = c.close >= c.open;
        ctx.fillStyle = isUp ? "rgba(0, 230, 118, 0.3)" : "rgba(255, 23, 68, 0.3)";
        ctx.fillRect(x - bodyW / 2, volTop + volH - barH - 5, bodyW, barH);
      });
    }
  }, [candles, indicators, height]);

  // Draw RSI
  useEffect(() => {
    const canvas = rsiCanvasRef.current;
    if (!canvas || !showRSI || rsiValues.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 80 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 80;
    const padR = 65;
    const padL = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    // Background zones
    ctx.fillStyle = "rgba(255, 23, 68, 0.05)";
    ctx.fillRect(padL, 0, chartW, h * 0.3);
    ctx.fillStyle = "rgba(0, 230, 118, 0.05)";
    ctx.fillRect(padL, h * 0.7, chartW, h * 0.3);

    // Lines at 30, 50, 70
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px Inter, sans-serif";
    [30, 50, 70].forEach(level => {
      const y = h - (level / 100) * h;
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(String(level), padL + chartW + 4, y + 3);
    });

    // RSI line
    const candleW = chartW / candles.length;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < rsiValues.length; i++) {
      if (isNaN(rsiValues[i])) continue;
      const x = padL + i * candleW + candleW / 2;
      const y = h - (rsiValues[i] / 100) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Label
    ctx.fillStyle = "#a855f7";
    ctx.font = "bold 10px Inter, sans-serif";
    const lastRSI = rsiValues[rsiValues.length - 1];
    if (!isNaN(lastRSI)) {
      ctx.fillText(`RSI ${lastRSI.toFixed(1)}`, padL, 10);
    }
  }, [candles, rsiValues, showRSI]);

  // Draw MACD
  useEffect(() => {
    const canvas = macdCanvasRef.current;
    if (!canvas || !showMACD || !macdData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 80 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = 80;
    const padR = 65;
    const padL = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    const allVals = [...macdData.histogram, ...macdData.macdLine, ...macdData.signalLine].filter(v => !isNaN(v));
    const maxVal = Math.max(...allVals, 0.001);
    const minVal = Math.min(...allVals, -0.001);
    const range = maxVal - minVal || 1;
    const zeroY = h - ((0 - minVal) / range) * h;

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + chartW, zeroY);
    ctx.stroke();

    const candleW = chartW / candles.length;

    // Histogram
    macdData.histogram.forEach((val, i) => {
      if (isNaN(val)) return;
      const x = padL + i * candleW + candleW / 2;
      const y = h - ((val - minVal) / range) * h;
      ctx.fillStyle = val >= 0 ? "rgba(0, 230, 118, 0.4)" : "rgba(255, 23, 68, 0.4)";
      ctx.fillRect(x - candleW * 0.3, Math.min(y, zeroY), candleW * 0.6, Math.abs(y - zeroY));
    });

    // MACD line
    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < macdData.macdLine.length; i++) {
      if (isNaN(macdData.macdLine[i])) continue;
      const x = padL + i * candleW + candleW / 2;
      const y = h - ((macdData.macdLine[i] - minVal) / range) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Signal line
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    started = false;
    for (let i = 0; i < macdData.signalLine.length; i++) {
      if (isNaN(macdData.signalLine[i])) continue;
      const x = padL + i * candleW + candleW / 2;
      const y = h - ((macdData.signalLine[i] - minVal) / range) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = "#06b6d4";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.fillText("MACD", padL, 10);
  }, [candles, macdData, showMACD]);

  return (
    <div className="space-y-1">
      <canvas ref={canvasRef} style={{ width: "100%", height }} />
      {showRSI && <canvas ref={rsiCanvasRef} style={{ width: "100%", height: 80 }} />}
      {showMACD && <canvas ref={macdCanvasRef} style={{ width: "100%", height: 80 }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Order Book Component
// ═══════════════════════════════════════════════════════════════════

function OrderBookWidget({ symbol, currentPrice }: { symbol: string; currentPrice: number }) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrderBook = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BINANCE_API}/depth?symbol=${symbol}&limit=20`);
      if (resp.ok) {
        const data = await resp.json();
        let bidTotal = 0;
        const bids: OrderBookLevel[] = data.bids.map((b: string[]) => {
          bidTotal += parseFloat(b[1]);
          return { price: parseFloat(b[0]), qty: parseFloat(b[1]), total: bidTotal };
        });
        let askTotal = 0;
        const asks: OrderBookLevel[] = data.asks.map((a: string[]) => {
          askTotal += parseFloat(a[1]);
          return { price: parseFloat(a[0]), qty: parseFloat(a[1]), total: askTotal };
        });
        setOrderBook({ bids, asks, lastUpdateId: data.lastUpdateId });
      }
    } catch {
      // Silently fail — order book is supplementary
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 2000);
    return () => clearInterval(interval);
  }, [fetchOrderBook]);

  const maxBidTotal = orderBook ? Math.max(...orderBook.bids.map(b => b.total)) : 1;
  const maxAskTotal = orderBook ? Math.max(...orderBook.asks.map(a => a.total)) : 1;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);
  const bidVolume = orderBook ? orderBook.bids.reduce((s, b) => s + b.qty, 0) : 0;
  const askVolume = orderBook ? orderBook.asks.reduce((s, a) => s + a.qty, 0) : 0;
  const imbalance = bidVolume + askVolume > 0 ? ((bidVolume - askVolume) / (bidVolume + askVolume)) * 100 : 0;

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-accent" />
          Order Book
        </h4>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
      </div>

      {/* Imbalance bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[9px] text-muted mb-0.5">
          <span>Bids {bidVolume.toFixed(2)}</span>
          <span className={cn(imbalance >= 0 ? "text-success" : "text-danger")}>
            {imbalance >= 0 ? "+" : ""}{imbalance.toFixed(1)}%
          </span>
          <span>Asks {askVolume.toFixed(2)}</span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden">
          <div className="bg-success" style={{ width: `${(bidVolume / (bidVolume + askVolume)) * 100}%` }} />
          <div className="bg-danger" style={{ width: `${(askVolume / (bidVolume + askVolume)) * 100}%` }} />
        </div>
      </div>

      {/* Asks (reversed) */}
      <div className="space-y-0.5">
        {orderBook?.asks.slice(-8).reverse().map((ask, i) => (
          <div key={i} className="relative flex justify-between text-[10px] py-0.5 px-1 rounded">
            <div
              className="absolute right-0 top-0 bottom-0 bg-danger/10 rounded"
              style={{ width: `${(ask.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-danger font-mono">{formatPrice(ask.price)}</span>
            <span className="relative text-muted font-mono">{ask.qty.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="my-1 py-1 text-center text-[10px] text-muted border-y border-white/5">
        {currentPrice > 0 && <span className="font-bold text-text">${formatPrice(currentPrice)}</span>}
      </div>

      {/* Bids */}
      <div className="space-y-0.5">
        {orderBook?.bids.slice(0, 8).map((bid, i) => (
          <div key={i} className="relative flex justify-between text-[10px] py-0.5 px-1 rounded">
            <div
              className="absolute left-0 top-0 bottom-0 bg-success/10 rounded"
              style={{ width: `${(bid.total / maxTotal) * 100}%` }}
            />
            <span className="relative text-success font-mono">{formatPrice(bid.price)}</span>
            <span className="relative text-muted font-mono">{bid.qty.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Order Flow Component (delta, cumulative delta, volume profile)
// ═══════════════════════════════════════════════════════════════════

function OrderFlowWidget({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BINANCE_API}/trades?symbol=${symbol}&limit=100`);
      if (resp.ok) {
        const data = await resp.json();
        setTrades(data.map((t: any) => ({
          id: t.id,
          price: parseFloat(t.price),
          qty: parseFloat(t.qty),
          time: t.time,
          isBuyerMaker: t.isBuyerMaker,
        })));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  // Calculate order flow metrics
  const buyTrades = trades.filter(t => !t.isBuyerMaker);
  const sellTrades = trades.filter(t => t.isBuyerMaker);
  const buyVolume = buyTrades.reduce((s, t) => s + t.qty, 0);
  const sellVolume = sellTrades.reduce((s, t) => s + t.qty, 0);
  const delta = buyVolume - sellVolume;
  const cumulativeDelta = delta;
  const aggressorRatio = buyVolume + sellVolume > 0
    ? (buyVolume / (buyVolume + sellVolume)) * 100
    : 50;

  // Volume profile (price levels)
  const priceLevels = useMemo(() => {
    if (trades.length === 0) return [];
    const map: Record<string, number> = {};
    for (const t of trades) {
      const key = t.price.toFixed(2);
      map[key] = (map[key] || 0) + t.qty;
    }
    return Object.entries(map)
      .map(([price, vol]) => ({ price: parseFloat(price), volume: vol }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10)
      .sort((a, b) => b.price - a.price);
  }, [trades]);

  const maxVol = priceLevels.length > 0 ? Math.max(...priceLevels.map(l => l.volume)) : 1;
  const poc = priceLevels.length > 0 ? priceLevels[0] : null;

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-accent" />
          Order Flow
        </h4>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
      </div>

      {/* Delta metrics */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Delta</p>
          <p className={cn("text-sm font-bold", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(4)}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Cum Delta</p>
          <p className={cn("text-sm font-bold", cumulativeDelta >= 0 ? "text-success" : "text-danger")}>
            {cumulativeDelta >= 0 ? "+" : ""}{cumulativeDelta.toFixed(2)}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Buy Vol</p>
          <p className="text-sm font-bold text-success">{buyVolume.toFixed(2)}</p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Sell Vol</p>
          <p className="text-sm font-bold text-danger">{sellVolume.toFixed(2)}</p>
        </div>
      </div>

      {/* Aggressor ratio bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[9px] text-muted mb-0.5">
          <span>Aggressor Ratio</span>
          <span className={cn(aggressorRatio >= 50 ? "text-success" : "text-danger")}>
            {aggressorRatio.toFixed(1)}% Buy
          </span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="bg-success" style={{ width: `${aggressorRatio}%` }} />
          <div className="bg-danger" style={{ width: `${100 - aggressorRatio}%` }} />
        </div>
      </div>

      {/* Volume profile */}
      <div>
        <p className="text-[9px] font-semibold text-muted mb-1">Volume Profile (POC highlighted)</p>
        <div className="space-y-0.5 max-h-40 overflow-y-auto no-scrollbar">
          {priceLevels.map((level, i) => (
            <div key={i} className="relative flex items-center gap-2 text-[10px] py-0.5">
              <span className={cn("font-mono w-16 flex-shrink-0", poc === level ? "text-warning font-bold" : "text-muted")}>
                {formatPrice(level.price)}
              </span>
              <div className="flex-1 relative h-3 bg-bg-alt rounded">
                <div
                  className={cn("absolute left-0 top-0 bottom-0 rounded", poc === level ? "bg-warning/40" : "bg-accent/30")}
                  style={{ width: `${(level.volume / maxVol) * 100}%` }}
                />
              </div>
              <span className="font-mono text-muted w-12 text-right">{level.volume.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent trades tape */}
      <div className="mt-3">
        <p className="text-[9px] font-semibold text-muted mb-1">Recent Trades</p>
        <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
          {trades.slice(-15).reverse().map((t) => (
            <div key={t.id} className="flex justify-between text-[10px] font-mono">
              <span className={t.isBuyerMaker ? "text-danger" : "text-success"}>
                {t.isBuyerMaker ? "SELL" : "BUY "}
              </span>
              <span className="text-muted">{formatPrice(t.price)}</span>
              <span className="text-muted">{t.qty.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AI Indicators Component
// ═══════════════════════════════════════════════════════════════════

function AIIndicatorsWidget({ candles, ticker }: { candles: Candle[]; ticker?: Ticker }) {
  const analysis = useMemo(() => {
    if (candles.length < 30) return null;
    const closes = candles.map(c => c.close);
    const rsiVals = rsi(candles);
    const macdData = macd(candles);
    const sma7Vals = sma(closes, 7);
    const sma25Vals = sma(closes, 25);
    const bbData = bollingerBands(candles);

    const lastRSI = rsiVals[rsiVals.length - 1];
    const lastMACD = macdData.histogram[macdData.histogram.length - 1];
    const lastSMA7 = sma7Vals[sma7Vals.length - 1];
    const lastSMA25 = sma25Vals[sma25Vals.length - 1];
    const lastPrice = closes[closes.length - 1];
    const bbWidth = bbData.upper[bbData.upper.length - 1] - bbData.lower[bbData.lower.length - 1];
    const bbPosition = bbWidth > 0 ? (lastPrice - bbData.lower[bbData.lower.length - 1]) / bbWidth : 0.5;

    // Trend strength (ADX-like)
    const trendUp = lastSMA7 > lastSMA25;
    const trendStrength = Math.abs((lastSMA7 - lastSMA25) / lastSMA25) * 100;

    // Momentum
    const momentum = ((lastPrice - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;

    // Volatility
    const recentReturns = [];
    for (let i = Math.max(1, candles.length - 20); i < candles.length; i++) {
      recentReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const variance = recentReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / recentReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(365) * 100;

    // Smart money detection (large trades at key levels)
    const recentCandles = candles.slice(-5);
    const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    const highVolCandles = recentCandles.filter(c => c.volume > avgVol * 1.5);
    const smartMoney = highVolCandles.length >= 2;

    // Signal generation
    let signal: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL" = "NEUTRAL";
    let score = 0;
    if (lastRSI < 30) score += 2;
    else if (lastRSI < 45) score += 1;
    else if (lastRSI > 70) score -= 2;
    else if (lastRSI > 55) score -= 1;

    if (lastMACD > 0) score += 1; else score -= 1;
    if (trendUp) score += 1; else score -= 1;
    if (momentum > 0.02) score += 1; else if (momentum < -0.02) score -= 1;
    if (bbPosition < 0.2) score += 1; else if (bbPosition > 0.8) score -= 1;
    if (smartMoney && trendUp) score += 1;

    if (score >= 3) signal = "STRONG BUY";
    else if (score >= 1) signal = "BUY";
    else if (score <= -3) signal = "STRONG SELL";
    else if (score <= -1) signal = "SELL";

    return {
      rsi: lastRSI,
      macdHist: lastMACD,
      trendUp,
      trendStrength,
      momentum,
      volatility,
      bbPosition,
      smartMoney,
      signal,
      score,
    };
  }, [candles]);

  if (!analysis) {
    return (
      <div className="card p-3">
        <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
          <Brain className="w-3.5 h-3.5 text-accent" />
          AI Indicators
        </h4>
        <p className="text-[10px] text-muted text-center py-4">Loading analysis...</p>
      </div>
    );
  }

  const signalColor = analysis.signal.includes("BUY") ? "text-success" : analysis.signal.includes("SELL") ? "text-danger" : "text-muted";
  const signalBg = analysis.signal.includes("BUY") ? "bg-success/15" : analysis.signal.includes("SELL") ? "bg-danger/15" : "bg-bg-alt";

  return (
    <div className="card p-3">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-3">
        <Brain className="w-3.5 h-3.5 text-accent" />
        AI Indicators
      </h4>

      {/* Signal */}
      <div className={cn("p-3 rounded-xl text-center mb-3", signalBg)}>
        <p className="text-[9px] text-muted mb-0.5">AI Signal</p>
        <p className={cn("text-base font-bold", signalColor)}>{analysis.signal}</p>
        <p className="text-[9px] text-muted">Score: {analysis.score}/6</p>
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <Activity className="w-3 h-3" /> RSI
          </span>
          <span className={cn("font-bold", analysis.rsi < 30 ? "text-success" : analysis.rsi > 70 ? "text-danger" : "text-text")}>
            {analysis.rsi.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <BarChart3 className="w-3 h-3" /> MACD
          </span>
          <span className={cn("font-bold", analysis.macdHist >= 0 ? "text-success" : "text-danger")}>
            {analysis.macdHist >= 0 ? "+" : ""}{analysis.macdHist.toFixed(4)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Trend
          </span>
          <span className={cn("font-bold", analysis.trendUp ? "text-success" : "text-danger")}>
            {analysis.trendUp ? "Bullish" : "Bearish"} ({analysis.trendStrength.toFixed(2)}%)
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <Zap className="w-3 h-3" /> Momentum
          </span>
          <span className={cn("font-bold", analysis.momentum >= 0 ? "text-success" : "text-danger")}>
            {analysis.momentum >= 0 ? "+" : ""}{analysis.momentum.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Volatility
          </span>
          <span className="font-bold text-text">{analysis.volatility.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <Layers className="w-3 h-3" /> BB Position
          </span>
          <span className={cn("font-bold", analysis.bbPosition < 0.2 ? "text-success" : analysis.bbPosition > 0.8 ? "text-danger" : "text-text")}>
            {(analysis.bbPosition * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1">
            <Brain className="w-3 h-3" /> Smart Money
          </span>
          <span className={cn("font-bold", analysis.smartMoney ? "text-warning" : "text-muted")}>
            {analysis.smartMoney ? "Detected" : "None"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Smart Trade Terminal Component
// ═══════════════════════════════════════════════════════════════════

function SmartTradeTerminal({
  symbol,
  ticker,
  portfolio,
  onExecute,
}: {
  symbol: string;
  ticker?: Ticker;
  portfolio: { cash: number; positions: Position[] };
  onExecute: (side: "buy" | "sell", amount: number, options: {
    takeProfit?: number; stopLoss?: number;
    trailingTakeProfit?: boolean; trailingStopLoss?: boolean;
    trailingOffset?: number;
  }) => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [trailingTP, setTrailingTP] = useState(false);
  const [trailingSL, setTrailingSL] = useState(false);
  const [trailingOffset, setTrailingOffset] = useState("2");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const price = ticker?.price || 0;
  const total = amount ? parseFloat(amount) * price : 0;

  const execute = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    onExecute(side, amt, {
      takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      trailingTakeProfit: trailingTP,
      trailingStopLoss: trailingSL,
      trailingOffset: trailingOffset ? parseFloat(trailingOffset) : undefined,
    });
    setAmount("");
    setTakeProfit("");
    setStopLoss("");
  };

  return (
    <div className="card p-3">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-3">
        <Target className="w-3.5 h-3.5 text-accent" />
        Smart Trade Terminal
      </h4>

      {/* Buy/Sell toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-bg-alt mb-3">
        <button
          onClick={() => setSide("buy")}
          className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
            side === "buy" ? "bg-success text-white" : "text-muted")}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
            side === "sell" ? "bg-danger text-white" : "text-muted")}
        >
          Sell
        </button>
      </div>

      {/* Amount */}
      <div className="mb-2">
        <label className="text-[9px] text-muted block mb-0.5">Amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Total */}
      <div className="mb-2 p-2 rounded-lg bg-bg-alt text-[10px] flex justify-between">
        <span className="text-muted">Total</span>
        <span className="font-semibold">${formatPrice(total)}</span>
      </div>

      {/* TP/SL */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="text-[9px] text-muted block mb-0.5">Take Profit ($)</label>
          <input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder={price > 0 ? formatPrice(price * 1.05) : "0.00"}
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs outline-none focus:ring-1 focus:ring-success"
          />
        </div>
        <div>
          <label className="text-[9px] text-muted block mb-0.5">Stop Loss ($)</label>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder={price > 0 ? formatPrice(price * 0.95) : "0.00"}
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs outline-none focus:ring-1 focus:ring-danger"
          />
        </div>
      </div>

      {/* Advanced */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-[10px] text-muted hover:text-text flex items-center justify-center gap-1 mb-2"
      >
        <Settings className="w-3 h-3" />
        {showAdvanced ? "Hide" : "Show"} Advanced (Trailing)
      </button>

      {showAdvanced && (
        <div className="space-y-2 mb-2 p-2 rounded-lg bg-bg-alt">
          <label className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Trailing Take Profit</span>
            <input type="checkbox" checked={trailingTP} onChange={(e) => setTrailingTP(e.target.checked)} className="accent-success" />
          </label>
          <label className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Trailing Stop Loss</span>
            <input type="checkbox" checked={trailingSL} onChange={(e) => setTrailingSL(e.target.checked)} className="accent-danger" />
          </label>
          <div>
            <label className="text-[9px] text-muted block mb-0.5">Trailing Offset (%)</label>
            <input
              type="number"
              value={trailingOffset}
              onChange={(e) => setTrailingOffset(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      )}

      <button
        onClick={execute}
        disabled={!amount}
        className={cn(
          "w-full py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition-all",
          side === "buy" ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"
        )}
      >
        {side === "buy" ? "Buy" : "Sell"} {symbol.replace("USDT", "")}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DCA Bot Component
// ═══════════════════════════════════════════════════════════════════

function DCABotPanel({
  symbol,
  ticker,
  bots,
  setBots,
  portfolio,
  onBotTrade,
}: {
  symbol: string;
  ticker?: Ticker;
  bots: DCABot[];
  setBots: (b: DCABot[]) => void;
  portfolio: { cash: number; positions: Position[] };
  onBotTrade: (bot: DCABot, side: "buy" | "sell", amount: number, price: number) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState(`DCA ${symbol.replace("USDT", "")}`);
  const [baseOrder, setBaseOrder] = useState("100");
  const [safetyOrder, setSafetyOrder] = useState("200");
  const [maxSafety, setMaxSafety] = useState("5");
  const [priceDev, setPriceDev] = useState("2");
  const [takeProfit, setTakeProfit] = useState("3");
  const [stopLoss, setStopLoss] = useState("10");

  const createBot = () => {
    const bot: DCABot = {
      id: `dca-${Date.now()}`,
      name: name || `DCA ${symbol.replace("USDT", "")}`,
      symbol,
      active: true,
      baseOrder: parseFloat(baseOrder) || 100,
      safetyOrder: parseFloat(safetyOrder) || 200,
      maxSafetyOrders: parseInt(maxSafety) || 5,
      priceDeviation: parseFloat(priceDev) || 2,
      takeProfit: parseFloat(takeProfit) || 3,
      stopLoss: parseFloat(stopLoss) || 10,
      trailingTakeProfit: false,
      totalInvested: 0,
      totalProfit: 0,
      deals: 0,
      createdAt: Date.now(),
    };
    const updated = [...bots, bot];
    setBots(updated);
    saveDCABots(updated);
    setShowCreate(false);
    setName(`DCA ${symbol.replace("USDT", "")}`);
  };

  const toggleBot = (id: string) => {
    const updated = bots.map(b => b.id === id ? { ...b, active: !b.active } : b);
    setBots(updated);
    saveDCABots(updated);
  };

  const deleteBot = (id: string) => {
    const updated = bots.filter(b => b.id !== id);
    setBots(updated);
    saveDCABots(updated);
  };

  const symbolBots = bots.filter(b => b.symbol === symbol);

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-accent" />
          DCA Bots ({symbolBots.length})
        </h4>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="text-[10px] text-accent hover:text-accent/80 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          New Bot
        </button>
      </div>

      {showCreate && (
        <div className="space-y-2 mb-3 p-3 rounded-lg bg-bg-alt">
          <div>
            <label className="text-[9px] text-muted block mb-0.5">Bot Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Base Order ($)</label>
              <input type="number" value={baseOrder} onChange={(e) => setBaseOrder(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Safety Order ($)</label>
              <input type="number" value={safetyOrder} onChange={(e) => setSafetyOrder(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Max Safety Orders</label>
              <input type="number" value={maxSafety} onChange={(e) => setMaxSafety(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Price Deviation (%)</label>
              <input type="number" value={priceDev} onChange={(e) => setPriceDev(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Take Profit (%)</label>
              <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Stop Loss (%)</label>
              <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
            </div>
          </div>
          <button onClick={createBot} className="w-full py-2 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent/90">
            Create Bot
          </button>
        </div>
      )}

      {/* Bot list */}
      <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
        {symbolBots.length === 0 ? (
          <p className="text-[10px] text-muted text-center py-4">
            No DCA bots for {symbol.replace("USDT", "")}. Create one to automate trading.
          </p>
        ) : (
          symbolBots.map(bot => (
            <div key={bot.id} className="p-2 rounded-lg bg-bg-alt">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{bot.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleBot(bot.id)}
                    className={cn("w-6 h-6 rounded flex items-center justify-center",
                      bot.active ? "bg-success/20 text-success" : "bg-bg-card text-muted")}
                  >
                    {bot.active ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button onClick={() => deleteBot(bot.id)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-danger bg-bg-card">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px]">
                <div>
                  <p className="text-muted">Invested</p>
                  <p className="font-medium">${formatPrice(bot.totalInvested)}</p>
                </div>
                <div>
                  <p className="text-muted">Profit</p>
                  <p className={cn("font-medium", bot.totalProfit >= 0 ? "text-success" : "text-danger")}>
                    ${formatPrice(bot.totalProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Deals</p>
                  <p className="font-medium">{bot.deals}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-1 text-[9px] text-muted">
                <span>TP: {bot.takeProfit}%</span>
                <span>SL: {bot.stopLoss}%</span>
                <span>Max SO: {bot.maxSafetyOrders}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main DayTradingPage
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
  const [smartTrades, setSmartTrades] = useState<SmartTrade[]>(() => loadSmartTrades());
  const [showAddSymbol, setShowAddSymbol] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [layout, setLayout] = useState<"single" | "multi">("single");
  const [activeTab, setActiveTab] = useState<"trade" | "portfolio" | "orders" | "bots">("trade");

  // Indicator toggables
  const [indicators, setIndicators] = useState({
    sma: true, ema: true, bollinger: false, rsi: true, macd: true, volume: true,
  });

  // Widget panel toggles
  const [showOrderBook, setShowOrderBook] = useState(true);
  const [showOrderFlow, setShowOrderFlow] = useState(true);
  const [showAI, setShowAI] = useState(true);
  const [showSmartTrade, setShowSmartTrade] = useState(true);
  const [showDCA, setShowDCA] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ────────────────────────────────────────────────

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
      // CoinGecko fallback
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

  // ── DCA Bot auto-execution ────────────────────────────────────────
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      for (const bot of dcaBots) {
        if (!bot.active) continue;
        const ticker = tickers[bot.symbol];
        if (!ticker) continue;

        // Simple DCA logic: buy base order if no position, add safety order on dip
        const existingPos = portfolio.positions.find(p => p.symbol === bot.symbol && p.side === "long");
        if (!existingPos && bot.totalInvested === 0) {
          // Start new deal
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
          // Check take profit
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
          // Check stop loss
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
          // Check safety order (price deviated by bot.priceDeviation%)
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
  }, [autoRefresh, dcaBots, tickers, portfolio, orders]);

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

  // ── Trading ──────────────────────────────────────────────────────

  const executeSmartTrade = (side: "buy" | "sell", amount: number, options: {
    takeProfit?: number; stopLoss?: number;
    trailingTakeProfit?: boolean; trailingStopLoss?: boolean;
    trailingOffset?: number;
  }) => {
    const ticker = tickers[selectedSymbol];
    if (!ticker) { showAlert("danger", "No price data"); return; }
    const price = ticker.price;
    const total = amount * price;

    if (side === "buy") {
      if (total > portfolio.cash) { showAlert("danger", "Insufficient cash"); return; }
      const newPos: Position = {
        id: `pos-${Date.now()}`, symbol: selectedSymbol, side: "long",
        entryPrice: price, amount, openedAt: Date.now(),
        takeProfit: options.takeProfit, stopLoss: options.stopLoss,
        trailingStop: options.trailingStopLoss ? options.trailingOffset : undefined,
        trailingTakeProfit: options.trailingTakeProfit ? options.trailingOffset : undefined,
      };
      const newPortfolio = { cash: portfolio.cash - total, positions: [...portfolio.positions, newPos] };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      showAlert("success", `Bought ${amount} ${selectedSymbol.replace("USDT", "")} at $${formatPrice(price)}`);
    } else {
      const pos = portfolio.positions.find(p => p.symbol === selectedSymbol);
      if (!pos) { showAlert("danger", "No position to sell"); return; }
      if (amount > pos.amount) { showAlert("danger", "Cannot sell more than held"); return; }
      const proceeds = amount * price;
      const newPositions = amount === pos.amount
        ? portfolio.positions.filter(p => p.id !== pos.id)
        : portfolio.positions.map(p => p.id === pos.id ? { ...p, amount: p.amount - amount } : p);
      const newPortfolio = { cash: portfolio.cash + proceeds, positions: newPositions };
      setPortfolio(newPortfolio);
      savePortfolio(newPortfolio);
      const pnl = (price - pos.entryPrice) * amount;
      showAlert(pnl >= 0 ? "success" : "danger", `Sold ${amount} ${selectedSymbol.replace("USDT", "")} — P&L: $${formatPrice(pnl)}`);
    }

    const order: Order = {
      id: `ord-${Date.now()}`, symbol: selectedSymbol, side,
      type: "market", price, amount, total, status: "filled", timestamp: Date.now(),
      takeProfit: options.takeProfit, stopLoss: options.stopLoss,
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
    setSmartTrades([]);
    saveSmartTrades([]);
    showAlert("info", "Portfolio reset to $100,000");
  };

  // ── Computed values ──────────────────────────────────────────────

  const totalPositionValue = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    return sum + (t ? t.price * p.amount : 0);
  }, 0);
  const totalAccountValue = portfolio.cash + totalPositionValue;
  const totalPnL = portfolio.positions.reduce((sum, p) => {
    const t = tickers[p.symbol];
    return sum + (t ? (t.price - p.entryPrice) * p.amount : 0);
  }, 0);

  const selectedTicker = tickers[selectedSymbol];
  const filteredSymbols = AVAILABLE_SYMBOLS.filter(s =>
    !watchlist.includes(s) && s.toLowerCase().includes(symbolSearch.toLowerCase())
  );

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
            <p className="text-xs text-muted">Kraken × Pyonix × 3Commas hybrid · Order flow extreme · AI indicators</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayout(layout === "single" ? "multi" : "single")}
            className="px-3 py-2 rounded-xl bg-bg-alt text-muted hover:text-text flex items-center gap-1.5 text-xs font-medium"
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            {layout === "single" ? "Multi" : "Single"}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn("px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5",
              autoRefresh ? "bg-success/15 text-success" : "bg-bg-alt text-muted")}
          >
            <Activity className="w-3.5 h-3.5" />
            {autoRefresh ? "Live" : "Paused"}
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
          <p className="text-lg font-bold">${formatPrice(totalAccountValue)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Cash</p>
          </div>
          <p className="text-lg font-bold">${formatPrice(portfolio.cash)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Positions</p>
          </div>
          <p className="text-lg font-bold">${formatPrice(totalPositionValue)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            {totalPnL >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-success" /> : <TrendingDown className="w-3.5 h-3.5 text-danger" />}
            <p className="text-[10px] text-muted">Unrealized P&L</p>
          </div>
          <p className={cn("text-lg font-bold", totalPnL >= 0 ? "text-success" : "text-danger")}>
            {totalPnL >= 0 ? "+" : ""}${formatPrice(totalPnL)}
          </p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="w-3.5 h-3.5 text-muted" />
            <p className="text-[10px] text-muted">Active Bots</p>
          </div>
          <p className="text-lg font-bold">{dcaBots.filter(b => b.active).length}</p>
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
        <div className="grid lg:grid-cols-[200px_1fr_280px] gap-3">
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
          <div className="space-y-0.5 max-h-[60vh] overflow-y-auto no-scrollbar">
            {watchlist.map(sym => {
              const t = tickers[sym];
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={cn("w-full flex items-center justify-between p-1.5 rounded-lg transition-colors group",
                    selectedSymbol === sym ? "bg-accent/10" : "hover:bg-bg-alt")}
                >
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium">{sym.replace("USDT", "")}</p>
                    {t && <p className={cn("text-[9px]", t.priceChangePercent >= 0 ? "text-success" : "text-danger")}>
                      {t.priceChangePercent >= 0 ? "+" : ""}{t.priceChangePercent.toFixed(2)}%
                    </p>}
                  </div>
                  {t && <p className="text-xs font-semibold text-right">${formatPrice(t.price)}</p>}
                  {selectedSymbol !== sym && (
                    <span onClick={(e) => { e.stopPropagation(); removeFromWatchlist(sym); }} className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 ml-1">
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center — Chart + Indicators */}
        <div className="space-y-2">
          <div className="card p-3">
            {/* Symbol header */}
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold">{selectedSymbol.replace("USDT", "")}/USDT</h3>
                {selectedTicker && (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">${formatPrice(selectedTicker.price)}</span>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
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
                    className={cn("px-2 py-0.5 rounded text-[10px] font-medium",
                      candleInterval === iv.value ? "bg-accent text-white" : "bg-bg-alt text-muted hover:text-text")}
                  >
                    {iv.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 24h stats */}
            {selectedTicker && (
              <div className="flex gap-3 mb-2 text-[10px] text-muted">
                <span>H: <span className="text-text">${formatPrice(selectedTicker.high)}</span></span>
                <span>L: <span className="text-text">${formatPrice(selectedTicker.low)}</span></span>
                <span>Vol: <span className="text-text">${formatVolume(selectedTicker.quoteVolume)}</span></span>
              </div>
            )}

            {/* Indicator toggles */}
            <div className="flex flex-wrap gap-1 mb-2">
              {[
                { key: "sma" as const, label: "SMA", color: "text-amber-400" },
                { key: "ema" as const, label: "EMA", color: "text-cyan-400" },
                { key: "bollinger" as const, label: "BB", color: "text-indigo-400" },
                { key: "volume" as const, label: "Vol", color: "text-success" },
                { key: "rsi" as const, label: "RSI", color: "text-purple-400" },
                { key: "macd" as const, label: "MACD", color: "text-cyan-400" },
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
                height={350}
                showRSI={indicators.rsi}
                showMACD={indicators.macd}
              />
            </div>
          </div>

          {/* Widget panel toggles */}
          <div className="flex flex-wrap gap-1">
            {([
              { show: showOrderBook, set: setShowOrderBook, label: "Order Book", icon: Layers },
              { show: showOrderFlow, set: setShowOrderFlow, label: "Order Flow", icon: Activity },
              { show: showAI, set: setShowAI, label: "AI Indicators", icon: Brain },
              { show: showSmartTrade, set: setShowSmartTrade, label: "Smart Trade", icon: Target },
              { show: showDCA, set: setShowDCA, label: "DCA Bot", icon: Bot },
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
        <div className="space-y-2 max-h-[75vh] overflow-y-auto no-scrollbar">
          {showOrderBook && <OrderBookWidget symbol={selectedSymbol} currentPrice={selectedTicker?.price || 0} />}
          {showOrderFlow && <OrderFlowWidget symbol={selectedSymbol} />}
          {showAI && <AIIndicatorsWidget candles={candles} ticker={selectedTicker} />}
          {showSmartTrade && (
            <SmartTradeTerminal
              symbol={selectedSymbol}
              ticker={selectedTicker}
              portfolio={portfolio}
              onExecute={executeSmartTrade}
            />
          )}
          {showDCA && (
            <DCABotPanel
              symbol={selectedSymbol}
              ticker={selectedTicker}
              bots={dcaBots}
              setBots={setDCABots}
              portfolio={portfolio}
              onBotTrade={() => {}}
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
                        <span className="font-bold text-sm">{pos.symbol.replace("USDT", "")}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/15 text-success">LONG</span>
                        {pos.takeProfit && <span className="text-[10px] text-success">TP: ${formatPrice(pos.takeProfit)}</span>}
                        {pos.stopLoss && <span className="text-[10px] text-danger">SL: ${formatPrice(pos.stopLoss)}</span>}
                      </div>
                      <button onClick={() => closePosition(pos.id)} className="text-xs text-danger hover:text-danger/80 font-medium">Close</button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><p className="text-muted">Amount</p><p className="font-medium">{pos.amount}</p></div>
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

      {/* Bots Tab */}
      {activeTab === "bots" && (
        <div className="space-y-3">
          <DCABotPanel
            symbol={selectedSymbol}
            ticker={selectedTicker}
            bots={dcaBots}
            setBots={setDCABots}
            portfolio={portfolio}
            onBotTrade={() => {}}
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
                        <p className="text-[10px] text-muted">{bot.symbol.replace("USDT", "")} · {bot.active ? "Active" : "Paused"}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs text-right">
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
