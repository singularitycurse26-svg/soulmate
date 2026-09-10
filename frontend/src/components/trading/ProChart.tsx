import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { sma, ema, rsi, macd, bollingerBands, stochastic, vwap, atr, adx, heikinAshi, detectPattern, type Candle, type PatternType } from "@/lib/indicators";

export interface ChartIndicators {
  sma: boolean; ema: boolean; bollinger: boolean; rsi: boolean;
  macd: boolean; volume: boolean; stochastic: boolean; vwap: boolean;
  atr: boolean; adx: boolean;
}

export type ChartType = "candle" | "line" | "area" | "heikin_ashi";

export interface Drawing {
  id: string;
  type: "trendline" | "horizontal" | "fibonacci" | "rectangle";
  points: { x: number; y: number }[];
  color: string;
}

interface ProChartProps {
  candles: Candle[];
  indicators: ChartIndicators;
  chartType: ChartType;
  height?: number;
  showRSI: boolean;
  showMACD: boolean;
  drawings: Drawing[];
  onDrawingsChange: (d: Drawing[]) => void;
  drawMode: string | null;
  symbol: string;
}

const PATTERN_LABELS: Record<PatternType, { label: string; color: string }> = {
  bullish_engulfing: { label: "Bull Engulf", color: "#00e676" },
  bearish_engulfing: { label: "Bear Engulf", color: "#ff1744" },
  doji: { label: "Doji", color: "#f59e0b" },
  hammer: { label: "Hammer", color: "#00e676" },
  shooting_star: { label: "Shooting Star", color: "#ff1744" },
  bullish_harami: { label: "Bull Harami", color: "#00e676" },
  bearish_harami: { label: "Bear Harami", color: "#ff1744" },
  none: { label: "", color: "" },
};

export function ProChart({
  candles, indicators, chartType, height = 380,
  showRSI, showMACD, drawings, onDrawingsChange, drawMode, symbol,
}: ProChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rsiCanvasRef = useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number; index: number } | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  // Transform candles for chart type
  const displayCandles = useMemo(() => {
    if (chartType === "heikin_ashi") return heikinAshi(candles);
    return candles;
  }, [candles, chartType]);

  // Calculate indicators
  const sma7 = useMemo(() => displayCandles.length > 7 ? sma(displayCandles.map(c => c.close), 7) : [], [displayCandles]);
  const sma25 = useMemo(() => displayCandles.length > 25 ? sma(displayCandles.map(c => c.close), 25) : [], [displayCandles]);
  const ema9 = useMemo(() => displayCandles.length > 9 ? ema(displayCandles.map(c => c.close), 9) : [], [displayCandles]);
  const bb = useMemo(() => displayCandles.length > 20 ? bollingerBands(displayCandles) : null, [displayCandles]);
  const vwapVals = useMemo(() => displayCandles.length > 0 ? vwap(displayCandles) : [], [displayCandles]);
  const stoch = useMemo(() => displayCandles.length > 14 ? stochastic(displayCandles) : null, [displayCandles]);
  const rsiValues = useMemo(() => displayCandles.length > 14 ? rsi(displayCandles) : [], [displayCandles]);
  const macdData = useMemo(() => displayCandles.length > 26 ? macd(displayCandles) : null, [displayCandles]);

  // ── Coordinate helpers ──────────────────────────────────────────
  const getChartBounds = (w: number, h: number, volH: number) => {
    const padR = 65, padL = 8, padT = 10;
    return {
      padR, padL, padT,
      chartH: h - padT - 20 - volH,
      chartW: w - padL - padR,
    };
  };

  const priceToY = (price: number, minP: number, pRange: number, chartH: number, padT: number) =>
    padT + ((minP + pRange - price) / pRange) * chartH;

  const indexToX = (i: number, candleW: number, padL: number) =>
    padL + i * candleW + candleW / 2;

  // ── Main chart drawing ──────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displayCandles.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = height;
    const volH = indicators.volume ? 60 : 0;
    const { padR, padL, padT, chartH, chartW } = getChartBounds(w, h, volH);

    ctx.clearRect(0, 0, w, h);

    const prices = displayCandles.flatMap(c => [c.high, c.low]);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    minP -= range * 0.08;
    maxP += range * 0.08;
    const pRange = maxP - minP;

    const candleW = chartW / displayCandles.length;
    const bodyW = Math.max(1.5, candleW * 0.65);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i <= 5; i++) {
      const y = padT + (chartH / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      const price = maxP - (pRange / 5) * i;
      ctx.fillText(price.toFixed(price >= 1000 ? 0 : 2), padL + chartW + 4, y + 3);
    }

    // Bollinger Bands
    if (indicators.bollinger && bb) {
      ctx.fillStyle = "rgba(99, 102, 241, 0.06)";
      ctx.beginPath();
      for (let i = 0; i < bb.upper.length; i++) {
        if (isNaN(bb.upper[i])) continue;
        const x = indexToX(i, candleW, padL);
        const y = priceToY(bb.upper[i], minP, pRange, chartH, padT);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = bb.lower.length - 1; i >= 0; i--) {
        if (isNaN(bb.lower[i])) continue;
        const x = indexToX(i, candleW, padL);
        const y = priceToY(bb.lower[i], minP, pRange, chartH, padT);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      [bb.upper, bb.middle, bb.lower].forEach(band => {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < band.length; i++) {
          if (isNaN(band[i])) continue;
          const x = indexToX(i, candleW, padL);
          const y = priceToY(band[i], minP, pRange, chartH, padT);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // VWAP
    if (indicators.vwap && vwapVals.length === displayCandles.length) {
      ctx.strokeStyle = "#e879f9";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < vwapVals.length; i++) {
        const x = indexToX(i, candleW, padL);
        const y = priceToY(vwapVals[i], minP, pRange, chartH, padT);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e879f9";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("VWAP", padL + 4, padT + 10);
    }

    // SMA lines
    if (indicators.sma) {
      if (sma7.length === displayCandles.length) {
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < sma7.length; i++) {
          if (isNaN(sma7[i])) continue;
          const x = indexToX(i, candleW, padL);
          const y = priceToY(sma7[i], minP, pRange, chartH, padT);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (sma25.length === displayCandles.length) {
        ctx.strokeStyle = "#8b5cf6";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < sma25.length; i++) {
          if (isNaN(sma25[i])) continue;
          const x = indexToX(i, candleW, padL);
          const y = priceToY(sma25[i], minP, pRange, chartH, padT);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // EMA line
    if (indicators.ema && ema9.length === displayCandles.length) {
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < ema9.length; i++) {
        if (isNaN(ema9[i])) continue;
        const x = indexToX(i, candleW, padL);
        const y = priceToY(ema9[i], minP, pRange, chartH, padT);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Candles or line/area
    if (chartType === "line" || chartType === "area") {
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < displayCandles.length; i++) {
        const x = indexToX(i, candleW, padL);
        const y = priceToY(displayCandles[i].close, minP, pRange, chartH, padT);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (chartType === "area") {
        ctx.lineTo(indexToX(displayCandles.length - 1, candleW, padL), padT + chartH);
        ctx.lineTo(padL, padT + chartH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
        grad.addColorStop(0, "rgba(6, 182, 212, 0.2)");
        grad.addColorStop(1, "rgba(6, 182, 212, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    } else {
      // Candlestick or Heikin-Ashi
      displayCandles.forEach((c, i) => {
        const x = indexToX(i, candleW, padL);
        const isUp = c.close >= c.open;
        const color = isUp ? "#00e676" : "#ff1744";

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, priceToY(c.high, minP, pRange, chartH, padT));
        ctx.lineTo(x, priceToY(c.low, minP, pRange, chartH, padT));
        ctx.stroke();

        const openY = priceToY(c.open, minP, pRange, chartH, padT);
        const closeY = priceToY(c.close, minP, pRange, chartH, padT);
        ctx.fillStyle = color;
        ctx.fillRect(x - bodyW / 2, Math.min(openY, closeY), bodyW, Math.max(1, Math.abs(closeY - openY)));
      });
    }

    // Pattern markers
    if (displayCandles.length > 2) {
      for (let i = Math.max(1, displayCandles.length - 20); i < displayCandles.length; i++) {
        const pattern = detectPattern(displayCandles, i);
        if (pattern === "none") continue;
        const info = PATTERN_LABELS[pattern];
        const x = indexToX(i, candleW, padL);
        const y = priceToY(displayCandles[i].high, minP, pRange, chartH, padT) - 4;
        ctx.fillStyle = info.color;
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(info.label, x - 20, y);
      }
    }

    // Current price line
    const lastPrice = displayCandles[displayCandles.length - 1].close;
    const lastY = priceToY(lastPrice, minP, pRange, chartH, padT);
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
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(lastPrice.toFixed(lastPrice >= 1000 ? 0 : 2), padL + chartW + 3, lastY + 3);

    // Volume bars
    if (indicators.volume && volH > 0) {
      const volTop = padT + chartH + 10;
      const maxVol = Math.max(...displayCandles.map(c => c.volume));
      displayCandles.forEach((c, i) => {
        const x = indexToX(i, candleW, padL);
        const barH = (c.volume / maxVol) * (volH - 10);
        const isUp = c.close >= c.open;
        ctx.fillStyle = isUp ? "rgba(0, 230, 118, 0.3)" : "rgba(255, 23, 68, 0.3)";
        ctx.fillRect(x - bodyW / 2, volTop + volH - barH - 5, bodyW, barH);
      });
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText("Volume", padL, volTop + 10);
    }

    // Drawings
    drawings.forEach(d => {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 2;
      if (d.type === "trendline" && d.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        ctx.lineTo(d.points[1].x, d.points[1].y);
        ctx.stroke();
      } else if (d.type === "horizontal" && d.points.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(padL, d.points[0].y);
        ctx.lineTo(padL + chartW, d.points[0].y);
        ctx.stroke();
      } else if (d.type === "fibonacci" && d.points.length >= 2) {
        const p1 = d.points[0], p2 = d.points[1];
        const diff = p1.y - p2.y;
        const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        fibLevels.forEach(level => {
          const y = p2.y + diff * level;
          ctx.strokeStyle = level === 0.5 ? "#f59e0b" : "rgba(99, 102, 241, 0.5)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(padL + chartW, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillText(`${(level * 100).toFixed(1)}%`, padL + 2, y - 2);
        });
      } else if (d.type === "rectangle" && d.points.length >= 2) {
        const p1 = d.points[0], p2 = d.points[1];
        ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
        ctx.fillRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      }
    });

    // Active drawing
    if (drawing && drawing.points.length >= 1) {
      ctx.strokeStyle = drawing.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      if (drawing.type === "trendline" && drawing.points.length === 1 && crosshair) {
        ctx.beginPath();
        ctx.moveTo(drawing.points[0].x, drawing.points[0].y);
        ctx.lineTo(crosshair.x, crosshair.y);
        ctx.stroke();
      } else if (drawing.type === "horizontal" && drawing.points.length === 1) {
        ctx.beginPath();
        ctx.moveTo(padL, drawing.points[0].y);
        ctx.lineTo(padL + chartW, drawing.points[0].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Crosshair
    if (crosshair) {
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(crosshair.x, padT);
      ctx.lineTo(crosshair.x, padT + chartH);
      ctx.moveTo(padL, crosshair.y);
      ctx.lineTo(padL + chartW, crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // OHLC tooltip
      if (crosshair.index >= 0 && crosshair.index < displayCandles.length) {
        const c = displayCandles[crosshair.index];
        const tooltip = `O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume.toFixed(0)}`;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.font = "10px 'JetBrains Mono', monospace";
        const tw = ctx.measureText(tooltip).width;
        ctx.fillRect(padL + 4, padT + 2, tw + 8, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(tooltip, padL + 8, padT + 13);
      }
    }
  }, [displayCandles, indicators, chartType, height, drawings, crosshair, drawing, sma7, sma25, ema9, bb, vwapVals, rsiValues, macdData]);

  // ── RSI panel ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = rsiCanvasRef.current;
    if (!canvas || !showRSI || rsiValues.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 70 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 70;
    const padR = 65, padL = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255, 23, 68, 0.05)";
    ctx.fillRect(padL, 0, chartW, h * 0.3);
    ctx.fillStyle = "rgba(0, 230, 118, 0.05)";
    ctx.fillRect(padL, h * 0.7, chartW, h * 0.3);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    [30, 50, 70].forEach(level => {
      const y = h - (level / 100) * h;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillText(String(level), padL + chartW + 4, y + 3);
    });

    const candleW = chartW / displayCandles.length;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < rsiValues.length; i++) {
      if (isNaN(rsiValues[i])) continue;
      const x = indexToX(i, candleW, padL);
      const y = h - (rsiValues[i] / 100) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = "#a855f7";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    const lastRSI = rsiValues[rsiValues.length - 1];
    if (!isNaN(lastRSI)) ctx.fillText(`RSI ${lastRSI.toFixed(1)}`, padL, 10);
  }, [displayCandles, rsiValues, showRSI]);

  // ── MACD panel ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = macdCanvasRef.current;
    if (!canvas || !showMACD || !macdData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 70 * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = 70;
    const padR = 65, padL = 8;
    const chartW = w - padL - padR;

    ctx.clearRect(0, 0, w, h);

    const allVals = [...macdData.histogram, ...macdData.macdLine, ...macdData.signalLine].filter(v => !isNaN(v));
    const maxVal = Math.max(...allVals, 0.001);
    const minVal = Math.min(...allVals, -0.001);
    const range = maxVal - minVal || 1;
    const zeroY = h - ((0 - minVal) / range) * h;

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(padL + chartW, zeroY);
    ctx.stroke();

    const candleW = chartW / displayCandles.length;

    macdData.histogram.forEach((val, i) => {
      if (isNaN(val)) return;
      const x = indexToX(i, candleW, padL);
      const y = h - ((val - minVal) / range) * h;
      ctx.fillStyle = val >= 0 ? "rgba(0, 230, 118, 0.4)" : "rgba(255, 23, 68, 0.4)";
      ctx.fillRect(x - candleW * 0.3, Math.min(y, zeroY), candleW * 0.6, Math.abs(y - zeroY));
    });

    ctx.strokeStyle = "#06b6d4";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < macdData.macdLine.length; i++) {
      if (isNaN(macdData.macdLine[i])) continue;
      const x = indexToX(i, candleW, padL);
      const y = h - ((macdData.macdLine[i] - minVal) / range) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    started = false;
    for (let i = 0; i < macdData.signalLine.length; i++) {
      if (isNaN(macdData.signalLine[i])) continue;
      const x = indexToX(i, candleW, padL);
      const y = h - ((macdData.signalLine[i] - minVal) / range) * h;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = "#06b6d4";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText("MACD", padL, 10);
  }, [displayCandles, macdData, showMACD]);

  // ── Mouse handlers ──────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || displayCandles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const w = rect.width;
    const h = height;
    const volH = indicators.volume ? 60 : 0;
    const { padR, padL, padT, chartH, chartW } = getChartBounds(w, h, volH);

    const prices = displayCandles.flatMap(c => [c.high, c.low]);
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    minP -= range * 0.08;
    maxP += range * 0.08;
    const pRange = maxP - minP;

    const candleW = chartW / displayCandles.length;
    const index = Math.round((x - padL - candleW / 2) / candleW);
    const price = maxP - ((y - padT) / chartH) * pRange;

    setCrosshair({ x, y, price, index: Math.max(0, Math.min(displayCandles.length - 1, index)) });

    if (drawing && drawStartRef.current) {
      setDrawing({ ...drawing, points: [drawStartRef.current, { x, y }] });
    }
  }, [displayCandles, indicators.volume, height, drawing]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawStartRef.current = { x, y };
    const colors: Record<string, string> = {
      trendline: "#06b6d4", horizontal: "#f59e0b", fibonacci: "#a855f7", rectangle: "#6366f1",
    };
    setDrawing({
      id: `draw-${Date.now()}`,
      type: drawMode as Drawing["type"],
      points: [{ x, y }],
      color: colors[drawMode] || "#06b6d4",
    });
  }, [drawMode]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !drawMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (drawing.type === "horizontal") {
      onDrawingsChange([...drawings, { ...drawing, points: [{ x, y }] }]);
    } else {
      onDrawingsChange([...drawings, { ...drawing, points: [drawStartRef.current!, { x, y }] }]);
    }
    setDrawing(null);
    drawStartRef.current = null;
  }, [drawing, drawMode, drawings, onDrawingsChange]);

  const handleMouseLeave = useCallback(() => {
    setCrosshair(null);
    if (drawing) {
      setDrawing(null);
      drawStartRef.current = null;
    }
  }, [drawing]);

  return (
    <div ref={containerRef} className="relative">
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, cursor: drawMode ? "crosshair" : "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
      {showRSI && <canvas ref={rsiCanvasRef} style={{ width: "100%", height: 70 }} />}
      {showMACD && <canvas ref={macdCanvasRef} style={{ width: "100%", height: 70 }} />}
    </div>
  );
}
