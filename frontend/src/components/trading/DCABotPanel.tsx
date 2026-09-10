import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Bot, Plus, X, Play, Pause, Trash2, Settings, Brain, Zap, Shield } from "lucide-react";
import { rsi, macd, bollingerBands, type Candle } from "@/lib/indicators";

interface Ticker {
  price: number;
}

export interface DCABot {
  id: string;
  name: string;
  symbol: string;
  active: boolean;
  mode: "manual" | "ai_strategy" | "advanced";
  preset?: string;
  baseOrder: number;
  safetyOrder: number;
  maxSafetyOrders: number;
  priceDeviation: number;
  deviationStepMultiplier: number;
  orderSizeMultiplier: number;
  takeProfit: number;
  stopLoss: number;
  trailingTakeProfit: boolean;
  startCondition: "none" | "rsi" | "macd" | "bb";
  closeCondition: "none" | "rsi" | "macd" | "bb";
  multiPair: boolean;
  blacklist: string[];
  totalInvested: number;
  totalProfit: number;
  deals: number;
  createdAt: number;
}

interface Portfolio {
  cash: number;
}

const PRESETS = [
  { name: "Conservative", baseOrder: 50, safetyOrder: 100, maxSafetyOrders: 3, priceDeviation: 1, takeProfit: 2, stopLoss: 5, icon: Shield, color: "text-success" },
  { name: "Moderate", baseOrder: 100, safetyOrder: 200, maxSafetyOrders: 5, priceDeviation: 2, takeProfit: 3, stopLoss: 10, icon: Bot, color: "text-accent" },
  { name: "Aggressive", baseOrder: 200, safetyOrder: 400, maxSafetyOrders: 8, priceDeviation: 3, takeProfit: 5, stopLoss: 15, icon: Zap, color: "text-warning" },
  { name: "Moon Farming", baseOrder: 500, safetyOrder: 1000, maxSafetyOrders: 12, priceDeviation: 5, takeProfit: 10, stopLoss: 25, icon: Brain, color: "text-danger" },
];

export function DCABotPanel({
  symbol,
  ticker,
  bots,
  setBots,
  portfolio,
  candles,
}: {
  symbol: string;
  ticker?: Ticker;
  bots: DCABot[];
  setBots: (b: DCABot[]) => void;
  portfolio: Portfolio;
  candles: Candle[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<"manual" | "ai_strategy" | "advanced">("manual");
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [name, setName] = useState(`DCA ${symbol.replace("USDT", "")}`);
  const [baseOrder, setBaseOrder] = useState("100");
  const [safetyOrder, setSafetyOrder] = useState("200");
  const [maxSafety, setMaxSafety] = useState("5");
  const [priceDev, setPriceDev] = useState("2");
  const [devStepMult, setDevStepMult] = useState("1.5");
  const [orderSizeMult, setOrderSizeMult] = useState("1.5");
  const [takeProfit, setTakeProfit] = useState("3");
  const [stopLoss, setStopLoss] = useState("10");
  const [startCond, setStartCond] = useState<"none" | "rsi" | "macd" | "bb">("none");
  const [closeCond, setCloseCond] = useState<"none" | "rsi" | "macd" | "bb">("none");
  const [multiPair, setMultiPair] = useState(false);
  const [blacklist, setBlacklist] = useState("");
  const [backtestResult, setBacktestResult] = useState<null | {
    totalTrades: number;
    winRate: number;
    totalProfit: number;
    maxDrawdown: number;
    avgDeal: number;
  }>(null);

  // ── Summary box calculations ────────────────────────────────────
  const summary = useMemo(() => {
    const bo = parseFloat(baseOrder) || 0;
    const so = parseFloat(safetyOrder) || 0;
    const maxSO = parseInt(maxSafety) || 0;
    const dev = parseFloat(priceDev) || 0;
    const devMult = parseFloat(devStepMult) || 1;
    const sizeMult = parseFloat(orderSizeMult) || 1;

    let maxDrop = 0;
    let totalCapital = bo;
    let weightedPrice = bo;

    for (let i = 1; i <= maxSO; i++) {
      const deviation = dev * Math.pow(devMult, i - 1);
      maxDrop = Math.max(maxDrop, deviation);
      const orderSize = so * Math.pow(sizeMult, i - 1);
      totalCapital += orderSize;
    }

    const avgEntryDev = maxDrop * 0.6;
    const required = bo + so * maxSO * (sizeMult > 1 ? (Math.pow(sizeMult, maxSO) - 1) / (sizeMult - 1) : maxSO);

    return {
      maxDrop,
      avgEntryDev,
      required,
      available: portfolio.cash,
    };
  }, [baseOrder, safetyOrder, maxSafety, priceDev, devStepMult, orderSizeMult, portfolio.cash]);

  // ── Backtest ────────────────────────────────────────────────────
  const runBacktest = () => {
    if (candles.length < 50) return;
    const bo = parseFloat(baseOrder) || 100;
    const so = parseFloat(safetyOrder) || 200;
    const maxSO = parseInt(maxSafety) || 5;
    const dev = parseFloat(priceDev) || 2;
    const tp = parseFloat(takeProfit) || 3;
    const sl = parseFloat(stopLoss) || 10;
    const devMult = parseFloat(devStepMult) || 1.5;
    const sizeMult = parseFloat(orderSizeMult) || 1.5;

    let cash = 10000;
    let position = 0;
    let entryPrice = 0;
    let safetyCount = 0;
    let totalTrades = 0;
    let wins = 0;
    let totalProfit = 0;
    let maxDrawdown = 0;
    let peak = cash;

    for (let i = 20; i < candles.length; i++) {
      const c = candles[i];

      // Check start condition
      if (position === 0) {
        let shouldStart = true;
        if (startCond === "rsi") {
          const rsiVals = rsi(candles.slice(0, i + 1));
          shouldStart = rsiVals[rsiVals.length - 1] < 45;
        } else if (startCond === "macd") {
          const macdData = macd(candles.slice(0, i + 1));
          shouldStart = macdData.histogram[macdData.histogram.length - 1] > 0;
        } else if (startCond === "bb") {
          const bb = bollingerBands(candles.slice(0, i + 1));
          shouldStart = c.close < bb.lower[bb.lower.length - 1];
        }

        if (shouldStart && cash >= bo) {
          position = bo / c.close;
          entryPrice = c.close;
          cash -= bo;
          safetyCount = 0;
        }
      } else {
        // Check safety order
        if (safetyCount < maxSO && c.close < entryPrice * (1 - dev * Math.pow(devMult, safetyCount) / 100)) {
          const soSize = so * Math.pow(sizeMult, safetyCount);
          if (cash >= soSize) {
            const newShares = soSize / c.close;
            entryPrice = (entryPrice * position + c.close * newShares) / (position + newShares);
            position += newShares;
            cash -= soSize;
            safetyCount++;
          }
        }

        // Check TP
        if (c.close >= entryPrice * (1 + tp / 100)) {
          cash += position * c.close;
          const profit = (c.close - entryPrice) * position;
          totalProfit += profit;
          if (profit > 0) wins++;
          totalTrades++;
          position = 0;
          entryPrice = 0;
          safetyCount = 0;
        }

        // Check SL
        else if (c.close <= entryPrice * (1 - sl / 100)) {
          cash += position * c.close;
          const loss = (c.close - entryPrice) * position;
          totalProfit += loss;
          totalTrades++;
          position = 0;
          entryPrice = 0;
          safetyCount = 0;
        }
      }

      const equity = cash + position * c.close;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    if (position > 0) {
      cash += position * candles[candles.length - 1].close;
    }

    setBacktestResult({
      totalTrades,
      winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
      totalProfit: cash - 10000,
      maxDrawdown,
      avgDeal: totalTrades > 0 ? totalProfit / totalTrades : 0,
    });
  };

  const applyPreset = (presetName: string) => {
    const preset = PRESETS.find(p => p.name === presetName);
    if (!preset) return;
    setSelectedPreset(presetName);
    setBaseOrder(String(preset.baseOrder));
    setSafetyOrder(String(preset.safetyOrder));
    setMaxSafety(String(preset.maxSafetyOrders));
    setPriceDev(String(preset.priceDeviation));
    setTakeProfit(String(preset.takeProfit));
    setStopLoss(String(preset.stopLoss));
  };

  const createBot = () => {
    const bot: DCABot = {
      id: `dca-${Date.now()}`,
      name: name || `DCA ${symbol.replace("USDT", "")}`,
      symbol,
      active: true,
      mode,
      preset: selectedPreset || undefined,
      baseOrder: parseFloat(baseOrder) || 100,
      safetyOrder: parseFloat(safetyOrder) || 200,
      maxSafetyOrders: parseInt(maxSafety) || 5,
      priceDeviation: parseFloat(priceDev) || 2,
      deviationStepMultiplier: parseFloat(devStepMult) || 1.5,
      orderSizeMultiplier: parseFloat(orderSizeMult) || 1.5,
      takeProfit: parseFloat(takeProfit) || 3,
      stopLoss: parseFloat(stopLoss) || 10,
      trailingTakeProfit: false,
      startCondition: startCond,
      closeCondition: closeCond,
      multiPair,
      blacklist: blacklist ? blacklist.split(",").map(s => s.trim()) : [],
      totalInvested: 0,
      totalProfit: 0,
      deals: 0,
      createdAt: Date.now(),
    };
    const updated = [...bots, bot];
    setBots(updated);
    setShowCreate(false);
    setName(`DCA ${symbol.replace("USDT", "")}`);
    setSelectedPreset("");
    setBacktestResult(null);
  };

  const toggleBot = (id: string) => {
    const updated = bots.map(b => b.id === id ? { ...b, active: !b.active } : b);
    setBots(updated);
  };

  const deleteBot = (id: string) => {
    const updated = bots.filter(b => b.id !== id);
    setBots(updated);
  };

  const symbolBots = bots.filter(b => b.symbol === symbol || (b.multiPair && !b.blacklist.includes(symbol)));

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
          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-1">
            {(["ai_strategy", "manual", "advanced"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn("py-1.5 rounded text-[10px] font-medium",
                  mode === m ? "bg-accent/20 text-accent" : "bg-bg-card text-muted")}
              >
                {m === "ai_strategy" ? "AI Strategy" : m === "manual" ? "Manual" : "Advanced"}
              </button>
            ))}
          </div>

          {/* AI Strategy presets */}
          {mode === "ai_strategy" && (
            <div className="grid grid-cols-2 gap-1">
              {PRESETS.map(preset => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset.name)}
                    className={cn("p-2 rounded-lg text-left border transition-all",
                      selectedPreset === preset.name ? "border-accent bg-accent/10" : "border-white/5 bg-bg-card hover:border-white/10")}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={cn("w-3 h-3", preset.color)} />
                      <span className="text-[10px] font-semibold">{preset.name}</span>
                    </div>
                    <p className="text-[8px] text-muted">TP {preset.takeProfit}% · SL {preset.stopLoss}% · SO {preset.maxSafetyOrders}</p>
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label className="text-[9px] text-muted block mb-0.5">Bot Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Base Order ($)</label>
              <input type="number" value={baseOrder} onChange={(e) => setBaseOrder(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Safety Order ($)</label>
              <input type="number" value={safetyOrder} onChange={(e) => setSafetyOrder(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Max Safety Orders</label>
              <input type="number" value={maxSafety} onChange={(e) => setMaxSafety(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Price Deviation (%)</label>
              <input type="number" value={priceDev} onChange={(e) => setPriceDev(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Take Profit (%)</label>
              <input type="number" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
            <div>
              <label className="text-[9px] text-muted block mb-0.5">Stop Loss (%)</label>
              <input type="number" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
            </div>
          </div>

          {/* Advanced mode fields */}
          {mode === "advanced" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-muted block mb-0.5">Dev Step Multiplier</label>
                  <input type="number" value={devStepMult} onChange={(e) => setDevStepMult(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-muted block mb-0.5">Order Size Multiplier</label>
                  <input type="number" value={orderSizeMult} onChange={(e) => setOrderSizeMult(e.target.value)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs font-mono outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-muted block mb-0.5">Start Condition</label>
                  <select value={startCond} onChange={(e) => setStartCond(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none">
                    <option value="none">None</option>
                    <option value="rsi">RSI</option>
                    <option value="macd">MACD</option>
                    <option value="bb">Bollinger Bands</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-muted block mb-0.5">Close Condition</label>
                  <select value={closeCond} onChange={(e) => setCloseCond(e.target.value as any)} className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none">
                    <option value="none">None</option>
                    <option value="rsi">RSI</option>
                    <option value="macd">MACD</option>
                    <option value="bb">Bollinger Bands</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center justify-between text-[10px]">
                <span className="text-muted">Multi-Pair Mode</span>
                <input type="checkbox" checked={multiPair} onChange={(e) => setMultiPair(e.target.checked)} className="accent-accent" />
              </label>

              {multiPair && (
                <div>
                  <label className="text-[9px] text-muted block mb-0.5">Blacklist (comma-separated)</label>
                  <input value={blacklist} onChange={(e) => setBlacklist(e.target.value)} placeholder="PEPEUSDT,SHIBUSDT" className="w-full px-2 py-1.5 rounded-lg bg-bg-card text-xs outline-none" />
                </div>
              )}
            </>
          )}

          {/* Summary box */}
          <div className="p-2 rounded-lg bg-bg-card border border-white/5">
            <p className="text-[9px] font-semibold text-muted mb-1">Summary</p>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
              <div>
                <p className="text-muted text-[8px]">Max Drop</p>
                <p className="text-warning">{summary.maxDrop.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-muted text-[8px]">Avg Entry Dev</p>
                <p className="text-accent">{summary.avgEntryDev.toFixed(2)}%</p>
              </div>
              <div>
                <p className="text-muted text-[8px]">Required</p>
                <p className={cn(summary.required <= summary.available ? "text-success" : "text-danger")}>
                  ${summary.required.toFixed(0)}
                </p>
              </div>
            </div>
          </div>

          {/* Backtest */}
          <button
            onClick={runBacktest}
            disabled={candles.length < 50}
            className="w-full py-1.5 rounded-lg bg-bg-card text-[10px] font-medium text-accent hover:bg-accent/10 disabled:opacity-30"
          >
            Run Backtest
          </button>

          {backtestResult && (
            <div className="p-2 rounded-lg bg-bg-card border border-accent/20">
              <p className="text-[9px] font-semibold text-accent mb-1">Backtest Results</p>
              <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                <div><span className="text-muted">Trades:</span> <span className="font-medium">{backtestResult.totalTrades}</span></div>
                <div><span className="text-muted">Win Rate:</span> <span className={cn("font-medium", backtestResult.winRate >= 50 ? "text-success" : "text-danger")}>{backtestResult.winRate.toFixed(1)}%</span></div>
                <div><span className="text-muted">Profit:</span> <span className={cn("font-medium", backtestResult.totalProfit >= 0 ? "text-success" : "text-danger")}>${backtestResult.totalProfit.toFixed(2)}</span></div>
                <div><span className="text-muted">Max DD:</span> <span className="text-danger">{backtestResult.maxDrawdown.toFixed(1)}%</span></div>
                <div><span className="text-muted">Avg Deal:</span> <span className="font-medium">${backtestResult.avgDeal.toFixed(2)}</span></div>
              </div>
            </div>
          )}

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
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{bot.name}</span>
                  {bot.preset && <span className="text-[8px] px-1 py-0.5 rounded bg-accent/15 text-accent">{bot.preset}</span>}
                  {bot.multiPair && <span className="text-[8px] px-1 py-0.5 rounded bg-warning/15 text-warning">Multi</span>}
                </div>
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
              <div className="grid grid-cols-3 gap-1 text-[9px] font-mono">
                <div>
                  <p className="text-muted">Invested</p>
                  <p className="font-medium">${bot.totalInvested.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-muted">Profit</p>
                  <p className={cn("font-medium", bot.totalProfit >= 0 ? "text-success" : "text-danger")}>
                    ${bot.totalProfit.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Deals</p>
                  <p className="font-medium">{bot.deals}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-1 text-[9px] text-muted font-mono">
                <span>TP: {bot.takeProfit}%</span>
                <span>SL: {bot.stopLoss}%</span>
                <span>SO: {bot.maxSafetyOrders}</span>
                {bot.startCondition !== "none" && <span className="text-accent">Start: {bot.startCondition.toUpperCase()}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
