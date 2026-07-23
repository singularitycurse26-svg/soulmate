import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dice3D } from "./Dice3D";
import { cn } from "@/lib/utils";
import { Coins, Dice5, RotateCcw, TrendingUp, History, Lock } from "lucide-react";

type GamePhase = "idle" | "comeout" | "point" | "won" | "lost";
type BetType = "pass" | "dontpass" | "any7" | "yo11" | "snake2" | "boxcars12";

const BET_LABELS: Record<BetType, string> = {
  pass: "Pass Line (7/11 win, 2/3/12 lose)",
  dontpass: "Don't Pass (7/11 lose, 2/3 win)",
  any7: "Any 7 (pays 4:1)",
  yo11: "Yo 11 (pays 15:1)",
  snake2: "Snake Eyes 2 (pays 30:1)",
  boxcars12: "Boxcars 12 (pays 30:1)",
};

const BET_PAYOUTS: Record<BetType, number> = {
  pass: 1,
  dontpass: 1,
  any7: 4,
  yo11: 15,
  snake2: 30,
  boxcars12: 30,
};

interface RollResult {
  values: [number, number];
  sum: number;
  win: boolean;
  payout: number;
}

export function CrapsGame() {
  const [coins, setCoins] = useState(1000);
  const [betAmount, setBetAmount] = useState(50);
  const [betType, setBetType] = useState<BetType>("pass");
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [point, setPoint] = useState<number | null>(null);
  const [rollTrigger, setRollTrigger] = useState(0);
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [history, setHistory] = useState<Array<{ sum: number; win: boolean }>>([]);
  const [showResult, setShowResult] = useState(false);
  const [rolling, setRolling] = useState(false);

  const handleDiceResult = useCallback((values: [number, number]) => {
    const sum = values[0] + values[1];
    setRolling(false);

    let win = false;
    let payout = 0;
    let newPhase: GamePhase = phase;
    let newPoint = point;

    if (phase === "comeout") {
      // Come-out roll
      if (betType === "pass") {
        if (sum === 7 || sum === 11) { win = true; payout = betAmount * BET_PAYOUTS.pass; newPhase = "won"; }
        else if (sum === 2 || sum === 3 || sum === 12) { win = false; newPhase = "lost"; }
        else { newPoint = sum; newPhase = "point"; }
      } else if (betType === "dontpass") {
        if (sum === 7 || sum === 11) { win = false; newPhase = "lost"; }
        else if (sum === 2 || sum === 3) { win = true; payout = betAmount; newPhase = "won"; }
        else if (sum === 12) { newPhase = "comeout"; } // push
        else { newPoint = sum; newPhase = "point"; }
      } else {
        // Side bets resolved on come-out
        if (betType === "any7" && sum === 7) { win = true; payout = betAmount * 4; }
        else if (betType === "yo11" && sum === 11) { win = true; payout = betAmount * 15; }
        else if (betType === "snake2" && sum === 2) { win = true; payout = betAmount * 30; }
        else if (betType === "boxcars12" && sum === 12) { win = true; payout = betAmount * 30; }
        else { win = false; payout = 0; }
        newPhase = win ? "won" : "lost";
      }
    } else if (phase === "point") {
      // Point round
      if (betType === "pass") {
        if (sum === point) { win = true; payout = betAmount; newPhase = "won"; }
        else if (sum === 7) { win = false; newPhase = "lost"; }
      } else if (betType === "dontpass") {
        if (sum === 7) { win = true; payout = betAmount; newPhase = "won"; }
        else if (sum === point) { win = false; newPhase = "lost"; }
      } else {
        // Side bets during point
        if (betType === "any7" && sum === 7) { win = true; payout = betAmount * 4; newPhase = "won"; }
        else if (betType === "yo11" && sum === 11) { win = true; payout = betAmount * 15; }
        else { win = false; }
      }
    }

    if (win) {
      setCoins((c) => c + payout);
    } else if (newPhase === "lost") {
      setCoins((c) => c - betAmount);
    }

    setPhase(newPhase);
    setPoint(newPoint);
    setLastRoll({ values, sum, win, payout });
    setHistory((h) => [{ sum, win }, ...h].slice(0, 10));
    setShowResult(true);
    setTimeout(() => setShowResult(false), 3000);
  }, [phase, point, betType, betAmount]);

  const startGame = () => {
    if (coins < betAmount) return;
    setPhase("comeout");
    setPoint(null);
    setLastRoll(null);
    setHistory([]);
    setShowResult(false);
  };

  const rollDice = () => {
    if (phase !== "comeout" && phase !== "point") return;
    if (coins < betAmount) return;
    setRolling(true);
    setRollTrigger((t) => t + 1);
  };

  const reset = () => {
    setPhase("idle");
    setPoint(null);
    setLastRoll(null);
    setHistory([]);
    setShowResult(false);
    setRolling(false);
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
          <Coins className="w-4 h-4 text-warning" />
          <span className="text-sm font-bold">{coins.toLocaleString()}</span>
        </div>
        {phase === "point" && (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 bg-accent/10 px-3 py-1.5 rounded-lg">
            <TrendingUp className="w-4 h-4 text-accent" />
            <span className="text-sm font-bold text-accent">Point: {point}</span>
          </motion.div>
        )}
        <div className="flex-1" />
        {phase !== "idle" && (
          <span className={cn(
            "text-xs font-medium px-2 py-1 rounded capitalize",
            phase === "won" && "bg-success/10 text-success",
            phase === "lost" && "bg-danger/10 text-danger",
            (phase === "comeout" || phase === "point") && "bg-accent/10 text-accent"
          )}>{phase}</span>
        )}
      </div>

      {/* 3D Dice */}
      <Dice3D rollTrigger={rollTrigger} onResult={handleDiceResult} />

      {/* Result display */}
      <AnimatePresence>
        {showResult && lastRoll && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: -10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: -10 }}
            className={cn(
              "text-center py-3 rounded-lg font-bold text-lg",
              lastRoll.win ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
            )}
          >
            {lastRoll.values[0]} + {lastRoll.values[1]} = {lastRoll.sum}
            {lastRoll.win ? ` — Won +${lastRoll.payout} coins!` : ` — Lost -${betAmount} coins`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game controls */}
      {phase === "idle" ? (
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

          <div>
            <label className="label">Bet Type</label>
            <select
              value={betType}
              onChange={(e) => setBetType(e.target.value as BetType)}
              className="w-full"
            >
              {Object.entries(BET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <button onClick={startGame} disabled={coins < betAmount} className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed">
            <Dice5 className="w-5 h-5" /> {coins < betAmount ? "Not enough coins" : "Start Round"}
          </button>
        </div>
      ) : phase === "won" || phase === "lost" ? (
        <div className="space-y-3">
          <div className={cn(
            "text-center py-4 rounded-lg",
            phase === "won" ? "bg-success/10" : "bg-danger/10"
          )}>
            <p className={cn("text-xl font-bold", phase === "won" ? "text-success" : "text-danger")}>
              {phase === "won" ? "🎉 You Won!" : "😔 You Lost"}
            </p>
            {lastRoll && (
              <p className="text-sm text-muted mt-1">
                Rolled {lastRoll.sum} • {lastRoll.win ? `+${lastRoll.payout}` : `-${betAmount}`} coins
              </p>
            )}
          </div>
          <button onClick={reset} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
            <RotateCcw className="w-4 h-4" /> Play Again
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Roll history */}
          {history.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              <History className="w-4 h-4 text-muted flex-shrink-0" />
              {history.map((h, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-bold flex-shrink-0",
                    h.win ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}
                >
                  {h.sum}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={rollDice}
            disabled={rolling}
            className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50"
          >
            {rolling ? (
              <><Dice5 className="w-6 h-6 animate-spin" /> Rolling...</>
            ) : phase === "point" ? (
              <><Dice5 className="w-6 h-6" /> Roll for {point}</>
            ) : (
              <><Dice5 className="w-6 h-6" /> Roll Dice</>
            )}
          </button>

          {phase === "point" && (
            <p className="text-center text-sm text-muted">
              Roll a {point} to win, or 7 to lose
            </p>
          )}
        </div>
      )}

      {/* Payout info */}
      <div className="card text-xs text-muted">
        <p className="font-medium text-white mb-2">Payouts</p>
        <div className="grid grid-cols-2 gap-1.5">
          <span>Pass / Don't Pass: 1:1</span>
          <span>Any 7: 4:1</span>
          <span>Yo 11: 15:1</span>
          <span>Snake Eyes: 30:1</span>
          <span>Boxcars: 30:1</span>
        </div>
      </div>
    </div>
  );
}
