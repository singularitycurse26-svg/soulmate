import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Activity, Loader2, Eye, AlertTriangle, Settings, Layers,
  TrendingUp, TrendingDown, Zap, Target, Flame, Grid3x3,
  BarChart3, DollarSign, Circle,
} from "lucide-react";
import {
  valueArea, detectIcebergs, buildFootprint, buildVolumeDots,
  detectAbsorption, detectPowerTrades, detectStops, detectExhaustion,
  buildClusterStats, buildTradeSizeDistribution,
  type Candle, type FootprintCandle, type VolumeDot,
  type PowerTrade, type StopRun, type ExhaustionEvent, type ClusterStats,
  type TradeSizeBucket,
} from "@/lib/indicators";

const BINANCE_API = "https://api.binance.com/api/v3";

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
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

type FootprintMode = "bid_ask" | "delta" | "volume" | "delta_profile";
type ColorScheme = "delta" | "heatmap_volume" | "heatmap_delta" | "solid";
type ViewTab = "footprint" | "heatmap" | "profile" | "tape" | "dots" | "stats" | "power" | "distribution";

function formatPrice(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function OrderFlowWidget({ symbol, candles }: { symbol: string; candles: Candle[] }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("footprint");
  const [footprintMode, setFootprintMode] = useState<FootprintMode>("bid_ask");
  const [colorScheme, setColorScheme] = useState<ColorScheme>("delta");
  const [imbalanceRatio, setImbalanceRatio] = useState(3);
  const [minVolume, setMinVolume] = useState(0);
  const [heatmapSnapshots, setHeatmapSnapshots] = useState<{ time: number; levels: { price: number; bidQty: number; askQty: number }[] }[]>([]);

  const deltaCanvasRef = useRef<HTMLCanvasElement>(null);
  const footprintCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement>(null);
  const dotsCanvasRef = useRef<HTMLCanvasElement>(null);
  const deltaBarsCanvasRef = useRef<HTMLCanvasElement>(null);

  // ── Data fetching ───────────────────────────────────────────────
  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BINANCE_API}/trades?symbol=${symbol}&limit=1000`);
      if (resp.ok) {
        const data = await resp.json();
        setTrades(data.map((t: any) => ({
          id: t.id, price: parseFloat(t.price), qty: parseFloat(t.qty),
          time: t.time, isBuyerMaker: t.isBuyerMaker,
        })));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  const fetchOrderBook = useCallback(async () => {
    try {
      const resp = await fetch(`${BINANCE_API}/depth?symbol=${symbol}&limit=50`);
      if (resp.ok) {
        const data = await resp.json();
        setOrderBook({
          bids: data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
          asks: data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) })),
        });
        // Store snapshot for heatmap
        const now = Date.now();
        setHeatmapSnapshots(prev => {
          const updated = [...prev, {
            time: now,
            levels: [
              ...data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), bidQty: parseFloat(b[1]), askQty: 0 })),
              ...data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), bidQty: 0, askQty: parseFloat(a[1]) })),
            ],
          }];
          return updated.slice(-30);
        });
      }
    } catch {
      // Silently fail
    }
  }, [symbol]);

  useEffect(() => {
    fetchTrades();
    fetchOrderBook();
    const tradeInterval = setInterval(fetchTrades, 3000);
    const bookInterval = setInterval(fetchOrderBook, 2000);
    return () => { clearInterval(tradeInterval); clearInterval(bookInterval); };
  }, [fetchTrades, fetchOrderBook]);

  // ── Core metrics ────────────────────────────────────────────────
  const buyTrades = trades.filter(t => !t.isBuyerMaker);
  const sellTrades = trades.filter(t => t.isBuyerMaker);
  const buyVolume = buyTrades.reduce((s, t) => s + t.qty, 0);
  const sellVolume = sellTrades.reduce((s, t) => s + t.qty, 0);
  const delta = buyVolume - sellVolume;
  const aggressorRatio = buyVolume + sellVolume > 0 ? (buyVolume / (buyVolume + sellVolume)) * 100 : 50;

  // ── Value area ─────────────────────────────────────────────────
  const va = useMemo(() => valueArea(candles, 30), [candles]);
  const maxVol = va.levels.length > 0 ? Math.max(...va.levels.map(l => l.volume)) : 1;

  // ── Iceberg detection ──────────────────────────────────────────
  const icebergs = useMemo(() => detectIcebergs(trades), [trades]);

  // ── Absorption detection ───────────────────────────────────────
  const absorptions = useMemo(() => {
    if (!orderBook) return [];
    return detectAbsorption(trades, orderBook);
  }, [trades, orderBook]);

  // ── Cumulative delta ────────────────────────────────────────────
  const deltaHistory = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.time - b.time);
    let cum = 0;
    return sorted.map(t => {
      cum += t.isBuyerMaker ? -t.qty : t.qty;
      return cum;
    });
  }, [trades]);

  // ── Footprint candles (last 10) ─────────────────────────────────
  const footprintCandles = useMemo(() => {
    if (candles.length === 0 || trades.length === 0) return [];
    const recentCandles = candles.slice(-10);
    return recentCandles.map(c => buildFootprint(c, trades, imbalanceRatio));
  }, [candles, trades, imbalanceRatio]);

  // ── Volume dots ────────────────────────────────────────────────
  const volumeDots = useMemo(() => buildVolumeDots(trades, 5000), [trades]);

  // ── Power trades ────────────────────────────────────────────────
  const powerTrades = useMemo(() => detectPowerTrades(trades, 5, 3000), [trades]);

  // ── Stop runs ───────────────────────────────────────────────────
  const stopRuns = useMemo(() => detectStops(trades, 0.003), [trades]);

  // ── Exhaustion ──────────────────────────────────────────────────
  const exhaustions = useMemo(() => detectExhaustion(trades), [trades]);

  // ── Cluster statistics ──────────────────────────────────────────
  const clusterStats = useMemo(() => buildClusterStats(candles, trades), [candles, trades]);

  // ── Trade size distribution ─────────────────────────────────────
  const tradeSizeDist = useMemo(() => buildTradeSizeDistribution(trades), [trades]);

  // ── Trade flow classification ──────────────────────────────────
  const blockTrades = trades.filter(t => t.qty > 1).length;
  const largeTrades = trades.filter(t => t.qty > 5).length;
  const whaleTrades = trades.filter(t => t.qty > 10).length;

  // ── Draw cumulative delta ──────────────────────────────────────
  useEffect(() => {
    const canvas = deltaCanvasRef.current;
    if (!canvas || deltaHistory.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 50 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 50;
    ctx.clearRect(0, 0, w, h);

    const maxDelta = Math.max(...deltaHistory.map(Math.abs), 0.001);
    const stepX = w / deltaHistory.length;

    const zeroY = h / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    deltaHistory.forEach((d, i) => {
      const x = i * stepX;
      const y = zeroY - (d / maxDelta) * (h / 2);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, zeroY);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(0, 230, 118, 0.3)");
    grad.addColorStop(0.5, "rgba(255, 255, 255, 0.05)");
    grad.addColorStop(1, "rgba(255, 23, 68, 0.3)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = deltaHistory[deltaHistory.length - 1] >= 0 ? "#00e676" : "#ff1744";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    deltaHistory.forEach((d, i) => {
      const x = i * stepX;
      const y = zeroY - (d / maxDelta) * (h / 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [deltaHistory]);

  // ── Draw footprint chart ────────────────────────────────────────
  useEffect(() => {
    const canvas = footprintCanvasRef.current;
    if (!canvas || footprintCandles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 280 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 280;
    const padL = 4, padR = 4, padT = 4, padB = 4;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const candleW = chartW / footprintCandles.length;
    const allPrices = footprintCandles.flatMap(fc => fc.cells.map(c => c.price));
    if (allPrices.length === 0) return;
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const pRange = maxP - minP || 1;

    const maxCellVol = Math.max(...footprintCandles.flatMap(fc => fc.cells.map(c => c.total)), 0.001);

    footprintCandles.forEach((fc, ci) => {
      const cx = padL + ci * candleW;
      const cellH = chartH / (fc.cells.length || 1);

      fc.cells.forEach((cell, ri) => {
        const cy = padT + ((maxP - cell.price) / pRange) * chartH;
        const cellY = cy - cellH / 2;

        // Color based on scheme
        let bgColor = "rgba(255,255,255,0.02)";
        let textColor = "rgba(255,255,255,0.4)";

        if (colorScheme === "delta") {
          if (cell.delta > 0) {
            const intensity = Math.min(1, cell.delta / maxCellVol);
            bgColor = `rgba(0, 230, 118, ${0.1 + intensity * 0.3})`;
            textColor = "#00e676";
          } else if (cell.delta < 0) {
            const intensity = Math.min(1, Math.abs(cell.delta) / maxCellVol);
            bgColor = `rgba(255, 23, 68, ${0.1 + intensity * 0.3})`;
            textColor = "#ff1744";
          }
        } else if (colorScheme === "heatmap_volume") {
          const intensity = cell.total / maxCellVol;
          bgColor = `rgba(99, 102, 241, ${0.05 + intensity * 0.5})`;
          textColor = intensity > 0.5 ? "#fff" : "rgba(255,255,255,0.4)";
        } else if (colorScheme === "heatmap_delta") {
          const intensity = Math.abs(cell.delta) / maxCellVol;
          if (cell.delta > 0) {
            bgColor = `rgba(0, 230, 118, ${0.05 + intensity * 0.5})`;
            textColor = "#00e676";
          } else {
            bgColor = `rgba(255, 23, 68, ${0.05 + intensity * 0.5})`;
            textColor = "#ff1744";
          }
        } else if (colorScheme === "solid") {
          bgColor = cell.delta >= 0 ? "rgba(0, 230, 118, 0.15)" : "rgba(255, 23, 68, 0.15)";
        }

        // Imbalance highlight
        if (cell.isImbalance) {
          ctx.strokeStyle = cell.imbalanceSide === "buy" ? "#00e676" : "#ff1744";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 1, cellY, candleW - 2, cellH);
        }

        // POC highlight
        if (cell.isPOC) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
          ctx.fillRect(cx, cellY, candleW, cellH);
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx, cellY, candleW, cellH);
        }

        // Absorption marker
        if (cell.isAbsorption) {
          ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
          ctx.fillRect(cx, cellY, candleW, cellH);
        }

        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(cx + 1, cellY, candleW - 2, cellH);

        // Text
        ctx.fillStyle = textColor;
        ctx.font = "7px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";

        if (footprintMode === "bid_ask") {
          const buyText = cell.buyVolume > 0 ? cell.buyVolume.toFixed(2) : "·";
          const sellText = cell.sellVolume > 0 ? cell.sellVolume.toFixed(2) : "·";
          ctx.textAlign = "left";
          ctx.fillText(sellText, cx + 2, cellY + cellH / 2 + 2);
          ctx.textAlign = "right";
          ctx.fillStyle = cell.buyVolume > cell.sellVolume ? "#00e676" : textColor;
          ctx.fillText(buyText, cx + candleW - 2, cellY + cellH / 2 + 2);
        } else if (footprintMode === "delta") {
          const deltaText = (cell.delta >= 0 ? "+" : "") + cell.delta.toFixed(2);
          ctx.fillText(deltaText, cx + candleW / 2, cellY + cellH / 2 + 2);
        } else if (footprintMode === "volume") {
          ctx.fillText(cell.total.toFixed(1), cx + candleW / 2, cellY + cellH / 2 + 2);
        } else if (footprintMode === "delta_profile") {
          // Profile bar
          const barW = (Math.abs(cell.delta) / maxCellVol) * (candleW * 0.4);
          ctx.fillStyle = cell.delta >= 0 ? "#00e676" : "#ff1744";
          if (cell.delta >= 0) {
            ctx.fillRect(cx + candleW / 2, cellY + 1, barW, cellH - 2);
          } else {
            ctx.fillRect(cx + candleW / 2 - barW, cellY + 1, barW, cellH - 2);
          }
        }

        // Max volume border
        if (cell.isMaxVolume) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 1, cellY, candleW - 2, cellH);
        }
      });

      // Stacking indicator
      if (fc.hasStacking) {
        ctx.fillStyle = fc.stackingSide === "buy" ? "#00e676" : "#ff1744";
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(`S${fc.stackingCount}`, cx + candleW / 2, padT + 8);
      }

      // Auction markers
      if (!fc.isFinishedAuctionTop) {
        ctx.fillStyle = "#f59e0b";
        ctx.font = "7px 'JetBrains Mono', monospace";
        ctx.fillText("UA", cx + candleW / 2, padT + chartH - 2);
      }
    });

    ctx.textAlign = "left";
  }, [footprintCandles, footprintMode, colorScheme]);

  // ── Draw liquidity heatmap ────────────────────────────────────
  useEffect(() => {
    const canvas = heatmapCanvasRef.current;
    if (!canvas || heatmapSnapshots.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 200;
    ctx.clearRect(0, 0, w, h);

    const allPrices = heatmapSnapshots.flatMap(s => s.levels.map(l => l.price));
    if (allPrices.length === 0) return;
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const pRange = maxP - minP || 1;
    const bins = 40;
    const binSize = pRange / bins;

    const maxIntensity = Math.max(...heatmapSnapshots.flatMap(s => s.levels.map(l => l.bidQty + l.askQty)), 0.001);
    const colW = w / heatmapSnapshots.length;

    heatmapSnapshots.forEach((snap, si) => {
      const cx = si * colW;
      for (const lvl of snap.levels) {
        const binIdx = Math.floor((lvl.price - minP) / binSize);
        const y = (binIdx / bins) * h;
        const cellH = h / bins;
        const intensity = (lvl.bidQty + lvl.askQty) / maxIntensity;

        if (intensity < 0.05) continue;

        // Color: red = high liquidity, blue = low
        const r = Math.floor(255 * intensity);
        const g = Math.floor(100 * (1 - intensity));
        const b = Math.floor(200 * (1 - intensity));
        const alpha = 0.15 + intensity * 0.7;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fillRect(cx, y, colW + 1, cellH + 1);
      }
    });

    // Price axis labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    for (let i = 0; i <= 4; i++) {
      const price = maxP - (pRange / 4) * i;
      const y = (i / 4) * h;
      ctx.fillText(formatPrice(price), 2, y + 8);
    }
  }, [heatmapSnapshots]);

  // ── Draw volume dots (Bookmap-style) ───────────────────────────
  useEffect(() => {
    const canvas = dotsCanvasRef.current;
    if (!canvas || volumeDots.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 200;
    const padL = 4, padR = 4, padT = 4, padB = 4;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const allPrices = volumeDots.map(d => d.price);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const pRange = maxP - minP || 1;
    const minTime = Math.min(...volumeDots.map(d => d.time));
    const maxTime = Math.max(...volumeDots.map(d => d.time));
    const tRange = maxTime - minTime || 1;
    const maxDotSize = 12;

    // Price axis labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "8px 'JetBrains Mono', monospace";
    for (let i = 0; i <= 4; i++) {
      const price = maxP - (pRange / 4) * i;
      const y = padT + (chartH / 4) * i;
      ctx.fillText(formatPrice(price), 2, y + 8);
    }

    // Draw dots
    for (const dot of volumeDots) {
      const x = padL + ((dot.time - minTime) / tRange) * chartW;
      const y = padT + ((maxP - dot.price) / pRange) * chartH;
      const radius = Math.max(2, dot.size * maxDotSize);

      // Color: green for buy, red for sell, intensity by dominance
      const buyRatio = dot.buyVolume / (dot.volume || 1);
      const r = Math.floor(255 * (1 - buyRatio));
      const g = Math.floor(255 * buyRatio);
      const alpha = 0.3 + dot.size * 0.5;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, 50, ${alpha})`;
      ctx.fill();

      // Outline for large dots
      if (dot.size > 0.5) {
        ctx.strokeStyle = dot.isBuy ? "#00e676" : "#ff1744";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [volumeDots]);

  // ── Draw delta bars per candle ─────────────────────────────────
  useEffect(() => {
    const canvas = deltaBarsCanvasRef.current;
    if (!canvas || clusterStats.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 120 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 120;
    const padL = 4, padR = 4, padT = 4, padB = 4;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    ctx.clearRect(0, 0, w, h);

    const maxAbsDelta = Math.max(...clusterStats.map(s => Math.abs(s.delta)), 0.001);
    const barW = chartW / clusterStats.length;
    const zeroY = padT + chartH / 2;

    // Zero line
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + chartW, zeroY);
    ctx.stroke();

    clusterStats.forEach((stat, i) => {
      const x = padL + i * barW;
      const barH = (Math.abs(stat.delta) / maxAbsDelta) * (chartH / 2);
      const isPositive = stat.delta >= 0;
      ctx.fillStyle = isPositive ? "#00e676" : "#ff1744";
      ctx.fillRect(x + 1, isPositive ? zeroY - barH : zeroY, barW - 2, barH);

      // POC marker
      if (stat.pocPrice > 0) {
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(x + barW / 2 - 1, padT, 2, chartH);
      }
    });

    // Label
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.fillText("Delta per Candle", padL, padT + 10);
  }, [clusterStats]);

  // ── Alerts ─────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { type: string; message: string; severity: "info" | "warning" | "danger" }[] = [];
    if (icebergs.length > 0) {
      list.push({ type: "iceberg", message: `${icebergs.length} iceberg orders detected`, severity: "warning" });
    }
    if (absorptions.length > 0) {
      list.push({ type: "absorption", message: `${absorptions.length} absorption events`, severity: "info" });
    }
    if (powerTrades.length > 0) {
      list.push({ type: "power", message: `${powerTrades.length} power trades detected`, severity: "warning" });
    }
    if (stopRuns.length > 0) {
      list.push({ type: "stops", message: `${stopRuns.length} stop runs detected`, severity: "danger" });
    }
    if (exhaustions.length > 0) {
      list.push({ type: "exhaustion", message: `${exhaustions.length} exhaustion events`, severity: "info" });
    }
    for (const fc of footprintCandles) {
      if (fc.hasStacking) {
        list.push({
          type: "stacking",
          message: `${fc.stackingCount}x ${fc.stackingSide?.toUpperCase()} stacking`,
          severity: fc.stackingSide === "buy" ? "info" : "danger",
        });
      }
    }
    if (whaleTrades > 5) {
      list.push({ type: "whale", message: `${whaleTrades} whale trades (>10 qty)`, severity: "warning" });
    }
    return list.slice(0, 8);
  }, [icebergs, absorptions, powerTrades, stopRuns, exhaustions, footprintCandles, whaleTrades]);

  return (
    <div className="card p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-accent" />
          Order Flow Pro
          {alerts.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-warning/15 text-warning text-[8px] font-bold">
              {alerts.length}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-text hover:bg-white/5"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="mb-3 p-2 rounded-lg bg-bg-alt space-y-2 text-[10px]">
          <div>
            <p className="text-muted mb-1">Footprint Mode</p>
            <div className="grid grid-cols-4 gap-1">
              {([
                { key: "bid_ask" as const, label: "Bid×Ask" },
                { key: "delta" as const, label: "Delta" },
                { key: "volume" as const, label: "Volume" },
                { key: "delta_profile" as const, label: "Profile" },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => setFootprintMode(m.key)}
                  className={cn("py-1 rounded font-medium",
                    footprintMode === m.key ? "bg-accent/20 text-accent" : "bg-bg-card text-muted")}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-muted mb-1">Color Scheme</p>
            <div className="grid grid-cols-4 gap-1">
              {([
                { key: "delta" as const, label: "Delta" },
                { key: "heatmap_volume" as const, label: "Heat Vol" },
                { key: "heatmap_delta" as const, label: "Heat Δ" },
                { key: "solid" as const, label: "Solid" },
              ]).map(c => (
                <button
                  key={c.key}
                  onClick={() => setColorScheme(c.key)}
                  className={cn("py-1 rounded font-medium",
                    colorScheme === c.key ? "bg-accent/20 text-accent" : "bg-bg-card text-muted")}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-muted block mb-0.5">Imbalance Ratio: {imbalanceRatio}x</label>
            <input
              type="range"
              min="2"
              max="10"
              step="0.5"
              value={imbalanceRatio}
              onChange={(e) => setImbalanceRatio(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div>
            <label className="text-muted block mb-0.5">Min Volume Filter: {minVolume}</label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={minVolume}
              onChange={(e) => setMinVolume(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>
      )}

      {/* Delta metrics grid */}
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        <div className="p-1.5 rounded-lg bg-bg-alt">
          <p className="text-[8px] text-muted">Delta</p>
          <p className={cn("text-xs font-bold font-mono", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(3)}
          </p>
        </div>
        <div className="p-1.5 rounded-lg bg-bg-alt">
          <p className="text-[8px] text-muted">Buy Vol</p>
          <p className="text-xs font-bold text-success font-mono">{buyVolume.toFixed(1)}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-bg-alt">
          <p className="text-[8px] text-muted">Sell Vol</p>
          <p className="text-xs font-bold text-danger font-mono">{sellVolume.toFixed(1)}</p>
        </div>
        <div className="p-1.5 rounded-lg bg-bg-alt">
          <p className="text-[8px] text-muted">Trades</p>
          <p className="text-xs font-bold font-mono">{trades.length}</p>
        </div>
      </div>

      {/* Aggressor ratio bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[9px] text-muted mb-0.5 font-mono">
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

      {/* Cumulative delta chart */}
      <div className="mb-3">
        <p className="text-[9px] font-semibold text-muted mb-1">Cumulative Delta</p>
        <canvas ref={deltaCanvasRef} style={{ width: "100%", height: 50 }} />
      </div>

      {/* View tabs */}
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-bg-alt mb-2 flex-wrap">
        {([
          { key: "footprint" as const, label: "Footprint", icon: Grid3x3 },
          { key: "heatmap" as const, label: "Heatmap", icon: Flame },
          { key: "profile" as const, label: "Profile", icon: Layers },
          { key: "tape" as const, label: "Tape", icon: Eye },
          { key: "dots" as const, label: "Dots", icon: Circle },
          { key: "stats" as const, label: "Stats", icon: BarChart3 },
          { key: "power" as const, label: "Power", icon: Zap },
          { key: "distribution" as const, label: "Dist", icon: DollarSign },
        ]).map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setViewTab(t.key)}
              className={cn("flex-1 flex items-center justify-center gap-1 py-1 rounded text-[9px] font-medium",
                viewTab === t.key ? "bg-accent/20 text-accent" : "text-muted")}
            >
              <Icon className="w-3 h-3" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Footprint view */}
      {viewTab === "footprint" && (
        <div className="mb-3">
          <div className="flex justify-between text-[8px] text-muted mb-1 font-mono">
            <span>Footprint (last 10 candles)</span>
            <span>
              <span className="text-success">Buy</span> / <span className="text-danger">Sell</span> ·{" "}
              <span className="text-warning">POC</span> ·{" "}
              <span className="text-purple-400">Abs</span> ·{" "}
              <span>S=Stack</span>
            </span>
          </div>
          {footprintCandles.length > 0 ? (
            <canvas ref={footprintCanvasRef} style={{ width: "100%", height: 280 }} />
          ) : (
            <div className="flex items-center justify-center h-48 text-muted text-[10px]">
              No footprint data available
            </div>
          )}
        </div>
      )}

      {/* Heatmap view */}
      {viewTab === "heatmap" && (
        <div className="mb-3">
          <div className="flex justify-between text-[8px] text-muted mb-1 font-mono">
            <span>Liquidity Heatmap</span>
            <span><span className="text-red-400">High</span> → <span className="text-blue-400">Low</span></span>
          </div>
          {heatmapSnapshots.length > 1 ? (
            <canvas ref={heatmapCanvasRef} style={{ width: "100%", height: 200 }} />
          ) : (
            <div className="flex items-center justify-center h-48 text-muted text-[10px]">
              Collecting order book data...
            </div>
          )}
        </div>
      )}

      {/* Profile view */}
      {viewTab === "profile" && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold text-muted mb-1">
            Volume Profile <span className="text-warning">(POC)</span> · <span className="text-success">VAH</span> · <span className="text-danger">VAL</span>
          </p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto no-scrollbar">
            {va.levels.map((level, i) => (
              <div key={i} className="relative flex items-center gap-2 text-[10px] py-0.5 font-mono">
                <span className={cn("w-16 flex-shrink-0", level.price === va.poc.price ? "text-warning font-bold" : "text-muted")}>
                  {formatPrice(level.price)}
                </span>
                <div className="flex-1 relative h-3 bg-bg-alt rounded">
                  <div
                    className={cn("absolute left-0 top-0 bottom-0 rounded",
                      level.price === va.poc.price ? "bg-warning/40" :
                      level.price >= va.val && level.price <= va.vah ? "bg-accent/25" : "bg-accent/15")}
                    style={{ width: `${(level.volume / maxVol) * 100}%` }}
                  />
                </div>
                <span className="text-muted w-12 text-right">{level.volume.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] text-muted mt-1 font-mono">
            <span>VAH: <span className="text-success">{formatPrice(va.vah)}</span></span>
            <span>VAL: <span className="text-danger">{formatPrice(va.val)}</span></span>
          </div>
        </div>
      )}

      {/* Tape view */}
      {viewTab === "tape" && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold text-muted mb-1">Recent Trades Tape</p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto no-scrollbar">
            {trades.slice(-30).reverse().map((t) => (
              <div key={t.id} className="flex justify-between text-[10px] font-mono py-0.5 px-1 rounded hover:bg-white/5">
                <span className={t.isBuyerMaker ? "text-danger" : "text-success"}>
                  {t.isBuyerMaker ? "SELL" : "BUY "}
                </span>
                <span className="text-muted">{formatPrice(t.price)}</span>
                <span className={cn(t.qty > 5 ? "text-warning font-bold" : "text-muted")}>{t.qty.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volume Dots view (Bookmap-style) */}
      {viewTab === "dots" && (
        <div className="mb-3">
          <div className="flex justify-between text-[8px] text-muted mb-1 font-mono">
            <span>Volume Dots (Bookmap-style)</span>
            <span>
              <span className="text-success">● Buy</span>{" "}
              <span className="text-danger">● Sell</span> · Size = Volume
            </span>
          </div>
          {volumeDots.length > 0 ? (
            <canvas ref={dotsCanvasRef} style={{ width: "100%", height: 200 }} />
          ) : (
            <div className="flex items-center justify-center h-48 text-muted text-[10px]">
              No volume dot data available
            </div>
          )}
        </div>
      )}

      {/* Cluster Statistics view (ATAS-style) */}
      {viewTab === "stats" && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold text-muted mb-1">Cluster Statistics (last 12 candles)</p>
          {/* Delta bars chart */}
          <canvas ref={deltaBarsCanvasRef} style={{ width: "100%", height: 120 }} className="mb-2" />
          {/* Stats table */}
          {clusterStats.length > 0 ? (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-[9px] font-mono">
                <thead>
                  <tr className="text-muted border-b border-white/5">
                    <th className="text-left py-1 px-1">#</th>
                    <th className="text-right py-1 px-1">Volume</th>
                    <th className="text-right py-1 px-1">Buy</th>
                    <th className="text-right py-1 px-1">Sell</th>
                    <th className="text-right py-1 px-1">Delta</th>
                    <th className="text-right py-1 px-1">Δ%</th>
                    <th className="text-right py-1 px-1">B/S</th>
                    <th className="text-right py-1 px-1">Trd</th>
                    <th className="text-right py-1 px-1">POC</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterStats.map((s, i) => (
                    <tr key={i} className="border-b border-white/3 hover:bg-white/5">
                      <td className="py-0.5 px-1 text-muted">{i + 1}</td>
                      <td className="py-0.5 px-1 text-right">{s.totalVolume.toFixed(2)}</td>
                      <td className="py-0.5 px-1 text-right text-success">{s.buyVolume.toFixed(2)}</td>
                      <td className="py-0.5 px-1 text-right text-danger">{s.sellVolume.toFixed(2)}</td>
                      <td className={cn("py-0.5 px-1 text-right font-bold", s.delta >= 0 ? "text-success" : "text-danger")}>
                        {s.delta >= 0 ? "+" : ""}{s.delta.toFixed(3)}
                      </td>
                      <td className={cn("py-0.5 px-1 text-right", s.deltaPercent >= 0 ? "text-success" : "text-danger")}>
                        {s.deltaPercent >= 0 ? "+" : ""}{s.deltaPercent.toFixed(1)}%
                      </td>
                      <td className="py-0.5 px-1 text-right text-muted">{s.buySellRatio.toFixed(2)}</td>
                      <td className="py-0.5 px-1 text-right text-muted">{s.tradeCount}</td>
                      <td className="py-0.5 px-1 text-right text-warning">{s.pocPrice > 0 ? formatPrice(s.pocPrice) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-muted text-[10px]">
              No cluster data available
            </div>
          )}
        </div>
      )}

      {/* Power Trades view (Quantower-style) */}
      {viewTab === "power" && (
        <div className="mb-3 space-y-2">
          <p className="text-[9px] font-semibold text-muted mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-warning" />
            Power Trades — Large aggressive orders in short time windows
          </p>
          {powerTrades.length > 0 ? (
            <div className="space-y-1">
              {powerTrades.map((pt, i) => (
                <div key={i} className={cn(
                  "p-2 rounded-lg border",
                  pt.side === "buy" ? "bg-success/5 border-success/20" : "bg-danger/5 border-danger/20"
                )}>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className={cn("font-bold", pt.side === "buy" ? "text-success" : "text-danger")}>
                      {pt.side === "buy" ? "BUY" : "SELL"} POWER
                    </span>
                    <span className="text-warning">{pt.intensity.toFixed(0)}% intensity</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-1 text-[9px] font-mono text-muted">
                    <div><p>Volume</p><p className="text-text font-bold">{pt.totalVolume.toFixed(2)}</p></div>
                    <div><p>Trades</p><p className="text-text font-bold">{pt.tradeCount}</p></div>
                    <div><p>Price</p><p className="text-text font-bold">{formatPrice(pt.priceStart)}→{formatPrice(pt.priceEnd)}</p></div>
                    <div><p>Move</p><p className={cn("font-bold", pt.priceMove >= 0 ? "text-success" : "text-danger")}>
                      {pt.priceMove >= 0 ? "+" : ""}{(pt.priceMove * 100).toFixed(3)}%
                    </p></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted text-center py-4">No power trades detected</p>
          )}

          {/* Stop runs */}
          <p className="text-[9px] font-semibold text-muted mt-2 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-warning" />
            Stop Runs Detected
          </p>
          {stopRuns.length > 0 ? (
            <div className="space-y-1">
              {stopRuns.map((sr, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-bg-alt text-[10px] font-mono">
                  <span className={cn("font-bold", sr.side === "buy" ? "text-success" : "text-danger")}>
                    {sr.side === "buy" ? "↑ BUY STOP" : "↓ SELL STOP"}
                  </span>
                  <span className="text-muted">@ {formatPrice(sr.price)}</span>
                  <span className="text-muted">Vol: {sr.volume.toFixed(2)}</span>
                  <span className={cn(sr.priceMove >= 0 ? "text-success" : "text-danger")}>
                    {(sr.priceMove * 100).toFixed(3)}%
                  </span>
                  <span className="text-warning">{sr.confidence.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted text-center py-2">No stop runs detected</p>
          )}

          {/* Exhaustion */}
          <p className="text-[9px] font-semibold text-muted mt-2 mb-1 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-purple-400" />
            Exhaustion — Aggressive orders failing to move price
          </p>
          {exhaustions.length > 0 ? (
            <div className="space-y-1">
              {exhaustions.map((ex, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono">
                  <span className={cn("font-bold", ex.side === "buy" ? "text-success" : "text-danger")}>
                    {ex.side === "buy" ? "BUY" : "SELL"} EXHAUSTION
                  </span>
                  <span className="text-muted">@ {formatPrice(ex.price)}</span>
                  <span className="text-muted">Vol: {ex.volume.toFixed(2)}</span>
                  <span className="text-purple-400">{ex.confidence.toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted text-center py-2">No exhaustion detected</p>
          )}
        </div>
      )}

      {/* Trade Size Distribution view */}
      {viewTab === "distribution" && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold text-muted mb-1">Trade Size Distribution</p>
          {tradeSizeDist.length > 0 ? (
            <div className="space-y-1">
              {tradeSizeDist.map((bucket, i) => {
                const maxCount = Math.max(...tradeSizeDist.map(b => b.count), 1);
                const buyPercent = bucket.count > 0 ? (bucket.buyCount / bucket.count) * 100 : 50;
                return (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-muted">{bucket.label} qty</span>
                      <span className="text-text">{bucket.count} trades · {bucket.volume.toFixed(2)} vol</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-bg-alt">
                      <div className="bg-success" style={{ width: `${(bucket.buyCount / maxCount) * 100}%` }} />
                      <div className="bg-danger" style={{ width: `${(bucket.sellCount / maxCount) * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[8px] font-mono text-muted">
                      <span className="text-success">{bucket.buyCount} buy</span>
                      <span className="text-danger">{bucket.sellCount} sell</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-muted text-center py-4">No trade data available</p>
          )}
        </div>
      )}

      {/* Alerts panel */}
      {alerts.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-bg-alt border border-white/5">
          <p className="text-[9px] font-semibold text-muted mb-1 flex items-center gap-1">
            <Zap className="w-3 h-3 text-warning" />
            Flow Alerts
          </p>
          <div className="space-y-0.5">
            {alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className={cn("w-1.5 h-1.5 rounded-full",
                  alert.severity === "warning" ? "bg-warning" :
                  alert.severity === "danger" ? "bg-danger" : "bg-accent")} />
                <span className="text-muted">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Iceberg detection */}
      {icebergs.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-warning/10 border border-warning/20">
          <p className="text-[9px] font-semibold text-warning flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3" />
            Iceberg Detection ({icebergs.length})
          </p>
          <div className="space-y-0.5">
            {icebergs.map((ice, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono">
                <span className="text-muted">@ {formatPrice(ice.price)}</span>
                <span className="text-warning">{ice.count} fills · {ice.confidence.toFixed(0)}% conf</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Absorption detection */}
      {absorptions.length > 0 && (
        <div className="mb-3 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <p className="text-[9px] font-semibold text-purple-400 flex items-center gap-1 mb-1">
            <Target className="w-3 h-3" />
            Absorption ({absorptions.length})
          </p>
          <div className="space-y-0.5">
            {absorptions.map((abs, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono">
                <span className="text-muted">@ {formatPrice(abs.price)}</span>
                <span className={cn(abs.side === "buy" ? "text-success" : "text-danger")}>
                  {abs.side.toUpperCase()} · {abs.aggressedVolume.toFixed(2)} vs {abs.passiveLiquidity.toFixed(2)} · {abs.confidence.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trade flow stats */}
      <div className="grid grid-cols-3 gap-1.5 mb-2 text-[10px]">
        <div className="flex items-center gap-1 p-1.5 rounded-lg bg-bg-alt">
          <Eye className="w-3 h-3 text-muted" />
          <span className="text-muted">Blk:</span>
          <span className="font-mono font-medium">{blockTrades}</span>
        </div>
        <div className="flex items-center gap-1 p-1.5 rounded-lg bg-bg-alt">
          <AlertTriangle className="w-3 h-3 text-muted" />
          <span className="text-muted">Lrg:</span>
          <span className="font-mono font-medium">{largeTrades}</span>
        </div>
        <div className="flex items-center gap-1 p-1.5 rounded-lg bg-bg-alt">
          <TrendingUp className="w-3 h-3 text-muted" />
          <span className="text-muted">Whl:</span>
          <span className="font-mono font-medium text-warning">{whaleTrades}</span>
        </div>
      </div>
    </div>
  );
}
