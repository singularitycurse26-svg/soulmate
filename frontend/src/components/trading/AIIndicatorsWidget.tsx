import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Brain, Activity, BarChart3, TrendingUp, Zap, AlertTriangle, Layers, Target } from "lucide-react";
import {
  rsi, macd, sma, ema, bollingerBands, stochastic, vwap, atr, adx,
  detectPattern, type Candle,
} from "@/lib/indicators";

interface Ticker {
  symbol: string;
  price: number;
  priceChangePercent: number;
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function AIIndicatorsWidget({ candles, ticker }: { candles: Candle[]; ticker?: Ticker }) {
  const analysis = useMemo(() => {
    if (candles.length < 30) return null;
    const closes = candles.map(c => c.close);
    const rsiVals = rsi(candles);
    const macdData = macd(candles);
    const sma7Vals = sma(closes, 7);
    const sma25Vals = sma(closes, 25);
    const ema9Vals = ema(closes, 9);
    const bbData = bollingerBands(candles);
    const vwapVals = vwap(candles);
    const stochData = stochastic(candles);
    const atrVals = atr(candles);
    const adxData = adx(candles);

    const lastRSI = rsiVals[rsiVals.length - 1];
    const lastMACD = macdData.histogram[macdData.histogram.length - 1];
    const lastSMA7 = sma7Vals[sma7Vals.length - 1];
    const lastSMA25 = sma25Vals[sma25Vals.length - 1];
    const lastEMA9 = ema9Vals[ema9Vals.length - 1];
    const lastPrice = closes[closes.length - 1];
    const lastVWAP = vwapVals[vwapVals.length - 1];
    const lastStochK = stochData.k[stochData.k.length - 1];
    const lastStochD = stochData.d[stochData.d.length - 1];
    const lastATR = atrVals[atrVals.length - 1];
    const lastADX = adxData.adx[adxData.adx.length - 1];
    const lastPlusDI = adxData.plusDI[adxData.plusDI.length - 1];
    const lastMinusDI = adxData.minusDI[adxData.minusDI.length - 1];

    const bbWidth = bbData.upper[bbData.upper.length - 1] - bbData.lower[bbData.lower.length - 1];
    const bbPosition = bbWidth > 0 ? (lastPrice - bbData.lower[bbData.lower.length - 1]) / bbWidth : 0.5;

    const trendUp = lastSMA7 > lastSMA25;
    const trendStrength = Math.abs((lastSMA7 - lastSMA25) / lastSMA25) * 100;
    const momentum = ((lastPrice - closes[closes.length - 10]) / closes[closes.length - 10]) * 100;

    const recentReturns: number[] = [];
    for (let i = Math.max(1, candles.length - 20); i < candles.length; i++) {
      recentReturns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const avgReturn = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;
    const variance = recentReturns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / recentReturns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(365) * 100;

    const recentCandles = candles.slice(-5);
    const avgVol = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
    const highVolCandles = recentCandles.filter(c => c.volume > avgVol * 1.5);
    const smartMoney = highVolCandles.length >= 2;

    const vwapDeviation = ((lastPrice - lastVWAP) / lastVWAP) * 100;

    // Pattern detection
    const lastPattern = detectPattern(candles, candles.length - 1);
    const prevPattern = detectPattern(candles, candles.length - 2);

    // Support/resistance from recent highs/lows
    const recentHighs = candles.slice(-50).map(c => c.high).sort((a, b) => b - a);
    const recentLows = candles.slice(-50).map(c => c.low).sort((a, b) => a - b);
    const resistance1 = recentHighs[0];
    const resistance2 = recentHighs[2] || recentHighs[0];
    const support1 = recentLows[0];
    const support2 = recentLows[2] || recentLows[0];

    // Signal generation with confluence
    const signals: { name: string; signal: "buy" | "sell" | "neutral"; weight: number }[] = [];

    // RSI
    if (lastRSI < 30) signals.push({ name: "RSI", signal: "buy", weight: 2 });
    else if (lastRSI < 45) signals.push({ name: "RSI", signal: "buy", weight: 1 });
    else if (lastRSI > 70) signals.push({ name: "RSI", signal: "sell", weight: 2 });
    else if (lastRSI > 55) signals.push({ name: "RSI", signal: "sell", weight: 1 });
    else signals.push({ name: "RSI", signal: "neutral", weight: 0 });

    // MACD
    if (lastMACD > 0) signals.push({ name: "MACD", signal: "buy", weight: 1 });
    else signals.push({ name: "MACD", signal: "sell", weight: 1 });

    // SMA trend
    if (trendUp) signals.push({ name: "SMA Trend", signal: "buy", weight: 1 });
    else signals.push({ name: "SMA Trend", signal: "sell", weight: 1 });

    // Momentum
    if (momentum > 0.02) signals.push({ name: "Momentum", signal: "buy", weight: 1 });
    else if (momentum < -0.02) signals.push({ name: "Momentum", signal: "sell", weight: 1 });
    else signals.push({ name: "Momentum", signal: "neutral", weight: 0 });

    // BB Position
    if (bbPosition < 0.2) signals.push({ name: "BB", signal: "buy", weight: 1 });
    else if (bbPosition > 0.8) signals.push({ name: "BB", signal: "sell", weight: 1 });
    else signals.push({ name: "BB", signal: "neutral", weight: 0 });

    // Stochastic
    if (lastStochK < 20) signals.push({ name: "Stochastic", signal: "buy", weight: 1 });
    else if (lastStochK > 80) signals.push({ name: "Stochastic", signal: "sell", weight: 1 });
    else signals.push({ name: "Stochastic", signal: "neutral", weight: 0 });

    // VWAP
    if (vwapDeviation < -1) signals.push({ name: "VWAP", signal: "buy", weight: 1 });
    else if (vwapDeviation > 1) signals.push({ name: "VWAP", signal: "sell", weight: 1 });
    else signals.push({ name: "VWAP", signal: "neutral", weight: 0 });

    // ADX
    if (lastADX > 25 && lastPlusDI > lastMinusDI) signals.push({ name: "ADX", signal: "buy", weight: 1 });
    else if (lastADX > 25 && lastMinusDI > lastPlusDI) signals.push({ name: "ADX", signal: "sell", weight: 1 });
    else signals.push({ name: "ADX", signal: "neutral", weight: 0 });

    // Smart money
    if (smartMoney && trendUp) signals.push({ name: "Smart Money", signal: "buy", weight: 1 });
    else if (smartMoney && !trendUp) signals.push({ name: "Smart Money", signal: "sell", weight: 1 });
    else signals.push({ name: "Smart Money", signal: "neutral", weight: 0 });

    // Pattern
    if (lastPattern === "bullish_engulfing" || lastPattern === "hammer" || lastPattern === "bullish_harami") {
      signals.push({ name: "Pattern", signal: "buy", weight: 2 });
    } else if (lastPattern === "bearish_engulfing" || lastPattern === "shooting_star" || lastPattern === "bearish_harami") {
      signals.push({ name: "Pattern", signal: "sell", weight: 2 });
    } else {
      signals.push({ name: "Pattern", signal: "neutral", weight: 0 });
    }

    const buyScore = signals.filter(s => s.signal === "buy").reduce((sum, s) => sum + s.weight, 0);
    const sellScore = signals.filter(s => s.signal === "sell").reduce((sum, s) => sum + s.weight, 0);
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const score = buyScore - sellScore;
    const maxScore = 12;

    let signal: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL" = "NEUTRAL";
    if (score >= 5) signal = "STRONG BUY";
    else if (score >= 2) signal = "BUY";
    else if (score <= -5) signal = "STRONG SELL";
    else if (score <= -2) signal = "SELL";

    const confluence = totalWeight > 0 ? Math.abs(score) / maxScore * 100 : 0;

    return {
      rsi: lastRSI, macdHist: lastMACD, trendUp, trendStrength, momentum,
      volatility, bbPosition, smartMoney, signal, score,
      stochK: lastStochK, stochD: lastStochD,
      vwap: lastVWAP, vwapDeviation,
      atr: lastATR, adx: lastADX, plusDI: lastPlusDI, minusDI: lastMinusDI,
      lastPattern, prevPattern,
      resistance1, resistance2, support1, support2,
      signals, confluence,
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

  const patternLabels: Record<string, { label: string; color: string }> = {
    bullish_engulfing: { label: "Bullish Engulfing", color: "text-success" },
    bearish_engulfing: { label: "Bearish Engulfing", color: "text-danger" },
    doji: { label: "Doji", color: "text-warning" },
    hammer: { label: "Hammer", color: "text-success" },
    shooting_star: { label: "Shooting Star", color: "text-danger" },
    bullish_harami: { label: "Bullish Harami", color: "text-success" },
    bearish_harami: { label: "Bearish Harami", color: "text-danger" },
    none: { label: "None", color: "text-muted" },
  };

  const patternInfo = patternLabels[analysis.lastPattern] || patternLabels.none;

  return (
    <div className="card p-3">
      <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-3">
        <Brain className="w-3.5 h-3.5 text-accent" />
        AI Indicators
      </h4>

      {/* Signal with confluence meter */}
      <div className={cn("p-3 rounded-xl text-center mb-3", signalBg)}>
        <p className="text-[9px] text-muted mb-0.5">AI Signal</p>
        <p className={cn("text-base font-bold", signalColor)}>{analysis.signal}</p>
        <p className="text-[9px] text-muted">Score: {analysis.score > 0 ? "+" : ""}{analysis.score}/12</p>
        {/* Confluence bar */}
        <div className="mt-2">
          <div className="flex justify-between text-[8px] text-muted mb-0.5">
            <span>Confluence</span>
            <span>{analysis.confluence.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-bg-alt rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full", analysis.score >= 0 ? "bg-success" : "bg-danger")}
              style={{ width: `${analysis.confluence}%` }}
            />
          </div>
        </div>
      </div>

      {/* Individual signal chips */}
      <div className="flex flex-wrap gap-1 mb-3">
        {analysis.signals.map((s, i) => (
          <span
            key={i}
            className={cn("px-1.5 py-0.5 rounded text-[9px] font-mono",
              s.signal === "buy" ? "bg-success/15 text-success" :
              s.signal === "sell" ? "bg-danger/15 text-danger" : "bg-bg-alt text-muted")}
          >
            {s.name}
          </span>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Activity className="w-3 h-3" /> RSI</span>
          <span className={cn("font-bold font-mono", analysis.rsi < 30 ? "text-success" : analysis.rsi > 70 ? "text-danger" : "text-text")}>
            {analysis.rsi.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><BarChart3 className="w-3 h-3" /> MACD</span>
          <span className={cn("font-bold font-mono", analysis.macdHist >= 0 ? "text-success" : "text-danger")}>
            {analysis.macdHist >= 0 ? "+" : ""}{analysis.macdHist.toFixed(4)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><TrendingUp className="w-3 h-3" /> ADX</span>
          <span className={cn("font-bold font-mono", analysis.adx > 25 ? "text-warning" : "text-text")}>
            {analysis.adx.toFixed(1)} {analysis.plusDI > analysis.minusDI ? "↑" : "↓"}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Stochastic</span>
          <span className={cn("font-bold font-mono", analysis.stochK < 20 ? "text-success" : analysis.stochK > 80 ? "text-danger" : "text-text")}>
            K:{analysis.stochK.toFixed(1)} D:{analysis.stochD.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Layers className="w-3 h-3" /> VWAP Dev</span>
          <span className={cn("font-bold font-mono", analysis.vwapDeviation < 0 ? "text-success" : "text-danger")}>
            {analysis.vwapDeviation >= 0 ? "+" : ""}{analysis.vwapDeviation.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Trend</span>
          <span className={cn("font-bold", analysis.trendUp ? "text-success" : "text-danger")}>
            {analysis.trendUp ? "Bullish" : "Bearish"} ({analysis.trendStrength.toFixed(2)}%)
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Zap className="w-3 h-3" /> Momentum</span>
          <span className={cn("font-bold font-mono", analysis.momentum >= 0 ? "text-success" : "text-danger")}>
            {analysis.momentum >= 0 ? "+" : ""}{analysis.momentum.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Volatility</span>
          <span className="font-bold font-mono text-text">{analysis.volatility.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Activity className="w-3 h-3" /> ATR</span>
          <span className="font-bold font-mono text-text">{analysis.atr.toFixed(4)}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Layers className="w-3 h-3" /> BB Position</span>
          <span className={cn("font-bold font-mono", analysis.bbPosition < 0.2 ? "text-success" : analysis.bbPosition > 0.8 ? "text-danger" : "text-text")}>
            {(analysis.bbPosition * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Brain className="w-3 h-3" /> Smart Money</span>
          <span className={cn("font-bold", analysis.smartMoney ? "text-warning" : "text-muted")}>
            {analysis.smartMoney ? "Detected" : "None"}
          </span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted flex items-center gap-1"><Target className="w-3 h-3" /> Pattern</span>
          <span className={cn("font-bold", patternInfo.color)}>{patternInfo.label}</span>
        </div>
      </div>

      {/* Support / Resistance */}
      <div className="mt-3 p-2 rounded-lg bg-bg-alt">
        <p className="text-[9px] font-semibold text-muted mb-1">Key Levels</p>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <p className="text-danger">R1: {formatPrice(analysis.resistance1)}</p>
            <p className="text-danger">R2: {formatPrice(analysis.resistance2)}</p>
          </div>
          <div>
            <p className="text-success">S1: {formatPrice(analysis.support1)}</p>
            <p className="text-success">S2: {formatPrice(analysis.support2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
