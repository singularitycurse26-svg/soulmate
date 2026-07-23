import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Flame, TrendingUp, TrendingDown, Trophy, Dice5, RotateCcw, Lock, Bot, Square } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PachinkoGame } from "./PachinkoGame";
import { BlackjackGame } from "./BlackjackGame";
import { TexasHoldemGame } from "./TexasHoldemGame";

const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
const RANK_VALUES: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_VALUES[r] = i + 2));

type Card = { suit: string; rank: string; value: number };

const NUM_DECKS = 4;

function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < NUM_DECKS; d++) {
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
  const [tab, setTab] = useState<"highlow" | "pachinko" | "blackjack" | "holdem">("highlow");

  // High/Low game state
  const [coins, setCoins] = useState(1000);
  const [deck, setDeck] = useState<Card[]>([]);
  const [currentCard, setCurrentCard] = useState<Card | null>(null);
  const [nextCard, setNextCard] = useState<Card | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [betAmount, setBetAmount] = useState(50);
  const [result, setResult] = useState<"win" | "loss" | "push" | "ace-bonus" | "king-wild" | null>(null);
  const [showParticles, setShowParticles] = useState(false);
  const [gameActive, setGameActive] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [showEndModal, setShowEndModal] = useState(false);
  const [totalWon, setTotalWon] = useState(0);

  // New rules state
  const [aceBonusTurn, setAceBonusTurn] = useState(false);
  const [kingAutoTurns, setKingAutoTurns] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [userAutoPlay, setUserAutoPlay] = useState(false);
  const [specialMessage, setSpecialMessage] = useState<string | null>(null);

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
    setAceBonusTurn(false);
    setKingAutoTurns(0);
    setAutoPlaying(false);
    setUserAutoPlay(false);
    setSpecialMessage(null);
  }, []);

  const advanceCard = (idx: number, d: Card[]) => {
    const nextIdx = idx + 1;
    if (nextIdx >= d.length) {
      setGameActive(false);
      setShowEndModal(true);
      return false;
    }
    setCurrentCard(d[nextIdx - 1] || d[idx]);
    setNextCard(d[nextIdx]);
    setCardIndex(nextIdx);
    return true;
  };

  const placeBet = (direction: "higher" | "lower") => {
    if (!gameActive || !nextCard || coins < betAmount || autoPlaying) return;

    const nextVal = nextCard.value;

    // King = wild card: 3 free auto turns
    if (nextVal === 13) {
      setResult("king-wild");
      setSpecialMessage("\ud83d\ud51c King Wild Card! 3 free auto turns!");
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
      // Advance past the King, then start auto turns
      setTimeout(() => {
        const nextIdx = cardIndex + 1;
        if (nextIdx >= deck.length) {
          setGameActive(false);
          setShowEndModal(true);
          return;
        }
        setCurrentCard(deck[nextIdx]);
        setNextCard(deck[nextIdx + 1] || null);
        setCardIndex(nextIdx + 1);
        setResult(null);
        setKingAutoTurns(3);
        setAutoPlaying(true);
      }, 1500);
      return;
    }

    // Ace = bonus turn: draw again, win = 2x
    if (nextVal === 14) {
      setResult("ace-bonus");
      setSpecialMessage("\ud83c\udca1 Ace! Bonus turn \u2014 win for 2x payout!");
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
      setAceBonusTurn(true);
      // Advance past the Ace for the bonus turn
      setTimeout(() => {
        const nextIdx = cardIndex + 1;
        if (nextIdx >= deck.length) {
          setGameActive(false);
          setShowEndModal(true);
          return;
        }
        setCurrentCard(deck[nextIdx]);
        setNextCard(deck[nextIdx + 1] || null);
        setCardIndex(nextIdx + 1);
        setResult(null);
      }, 1500);
      return;
    }

    // 10, J, Q = push (don't matter for high/low, only 1-8 i.e. 2-9 count)
    if (nextVal >= 10 && nextVal <= 12) {
      setResult("push");
      setSpecialMessage("Push \u2014 10/J/Q don't count for high/low");
      setTimeout(() => {
        setSpecialMessage(null);
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
      return;
    }

    // Normal high/low (values 2-9)
    const won = direction === "higher" ? nextVal > currentCard!.value : nextVal < currentCard!.value;
    const push = nextVal === currentCard!.value;

    if (push) {
      setResult("push");
    } else if (won) {
      const streakMult = streak >= 10 ? 3 : streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
      const aceMult = aceBonusTurn ? 2 : 1;
      const winnings = Math.floor(betAmount * streakMult * aceMult);
      setCoins((c) => c + winnings);
      setTotalWon((w) => w + winnings);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => Math.max(b, ns));
        return ns;
      });
      setResult("win");
      if (aceBonusTurn) {
        setSpecialMessage("\ud83c\udf89 Ace bonus win! 2x payout!");
        setAceBonusTurn(false);
      }
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
    } else {
      setCoins((c) => c - betAmount);
      setStreak(0);
      setResult("loss");
      if (aceBonusTurn) {
        setSpecialMessage("Ace bonus turn lost");
        setAceBonusTurn(false);
      }
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 800);
    }

    // Advance to next card
    setTimeout(() => {
      setSpecialMessage(null);
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

  // King auto-play effect
  useEffect(() => {
    if (!autoPlaying || kingAutoTurns <= 0) return;
    if (cardIndex >= deck.length - 1) {
      setAutoPlaying(false);
      setGameActive(false);
      setShowEndModal(true);
      return;
    }

    const timer = setTimeout(() => {
      const leftCard = deck[cardIndex];
      const rightCard = deck[cardIndex + 1];
      if (!leftCard || !rightCard) {
        setAutoPlaying(false);
        setGameActive(false);
        setShowEndModal(true);
        return;
      }

      setCurrentCard(leftCard);
      setNextCard(rightCard);
      setResult(null);

      // Auto-resolve: right card tries to beat left card
      setTimeout(() => {
        const won = rightCard.value > leftCard.value;
        if (won) {
          const winnings = betAmount;
          setCoins((c) => c + winnings);
          setTotalWon((w) => w + winnings);
          setResult("win");
          setShowParticles(true);
          setTimeout(() => setShowParticles(false), 800);
        } else {
          setResult("loss");
        }

        const newIdx = cardIndex + 2;
        setKingAutoTurns((k) => {
          const remaining = k - 1;
          if (remaining <= 0) {
            setAutoPlaying(false);
            setSpecialMessage(null);
            // Return to normal play
            setTimeout(() => {
              if (newIdx >= deck.length) {
                setGameActive(false);
                setShowEndModal(true);
                return;
              }
              setCurrentCard(deck[newIdx - 1]);
              setNextCard(deck[newIdx] || null);
              setCardIndex(newIdx);
              setResult(null);
            }, 1500);
          } else {
            setCardIndex(newIdx);
          }
          return remaining;
        });
      }, 1000);
    }, 1200);

    return () => clearTimeout(timer);
  }, [autoPlaying, kingAutoTurns, cardIndex, deck, betAmount]);

  // User auto-play effect: automatically pick higher/lower based on current card
  useEffect(() => {
    if (!userAutoPlay || !gameActive || autoPlaying || kingAutoTurns > 0) return;
    if (!currentCard || !nextCard || result || coins < betAmount) return;

    const timer = setTimeout(() => {
      // Strategy: low cards (2-5) -> higher, high cards (6-9) -> lower
      // 10/J/Q/K/A don't matter for high/low so just pick higher
      const dir = currentCard.value <= 7 ? "higher" : "lower";
      placeBet(dir);
    }, 1000);

    return () => clearTimeout(timer);
  }, [userAutoPlay, gameActive, autoPlaying, kingAutoTurns, currentCard, nextCard, result, coins, betAmount, cardIndex]);

  // Stop user auto-play when deck ends
  useEffect(() => {
    if (!gameActive && userAutoPlay) {
      setUserAutoPlay(false);
    }
  }, [gameActive, userAutoPlay]);

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
      <div className="flex gap-2 p-1 bg-bg-alt rounded-lg w-fit flex-wrap">
        <button
          onClick={() => setTab("highlow")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "highlow" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          High / Low Card
        </button>
        <button
          onClick={() => setTab("pachinko")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "pachinko" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          Pachinko
        </button>
        <button
          onClick={() => setTab("blackjack")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "blackjack" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          Blackjack
        </button>
        <button
          onClick={() => setTab("holdem")}
          className={cn("px-4 py-2 rounded-md text-sm font-medium transition-all", tab === "holdem" ? "bg-accent text-white" : "text-muted hover:text-white")}
        >
          Texas Hold'em
        </button>
      </div>

      {showParticles && <ParticleBurst type={result === "win" ? "win" : "loss"} />}

      {tab === "highlow" && (
        <div className="space-y-4">
          {/* Stats bar */}
          <div className="flex items-center gap-4 flex-wrap">
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
            {aceBonusTurn && (
              <div className="flex items-center gap-2 bg-accent/10 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-bold text-accent">\ud83c\udca1 Ace Bonus (2x)</span>
              </div>
            )}
            {kingAutoTurns > 0 && (
              <div className="flex items-center gap-2 bg-warning/10 px-3 py-1.5 rounded-lg">
                <span className="text-sm font-bold text-warning">\ud83d\ud51c Wild: {kingAutoTurns} auto turns left</span>
              </div>
            )}
            <div className="flex-1" />
            <span className="text-xs text-muted">Best: {bestStreak}</span>
          </div>

          {/* Special message banner */}
          {specialMessage && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "text-center py-2 rounded-lg font-bold text-sm",
                (result === "king-wild" || kingAutoTurns > 0) && "bg-warning/10 text-warning",
                result === "ace-bonus" && "bg-accent/10 text-accent",
                result === "win" && aceBonusTurn === false && "bg-success/10 text-success",
              )}
            >
              {specialMessage}
            </motion.div>
          )}

          {/* Progress bar */}
          {gameActive && (
            <div className="w-full bg-bg-alt rounded-full h-2 overflow-hidden">
              <div className="bg-accent h-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          )}

          {/* Card display */}
          <div className="flex items-center justify-center gap-8 py-8">
            <div className="text-center">
              <p className="text-xs text-muted mb-2">{autoPlaying ? "Left (High)" : "Current"}</p>
              <PlayingCard card={currentCard || undefined} faceDown={!currentCard} size="large" />
            </div>
            <div className="text-center">
              <p className="text-xs text-muted mb-2">{autoPlaying ? "Right (Beats it?)" : "Next"}</p>
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
                {result === "win" && `🎉 You won ${Math.floor(betAmount * multiplier * (aceBonusTurn ? 1 : 1))} coins!`}
                {result === "loss" && `😔 You lost ${betAmount} coins`}
                {result === "push" && "🤝 Push — bet returned"}
                {result === "ace-bonus" && "🂡 Ace drawn! Bonus turn next..."}
                {result === "king-wild" && "🜔 King Wild Card! 3 free auto turns!"}
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
                  disabled={!!result || coins < betAmount || autoPlaying || userAutoPlay}
                  className="btn-primary flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50"
                >
                  <TrendingUp className="w-6 h-6" />
                  Higher
                </button>
                <button
                  onClick={() => placeBet("lower")}
                  disabled={!!result || coins < betAmount || autoPlaying || userAutoPlay}
                  className="btn-secondary flex items-center justify-center gap-2 py-4 text-lg disabled:opacity-50"
                >
                  <TrendingDown className="w-6 h-6" />
                  Lower
                </button>
              </div>

              {/* Auto Play toggle */}
              <button
                onClick={() => setUserAutoPlay(!userAutoPlay)}
                disabled={coins < betAmount}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 font-medium transition-all rounded-lg border-2 disabled:opacity-50",
                  userAutoPlay
                    ? "bg-accent/20 border-accent text-accent"
                    : "bg-bg-alt border-border text-muted hover:text-white hover:border-accent/50"
                )}
              >
                {userAutoPlay ? (
                  <><Square className="w-5 h-5" /> Stop Auto Play</>
                ) : (
                  <><Bot className="w-5 h-5" /> Auto Play</>
                )}
              </button>

              {/* Rules info */}
              <div className="card text-xs text-muted">
                <p className="font-medium text-white mb-1">Rules:</p>
                <p>\u00b7 4 decks, play till all cards gone</p>
                <p>\u00b7 Cards 2-9: high/low decides win/loss</p>
                <p>\u00b7 10/J/Q: push (bet returned)</p>
                <p>\u00b7 Ace: bonus turn \u2014 win for 2x payout</p>
                <p>\u00b7 King: wild card \u2014 3 free auto turns (left=high, right beats it)</p>
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
                  <p className="text-muted text-sm mb-1">You won {totalWon} coins from {Math.round(cardIndex / 2)} turns</p>
                  <p className="text-muted text-sm mb-4">Best streak: {bestStreak} \u00b7 {deck.length} cards played</p>

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

      {tab === "pachinko" && (
        <PachinkoGame />
      )}

      {tab === "blackjack" && (
        <BlackjackGame />
      )}

      {tab === "holdem" && (
        <TexasHoldemGame />
      )}
    </div>
  );
}
