import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Coins, Bot, Square, RotateCcw, Users, User, TrendingUp, Trophy } from "lucide-react";
import { Card, PlayingCard, makeDeck, bestHand, compareHands, evaluatePokerHand, AI_NAMES, HandRank } from "./CardUtils";

type Phase = "betting" | "preflop" | "flop" | "turn" | "river" | "showdown";
type Mode = "heads-up" | "full-table";
type Action = "fold" | "check" | "call" | "raise";

interface Player {
  name: string;
  hand: Card[];
  isAI: boolean;
  isYou: boolean;
  folded: boolean;
  allIn: boolean;
  chips: number;
  currentBet: number;
  hasActed: boolean;
  bestHandResult?: HandRank;
  result?: "win" | "lose" | "tie";
  winAmount?: number;
}

export function TexasHoldemGame() {
  const [coins, setCoins] = useState(1000);
  const [betAmount, setBetAmount] = useState(50);
  const [mode, setMode] = useState<Mode>("heads-up");
  const [phase, setPhase] = useState<Phase>("betting");
  const [community, setCommunity] = useState<Card[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [dealerIdx, setDealerIdx] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [totalWon, setTotalWon] = useState(0);
  const [handsPlayed, setHandsPlayed] = useState(0);
  const deckRef = useRef<Card[]>([]);

  const drawCard = (): Card => {
    if (deckRef.current.length < 10) deckRef.current = makeDeck(4);
    return deckRef.current.pop()!;
  };

  const startHand = () => {
    if (coins < betAmount * 2) return;
    deckRef.current = makeDeck(4);

    const numPlayers = mode === "heads-up" ? 2 : 6;
    const newPlayers: Player[] = [];
    newPlayers.push({ name: "You", hand: [], isAI: false, isYou: true, folded: false, allIn: false, chips: coins, currentBet: 0, hasActed: false });
    for (let i = 1; i < numPlayers; i++) {
      newPlayers.push({ name: AI_NAMES[i - 1], hand: [], isAI: true, isYou: false, folded: false, allIn: false, chips: 1000, currentBet: 0, hasActed: false });
    }

    // Deal 2 cards each
    for (let round = 0; round < 2; round++) {
      for (const p of newPlayers) {
        p.hand.push(deckRef.current.pop()!);
      }
    }

    // Blinds
    const sbIdx = (dealerIdx + 1) % numPlayers;
    const bbIdx = (dealerIdx + 2) % numPlayers;
    const sb = Math.floor(betAmount / 2);
    const bb = betAmount;
    newPlayers[sbIdx].currentBet = sb;
    newPlayers[sbIdx].chips -= sb;
    newPlayers[bbIdx].currentBet = bb;
    newPlayers[bbIdx].chips -= bb;

    setPlayers(newPlayers);
    setCommunity([]);
    setPot(sb + bb);
    setCurrentBet(bb);
    setCurrentPlayerIdx((bbIdx + 1) % numPlayers);
    setShowResult(false);
    setPhase("preflop");
  };

  const advancePhase = (pls: Player[], currentPot: number, currentCommunity: Card[]) => {
    // Reset hasActed and currentBet for new round
    const reset = pls.map((p) => ({ ...p, hasActed: false, currentBet: 0 }));
    setPlayers(reset);
    setCurrentBet(0);

    if (phase === "preflop") {
      // Deal flop (3 cards)
      const flop = [drawCard(), drawCard(), drawCard()];
      const newComm = [...currentCommunity, ...flop];
      setCommunity(newComm);
      setPhase("flop");
      // First active player after dealer
      const firstIdx = findNextActive(reset, dealerIdx);
      setCurrentPlayerIdx(firstIdx);
    } else if (phase === "flop") {
      const turn = drawCard();
      const newComm = [...currentCommunity, turn];
      setCommunity(newComm);
      setPhase("turn");
      const firstIdx = findNextActive(reset, dealerIdx);
      setCurrentPlayerIdx(firstIdx);
    } else if (phase === "turn") {
      const river = drawCard();
      const newComm = [...currentCommunity, river];
      setCommunity(newComm);
      setPhase("river");
      const firstIdx = findNextActive(reset, dealerIdx);
      setCurrentPlayerIdx(firstIdx);
    } else if (phase === "river") {
      // Showdown
      doShowdown(reset, currentCommunity);
    }
  };

  const findNextActive = (pls: Player[], afterIdx: number): number => {
    let idx = (afterIdx + 1) % pls.length;
    let count = 0;
    while (pls[idx].folded && count < pls.length) {
      idx = (idx + 1) % pls.length;
      count++;
    }
    return idx;
  };

  const checkRoundComplete = (pls: Player[]): boolean => {
    const active = pls.filter((p) => !p.folded);
    if (active.length <= 1) return true;
    return active.every((p) => p.hasActed && (p.currentBet === currentBet || p.allIn || p.chips === 0));
  };

  const nextTurn = (pls: Player[], currentPot: number, currentCommunity: Card[]) => {
    // Check if only one player left
    const active = pls.filter((p) => !p.folded);
    if (active.length <= 1) {
      // Winner takes pot
      const winner = active[0];
      const updated = pls.map((p) => p === winner ? { ...p, chips: p.chips + currentPot, result: "win" as const, winAmount: currentPot } : p);
      setPlayers(updated);
      if (winner.isYou) {
        setCoins((c) => c + currentPot);
        setTotalWon((w) => w + currentPot);
      }
      setPot(0);
      setPhase("showdown");
      setShowResult(true);
      setHandsPlayed((h) => h + 1);
      return;
    }

    if (checkRoundComplete(pls)) {
      advancePhase(pls, currentPot, currentCommunity);
      return;
    }

    // Next player
    let next = (currentPlayerIdx + 1) % pls.length;
    let count = 0;
    while ((pls[next].folded || pls[next].allIn) && count < pls.length) {
      next = (next + 1) % pls.length;
      count++;
    }
    setCurrentPlayerIdx(next);
  };

  const doShowdown = (pls: Player[], currentCommunity: Card[]) => {
    const active = pls.filter((p) => !p.folded);
    const allCards = [...currentCommunity];
    // Evaluate each active player's best hand
    const evaluated = active.map((p) => ({
      player: p,
      hand: bestHand([...p.hand, ...allCards]),
    }));
    // Sort by hand strength (descending)
    evaluated.sort((a, b) => compareHands(b.hand, a.hand));

    // Find winners (ties possible)
    const bestHandResult = evaluated[0].hand;
    const winners = evaluated.filter((e) => compareHands(e.hand, bestHandResult) === 0);
    const winShare = Math.floor(pot / winners.length);

    const updated = pls.map((p) => {
      const evalResult = evaluated.find((e) => e.player === p);
      if (evalResult) {
        const isWinner = winners.some((w) => w.player === p);
        if (isWinner) {
          const newChips = p.chips + winShare;
          if (p.isYou) {
            setCoins((c) => c + winShare);
            setTotalWon((w) => w + winShare - betAmount);
          }
          return { ...p, chips: newChips, bestHandResult: evalResult.hand, result: "win" as const, winAmount: winShare };
        }
        return { ...p, bestHandResult: evalResult.hand, result: "lose" as const };
      }
      return p;
    });
    setPlayers(updated);
    setPot(0);
    setPhase("showdown");
    setShowResult(true);
    setHandsPlayed((h) => h + 1);
  };

  // Player actions
  const playerAction = (action: Action, raiseAmt?: number) => {
    const p = players[currentPlayerIdx];
    if (!p || p.isAI || p.folded) return;

    const updated = [...players];
    if (action === "fold") {
      updated[currentPlayerIdx] = { ...p, folded: true, hasActed: true };
    } else if (action === "check") {
      updated[currentPlayerIdx] = { ...p, hasActed: true };
    } else if (action === "call") {
      const toCall = currentBet - p.currentBet;
      const actualCall = Math.min(toCall, p.chips);
      updated[currentPlayerIdx] = { ...p, chips: p.chips - actualCall, currentBet: p.currentBet + actualCall, hasActed: true, allIn: p.chips - actualCall === 0 };
      setPot((v) => v + actualCall);
    } else if (action === "raise") {
      const raiseTo = raiseAmt || currentBet + betAmount;
      const toBet = raiseTo - p.currentBet;
      const actualBet = Math.min(toBet, p.chips);
      updated[currentPlayerIdx] = { ...p, chips: p.chips - actualBet, currentBet: p.currentBet + actualBet, hasActed: true, allIn: p.chips - actualBet === 0 };
      setPot((v) => v + actualBet);
      setCurrentBet(raiseTo);
      // Reset hasActed for others
      for (let i = 0; i < updated.length; i++) {
        if (i !== currentPlayerIdx && !updated[i].folded && !updated[i].allIn) {
          updated[i].hasActed = false;
        }
      }
    }
    setPlayers(updated);
    nextTurn(updated, pot, community);
  };

  // AI decision
  const aiDecide = (p: Player, comm: Card[]): Action => {
    const allCards = [...p.hand, ...comm];
    let strength = 0;

    if (comm.length === 0) {
      // Pre-flop: based on hole cards
      const v1 = p.hand[0].value;
      const v2 = p.hand[1].value;
      const pair = v1 === v2;
      const suited = p.hand[0].suit === p.hand[1].suit;
      const high = Math.max(v1, v2);
      const low = Math.min(v1, v2);
      if (pair && high >= 10) strength = 0.9;
      else if (pair) strength = 0.7;
      else if (high >= 13 && low >= 10) strength = 0.75;
      else if (high >= 12 && suited) strength = 0.6;
      else if (high >= 11 && low >= 10) strength = 0.5;
      else if (suited && high >= 10) strength = 0.45;
      else if (high >= 12) strength = 0.4;
      else strength = 0.2;
    } else {
      const hand = bestHand(allCards);
      strength = hand.rank / 9;
      if (hand.rank >= 5) strength = 0.8;
      if (hand.rank >= 7) strength = 0.95;
    }

    const toCall = currentBet - p.currentBet;
    if (toCall === 0) {
      if (strength > 0.7 && Math.random() > 0.3) return "raise";
      return "check";
    }
    if (strength < 0.25 && toCall > betAmount) return "fold";
    if (strength > 0.85 && Math.random() > 0.4) return "raise";
    if (strength < 0.15) return "fold";
    return "call";
  };

  // AI auto-play
  useEffect(() => {
    if (phase === "betting" || phase === "showdown") return;
    const p = players[currentPlayerIdx];
    if (!p || p.folded || p.allIn) {
      if (p) nextTurn(players, pot, community);
      return;
    }
    if (p.isAI) {
      const timer = setTimeout(() => {
        const action = aiDecide(p, community);
        const updated = [...players];
        if (action === "fold") {
          updated[currentPlayerIdx] = { ...p, folded: true, hasActed: true };
        } else if (action === "check") {
          updated[currentPlayerIdx] = { ...p, hasActed: true };
        } else if (action === "call") {
          const toCall = currentBet - p.currentBet;
          const actualCall = Math.min(toCall, p.chips);
          updated[currentPlayerIdx] = { ...p, chips: p.chips - actualCall, currentBet: p.currentBet + actualCall, hasActed: true, allIn: p.chips - actualCall === 0 };
          setPot((v) => v + actualCall);
        } else if (action === "raise") {
          const raiseTo = currentBet + betAmount;
          const toBet = raiseTo - p.currentBet;
          const actualBet = Math.min(toBet, p.chips);
          updated[currentPlayerIdx] = { ...p, chips: p.chips - actualBet, currentBet: p.currentBet + actualBet, hasActed: true, allIn: p.chips - actualBet === 0 };
          setPot((v) => v + actualBet);
          setCurrentBet(raiseTo);
          for (let i = 0; i < updated.length; i++) {
            if (i !== currentPlayerIdx && !updated[i].folded && !updated[i].allIn) {
              updated[i].hasActed = false;
            }
          }
        }
        setPlayers(updated);
        nextTurn(updated, pot, community);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, currentPlayerIdx, players, pot, community, currentBet, betAmount]);

  // Auto-play for user
  useEffect(() => {
    if (!autoPlay || phase === "betting" || phase === "showdown") return;
    const p = players[currentPlayerIdx];
    if (!p || p.isAI || p.folded) return;
    const timer = setTimeout(() => {
      const action = aiDecide(p, community);
      playerAction(action);
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoPlay, phase, currentPlayerIdx, players, community, currentBet]);

  const reset = () => {
    setPhase("betting");
    setPlayers([]);
    setCommunity([]);
    setPot(0);
    setShowResult(false);
    setAutoPlay(false);
    setTotalWon(0);
    setHandsPlayed(0);
  };

  const youPlayer = players.find((p) => p.isYou);
  const toCall = youPlayer ? currentBet - youPlayer.currentBet : 0;

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
          <button onClick={() => setMode("heads-up")} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all", mode === "heads-up" ? "bg-accent/20 border-accent text-accent" : "bg-bg-alt border-border text-muted hover:text-white")}>
            <User className="w-4 h-4" /> Heads-Up (1v1)
          </button>
          <button onClick={() => setMode("full-table")} className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all", mode === "full-table" ? "bg-accent/20 border-accent text-accent" : "bg-bg-alt border-border text-muted hover:text-white")}>
            <Users className="w-4 h-4" /> Full Table (6)
          </button>
        </div>
      )}

      {/* Pot */}
      {phase !== "betting" && (
        <div className="text-center py-2">
          <span className="text-muted text-sm">Pot: </span>
          <span className="text-warning font-bold text-lg">{pot}</span>
          <span className="text-muted text-sm ml-3">Phase: <span className="text-accent capitalize">{phase}</span></span>
        </div>
      )}

      {/* Community cards */}
      {phase !== "betting" && (
        <div className="flex justify-center gap-2 py-2">
          {community.map((card, i) => <PlayingCard key={i} card={card} size="small" />)}
          {Array.from({ length: 5 - community.length }).map((_, i) => <PlayingCard key={`empty-${i}`} faceDown size="small" />)}
        </div>
      )}

      {/* Players */}
      {phase !== "betting" && players.map((p, i) => (
        <div key={i} className={cn("card", currentPlayerIdx === i && phase !== "showdown" && !p.folded && "border-accent", p.folded && "opacity-40")}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">
              {p.name}
              {p.isAI && <span className="text-muted text-xs ml-1">(AI)</span>}
              {i === dealerIdx && <span className="text-muted text-xs ml-1">D</span>}
              {currentPlayerIdx === i && phase !== "showdown" && !p.folded && <span className="text-accent text-xs ml-1">← Turn</span>}
              {p.folded && <span className="text-danger text-xs ml-1">Folded</span>}
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted">Chips: {p.chips}</span>
              {p.currentBet > 0 && <span className="text-warning">Bet: {p.currentBet}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {p.hand.map((card, j) => (
              <PlayingCard key={j} card={card} faceDown={p.isAI && phase !== "showdown" && !p.folded} size="small" />
            ))}
          </div>
          {p.bestHandResult && phase === "showdown" && (
            <p className={cn("text-xs mt-1 font-medium", p.result === "win" ? "text-success" : "text-muted")}>
              {p.bestHandResult.name} {p.result === "win" && `— Won ${p.winAmount}!`}
            </p>
          )}
        </div>
      ))}

      {/* Result */}
      <AnimatePresence>
        {showResult && youPlayer && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className={cn("text-center py-3 rounded-lg font-bold text-lg",
              youPlayer.result === "win" ? "bg-success/10 text-success" : youPlayer.result === "tie" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger")}
          >
            {youPlayer.result === "win" ? `🎉 You Won ${youPlayer.winAmount}!` : youPlayer.result === "tie" ? "🤝 Tie" : "😔 You Lost"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      {phase === "betting" ? (
        <div className="space-y-3">
          <div>
            <label className="label">Blinds / Bet Amount</label>
            <div className="flex items-center gap-3">
              <input type="range" min="10" max={Math.min(coins, 500)} value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))} className="flex-1 accent-accent" />
              <span className="text-sm font-bold w-16 text-right">{betAmount}</span>
            </div>
          </div>
          <button onClick={startHand} disabled={coins < betAmount * 2} className="btn-primary w-full py-4 text-lg disabled:opacity-50">
            {coins < betAmount * 2 ? "Not enough coins" : "Deal Hand"}
          </button>
        </div>
      ) : phase !== "showdown" && players[currentPlayerIdx]?.isYou && !players[currentPlayerIdx]?.folded ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => playerAction("fold")} disabled={autoPlay} className="btn-secondary py-3 disabled:opacity-50">Fold</button>
            <button onClick={() => playerAction("check")} disabled={autoPlay || toCall > 0} className="btn-secondary py-3 disabled:opacity-50">Check</button>
            <button onClick={() => playerAction("call")} disabled={autoPlay || toCall === 0} className="btn-primary py-3 disabled:opacity-50">
              Call{toCall > 0 ? ` ${toCall}` : ""}
            </button>
            <button onClick={() => playerAction("raise")} disabled={autoPlay || coins < currentBet + betAmount} className="btn-primary py-3 disabled:opacity-50">
              Raise {betAmount}
            </button>
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
        <button onClick={() => { setPhase("betting"); setShowResult(false); setDealerIdx((d) => (d + 1) % players.length); }} className="btn-primary w-full py-4 text-lg">
          Next Hand
        </button>
      ) : (
        <div className="text-center text-muted text-sm py-4">Waiting for {players[currentPlayerIdx]?.name}...</div>
      )}
    </div>
  );
}
