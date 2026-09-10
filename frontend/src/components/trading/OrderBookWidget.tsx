import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Layers, Settings, Loader2 } from "lucide-react";

const BINANCE_API = "https://api.binance.com/api/v3";

interface OrderBookLevel {
  price: number;
  qty: number;
  total: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function OrderBookWidget({ symbol, currentPrice }: { symbol: string; currentPrice: number }) {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "ladder">("list");
  const [volMode, setVolMode] = useState<"cumulative" | "step">("cumulative");
  const [grouping, setGrouping] = useState<number>(0);
  const [showDepth, setShowDepth] = useState(true);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);

  const fetchOrderBook = useCallback(async () => {
    try {
      const resp = await fetch(`${BINANCE_API}/depth?symbol=${symbol}&limit=50`);
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
        setOrderBook({ bids, asks });
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    fetchOrderBook();
    const interval = setInterval(fetchOrderBook, 2000);
    return () => clearInterval(interval);
  }, [fetchOrderBook]);

  const maxBidTotal = orderBook ? Math.max(...orderBook.bids.map(b => b.total)) : 1;
  const maxAskTotal = orderBook ? Math.max(...orderBook.asks.map(a => a.total)) : 1;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);
  const maxStepVol = orderBook
    ? Math.max(...orderBook.bids.map(b => b.qty), ...orderBook.asks.map(a => a.qty))
    : 1;
  const bidVolume = orderBook ? orderBook.bids.reduce((s, b) => s + b.qty, 0) : 0;
  const askVolume = orderBook ? orderBook.asks.reduce((s, a) => s + a.qty, 0) : 0;
  const imbalance = bidVolume + askVolume > 0 ? ((bidVolume - askVolume) / (bidVolume + askVolume)) * 100 : 0;
  const spread = orderBook && orderBook.asks[0] && orderBook.bids[0]
    ? orderBook.asks[0].price - orderBook.bids[0].price
    : 0;
  const midPrice = orderBook && orderBook.asks[0] && orderBook.bids[0]
    ? (orderBook.asks[0].price + orderBook.bids[0].price) / 2
    : currentPrice;

  // ── Depth chart drawing ─────────────────────────────────────────
  useEffect(() => {
    if (!showDepth || !orderBook) return;
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 80 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 80;
    const padL = 8, padR = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    const allPrices = [...orderBook.bids.map(b => b.price), ...orderBook.asks.map(a => a.price)];
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const pRange = maxP - minP || 1;
    const maxDepth = Math.max(maxBidTotal, maxAskTotal);

    // Bid line (green, sloping down L→R)
    ctx.strokeStyle = "#00e676";
    ctx.fillStyle = "rgba(0, 230, 118, 0.1)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, h);
    for (const b of orderBook.bids) {
      const x = padL + ((b.price - minP) / pRange) * chartW;
      const y = h - (b.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + chartW / 2, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const b of orderBook.bids) {
      const x = padL + ((b.price - minP) / pRange) * chartW;
      const y = h - (b.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Ask line (red, sloping down R→L)
    ctx.strokeStyle = "#ff1744";
    ctx.fillStyle = "rgba(255, 23, 68, 0.1)";
    ctx.beginPath();
    ctx.moveTo(padL + chartW, h);
    for (const a of orderBook.asks) {
      const x = padL + ((a.price - minP) / pRange) * chartW;
      const y = h - (a.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + chartW / 2, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const a of orderBook.asks) {
      const x = padL + ((a.price - minP) / pRange) * chartW;
      const y = h - (a.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Mid price line
    const midX = padL + ((midPrice - minP) / pRange) * chartW;
    ctx.strokeStyle = "rgba(99, 102, 241, 0.5)";
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [orderBook, showDepth, midPrice]);

  const displayBids = orderBook?.bids.slice(0, 15) || [];
  const displayAsks = orderBook?.asks.slice(-15).reverse() || [];

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-accent" />
          Order Book
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

      {/* Settings menu */}
      {showSettings && (
        <div className="mb-2 p-2 rounded-lg bg-bg-alt space-y-2 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-muted">View Mode</span>
            <div className="flex gap-1">
              <button onClick={() => setViewMode("list")} className={cn("px-2 py-0.5 rounded", viewMode === "list" ? "bg-accent/20 text-accent" : "text-muted")}>List</button>
              <button onClick={() => setViewMode("ladder")} className={cn("px-2 py-0.5 rounded", viewMode === "ladder" ? "bg-accent/20 text-accent" : "text-muted")}>Ladder</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Volume Bars</span>
            <div className="flex gap-1">
              <button onClick={() => setVolMode("cumulative")} className={cn("px-2 py-0.5 rounded", volMode === "cumulative" ? "bg-accent/20 text-accent" : "text-muted")}>Cumul</button>
              <button onClick={() => setVolMode("step")} className={cn("px-2 py-0.5 rounded", volMode === "step" ? "bg-accent/20 text-accent" : "text-muted")}>Step</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Depth Chart</span>
            <button onClick={() => setShowDepth(!showDepth)} className={cn("px-2 py-0.5 rounded", showDepth ? "bg-accent/20 text-accent" : "text-muted")}>
              {showDepth ? "On" : "Off"}
            </button>
          </div>
        </div>
      )}

      {/* Imbalance bar */}
      <div className="mb-2">
        <div className="flex justify-between text-[9px] text-muted mb-0.5 font-mono">
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

      {/* Depth chart */}
      {showDepth && (
        <div className="mb-2">
          <canvas ref={depthCanvasRef} style={{ width: "100%", height: 80 }} />
          <div className="flex justify-between text-[8px] text-muted font-mono mt-0.5">
            <span>Depth</span>
            <span>Spread: {spread.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className="flex justify-between text-[9px] text-muted px-1 mb-0.5 font-mono">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {/* Asks (reversed) */}
      <div className="space-y-0.5">
        {displayAsks.map((ask, i) => {
          const volBar = volMode === "cumulative" ? ask.total / maxTotal : ask.qty / maxStepVol;
          return (
            <div key={i} className="relative flex justify-between text-[10px] py-0.5 px-1 rounded font-mono group">
              <div className="absolute right-0 top-0 bottom-0 bg-danger/10 rounded" style={{ width: `${volBar * 100}%` }} />
              <span className="relative text-danger">{formatPrice(ask.price)}</span>
              <span className="relative text-muted">{ask.qty.toFixed(4)}</span>
              <span className="relative text-muted">{ask.total.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* Spread / Mid price */}
      <div className="my-1 py-1 text-center border-y border-white/5">
        <div className="flex justify-between text-[10px] font-mono px-1">
          <span className="text-muted">Mid</span>
          <span className="font-bold text-text">{formatPrice(midPrice)}</span>
          <span className="text-muted">Spread {spread.toFixed(4)}</span>
        </div>
      </div>

      {/* Bids */}
      <div className="space-y-0.5">
        {displayBids.map((bid, i) => {
          const volBar = volMode === "cumulative" ? bid.total / maxTotal : bid.qty / maxStepVol;
          return (
            <div key={i} className="relative flex justify-between text-[10px] py-0.5 px-1 rounded font-mono group">
              <div className="absolute left-0 top-0 bottom-0 bg-success/10 rounded" style={{ width: `${volBar * 100}%` }} />
              <span className="relative text-success">{formatPrice(bid.price)}</span>
              <span className="relative text-muted">{bid.qty.toFixed(4)}</span>
              <span className="relative text-muted">{bid.total.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
