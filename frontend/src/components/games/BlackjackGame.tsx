import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins, Bot, Square, RotateCcw, Users, User, TrendingUp } from "lucide-react";
import { Card, PlayingCard, makeDeck, blackjackValue, isBlackjack, AI_NAMES } from "./CardUtils";

type Phase = "betting" | "dealing" | "player" | "dealer" | "showdown";
type Mode = "vs-dealer" | "live-table";

interface Player {
  name: string;
  hand: Card[];
  isAI: boolean;
  isYou: boolean;
  standing: boolean;
  busted: boolean;
  doubled: boolean;
  bet: number;
  result?: "win" | "lose" | "push" | "blackjack";
}

export function BlackjackGame() {
  const [coins, setCoins] = useState(1000);
  const [betAmount, setBetAmount] = useState(50);
  const [mode, setMode] = useState<Mode>("vs-dealer");
  const [phase, setPhase] = useState<Phase>("betting");
  const [deck, setDeck] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [totalWon, setTotalWon] = useState(0);
  const [handsPlayed, setHandsPlayed] = useState(0);
  const deckRef = useRef<Card[]>([]);

  const drawCard = useCallback((): Card => {
    if (deckRef.current.length < 10) {
      deckRef.current = makeDeck(4);
    }
    return deckRef.current.pop()!;
  }, []);

  const startRound = () => {
    if (coins < betAmount) return;
    deckRef.current = makeDeck(4);
    setDeck(deckRef.current);

    const numAI = mode === "live-table" ? 3 : 0;
    const newPlayers: Player[] = [
      { name: "You", hand: [], isAI: false, isYou: true, standing: false, busted: false, doubled: false, bet: betAmount },
    ];
    for (let i = 0; i < numAI; i++) {
      newPlayers.push({ name: AI_NAMES[i], hand: [], isAI: true, isYou: false, standing: false, busted: false, doubled: false, bet: betAmount });
    }

    // Deal 2 cards each
    for (let round = 0; round < 2; round++) {
      for (const p of newPlayers) {
        p.hand.push(deckRef.current.pop()!);
      }
    }
    const dHand = [deckRef.current.pop()!, deckRef.current.pop()!];
    setDealerHand(dHand);
    setPlayers(newPlayers);
    setCoins((c) => c - betAmount * newPlayers.length);
    setCurrentPlayerIdx(0);
    setShowResult(false);

    // Check for blackjacks
    if (isBlackjack(newPlayers[0].hand)) {
      setPhase("showdown");
      resolveShowdown(newPlayers, dHand);
    } else {
      setPhase("player");
    }
  };

  const resolveShowdown = (pls: Player[], dHand: Card[]) => {
    // Dealer plays
    let dealerHand = [...dHand];
    while (blackjackValue(dealerHand) < 17 && deckRef.current.length > 0) {
      dealerHand.push(deckRef.current.pop()!);
    }
    setDealerHand(dealerHand);
    const dealerVal = blackjackValue(dealerHand);
    const dealerBust = dealerVal > 21;

    const updated = pls.map((p) => {
      const pVal = blackjackValue(p.hand);
      if (p.busted) {
        return { ...p, result: "lose" as const };
      }
      if (isBlackjack(p.hand) && !isBlackjack(dealerHand)) {
        const win = Math.floor(p.bet * 2.5);
        setCoins((c) => c + win);
        setTotalWon((w) => w + win - p.bet);
        return { ...p, result: "blackjack" as const };
      }
      if (dealerBust || pVal > dealerVal) {
        const win = p.doubled ? p.bet * 4 : p.bet * 2;
        setCoins((c) => c + win);
        setTotalWon((w) => w + win - (p.doubled ? p.bet * 2 : p.bet));
        return { ...p, result: "win" as const };
      }
      if (pVal === dealerVal) {
        setCoins((c) => c + p.bet);
        return { ...p, result: "push" as const };
      }
      return { ...p, result: "lose" as const };
    });
    setPlayers(updated);
    setPhase("showdown");
    setShowResult(true);
    setHandsPlayed((h) => h + 1);
  };

  const nextPlayer = (pls: Player[], idx: number) => {
    let next = idx + 1;
    while (next < pls.length && pls[next].standing) next++;
    if (next >= pls.length) {
      resolveShowdown(pls, dealerHand);
    } else {
      setCurrentPlayerIdx(next);
      if (pls[next].isAI) {
        aiPlayTurn(pls, next);
      }
    }
  };

  const aiPlayTurn = (pls: Player[], idx: number) => {
    const player = pls[idx];
    const val = blackjackValue(player.hand);
    setTimeout(() => {
      if (val < 17) {
        const card = deckRef.current.pop()!;
        const newHand = [...player.hand, card];
        const newVal = blackjackValue(newHand);
        const updated = pls.map((p, i) => i === idx ? { ...p, hand: newHand, busted: newVal > 21 } : p);
        setPlayers(updated);
        if (newVal > 21) {
          setTimeout(() => nextPlayer(updated, idx), 800);
        } else if (newVal < 17) {
          setTimeout(() => aiPlayTurn(updated, idx), 1000);
        } else {
          const stood = updated.map((p, i) => i === idx ? { ...p, standing: true } : p);
          setPlayers(stood);
          setTimeout(() => nextPlayer(stood, idx), 800);
        }
      } else {
        const stood = pls.map((p, i) => i === idx ? { ...p, standing: true } : p);
        setPlayers(stood);
        setTimeout(() => nextPlayer(stood, idx), 800);
      }
    }, 1200);
  };

  const hit = () => {
    if (phase !== "player" || players[currentPlayerIdx]?.isAI) return;
    const card = deckRef.current.pop()!;
    const newHand = [...players[currentPlayerIdx].hand, card];
    const newVal = blackjackValue(newHand);
    const updated = players.map((p, i) => i === currentPlayerIdx ? { ...p, hand: newHand, busted: newVal > 21 } : p);
    setPlayers(updated);
    if (newVal > 21) {
      const stood = updated.map((p, i) => i === currentPlayerIdx ? { ...p, standing: true } : p);
      setPlayers(stood);
      setTimeout(() => nextPlayer(stood, currentPlayerIdx), 1000);
    } else if (newVal === 21) {
      const stood = updated.map((p, i) => i === currentPlayerIdx ? { ...p, standing: true } : p);
      setPlayers(stood);
      setTimeout(() => nextPlayer(stood, currentPlayerIdx), 1000);
    }
  };

  const stand = () => {
    if (phase !== "player" || players[currentPlayerIdx]?.isAI) return;
    const stood = players.map((p, i) => i === currentPlayerIdx ? { ...p, standing: true } : p);
    setPlayers(stood);
    nextPlayer(stood, currentPlayerIdx);
  };

  const doubleDown = () => {
    if (phase !== "player" || players[currentPlayerIdx]?.isAI) return;
    if (players[currentPlayerIdx].hand.length !== 2) return;
    if (coins < betAmount) return;
    const card = deckRef.current.pop()!;
    const p = players[currentPlayerIdx];
    const newHand = [...p.hand, card];
    const newVal = blackjackValue(newHand);
    setCoins((c) => c - betAmount);
    const updated = players.map((p, i) => i === currentPlayerIdx ? { ...p, hand: newHand, doubled: true, standing: true, busted: newVal > 21, bet: p.bet * 2 } : p);
    setPlayers(updated);
    setTimeout(() => nextPlayer(updated, currentPlayerIdx), 1000);
  };

  // Auto-play: basic strategy
  useEffect(() => {
    if (!autoPlay || phase !== "player") return;
    const p = players[currentPlayerIdx];
    if (!p || p.isAI) return;
    const val = blackjackValue(p.hand);
    const timer = setTimeout(() => {
      if (val < 17) {
        hit();
      } else {
        stand();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [autoPlay, phase, currentPlayerIdx, players]);

  // AI auto-play when it's their turn
  useEffect(() => {
    if (phase !== "player") return;
    const p = players[currentPlayerIdx];
    if (p && p.isAI && !p.standing && !p.busted) {
      aiPlayTurn(players, currentPlayerIdx);
    }
  }, [phase, currentPlayerIdx, players]);

  const reset = () => {
    setPhase("betting");
    setPlayers([]);
    setDealerHand([]);
    setShowResult(false);
    setAutoPlay(false);
    setTotalWon(0);
    setHandsPlayed(0);
  };

  const youPlayer = players.find((p) => p.isYou);
  const dealerVal = blackjackValue(dealerHand);

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
          <span className="text-sm text-muted">Hands: {handsPlayed}</span>
        </div>
        {(totalWon > 0 || handsPlayed > 0) && (
          <button onClick={reset} className="btn-ghost text-xs flex items-center gap-1 ml-auto">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        )}
      </div>

      {/* Mode selector */}
      {phase === "betting" && (
        <div className="flex gap-2">
          <button
            onClick={() => setMode("vs-dealer")}
            className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all", mode === "vs-dealer" ? "bg-accent/20 border-accent text-accent" : "bg-bg-alt border-border text-muted hover:text-white")}
          >
            <User className="w-4 h-4" /> vs Dealer
          </button>
          <button
            onClick={() => setMode("live-table")}
            className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all", mode === "live-table" ? "bg-accent/20 border-accent text-accent" : "bg-bg-alt border-border text-muted hover:text-white")}
          >
            <Users className="w-4 h-4" /> Live Table (3 AI + You)
          </button>
        </div>
      )}

      {/* Dealer */}
      {phase !== "betting" && dealerHand.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Dealer</span>
            {phase === "showdown" && (
              <span className={cn("text-sm font-bold", dealerVal > 21 ? "text-danger" : "text-success")}>
                {dealerVal > 21 ? "Bust" : dealerVal}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {dealerHand.map((card, i) => (
              <PlayingCard key={i} card={card} faceDown={i === 1 && phase === "player"} size="small" />
            ))}
          </div>
        </div>
      )}

      {/* Players */}
      {phase !== "betting" && players.map((p, i) => (
        <div key={i} className={cn("card", currentPlayerIdx === i && phase === "player" && "border-accent")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              {p.name}
              {p.isAI && <span className="text-muted text-xs ml-1">(AI)</span>}
              {currentPlayerIdx === i && phase === "player" && !p.standing && <span className="text-accent text-xs ml-1">← Turn</span>}
            </span>
            <span className={cn("text-sm font-bold", p.busted ? "text-danger" : blackjackValue(p.hand) === 21 ? "text-success" : "")}>
              {blackjackValue(p.hand) > 0 && (p.busted ? "Bust" : blackjackValue(p.hand))}
              {p.result === "win" && " — Win!"}
              {p.result === "lose" && " — Lose"}
              {p.result === "push" && " — Push"}
              {p.result === "blackjack" && " — Blackjack!"}
            </span>
          </div>
          <div className="flex gap-2">
            {p.hand.map((card, j) => (
              <PlayingCard key={j} card={card} size="small" />
            ))}
          </div>
        </div>
      ))}

      {/* Result */}
      <AnimatePresence>
        {showResult && youPlayer && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={cn(
              "text-center py-3 rounded-lg font-bold text-lg",
              youPlayer.result === "win" || youPlayer.result === "blackjack" ? "bg-success/10 text-success" :
              youPlayer.result === "push" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
            )}
          >
            {youPlayer.result === "blackjack" ? "🎉 Blackjack!" :
             youPlayer.result === "win" ? "🎉 You Won!" :
             youPlayer.result === "push" ? "🤝 Push" : "😔 You Lost"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      {phase === "betting" ? (
        <div className="space-y-3">
          <div>
            <label className="label">Bet Amount</label>
            <div className="flex items-center gap-3">
              <input type="range" min="10" max={Math.min(coins, 500)} value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="flex-1 accent-accent" />
              <span className="text-sm font-bold w-16 text-right">{betAmount}</span>
            </div>
          </div>
          <button onClick={startRound} disabled={coins < betAmount * (mode === "live-table" ? 4 : 1)} className="btn-primary w-full py-4 text-lg disabled:opacity-50">
            {coins < betAmount * (mode === "live-table" ? 4 : 1) ? "Not enough coins" : "Deal Cards"}
          </button>
        </div>
      ) : phase === "player" && !players[currentPlayerIdx]?.isAI ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={hit} disabled={!!autoPlay} className="btn-primary py-3 disabled:opacity-50">Hit</button>
            <button onClick={stand} disabled={!!autoPlay} className="btn-secondary py-3 disabled:opacity-50">Stand</button>
            <button onClick={doubleDown} disabled={!!autoPlay || coins < betAmount || players[currentPlayerIdx]?.hand.length !== 2} className="btn-secondary py-3 disabled:opacity-50">Double</button>
          </div>
          <button
            onClick={() => setAutoPlay(!autoPlay)}
            className={cn("w-full flex items-center justify-center gap-2 py-3 font-medium transition-all rounded-lg border-2",
              autoPlay ? "bg-accent/20 border-accent text-accent" : "bg-bg-alt border-border text-muted hover:text-white hover:border-accent/50")}
          >
            {autoPlay ? <><Square className="w-5 h-5" /> Stop Auto Play</> : <><Bot className="w-5 h-5" /> Auto Play</>}
          </button>
        </div>
      ) : phase === "showdown" ? (
        <button onClick={() => { setPhase("betting"); setShowResult(false); }} className="btn-primary w-full py-4 text-lg">
          Next Hand
        </button>
      ) : (
        <div className="text-center text-muted text-sm py-4">AI playing...</div>
      )}
    </div>
  );
}
