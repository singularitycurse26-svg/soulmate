import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Activity, Loader2, Eye, AlertTriangle } from "lucide-react";
import { valueArea, detectIcebergs, type Candle } from "@/lib/indicators";

const BINANCE_API = "https://api.binance.com/api/v3";

interface Trade {
  id: number;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean;
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

export function OrderFlowWidget({ symbol, candles }: { symbol: string; candles: Candle[] }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const deltaCanvasRef = useRef<HTMLCanvasElement>(null);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BINANCE_API}/trades?symbol=${symbol}&limit=500`);
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

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  // ── Order flow metrics ──────────────────────────────────────────
  const buyTrades = trades.filter(t => !t.isBuyerMaker);
  const sellTrades = trades.filter(t => t.isBuyerMaker);
  const buyVolume = buyTrades.reduce((s, t) => s + t.qty, 0);
  const sellVolume = sellTrades.reduce((s, t) => s + t.qty, 0);
  const delta = buyVolume - sellVolume;
  const aggressorRatio = buyVolume + sellVolume > 0 ? (buyVolume / (buyVolume + sellVolume)) * 100 : 50;

  // ── Value area from candles ─────────────────────────────────────
  const va = useMemo(() => valueArea(candles, 30), [candles]);
  const maxVol = va.levels.length > 0 ? Math.max(...va.levels.map(l => l.volume)) : 1;

  // ── Iceberg detection ───────────────────────────────────────────
  const icebergs = useMemo(() => detectIcebergs(trades), [trades]);

  // ── Cumulative delta over time ──────────────────────────────────
  const deltaHistory = useMemo(() => {
    const sorted = [...trades].sort((a, b) => a.time - b.time);
    let cum = 0;
    return sorted.map(t => {
      cum += t.isBuyerMaker ? -t.qty : t.qty;
      return cum;
    });
  }, [trades]);

  // ── Draw cumulative delta chart ─────────────────────────────────
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

    // Zero line
    const zeroY = h / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();

    // Delta area
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

    // Delta line
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

  // ── Trade flow classification ──────────────────────────────────
  const blockTrades = trades.filter(t => t.qty > 1).length;
  const largeTrades = trades.filter(t => t.qty > 5).length;

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-accent" />
          Order Flow
        </h4>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
      </div>

      {/* Delta metrics grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Delta</p>
          <p className={cn("text-sm font-bold font-mono", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(4)}
          </p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Buy Vol</p>
          <p className="text-sm font-bold text-success font-mono">{buyVolume.toFixed(2)}</p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Sell Vol</p>
          <p className="text-sm font-bold text-danger font-mono">{sellVolume.toFixed(2)}</p>
        </div>
        <div className="p-2 rounded-lg bg-bg-alt">
          <p className="text-[9px] text-muted">Trades</p>
          <p className="text-sm font-bold font-mono">{trades.length}</p>
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

      {/* Volume profile with value area */}
      <div className="mb-3">
        <p className="text-[9px] font-semibold text-muted mb-1">
          Volume Profile <span className="text-warning">(POC)</span> · <span className="text-success">VAH</span> · <span className="text-danger">VAL</span>
        </p>
        <div className="space-y-0.5 max-h-40 overflow-y-auto no-scrollbar">
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

      {/* Trade flow stats */}
      <div className="grid grid-cols-2 gap-2 mb-2 text-[10px]">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-muted" />
          <span className="text-muted">Block:</span>
          <span className="font-mono font-medium">{blockTrades}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 text-muted" />
          <span className="text-muted">Large:</span>
          <span className="font-mono font-medium">{largeTrades}</span>
        </div>
      </div>

      {/* Recent trades tape */}
      <div>
        <p className="text-[9px] font-semibold text-muted mb-1">Recent Trades</p>
        <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
          {trades.slice(-20).reverse().map((t) => (
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
