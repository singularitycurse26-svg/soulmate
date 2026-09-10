import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  const [viewMode, setViewMode] = useState<"list" | "ladder" | "depth">("list");
  const [volMode, setVolMode] = useState<"cumulative" | "step">("cumulative");
  const [grouping, setGrouping] = useState<number>(0);
  const [showDepth, setShowDepth] = useState(true);
  const [showTrades, setShowTrades] = useState(false);
  const [trades, setTrades] = useState<{ id: number; price: number; qty: number; time: number; isBuyerMaker: boolean }[]>([]);
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

  const fetchTrades = useCallback(async () => {
    try {
      const resp = await fetch(`${BINANCE_API}/trades?symbol=${symbol}&limit=30`);
      if (resp.ok) {
        const data = await resp.json();
        setTrades(data.map((t: any) => ({
          id: t.id, price: parseFloat(t.price), qty: parseFloat(t.qty),
          time: t.time, isBuyerMaker: t.isBuyerMaker,
        })));
      }
    } catch {
      // Silently fail
    }
  }, [symbol]);

  useEffect(() => {
    setLoading(true);
    fetchOrderBook();
    fetchTrades();
    const bookInterval = setInterval(fetchOrderBook, 2000);
    const tradeInterval = setInterval(fetchTrades, 1500);
    return () => { clearInterval(bookInterval); clearInterval(tradeInterval); };
  }, [fetchOrderBook, fetchTrades]);

  // ── Grouping: aggregate levels by price precision ───────────────
  const groupedBook = useMemo(() => {
    if (!orderBook) return null;
    if (grouping === 0) return orderBook;
    const groupLevels = (levels: OrderBookLevel[], side: "bid" | "ask") => {
      const map: Record<string, { price: number; qty: number }> = {};
      for (const lvl of levels) {
        const groupedPrice = side === "bid"
          ? Math.floor(lvl.price / grouping) * grouping
          : Math.ceil(lvl.price / grouping) * grouping;
        const key = groupedPrice.toFixed(8);
        if (!map[key]) map[key] = { price: groupedPrice, qty: 0 };
        map[key].qty += lvl.qty;
      }
      let total = 0;
      return Object.values(map)
        .sort((a, b) => side === "bid" ? b.price - a.price : a.price - b.price)
        .map(l => { total += l.qty; return { ...l, total }; });
    };
    return { bids: groupLevels(orderBook.bids, "bid"), asks: groupLevels(orderBook.asks, "ask") };
  }, [orderBook, grouping]);

  // ── Large order detection ───────────────────────────────────────
  const avgOrderSize = useMemo(() => {
    if (!groupedBook) return 1;
    const allQtys = [...groupedBook.bids.map(b => b.qty), ...groupedBook.asks.map(a => a.qty)];
    return allQtys.length > 0 ? allQtys.reduce((s, q) => s + q, 0) / allQtys.length : 1;
  }, [groupedBook]);

  const maxBidTotal = groupedBook ? Math.max(...groupedBook.bids.map(b => b.total)) : 1;
  const maxAskTotal = groupedBook ? Math.max(...groupedBook.asks.map(a => a.total)) : 1;
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);
  const maxStepVol = groupedBook
    ? Math.max(...groupedBook.bids.map(b => b.qty), ...groupedBook.asks.map(a => a.qty))
    : 1;
  const bidVolume = groupedBook ? groupedBook.bids.reduce((s, b) => s + b.qty, 0) : 0;
  const askVolume = groupedBook ? groupedBook.asks.reduce((s, a) => s + a.qty, 0) : 0;
  const imbalance = bidVolume + askVolume > 0 ? ((bidVolume - askVolume) / (bidVolume + askVolume)) * 100 : 0;
  const spread = groupedBook && groupedBook.asks[0] && groupedBook.bids[0]
    ? groupedBook.asks[0].price - groupedBook.bids[0].price
    : 0;
  const midPrice = groupedBook && groupedBook.asks[0] && groupedBook.bids[0]
    ? (groupedBook.asks[0].price + groupedBook.bids[0].price) / 2
    : currentPrice;

  // ── Depth chart drawing ─────────────────────────────────────────
  useEffect(() => {
    if (!showDepth && viewMode !== "depth") return;
    if (!groupedBook) return;
    const canvas = depthCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const canvasH = viewMode === "depth" ? 200 : 80;
    canvas.width = rect.width * dpr;
    canvas.height = canvasH * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = canvasH;
    const padL = 8, padR = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    const allPrices = [...groupedBook.bids.map(b => b.price), ...groupedBook.asks.map(a => a.price)];
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
    for (const b of groupedBook.bids) {
      const x = padL + ((b.price - minP) / pRange) * chartW;
      const y = h - (b.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + chartW / 2, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const b of groupedBook.bids) {
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
    for (const a of groupedBook.asks) {
      const x = padL + ((a.price - minP) / pRange) * chartW;
      const y = h - (a.total / maxDepth) * h;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(padL + chartW / 2, h);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (const a of groupedBook.asks) {
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

    // Price labels (depth mode only)
    if (viewMode === "depth") {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText(formatPrice(minP), padL, h - 2);
      ctx.fillText(formatPrice(maxP), padL + chartW - 40, h - 2);
      ctx.fillText(formatPrice(midPrice), midX - 20, 10);
    }
  }, [groupedBook, showDepth, viewMode, midPrice]);

  const displayBids = groupedBook?.bids.slice(0, 15) || [];
  const displayAsks = groupedBook?.asks.slice(-15).reverse() || [];

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
              <button onClick={() => setViewMode("depth")} className={cn("px-2 py-0.5 rounded", viewMode === "depth" ? "bg-accent/20 text-accent" : "text-muted")}>Depth</button>
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
          <div className="flex items-center justify-between">
            <span className="text-muted">Grouping</span>
            <div className="flex gap-0.5">
              {[
                { label: "None", val: 0 },
                { label: "0.1", val: 0.1 },
                { label: "1", val: 1 },
                { label: "10", val: 10 },
              ].map(g => (
                <button
                  key={g.val}
                  onClick={() => setGrouping(g.val)}
                  className={cn("px-1.5 py-0.5 rounded text-[9px]",
                    grouping === g.val ? "bg-accent/20 text-accent" : "text-muted")}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Trades Tape</span>
            <button onClick={() => setShowTrades(!showTrades)} className={cn("px-2 py-0.5 rounded", showTrades ? "bg-accent/20 text-accent" : "text-muted")}>
              {showTrades ? "On" : "Off"}
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
      {(showDepth || viewMode === "depth") && (
        <div className="mb-2">
          <canvas ref={depthCanvasRef} style={{ width: "100%", height: viewMode === "depth" ? 200 : 80 }} />
          <div className="flex justify-between text-[8px] text-muted font-mono mt-0.5">
            <span>Depth</span>
            <span>Spread: {spread.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Order book list (hidden in depth mode) */}
      {viewMode !== "depth" && (
        <>
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
          const isLarge = ask.qty > avgOrderSize * 3;
          return (
            <div key={i} className={cn("relative flex justify-between text-[10px] py-0.5 px-1 rounded font-mono group", isLarge && "bg-warning/5")}>
              <div className="absolute right-0 top-0 bottom-0 bg-danger/10 rounded" style={{ width: `${volBar * 100}%` }} />
              {isLarge && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-warning" />}
              <span className={cn("relative text-danger", isLarge && "font-bold")}>{formatPrice(ask.price)}</span>
              <span className={cn("relative", isLarge ? "text-warning font-bold" : "text-muted")}>{ask.qty.toFixed(4)}</span>
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
          const isLarge = bid.qty > avgOrderSize * 3;
          return (
            <div key={i} className={cn("relative flex justify-between text-[10px] py-0.5 px-1 rounded font-mono group", isLarge && "bg-warning/5")}>
              <div className="absolute left-0 top-0 bottom-0 bg-success/10 rounded" style={{ width: `${volBar * 100}%` }} />
              {isLarge && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-warning" />}
              <span className={cn("relative text-success", isLarge && "font-bold")}>{formatPrice(bid.price)}</span>
              <span className={cn("relative", isLarge ? "text-warning font-bold" : "text-muted")}>{bid.qty.toFixed(4)}</span>
              <span className="relative text-muted">{bid.total.toFixed(2)}</span>
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Recent trades tape (Kraken-style) */}
      {showTrades && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-[9px] font-semibold text-muted mb-1">Recent Trades</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
            {trades.slice(-20).reverse().map((t) => (
              <div key={t.id} className="flex justify-between text-[9px] font-mono py-0.5 px-1 rounded hover:bg-white/5">
                <span className={t.isBuyerMaker ? "text-danger" : "text-success"}>
                  {t.isBuyerMaker ? "SELL" : "BUY "}
                </span>
                <span className="text-muted">{formatPrice(t.price)}</span>
                <span className={cn(t.qty > avgOrderSize * 2 ? "text-warning font-bold" : "text-muted")}>{t.qty.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
