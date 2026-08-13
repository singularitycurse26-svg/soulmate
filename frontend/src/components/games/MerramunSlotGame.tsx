import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Coins,
  RotateCcw,
  Trophy,
  Lock,
  History,
  Bot,
  Square,
  Plus,
  Minus,
  Skull,
  Flame,
  Sun,
  Eye,
  FlaskConical,
  ScrollText,
  Cat,
  Bug,
  Diamond,
  Moon,
} from "lucide-react";
import { useStore } from "@/lib/store";

type TileType = "skull" | "ankh" | "eye" | "flame" | "sun" | "vase" | "scroll" | "cat" | "bug" | "multiplier";

interface Tile {
  id: number;
  type: TileType;
  value?: number;
}

interface TileConfig {
  id: TileType;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  text?: string;
  color: string;
  glow: string;
  weight: number;
  value: number;
}

const SYMBOLS: Record<TileType, TileConfig> = {
  skull: { id: "skull", label: "SKULL", icon: Skull, color: "text-red-500", glow: "drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]", weight: 12, value: 0.04 },
  ankh: { id: "ankh", label: "ANKH", text: "☥", color: "text-amber-400", glow: "drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]", weight: 6, value: 0.22 },
  eye: { id: "eye", label: "EYE", icon: Eye, color: "text-teal-400", glow: "drop-shadow-[0_0_8px_rgba(45,212,191,0.6)]", weight: 9, value: 0.10 },
  flame: { id: "flame", label: "JACKAL", icon: Flame, color: "text-blue-400", glow: "drop-shadow-[0_0_8px_rgba(96,165,250,0.6)]", weight: 10, value: 0.06 },
  sun: { id: "sun", label: "SUN", icon: Sun, color: "text-orange-400", glow: "drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]", weight: 7, value: 0.12 },
  vase: { id: "vase", label: "VASE", icon: FlaskConical, color: "text-amber-300", glow: "drop-shadow-[0_0_8px_rgba(252,211,77,0.6)]", weight: 10, value: 0.07 },
  scroll: { id: "scroll", label: "SCROLL", icon: ScrollText, color: "text-stone-300", glow: "drop-shadow-[0_0_8px_rgba(214,211,209,0.6)]", weight: 9, value: 0.08 },
  cat: { id: "cat", label: "CAT", icon: Cat, color: "text-cyan-400", glow: "drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]", weight: 11, value: 0.05 },
  bug: { id: "bug", label: "SCARAB", icon: Bug, color: "text-emerald-400", glow: "drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]", weight: 10, value: 0.06 },
  multiplier: { id: "multiplier", label: "MULTI", icon: Diamond, color: "text-white", glow: "drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]", weight: 3, value: 0 },
};

const COLS = 5;
const ROWS = 4;
const MIN_WIN = 3;
const STOP_DELAYS = [600, 800, 1000, 1200, 1400];
const SPIN_DURATION = Math.max(...STOP_DELAYS) + 300;
const EVAL_DELAY = 300;
const HIGHLIGHT_DELAY = 700;
const CASCADE_DELAY = 600;
const AUTO_DELAY = 1800;
const MULTIPLIER_VALUES = [2, 3, 5, 8];

const WHEEL: TileType[] = Object.values(SYMBOLS).flatMap((s) => Array(s.weight).fill(s.id));

let nextTileId = 1;

const containerVariants = { hidden: { opacity: 1 }, visible: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const childVariants = { hidden: { y: -35, opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.22 } } };
const popVariants = { hidden: { scale: 0.8, opacity: 0 }, visible: { scale: 1, opacity: 1, transition: { duration: 0.3 } } };

function randomSymbol(): TileType {
  return WHEEL[Math.floor(Math.random() * WHEEL.length)];
}

function createTile(type: TileType, value?: number): Tile {
  return { id: nextTileId++, type, value };
}

function randomTile(): Tile {
  const type = randomSymbol();
  if (type === "multiplier") {
    const value = MULTIPLIER_VALUES[Math.floor(Math.random() * MULTIPLIER_VALUES.length)];
    return createTile(type, value);
  }
  return createTile(type);
}

function randomColumn(): Tile[] {
  return Array.from({ length: ROWS }, randomTile);
}

function randomGrid(): Tile[][] {
  return Array.from({ length: COLS }, randomColumn);
}

interface CascadeResult {
  winning: [number, number][];
  multipliers: [number, number][];
  multiplierSum: number;
  cascadeWin: number;
  baseWin: number;
}

function evaluateCascade(columns: Tile[][], bet: number): CascadeResult {
  const counts: Partial<Record<TileType, [number, number][]>> = {};
  const multipliers: [number, number][] = [];
  const winning: [number, number][] = [];

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const tile = columns[c][r];
      if (tile.type === "multiplier") {
        multipliers.push([c, r]);
      } else {
        if (!counts[tile.type]) counts[tile.type] = [];
        counts[tile.type]!.push([c, r]);
      }
    }
  }

  let baseWin = 0;
  for (const type of Object.keys(counts) as TileType[]) {
    const positions = counts[type]!;
    if (positions.length >= MIN_WIN) {
      winning.push(...positions);
      const count = positions.length;
      baseWin += bet * count * SYMBOLS[type].value * (count - 2);
    }
  }

  const multiplierSum = multipliers.reduce((sum, [c, r]) => sum + (columns[c][r].value || 0), 0);
  const cascadeWin = winning.length > 0 ? baseWin * (multiplierSum > 0 ? multiplierSum : 1) : 0;
  return { winning, multipliers, multiplierSum, cascadeWin, baseWin };
}

function cascadeColumns(columns: Tile[][], winning: [number, number][], multipliers: [number, number][]): Tile[][] {
  const toRemove = new Set([...winning, ...multipliers].map(([c, r]) => `${c},${r}`));
  const next: Tile[][] = [];

  for (let c = 0; c < COLS; c++) {
    const kept: Tile[] = [];
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!toRemove.has(`${c},${r}`)) {
        kept.push(columns[c][r]);
      }
    }
    const missing = ROWS - kept.length;
    const newTiles: Tile[] = [];
    for (let i = 0; i < missing; i++) newTiles.push(randomTile());
    next[c] = [...newTiles, ...kept];
  }

  return next;
}

export function MerramunSlotGame() {
  const { showAlert } = useStore();
  const [coins, setCoins] = useState(1000);
  const [betAmount, setBetAmount] = useState(100);
  const [columns, setColumns] = useState<Tile[][]>(randomGrid());
  const [finalColumns, setFinalColumns] = useState<Tile[][]>(columns);
  const [reelSpinning, setReelSpinning] = useState<boolean[]>([false, false, false, false, false]);
  const [phase, setPhase] = useState<"idle" | "spinning" | "evaluating" | "cascading">("idle");
  const [spinKey, setSpinKey] = useState(0);
  const [cascadeStep, setCascadeStep] = useState(0);
  const [winningCells, setWinningCells] = useState<[number, number][]>([]);
  const [multiplierCells, setMultiplierCells] = useState<[number, number][]>([]);
  const [tumbleTotal, setTumbleTotal] = useState(0);
  const [cascadeMessages, setCascadeMessages] = useState<{ mult: number; win: number }[]>([]);
  const [showTumbleWin, setShowTumbleWin] = useState(false);
  const [totalWon, setTotalWon] = useState(0);
  const [spins, setSpins] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [history, setHistory] = useState<Array<{ spin: number; win: number }>>([]);

  const reelSpinningRef = useRef(reelSpinning);
  const phaseRef = useRef(phase);
  const coinsRef = useRef(coins);
  const betAmountRef = useRef(betAmount);
  const tumbleTotalRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    reelSpinningRef.current = reelSpinning;
  }, [reelSpinning]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    coinsRef.current = coins;
  }, [coins]);

  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  useEffect(() => {
    if (!reelSpinning.some(Boolean)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setColumns((prev) =>
        prev.map((col, c) => (reelSpinningRef.current[c] ? randomColumn() : finalColumns[c]))
      );
    }, 80);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [reelSpinning, finalColumns]);

  const spin = useCallback(() => {
    if (phaseRef.current !== "idle" || coinsRef.current < betAmountRef.current) return;
    const nextFinal = randomGrid();

    timeoutsRef.current.forEach(clearTimeout);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutsRef.current = [];

    setFinalColumns(nextFinal);
    setColumns(randomGrid());
    setReelSpinning([true, true, true, true, true]);
    setPhase("spinning");
    setSpinKey((k) => k + 1);
    setCascadeStep(0);
    setWinningCells([]);
    setMultiplierCells([]);
    setTumbleTotal(0);
    tumbleTotalRef.current = 0;
    setCascadeMessages([]);
    setShowTumbleWin(false);
    setSpins((s) => s + 1);
    setCoins((c) => c - betAmountRef.current);

    for (let i = 0; i < COLS; i++) {
      const t = window.setTimeout(() => {
        setReelSpinning((prev) => {
          const next = [...prev];
          next[i] = false;
          return next;
        });
      }, STOP_DELAYS[i]);
      timeoutsRef.current.push(t);
    }

    const finalT = window.setTimeout(() => {
      setColumns(nextFinal);
      setReelSpinning([false, false, false, false, false]);
      setPhase("evaluating");
    }, SPIN_DURATION);
    timeoutsRef.current.push(finalT);
  }, []);

  useEffect(() => {
    if (phase === "evaluating") {
      const t = window.setTimeout(() => {
        const result = evaluateCascade(columns, betAmountRef.current);
        if (result.winning.length === 0) {
          const total = tumbleTotalRef.current;
          setTumbleTotal(total);
          if (total > 0) {
            setCoins((c) => c + total);
            setTotalWon((w) => w + total);
            setHistory((h) => [{ spin: spins, win: total }, ...h].slice(0, 10));
          }
          setShowTumbleWin(total > 0);
          setPhase("idle");
        } else {
          setWinningCells(result.winning);
          setMultiplierCells(result.multipliers);
          setCascadeMessages((m) => [...m, { mult: result.multiplierSum, win: result.cascadeWin }]);
          setTumbleTotal((prev) => {
            const next = prev + result.cascadeWin;
            tumbleTotalRef.current = next;
            return next;
          });
          const t2 = window.setTimeout(() => setPhase("cascading"), HIGHLIGHT_DELAY);
          timeoutsRef.current.push(t2);
        }
      }, EVAL_DELAY);
      return () => clearTimeout(t);
    } else if (phase === "cascading") {
      const t = window.setTimeout(() => {
        const next = cascadeColumns(columns, winningCells, multiplierCells);
        setColumns(next);
        setWinningCells([]);
        setMultiplierCells([]);
        setCascadeStep((s) => s + 1);
        setPhase("evaluating");
      }, CASCADE_DELAY);
      return () => clearTimeout(t);
    }
  }, [phase, columns, winningCells, multiplierCells, spins]);

  useEffect(() => {
    if (!autoPlay || phase !== "idle" || spins === 0 || coins < betAmount) return;
    const t = window.setTimeout(() => spin(), AUTO_DELAY);
    return () => clearTimeout(t);
  }, [autoPlay, phase, spins, coins, betAmount, spin]);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const increaseBet = () => {
    if (phase !== "idle") return;
    setBetAmount((b) => Math.min(b + 10, Math.min(coins, 500)));
  };

  const decreaseBet = () => {
    if (phase !== "idle") return;
    setBetAmount((b) => Math.max(b - 10, 10));
  };

  const reset = () => {
    timeoutsRef.current.forEach(clearTimeout);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setCoins(1000);
    setBetAmount(100);
    const newGrid = randomGrid();
    setColumns(newGrid);
    setFinalColumns(newGrid);
    setReelSpinning([false, false, false, false, false]);
    setPhase("idle");
    setSpinKey((k) => k + 1);
    setCascadeStep(0);
    setWinningCells([]);
    setMultiplierCells([]);
    setTumbleTotal(0);
    tumbleTotalRef.current = 0;
    setCascadeMessages([]);
    setShowTumbleWin(false);
    setTotalWon(0);
    setSpins(0);
    setAutoPlay(false);
    setHistory([]);
  };

  const winningSet = new Set(winningCells.map(([c, r]) => `${c},${r}`));
  const multiplierSet = new Set(multiplierCells.map(([c, r]) => `${c},${r}`));
  const lastMessage = cascadeMessages[cascadeMessages.length - 1];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
            <Coins className="w-4 h-4 text-warning" />
            <span className="text-sm font-bold">{coins.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
            <Trophy className="w-4 h-4 text-accent" />
            <span className="text-sm text-muted">
              Won: <span className="text-success font-bold">{totalWon.toLocaleString()}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
            <span className="text-xs text-muted">Spins: <span className="text-white font-bold">{spins}</span></span>
          </div>
          {(totalWon > 0 || spins > 0) && (
            <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        <div className="relative rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_0_40px_rgba(245,158,11,0.12)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/20 bg-slate-900/80">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-amber-300" />
              <span className="text-sm font-bold text-amber-100">Incentives OS</span>
            </div>
            <div className="flex items-center gap-1 text-amber-500/60">
              <span className="w-3 h-0.5 bg-current rounded-full" />
              <span className="w-3 h-0.5 bg-current rounded-full" />
            </div>
          </div>

          <div className="p-4 text-center bg-gradient-to-b from-slate-800/50 to-slate-900/50 border-b border-amber-500/20">
            <h2
              className="text-3xl font-black tracking-[0.15em] text-amber-300 uppercase"
              style={{ textShadow: "0 0 12px rgba(251,191,36,0.4)" }}
            >
              Incentives OS
            </h2>
          </div>

          <div className="p-4">
            <motion.div
              key={`${spinKey}-${cascadeStep}`}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-5 gap-1.5 p-2 bg-slate-950/60 rounded-xl border border-amber-500/20"
            >
              {Array.from({ length: ROWS }).map((_, r) =>
                columns.map((col, c) => {
                  const tile = col[r];
                  const key = `${c}-${r}`;
                  const isWinning = winningSet.has(key);
                  const isMultiplier = tile.type === "multiplier";
                  const isMultiplierWin = multiplierSet.has(key);
                  const config = SYMBOLS[tile.type];

                  return (
                    <motion.div
                      key={key}
                      variants={childVariants}
                      className={cn(
                        "relative w-full aspect-[4/5] rounded-lg flex items-center justify-center overflow-hidden border transition-all duration-200",
                        isWinning
                          ? "border-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.55)] scale-105 z-10 bg-amber-900/30"
                          : isMultiplierWin
                            ? "border-blue-300 shadow-[0_0_18px_rgba(96,165,250,0.55)] z-10 bg-blue-900/30"
                            : "border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900",
                        isMultiplier && !isWinning && !isMultiplierWin && "border-blue-500/60 bg-gradient-to-b from-blue-800 to-blue-950"
                      )}
                    >
                      {config.text ? (
                        <span className={cn("text-3xl sm:text-4xl font-black", config.color, config.glow)}>{config.text}</span>
                      ) : (
                        <config.icon className={cn("w-9 h-9 sm:w-11 sm:h-11", config.color, config.glow)} />
                      )}
                      {isMultiplier && (
                        <span className="absolute inset-0 flex items-center justify-center text-slate-900 font-black text-sm sm:text-base">
                          {tile.value}x
                        </span>
                      )}
                      {phase === "spinning" && (
                        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]" />
                      )}
                    </motion.div>
                  );
                })
              )}
            </motion.div>

            <div className="h-6 mt-3 text-center">
              {lastMessage && (
                <span className="text-sm font-bold text-amber-300">
                  {lastMessage.mult > 0 ? `${lastMessage.mult}X PAYS ${lastMessage.win.toFixed(2)}` : `PAYS ${lastMessage.win.toFixed(2)}`}
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-4 my-3">
              <button
                onClick={decreaseBet}
                disabled={phase !== "idle"}
                className="p-2.5 rounded-full bg-slate-800 border border-amber-500/30 text-amber-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="min-w-[120px] px-6 py-2 rounded-lg bg-slate-950 border border-amber-500/30 text-amber-100 font-mono text-xl text-center">
                {betAmount.toFixed(2)}
              </div>
              <button
                onClick={increaseBet}
                disabled={phase !== "idle"}
                className="p-2.5 rounded-full bg-slate-800 border border-amber-500/30 text-amber-200 hover:bg-slate-700 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center my-4">
              <button
                onClick={spin}
                disabled={phase !== "idle" || coins < betAmount}
                className={cn(
                  "w-20 h-20 rounded-full bg-gradient-to-b from-amber-300 to-amber-600 text-slate-900 flex items-center justify-center shadow-[0_0_25px_rgba(245,158,11,0.45)] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
                  phase === "spinning" && "animate-pulse"
                )}
              >
                <RotateCcw className="w-8 h-8 fill-current" />
              </button>
            </div>

            <div className="flex justify-center gap-3">
              <button
                onClick={() => setAutoPlay((a) => !a)}
                disabled={phase !== "idle" || coins < betAmount}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg font-medium border-2 transition-all disabled:opacity-50",
                  autoPlay
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-bg-alt border-border text-muted hover:text-white hover:border-accent/50"
                )}
              >
                {autoPlay ? <><Square className="w-4 h-4" /> Stop Auto</> : <><Bot className="w-4 h-4" /> Auto Spin</>}
              </button>
            </div>

            <AnimatePresence>
              {showTumbleWin && (
                <motion.div
                  variants={popVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  className="mt-4 text-center py-4 rounded-xl bg-amber-500/15 border border-amber-500/40"
                >
                  <p className="text-amber-300 text-sm font-bold uppercase tracking-widest">Tumble Win</p>
                  <p className="text-3xl font-black text-amber-100">{tumbleTotal.toFixed(2)}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="card text-xs">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <History className="w-4 h-4" /> Recent Tumble Wins
          </h3>
          {history.length === 0 ? (
            <p className="text-muted">No wins yet.</p>
          ) : (
            <div className="space-y-1">
              {history.map((h, idx) => (
                <div key={idx} className="flex items-center justify-between bg-bg-alt/50 rounded px-2 py-1">
                  <span className="text-muted">Spin {h.spin}</span>
                  <span className="font-bold text-success">+{h.win.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h3 className="font-semibold mb-3">Paytable</h3>
          <div className="space-y-2 text-sm">
            {Object.values(SYMBOLS)
              .filter((s) => s.id !== "multiplier")
              .map((s) => (
                <div key={s.id} className="flex items-center justify-between bg-bg-alt/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    {s.text ? (
                      <span className={cn("font-black text-lg", s.color, s.glow)}>{s.text}</span>
                    ) : (
                      <s.icon className={cn("w-5 h-5", s.color)} />
                    )}
                    <span className="text-muted">{s.label}</span>
                  </div>
                  <span className="text-muted">3+ pays</span>
                </div>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-accent" />
            <h3 className="font-semibold">INC Staking Tournament</h3>
          </div>
          <p className="text-xs text-muted mb-3">
            Stake INC tokens to compete in quarterly slot tournaments. Top winners split the prize pool.
          </p>
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
          <button
            onClick={() =>
              showAlert("info", "INC staking tournament coming soon — connect your wallet to stake INC and compete for the quarterly prize pool!")
            }
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Lock className="w-4 h-4" /> Stake INC to Enter
          </button>
        </div>
      </div>
    </div>
  );
}
