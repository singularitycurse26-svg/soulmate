import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Target, Plus, X, Settings, DollarSign, Percent } from "lucide-react";

interface Ticker {
  price: number;
}

interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  amount: number;
}

interface Portfolio {
  cash: number;
  positions: Position[];
}

type OrderType = "market" | "limit" | "cond_limit" | "cond_market";

export interface SmartTradeOptions {
  side: "buy" | "sell";
  orderType: OrderType;
  amount: number;
  price?: number;
  triggerPrice?: number;
  takeProfitTargets: { price: number; volume: number }[];
  stopLoss?: number;
  stopLossType: "cond_limit" | "cond_market";
  stopLossLimitPrice?: number;
  stopLossTimeout: number;
  trailingTakeProfit: boolean;
  trailingStopLoss: boolean;
  trailingOffset?: number;
  moveBreakeven: boolean;
}

export function SmartTradeTerminal({
  symbol,
  ticker,
  portfolio,
  onExecute,
}: {
  symbol: string;
  ticker?: Ticker;
  portfolio: Portfolio;
  onExecute: (opts: SmartTradeOptions) => void;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [tpTargets, setTpTargets] = useState<{ price: string; volume: string }[]>([
    { price: "", volume: "100" },
  ]);
  const [stopLoss, setStopLoss] = useState("");
  const [slType, setSlType] = useState<"cond_limit" | "cond_market">("cond_market");
  const [slLimitPrice, setSlLimitPrice] = useState("");
  const [slTimeout, setSlTimeout] = useState("0");
  const [trailingTP, setTrailingTP] = useState(false);
  const [trailingSL, setTrailingSL] = useState(false);
  const [trailingOffset, setTrailingOffset] = useState("2");
  const [moveBreakeven, setMoveBreakeven] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const price = ticker?.price || 0;
  const amt = parseFloat(amount) || 0;
  const total = amt * price;

  // Approximate profit calculation
  const approxProfit = useMemo(() => {
    if (!amt || !price) return 0;
    return tpTargets.reduce((sum, tp) => {
      const tpPrice = parseFloat(tp.price) || 0;
      const vol = parseFloat(tp.volume) || 0;
      if (!tpPrice || !vol) return sum;
      const portion = (vol / 100) * amt;
      return sum + (tpPrice - price) * portion * (side === "buy" ? 1 : -1);
    }, 0);
  }, [amt, price, tpTargets, side]);

  const tpVolumeSum = tpTargets.reduce((s, t) => s + (parseFloat(t.volume) || 0), 0);

  const addTpTarget = () => {
    if (tpTargets.length >= 8) return;
    setTpTargets([...tpTargets, { price: "", volume: "" }]);
  };

  const removeTpTarget = (i: number) => {
    if (tpTargets.length === 1) return;
    setTpTargets(tpTargets.filter((_, idx) => idx !== i));
  };

  const updateTpTarget = (i: number, field: "price" | "volume", value: string) => {
    setTpTargets(tpTargets.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  const execute = () => {
    if (!amt) return;
    onExecute({
      side,
      orderType,
      amount: amt,
      price: limitPrice ? parseFloat(limitPrice) : undefined,
      triggerPrice: triggerPrice ? parseFloat(triggerPrice) : undefined,
      takeProfitTargets: tpTargets
        .filter(t => t.price && t.volume)
        .map(t => ({ price: parseFloat(t.price), volume: parseFloat(t.volume) })),
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      stopLossType: slType,
      stopLossLimitPrice: slLimitPrice ? parseFloat(slLimitPrice) : undefined,
      stopLossTimeout: parseInt(slTimeout) || 0,
      trailingTakeProfit: trailingTP,
      trailingStopLoss: trailingSL,
      trailingOffset: trailingOffset ? parseFloat(trailingOffset) : undefined,
      moveBreakeven,
    });
    setAmount("");
    setLimitPrice("");
    setTriggerPrice("");
    setTpTargets([{ price: "", volume: "100" }]);
    setStopLoss("");
    setSlLimitPrice("");
  };

  const orderTypeLabels: Record<OrderType, string> = {
    market: "Market",
    limit: "Limit",
    cond_limit: "Cond. Limit",
    cond_market: "Cond. Market",
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
          Buy / Long
        </button>
        <button
          onClick={() => setSide("sell")}
          className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
            side === "sell" ? "bg-danger text-white" : "text-muted")}
        >
          Sell / Short
        </button>
      </div>

      {/* Order type selector */}
      <div className="mb-2">
        <label className="text-[9px] text-muted block mb-0.5">Order Type</label>
        <div className="grid grid-cols-4 gap-1">
          {(["market", "limit", "cond_limit", "cond_market"] as OrderType[]).map(t => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={cn("py-1 rounded text-[9px] font-medium",
                orderType === t ? "bg-accent/20 text-accent" : "bg-bg-alt text-muted")}
            >
              {orderTypeLabels[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div className="mb-2">
        <label className="text-[9px] text-muted block mb-0.5">Amount ({symbol.replace("USDT", "")})</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Limit price (shown for limit and cond_limit) */}
      {(orderType === "limit" || orderType === "cond_limit") && (
        <div className="mb-2">
          <label className="text-[9px] text-muted block mb-0.5">Limit Price ($)</label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            placeholder={price > 0 ? price.toFixed(2) : "0.00"}
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      )}

      {/* Trigger price (shown for conditional) */}
      {(orderType === "cond_limit" || orderType === "cond_market") && (
        <div className="mb-2">
          <label className="text-[9px] text-muted block mb-0.5">Trigger Price ($)</label>
          <input
            type="number"
            value={triggerPrice}
            onChange={(e) => setTriggerPrice(e.target.value)}
            placeholder={price > 0 ? price.toFixed(2) : "0.00"}
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs font-mono outline-none focus:ring-1 focus:ring-warning"
          />
        </div>
      )}

      {/* Total */}
      <div className="mb-2 p-2 rounded-lg bg-bg-alt text-[10px] flex justify-between font-mono">
        <span className="text-muted">Total</span>
        <span className="font-semibold">${total.toFixed(2)}</span>
      </div>

      {/* Take Profit targets */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[9px] text-muted">Take Profit Targets ({tpTargets.length}/8)</label>
          <button onClick={addTpTarget} disabled={tpTargets.length >= 8} className="text-accent hover:text-accent/80 disabled:opacity-30">
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-1">
          {tpTargets.map((tp, i) => (
            <div key={i} className="flex gap-1 items-center">
              <span className="text-[9px] text-muted w-4">{i + 1}</span>
              <input
                type="number"
                value={tp.price}
                onChange={(e) => updateTpTarget(i, "price", e.target.value)}
                placeholder="Price"
                className="flex-1 px-1.5 py-1 rounded bg-bg-alt text-[10px] font-mono outline-none focus:ring-1 focus:ring-success"
              />
              <input
                type="number"
                value={tp.volume}
                onChange={(e) => updateTpTarget(i, "volume", e.target.value)}
                placeholder="Vol %"
                className="w-14 px-1.5 py-1 rounded bg-bg-alt text-[10px] font-mono outline-none focus:ring-1 focus:ring-success"
              />
              {tpTargets.length > 1 && (
                <button onClick={() => removeTpTarget(i)} className="text-muted hover:text-danger">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        {tpVolumeSum !== 100 && (
          <p className={cn("text-[9px] mt-0.5 font-mono", tpVolumeSum > 100 ? "text-danger" : "text-warning")}>
            Total volume: {tpVolumeSum}% (must = 100%)
          </p>
        )}
      </div>

      {/* Stop Loss */}
      <div className="mb-2">
        <label className="text-[9px] text-muted block mb-0.5">Stop Loss ($)</label>
        <input
          type="number"
          value={stopLoss}
          onChange={(e) => setStopLoss(e.target.value)}
          placeholder={price > 0 ? (price * 0.95).toFixed(2) : "0.00"}
          className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs font-mono outline-none focus:ring-1 focus:ring-danger"
        />
        <div className="grid grid-cols-2 gap-1 mt-1">
          <button
            onClick={() => setSlType("cond_market")}
            className={cn("py-1 rounded text-[9px] font-medium", slType === "cond_market" ? "bg-danger/20 text-danger" : "bg-bg-alt text-muted")}
          >
            Cond. Market
          </button>
          <button
            onClick={() => setSlType("cond_limit")}
            className={cn("py-1 rounded text-[9px] font-medium", slType === "cond_limit" ? "bg-danger/20 text-danger" : "bg-bg-alt text-muted")}
          >
            Cond. Limit
          </button>
        </div>
        {slType === "cond_limit" && (
          <input
            type="number"
            value={slLimitPrice}
            onChange={(e) => setSlLimitPrice(e.target.value)}
            placeholder="SL Limit Price"
            className="w-full px-2 py-1.5 rounded-lg bg-bg-alt text-xs font-mono outline-none mt-1 focus:ring-1 focus:ring-danger"
          />
        )}
      </div>

      {/* Advanced */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full text-[10px] text-muted hover:text-text flex items-center justify-center gap-1 mb-2"
      >
        <Settings className="w-3 h-3" />
        {showAdvanced ? "Hide" : "Show"} Advanced
      </button>

      {showAdvanced && (
        <div className="space-y-2 mb-2 p-2 rounded-lg bg-bg-alt">
          <div>
            <label className="text-[9px] text-muted block mb-0.5">SL Timeout (seconds)</label>
            <input
              type="number"
              value={slTimeout}
              onChange={(e) => setSlTimeout(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <label className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Trailing Take Profit</span>
            <input type="checkbox" checked={trailingTP} onChange={(e) => setTrailingTP(e.target.checked)} className="accent-success" />
          </label>
          <label className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Trailing Stop Loss</span>
            <input type="checkbox" checked={trailingSL} onChange={(e) => setTrailingSL(e.target.checked)} className="accent-danger" />
          </label>
          <label className="flex items-center justify-between text-[10px]">
            <span className="text-muted">Move to Breakeven</span>
            <input type="checkbox" checked={moveBreakeven} onChange={(e) => setMoveBreakeven(e.target.checked)} className="accent-accent" />
          </label>
          {(trailingTP || trailingSL) && (
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Trailing Offset (%)</label>
              <input
                type="number"
                value={trailingOffset}
                onChange={(e) => setTrailingOffset(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>
      )}

      {/* Approximate profit */}
      {approxProfit !== 0 && (
        <div className="mb-2 p-2 rounded-lg bg-bg-alt text-[10px] flex justify-between font-mono">
          <span className="text-muted flex items-center gap-1"><DollarSign className="w-3 h-3" /> Approx. Profit</span>
          <span className={cn("font-bold", approxProfit >= 0 ? "text-success" : "text-danger")}>
            {approxProfit >= 0 ? "+" : ""}${approxProfit.toFixed(2)}
          </span>
        </div>
      )}

      <button
        onClick={execute}
        disabled={!amt || (tpVolumeSum !== 100 && tpTargets.some(t => t.price))}
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
