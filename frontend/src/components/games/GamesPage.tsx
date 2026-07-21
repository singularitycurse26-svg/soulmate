import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Flame, TrendingUp, TrendingDown, Trophy, Dice5, RotateCcw, Lock } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CrapsGame } from "./CrapsGame";

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
const RANK_VALUES: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_VALUES[r] = i + 2));

type Card = { suit: string; rank: string; value: number };

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, value: RANK_VALUES[rank] });
      }
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function PlayingCard({ card, faceDown, size = "normal" }: { card?: Card; faceDown?: boolean; size?: "normal" | "large" }) {
  const dims = size === "large" ? "w-32 h-44" : "w-24 h-36";
  const fontSize = size === "large" ? "text-4xl" : "text-3xl";
  const cornerSize = size === "large" ? "text-sm" : "text-xs";

  if (faceDown || !card) {
    return (
      <div className={cn(dims, "rounded-xl border-2 border-border bg-gradient-to-br from-bg-alt to-bg-card flex items-center justify-center")}>
        <div className="w-full h-full rounded-lg border border-accent/20 flex items-center justify-center">
          <span className="text-accent/30 text-2xl font-bold">S</span>
        </div>
      </div>
    );
  }

  const isRed = card.suit === "♥" || card.suit === "♦";

  return (
    <motion.div
      initial={{ rotateY: 180, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ transformStyle: "preserve-3d" }}
      className={cn(
        dims,
        "rounded-xl border-2 bg-white flex flex-col justify-between p-2 shadow-lg",
        isRed ? "border-red-400 text-red-600" : "border-gray-300 text-gray-900"
      )}
    >
      <div className={cn(cornerSize, "font-bold text-left leading-none")}>
        {card.rank}
        <br />
        {card.suit}
      </div>
      <div className={cn(fontSize, "text-center")}>{card.suit}</div>
      <div className={cn(cornerSize, "font-bold text-right leading-none rotate-180")}>
        {card.rank}
        <br />
        {card.suit}
      </div>
    </motion.div>
  );
}

function ParticleBurst({ type }: { type: "win" | "loss" }) {
  const particles = Array.from({ length: 20 }, (_, i) => i);
  const color = type === "win" ? "#22c55e" : "#ef4444";

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-40">
      {particles.map((i) => {
        const angle = (i / particles.length) * Math.PI * 2;
        const distance = 100 + Math.random() * 100;
        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              opacity: 0,
              scale: 0,
            }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

export function GamesPage() {
  const { showAlert } = useStore();
  const [tab, setTab] = useState<"highlow" | "craps">("highlow");

  // High/Low game state
  const [coins, setCoins] = useState(1000);
  const [deck, setDeck] = useState<Card[]>([]);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [nextCard, setNextCard] = useState<Card | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [betAmount, setBetAmount] = useState(50);
  const [result, setResult] = useState<"win" | "loss" | "push" | null>(null);
  const [showParticles, setShowParticles] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [showEndModal, setShowEndModal] = useState(false);
  const [totalWon, setTotalWon] = useState(0);

  const startGame = useCallback(() => {
    const newDeck = makeDeck();
    setDeck(newDeck);
    setCurrentCard(newDeck[0]);
    setNextCard(newDeck[1]);
    setStreak(0);
    setResult(null);
    setGameActive(true);
    setCardIndex(1);
    setShowEndModal(false);
    setTotalWon(0);
  }, []);

  const placeBet = (direction: "higher" | "lower") => {
    if (!gameActive || !nextCard || coins < betAmount) return;

    const won = direction === "higher" ? nextCard.value > currentCard!.value : nextCard.value < currentCard!.value;
    const push = nextCard.value === currentCard!.value;

    if (push) {
      setResult("push");
    } else if (won) {
      const multiplier = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
      const winnings = Math.floor(betAmount * multiplier);
      setCoins((c) => c + winnings);
      setTotalWon((w) => w + winnings);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => Math.max(b, ns));
        return ns;
      });
      setResult("win");
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
    } else {
      setCoins((c) => c - betAmount);
      setStreak(0);
      setResult("loss");
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
    }

    // Advance to next card
    setTimeout(() => {
      const nextIdx = cardIndex + 1;
      if (nextIdx >= deck.length) {
        setGameActive(false);
        setShowEndModal(true);
        return;
      }
      setCurrentCard(nextCard);
      setNextCard(deck[nextIdx]);
      setCardIndex(nextIdx);
      setResult(null);
    }, 1200);
  };

  const streakEmoji = streak >= 10 ? "🔥🔥🔥" : streak >= 5 ? "🔥🔥" : streak >= 3 ? "🔥" : "";
  const multiplier = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
  const progress = deck.length > 0 ? Math.round((cardIndex / deck.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Games</h2>
          <p className="text-muted text-sm mt-1">Play and win virtual coins</p>
        </div>
        <div className="flex items-center gap-2 bg-bg-alt px-4 py-2 rounded-lg">
          <Coins className="w-5 h-5 text-warning" />
          <span className="font-bold">{coins.toLocaleString()}</span>
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex gap-2 p-1 bg-bg-alt rounded-lg w-fit">
        <button
          onClick={() => setTab("highlow")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "highlow" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          High / Low Card
        </button>
        <button
          onClick={() => setTab("craps")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "craps" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          Street Craps
        </button>
      </div>

      {showParticles && <ParticleBurst type={result === "win" ? "win" : "loss"} />}

      {tab === "highlow" && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-bg-alt px-3 py-1.5 rounded-lg">
              <Flame className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">{streak} streak {streakEmoji}</span>
            </div>
            {multiplier > 1 && (
              <div className="flex items-center gap-2 bg-success/10 px-3 py-1.5 rounded-lg">
                <Trophy className="w-4 h-4 text-success" />
                <span className="text-sm font-medium text-success">{multiplier}x multiplier</span>
              </div>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted">Best: {bestStreak}</span>
          </div>

          {/* Progress bar */}
          {gameActive && (
            <div className="w-full bg-bg-alt rounded-full h-2 overflow-hidden">
              <div className="bg-accent h-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Card display */}
          <div className="flex items-center justify-center gap-8 py-8">
            <div className="text-center">
              <p className="text-xs text-muted mb-2">Current</p>
              <PlayingCard card={currentCard || undefined} faceDown={!currentCard} size="large" />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted mb-2">Next</p>
              <PlayingCard card={nextCard || undefined} faceDown={!nextCard || result === null} size="large" />
            </div>
          </div>

          {/* Result display */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key={result + cardIndex}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className={cn(
                  "text-center font-bold text-lg py-2",
                  result === "win" && "text-success",
                  result === "loss" && "text-danger",
                  result === "push" && "text-accent"
                )}
              >
                {result === "win" && `🎉 You won ${Math.floor(betAmount * multiplier)} coins!`}
                {result === "loss" && `😔 You lost ${betAmount} coins`}
                {result === "push" && "🤝 Push — same card, bet returned"}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Controls */}
          {!gameActive ? (
            <div className="flex flex-col items-center gap-3">
              <button onClick={startGame} className="btn-primary px-8 py-3 text-lg">
                {cardIndex > 0 ? "Play Again" : "Start Game"}
              </button>
              {cardIndex > 0 && (
                <p className="text-xs text-muted">Deck complete! You won {totalWon} coins this round.</p>
              )}
            </div>
          ) : (
            <>
              {/* Bet slider */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">Bet:</span>
                <input
                  type="range"
                  min="10"
                  max={Math.min(coins, 500)}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="flex-1 accent-accent"
                />
                <span className="text-sm font-bold w-16 text-right">{betAmount} coins</span>
              </div>

              {/* Bet buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => placeBet("higher")}
                  disabled={!!result || coins < betAmount}
                  className="btn-primary flex items-center justify-center gap-2 py-4 text-lg"
                >
                  <TrendingUp className="w-6 h-6" />
                  Higher
                </button>
                <button
                  onClick={() => placeBet("lower")}
                  disabled={!!result || coins < betAmount}
                  className="btn-secondary flex items-center justify-center gap-2 py-4 text-lg"
                >
                  <TrendingDown className="w-6 h-6" />
                  Lower
                </button>
              </div>
            </>
          )}

          {/* End of deck modal */}
          <AnimatePresence>
            {showEndModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
                onClick={() => setShowEndModal(false)}
              >
                <motion.div
                  initial={{ scale: 0.8, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.8, y: 20 }}
                  className="card max-w-sm w-full text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trophy className="w-12 h-12 text-warning mx-auto mb-3" />
                  <h3 className="text-xl font-bold mb-2">Deck Complete!</h3>
                  <p className="text-muted text-sm mb-1">You won {totalWon} coins</p>
                  <p className="text-muted text-sm mb-4">Best streak: {bestStreak}</p>

                  <div className="space-y-2">
                    <button onClick={() => setShowEndModal(false)} className="btn-primary w-full flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" /> Walk Away
                    </button>
                    <button
                      onClick={() => {
                        showAlert("info", "INC staking coming soon — walk away for now!");
                        setShowEndModal(false);
                      }}
                      className="btn-secondary w-full flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" /> Stake INC for Bonus
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {tab === "craps" && (
        <CrapsGame />
      )}
    </div>
  );
}
