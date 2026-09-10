// ═══════════════════════════════════════════════════════════════════
// Technical Indicators Library — Pro Trading Suite
// All indicators are pure functions operating on Candle arrays.
// ═══════════════════════════════════════════════════════════════════

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
}

// ── Simple Moving Average ──────────────────────────────────────────
export function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push(sum / period);
  }
  return result;
}

// ── Exponential Moving Average ──────────────────────────────────────
export function ema(values: number[], period: number): number[] {
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

// ── Relative Strength Index ────────────────────────────────────────
export function rsi(candles: Candle[], period: number = 14): number[] {
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

// ── MACD ───────────────────────────────────────────────────────────
export function macd(candles: Candle[], fast: number = 12, slow: number = 26, signal: number = 9) {
  const closes = candles.map(c => c.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = ema(macdLine, signal);
  const histogram = macdLine.map((m, i) => m - signalLine[i]);
  return { macdLine, signalLine, histogram };
}

// ── Bollinger Bands ────────────────────────────────────────────────
export function bollingerBands(candles: Candle[], period: number = 20, stdDev: number = 2) {
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

// ── Stochastic Oscillator ─────────────────────────────────────────
export function stochastic(candles: Candle[], kPeriod: number = 14, dPeriod: number = 3) {
  const kValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) { kValues.push(NaN); continue; }
    let highestHigh = -Infinity, lowestLow = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highestHigh) highestHigh = candles[j].high;
      if (candles[j].low < lowestLow) lowestLow = candles[j].low;
    }
    const range = highestHigh - lowestLow;
    kValues.push(range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100);
  }
  const dValues = sma(kValues.map(v => isNaN(v) ? 0 : v), dPeriod);
  return { k: kValues, d: dValues };
}

// ── VWAP (Volume Weighted Average Price) ───────────────────────────
export function vwap(candles: Candle[]): number[] {
  const result: number[] = [];
  let cumVol = 0, cumTypVol = 0;
  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumVol += c.volume;
    cumTypVol += typicalPrice * c.volume;
    result.push(cumVol > 0 ? cumTypVol / cumVol : c.close);
  }
  return result;
}

// ── ATR (Average True Range) ────────────────────────────────────────
export function atr(candles: Candle[], period: number = 14): number[] {
  const result: number[] = [];
  const trValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trValues.push(candles[0].high - candles[0].low); }
    else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close),
      );
      trValues.push(tr);
    }
  }
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    if (i === period - 1) {
      result.push(trValues.slice(0, period).reduce((a, b) => a + b, 0) / period);
    } else {
      const prev = result[i - 1];
      result.push((prev * (period - 1) + trValues[i]) / period);
    }
  }
  return result;
}

// ── ADX (Average Directional Index) ────────────────────────────────
export function adx(candles: Candle[], period: number = 14): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ));
  }
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  const adxValues: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { plusDI.push(NaN); minusDI.push(NaN); adxValues.push(NaN); continue; }
    let trSum = 0, plusDMSum = 0, minusDMSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      trSum += tr[j];
      plusDMSum += plusDM[j];
      minusDMSum += minusDM[j];
    }
    const pdi = trSum > 0 ? (plusDMSum / trSum) * 100 : 0;
    const mdi = trSum > 0 ? (minusDMSum / trSum) * 100 : 0;
    plusDI.push(pdi);
    minusDI.push(mdi);
    const dx = pdi + mdi > 0 ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0;
    if (i < period * 2) { adxValues.push(NaN); continue; }
    let dxSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const p = plusDI[j], m = minusDI[j];
      dxSum += p + m > 0 ? Math.abs(p - m) / (p + m) * 100 : 0;
    }
    adxValues.push(dxSum / period);
  }
  return { adx: adxValues, plusDI, minusDI };
}

// ── Heikin-Ashi Candles ───────────────────────────────────────────
export function heikinAshi(candles: Candle[]): Candle[] {
  const result: Candle[] = [];
  let prevClose = candles[0]?.close || 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevClose + result[i - 1].open) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume });
    prevClose = haClose;
  }
  return result;
}

// ── Candlestick Pattern Detection ─────────────────────────────────
export type PatternType =
  | "bullish_engulfing" | "bearish_engulfing"
  | "doji" | "hammer" | "shooting_star"
  | "bullish_harami" | "bearish_harami"
  | "none";

export function detectPattern(candles: Candle[], index: number): PatternType {
  if (index < 1) return "none";
  const c = candles[index];
  const prev = candles[index - 1];
  const body = Math.abs(c.close - c.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const range = c.high - c.low || 0.0001;
  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;

  // Doji
  if (body / range < 0.1) return "doji";

  // Hammer
  if (lowerWick > body * 2 && upperWick < body * 0.5 && c.close > c.open) return "hammer";

  // Shooting star
  if (upperWick > body * 2 && lowerWick < body * 0.5 && c.close < c.open) return "shooting_star";

  // Bullish engulfing
  if (prev.close < prev.open && c.close > c.open && c.close > prev.open && c.open < prev.close && body > prevBody) {
    return "bullish_engulfing";
  }

  // Bearish engulfing
  if (prev.close > prev.open && c.close < c.open && c.close < prev.open && c.open > prev.close && body > prevBody) {
    return "bearish_engulfing";
  }

  // Bullish harami
  if (prev.close < prev.open && c.close > c.open && c.open > prev.close && c.close < prev.open && body < prevBody) {
    return "bullish_harami";
  }

  // Bearish harami
  if (prev.close > prev.open && c.close < c.open && c.open < prev.close && c.close > prev.open && body < prevBody) {
    return "bearish_harami";
  }

  return "none";
}

// ── Value Area Calculation (70% of volume) ────────────────────────
export function valueArea(candles: Candle[], bins: number = 20): {
  levels: { price: number; volume: number }[];
  poc: { price: number; volume: number };
  vah: number;
  val: number;
} {
  if (candles.length === 0) return { levels: [], poc: { price: 0, volume: 0 }, vah: 0, val: 0 };
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const binSize = (maxP - minP) / bins || 1;
  const priceMap: Record<string, number> = {};
  for (const c of candles) {
    const binIdx = Math.floor(((c.high + c.low) / 2 - minP) / binSize);
    const key = (minP + binIdx * binSize).toFixed(4);
    priceMap[key] = (priceMap[key] || 0) + c.volume;
  }
  const levels = Object.entries(priceMap)
    .map(([price, volume]) => ({ price: parseFloat(price), volume }))
    .sort((a, b) => b.volume - a.volume);
  const poc = levels[0] || { price: 0, volume: 0 };
  const totalVol = levels.reduce((s, l) => s + l.volume, 0);
  const targetVol = totalVol * 0.7;
  const sortedByPrice = [...levels].sort((a, b) => a.price - b.price);
  const pocIdx = sortedByPrice.findIndex(l => l.price === poc.price);
  let cumVol = poc.volume;
  let lowIdx = pocIdx - 1;
  let highIdx = pocIdx + 1;
  while (cumVol < targetVol && (lowIdx >= 0 || highIdx < sortedByPrice.length)) {
    const lowVol = lowIdx >= 0 ? sortedByPrice[lowIdx].volume : 0;
    const highVol = highIdx < sortedByPrice.length ? sortedByPrice[highIdx].volume : 0;
    if (highVol >= lowVol && highIdx < sortedByPrice.length) {
      cumVol += highVol;
      highIdx++;
    } else if (lowIdx >= 0) {
      cumVol += lowVol;
      lowIdx--;
    } else break;
  }
  return {
    levels: sortedByPrice,
    poc,
    vah: highIdx < sortedByPrice.length ? sortedByPrice[highIdx].price : maxP,
    val: lowIdx >= 0 ? sortedByPrice[lowIdx].price : minP,
  };
}

// ── Iceberg Order Detection ───────────────────────────────────────
export function detectIcebergs(trades: { price: number; qty: number; time: number; isBuyerMaker: boolean }[]): {
  price: number;
  confidence: number;
  count: number;
}[] {
  const levelMap: Record<string, { count: number; totalQty: number; times: number[] }> = {};
  for (const t of trades) {
    const key = t.price.toFixed(4);
    if (!levelMap[key]) levelMap[key] = { count: 0, totalQty: 0, times: [] };
    levelMap[key].count++;
    levelMap[key].totalQty += t.qty;
    levelMap[key].times.push(t.time);
  }
  const icebergs: { price: number; confidence: number; count: number }[] = [];
  for (const [price, data] of Object.entries(levelMap)) {
    if (data.count < 5) continue;
    const avgQty = data.totalQty / data.count;
    const qtyVariance = data.times.length > 1
      ? Math.sqrt(data.times.reduce((s, t, i) => i === 0 ? s : s + (t - data.times[i - 1]) ** 2, 0) / data.times.length)
      : 0;
    const confidence = Math.min(100, (data.count / 10) * 50 + (avgQty > 0.1 ? 30 : 0) + (qtyVariance < 1000 ? 20 : 0));
    if (confidence > 40) {
      icebergs.push({ price: parseFloat(price), confidence, count: data.count });
    }
  }
  return icebergs.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

// ── Footprint Data (bid/ask volume per price level per candle) ────
export interface FootprintCell {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  total: number;
  isImbalance: boolean;
  imbalanceSide: "buy" | "sell" | null;
  isPOC: boolean;
  isMaxVolume: boolean;
  isAbsorption: boolean;
}

export interface FootprintCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  cells: FootprintCell[];
  totalDelta: number;
  totalVolume: number;
  pocPrice: number;
  isFinishedAuctionTop: boolean;
  isFinishedAuctionBottom: boolean;
  hasStacking: boolean;
  stackingSide: "buy" | "sell" | null;
  stackingCount: number;
}

export function buildFootprint(
  candle: Candle,
  trades: { price: number; qty: number; isBuyerMaker: boolean; time: number }[],
  imbalanceRatio: number = 3,
): FootprintCandle {
  const priceMap: Record<string, { buy: number; sell: number }> = {};
  for (const t of trades) {
    if (t.time < candle.time || t.time > candle.time + 86400000) continue;
    const key = t.price.toFixed(4);
    if (!priceMap[key]) priceMap[key] = { buy: 0, sell: 0 };
    if (t.isBuyerMaker) priceMap[key].sell += t.qty;
    else priceMap[key].buy += t.qty;
  }

  const prices = Object.keys(priceMap).map(Number).sort((a, b) => a - b);
  let maxVol = 0;
  let pocPrice = candle.close;

  const cells: FootprintCell[] = prices.map(price => {
    const { buy, sell } = priceMap[price.toFixed(4)];
    const delta = buy - sell;
    const total = buy + sell;
    if (total > maxVol) { maxVol = total; pocPrice = price; }
    const ratio = total > 0 ? Math.max(buy, sell) / Math.min(buy, sell || 0.0001) : 1;
    const isImbalance = ratio >= imbalanceRatio && Math.min(buy, sell) > 0;
    return {
      price, buyVolume: buy, sellVolume: sell, delta, total,
      isImbalance,
      imbalanceSide: isImbalance ? (buy > sell ? "buy" : "sell") : null,
      isPOC: false,
      isMaxVolume: false,
      isAbsorption: false,
    };
  });

  // Mark POC and max volume
  cells.forEach(c => {
    c.isPOC = c.price === pocPrice;
    c.isMaxVolume = c.total === maxVol;
  });

  // Absorption: large volume but small price move
  const avgVol = cells.reduce((s, c) => s + c.total, 0) / (cells.length || 1);
  cells.forEach(c => {
    if (c.total > avgVol * 2 && Math.abs(c.delta) < avgVol * 0.3) {
      c.isAbsorption = true;
    }
  });

  // Stacking: consecutive imbalances
  let maxStack = 0;
  let curStack = 0;
  let stackSide: "buy" | "sell" | null = null;
  let finalStackSide: "buy" | "sell" | null = null;
  for (const c of cells) {
    if (c.isImbalance) {
      if (stackSide === c.imbalanceSide) {
        curStack++;
      } else {
        curStack = 1;
        stackSide = c.imbalanceSide;
      }
      if (curStack > maxStack) {
        maxStack = curStack;
        finalStackSide = stackSide;
      }
    } else {
      curStack = 0;
      stackSide = null;
    }
  }

  // Auction analysis: zero at edges = finished
  const topCell = cells[cells.length - 1];
  const bottomCell = cells[0];
  const isFinishedTop = topCell ? (topCell.buyVolume === 0 || topCell.sellVolume === 0) : true;
  const isFinishedBottom = bottomCell ? (bottomCell.buyVolume === 0 || bottomCell.sellVolume === 0) : true;

  return {
    time: candle.time,
    open: candle.open, high: candle.high, low: candle.low, close: candle.close,
    cells,
    totalDelta: cells.reduce((s, c) => s + c.delta, 0),
    totalVolume: cells.reduce((s, c) => s + c.total, 0),
    pocPrice,
    isFinishedAuctionTop: isFinishedTop,
    isFinishedAuctionBottom: isFinishedBottom,
    hasStacking: maxStack >= 3,
    stackingSide: finalStackSide,
    stackingCount: maxStack,
  };
}

// ── Liquidity Heatmap (Bookmap-style) ─────────────────────────────
export interface HeatmapSnapshot {
  time: number;
  levels: { price: number; bidQty: number; askQty: number }[];
}

export function buildHeatmapData(
  snapshots: HeatmapSnapshot[],
  minPrice: number,
  maxPrice: number,
  bins: number = 50,
): { time: number; binIndex: number; intensity: number; side: "bid" | "ask" }[] {
  const result: { time: number; binIndex: number; intensity: number; side: "bid" | "ask" }[] = [];
  const binSize = (maxPrice - minPrice) / bins || 1;
  for (const snap of snapshots) {
    const binMap: Record<number, { bid: number; ask: number }> = {};
    for (const lvl of snap.levels) {
      const binIdx = Math.floor((lvl.price - minPrice) / binSize);
      if (!binMap[binIdx]) binMap[binIdx] = { bid: 0, ask: 0 };
      binMap[binIdx].bid += lvl.bidQty;
      binMap[binIdx].ask += lvl.askQty;
    }
    for (const [binIdx, { bid, ask }] of Object.entries(binMap)) {
      const total = bid + ask;
      if (total > 0) {
        result.push({
          time: snap.time,
          binIndex: parseInt(binIdx),
          intensity: total,
          side: bid > ask ? "bid" : "ask",
        });
      }
    }
  }
  return result;
}

// ── Volume Dots (Bookmap-style trade visualization) ───────────────
export interface VolumeDot {
  time: number;
  price: number;
  volume: number;
  buyVolume: number;
  sellVolume: number;
  isBuy: boolean;
  size: number;
}

export function buildVolumeDots(
  trades: { price: number; qty: number; isBuyerMaker: boolean; time: number }[],
  bucketMs: number = 5000,
): VolumeDot[] {
  const buckets: Record<string, { time: number; price: number; buy: number; sell: number; count: number }> = {};
  for (const t of trades) {
    const bucket = Math.floor(t.time / bucketMs) * bucketMs;
    const key = `${bucket}-${t.price.toFixed(4)}`;
    if (!buckets[key]) buckets[key] = { time: bucket, price: t.price, buy: 0, sell: 0, count: 0 };
    if (t.isBuyerMaker) buckets[key].sell += t.qty;
    else buckets[key].buy += t.qty;
    buckets[key].count++;
  }
  const maxVol = Math.max(...Object.values(buckets).map(b => b.buy + b.sell), 0.001);
  return Object.values(buckets).map(b => ({
    time: b.time,
    price: b.price,
    volume: b.buy + b.sell,
    buyVolume: b.buy,
    sellVolume: b.sell,
    isBuy: b.buy > b.sell,
    size: (b.buy + b.sell) / maxVol,
  }));
}

// ── Absorption Detection ─────────────────────────────────────────
export function detectAbsorption(
  trades: { price: number; qty: number; isBuyerMaker: boolean; time: number }[],
  orderBook: { bids: { price: number; qty: number }[]; asks: { price: number; qty: number }[] },
): { price: number; side: "buy" | "sell"; aggressedVolume: number; passiveLiquidity: number; confidence: number }[] {
  const result: { price: number; side: "buy" | "sell"; aggressedVolume: number; passiveLiquidity: number; confidence: number }[] = [];
  const tradeMap: Record<string, { buy: number; sell: number }> = {};
  for (const t of trades) {
    const key = t.price.toFixed(4);
    if (!tradeMap[key]) tradeMap[key] = { buy: 0, sell: 0 };
    if (t.isBuyerMaker) tradeMap[key].sell += t.qty;
    else tradeMap[key].buy += t.qty;
  }
  for (const bid of orderBook.bids) {
    const key = bid.price.toFixed(4);
    const traded = tradeMap[key];
    if (traded && traded.sell > bid.qty * 0.5 && traded.sell > 1) {
      const confidence = Math.min(100, (traded.sell / (bid.qty || 0.001)) * 50);
      result.push({
        price: bid.price, side: "sell",
        aggressedVolume: traded.sell, passiveLiquidity: bid.qty, confidence,
      });
    }
  }
  for (const ask of orderBook.asks) {
    const key = ask.price.toFixed(4);
    const traded = tradeMap[key];
    if (traded && traded.buy > ask.qty * 0.5 && traded.buy > 1) {
      const confidence = Math.min(100, (traded.buy / (ask.qty || 0.001)) * 50);
      result.push({
        price: ask.price, side: "buy",
        aggressedVolume: traded.buy, passiveLiquidity: ask.qty, confidence,
      });
    }
  }
  return result.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}
