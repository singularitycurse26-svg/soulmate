import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins, Play, RotateCcw, Trophy, Lock, History, TrendingUp, Bot, Square } from "lucide-react";

const ROWS = 12;
const SLOTS = ROWS + 1;

const MULTIPLIERS = [10, 3, 2, 1, 0.5, 0.2, 0.2, 0.5, 1, 2, 3, 10, 50];
const SLOT_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#06b6d4",
  "#06b6d4", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444", "#a855f7",
];

interface BallPath {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface DropResult {
  slot: number;
  multiplier: number;
  payout: number;
  path: number[];
}

export function PachinkoGame() {
  const [coins, setCoins] = useState(1000);
  const [betAmount, setBetAmount] = useState(50);
  const [dropping, setDropping] = useState(false);
  const [result, setResult] = useState<DropResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<Array<{ slot: number; multiplier: number; win: number }>>([]);
  const [ballAnim, setBallAnim] = useState<{ x: number; y: number } | null>(null);
  const [highlightSlot, setHighlightSlot] = useState<number | null>(null);
  const [totalWon, setTotalWon] = useState(0);
  const [ballsDropped, setBallsDropped] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const animRef = useRef<number | null>(null);

  const simulateDrop = useCallback((): DropResult => {
    let pos = 0;
    const path: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      const goRight = Math.random() > 0.5;
      if (goRight) pos++;
      path.push(goRight ? 1 : 0);
    }
    const slot = Math.min(pos, SLOTS - 1);
    const multiplier = MULTIPLIERS[slot];
    const payout = Math.floor(betAmount * multiplier);
    return { slot, multiplier, payout, path };
  }, [betAmount]);

  const drop = () => {
    if (coins < betAmount || dropping) return;
    setDropping(true);
    setResult(null);
    setShowResult(false);
    setHighlightSlot(null);
    setCoins((c) => c - betAmount);

    const dropResult = simulateDrop();
    let currentRow = 0;
    let currentX = 50;

    const animate = () => {
      if (currentRow >= ROWS) {
        setBallAnim(null);
        setHighlightSlot(dropResult.slot);
        setResult(dropResult);
        setShowResult(true);
        setCoins((c) => c + dropResult.payout);
        setTotalWon((w) => w + dropResult.payout);
        setBallsDropped((b) => b + 1);
        setHistory((h) => [{ slot: dropResult.slot, multiplier: dropResult.multiplier, win: dropResult.payout }, ...h].slice(0, 15));
        setDropping(false);
        setTimeout(() => setShowResult(false), 4000);
        return;
      }
      const rowHeight = 100 / (ROWS + 1);
      const y = (currentRow + 1) * rowHeight;
      if (dropResult.path[currentRow] === 1) {
        currentX += rowHeight * 0.9;
      } else {
        currentX -= rowHeight * 0.3;
      }
      currentX = Math.max(5, Math.min(95, currentX));
      setBallAnim({ x: currentX, y });
      currentRow++;
      animRef.current = requestAnimationFrame(() => setTimeout(animate, 80));
    };
    animate();
  };

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  // Auto-play effect: auto-drop balls when enabled
  useEffect(() => {
    if (!autoPlay || dropping || coins < betAmount) return;
    const timer = setTimeout(() => {
      drop();
    }, 500);
    return () => clearTimeout(timer);
  }, [autoPlay, dropping, coins, betAmount]);

  const reset = () => {
    setResult(null);
    setShowResult(false);
    setHistory([]);
    setHighlightSlot(null);
    setTotalWon(0);
    setBallsDropped(0);
    setAutoPlay(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
          <Coins className="w-4 h-4 text-warning" />
          <span className="text-sm font-bold">{coins.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
          <TrendingUp className="w-4 h-4 text-accent" />
          <span className="text-sm text-muted">Won: <span className="text-success font-bold">{totalWon}</span></span>
        </div>
        <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
          <Play className="w-4 h-4 text-muted" />
          <span className="text-sm text-muted">Drops: {ballsDropped}</span>
        </div>
        {(totalWon > 0 || ballsDropped > 0) && (
          <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Pachinko Board */}
      <div className="card p-0 overflow-hidden">
        <div className="relative w-full" style={{ aspectRatio: "1 / 1.1", maxHeight: "500px" }}>
          <svg viewBox="0 0 100 110" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Pegs */}
            {Array.from({ length: ROWS }, (_, row) => {
              const pegsInRow = row + 2;
              const rowHeight = 100 / (ROWS + 1);
              const y = (row + 1) * rowHeight;
              const spacing = 100 / (pegsInRow + 1);
              return Array.from({ length: pegsInRow }, (_, i) => {
                const x = spacing * (i + 1);
                return <circle key={`${row}-${i}`} cx={x} cy={y} r="0.6" fill="rgba(255,255,255,0.25)" />;
              });
            })}

            {/* Slots */}
            {MULTIPLIERS.map((mult, i) => {
              const slotWidth = 100 / SLOTS;
              const x = i * slotWidth;
              const isHighlighted = highlightSlot === i;
              return (
                <g key={`slot-${i}`}>
                  <rect
                    x={x + 0.5}
                    y={102}
                    width={slotWidth - 1}
                    height={7}
                    fill={SLOT_COLORS[i]}
                    opacity={isHighlighted ? 1 : 0.5}
                    rx="0.5"
                  />
                  <text
                    x={x + slotWidth / 2}
                    y={107.5}
                    textAnchor="middle"
                    fontSize="2.2"
                    fill="white"
                    fontWeight="bold"
                  >
                    {mult}x
                  </text>
                </g>
              );
            })}

            {/* Slot dividers */}
            {Array.from({ length: SLOTS - 1 }, (_, i) => {
              const slotWidth = 100 / SLOTS;
              const x = (i + 1) * slotWidth;
              return <line key={`div-${i}`} x1={x} y1={100} x2={x} y2={110} stroke="rgba(255,255,255,0.15)" strokeWidth="0.3" />;
            })}

            {/* Ball */}
            {ballAnim && (
              <motion.circle
                cx={ballAnim.x}
                cy={ballAnim.y}
                r="1.2"
                fill="#ff6b9d"
                style={{ filter: "drop-shadow(0 0 2px #ff6b9d)" }}
                initial={false}
                animate={{ cx: ballAnim.x, cy: ballAnim.y }}
                transition={{ duration: 0.08, ease: "linear" }}
              />
            )}
          </svg>
        </div>
      </div>

      {/* Result display */}
      <AnimatePresence>
        {showResult && result && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: -10 }}
            className={cn(
              "text-center py-3 rounded-lg font-bold text-lg",
              result.payout > 0 ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            )}
          >
            {result.payout > 0
              ? `🎉 Landed on ${result.multiplier}x — Won +${result.payout} coins!`
              : `Landed on ${result.multiplier}x — Lost -${betAmount} coins`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="space-y-3">
        <div>
          <label className="label">Bet Amount</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max={Math.min(coins, 500)}
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              className="flex-1 accent-accent"
            />
            <span className="text-sm font-bold w-16 text-right">{betAmount}</span>
          </div>
        </div>

        <button
          onClick={drop}
          disabled={dropping || coins < betAmount || autoPlay}
          className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {dropping ? (
            <><Play className="w-6 h-6 animate-pulse" /> Dropping...</>
          ) : coins < betAmount ? (
            "Not enough coins"
          ) : (
            <><Play className="w-6 h-6" /> Drop Ball</>
          )}
        </button>

        {/* Auto Play toggle */}
        <button
          onClick={() => setAutoPlay(!autoPlay)}
          disabled={coins < betAmount && !autoPlay}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-3 font-medium transition-all rounded-lg border-2 disabled:opacity-50",
            autoPlay
              ? "bg-accent/20 border-accent text-accent"
              : "bg-bg-alt border-border text-muted hover:text-white hover:border-accent/50"
          )}
        >
          {autoPlay ? (
            <><Square className="w-5 h-5" /> Stop Auto Play</>
          ) : (
            <><Bot className="w-5 h-5" /> Auto Play</>
          )}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <History className="w-4 h-4 text-muted flex-shrink-0" />
          {history.map((h, i) => (
            <div
              key={i}
              className="px-2 py-1 rounded text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: SLOT_COLORS[h.slot] + "20", color: SLOT_COLORS[h.slot] }}
            >
              {h.multiplier}x
            </div>
          ))}
        </div>
      )}

      {/* Payout table */}
      <div className="card text-xs text-muted">
        <p className="font-medium text-white mb-2">Payout Multipliers</p>
        <div className="flex gap-1 flex-wrap">
          {MULTIPLIERS.map((m, i) => (
            <span
              key={i}
              className="px-2 py-1 rounded font-bold"
              style={{ backgroundColor: SLOT_COLORS[i] + "20", color: SLOT_COLORS[i] }}
            >
              {m}x
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs">Center slots hit more often but pay less. Edge slots pay big but are rare.</p>
      </div>

      {/* INC Staking Tournament */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-warning" />
          <h3 className="font-semibold">INC Staking Tournament</h3>
        </div>
        <p className="text-xs text-muted mb-3">Stake INC tokens to compete in quarterly tournaments. Top winners split the prize pool. 4 quarters per year.</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-bg-alt rounded-lg p-3 text-center">
            <p className="text-xs text-muted">Current Quarter</p>
            <p className="text-lg font-bold text-accent">Q3 2026</p>
          </div>
          <div className="bg-bg-alt rounded-lg p-3 text-center">
            <p className="text-xs text-muted">Prize Pool</p>
            <p className="text-lg font-bold text-warning">10,000 INC</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Your Rank</span>
            <span className="font-bold">—</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Your Stake</span>
            <span className="font-bold">0 INC</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Total Staked</span>
            <span className="font-bold">0 INC</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Next Payout</span>
            <span className="font-bold text-accent">Oct 1, 2026</span>
          </div>
        </div>
        <button
          onClick={() => alert("INC staking tournament — connect your wallet to stake INC and compete for the quarterly prize pool!")}
          className="btn-secondary w-full mt-3 flex items-center justify-center gap-2 text-sm"
        >
          <Lock className="w-4 h-4" /> Stake INC to Enter
        </button>
      </div>
    </div>
  );
}
