import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const RANK_VALUES: Record<string, number> = {};
RANKS.forEach((r, i) => (RANK_VALUES[r] = i + 2));

export type Card = { suit: string; rank: string; value: number };

export function makeDeck(numDecks = 4): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < numDecks; d++) {
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

export function PlayingCard({ card, faceDown, size = "normal" }: { card?: Card; faceDown?: boolean; size?: "normal" | "large" | "small" }) {
  const dims = size === "large" ? "w-32 h-44" : size === "small" ? "w-16 h-24" : "w-24 h-36";
  const fontSize = size === "large" ? "text-4xl" : size === "small" ? "text-xl" : "text-3xl";
  const cornerSize = size === "large" ? "text-sm" : size === "small" ? "text-[8px]" : "text-xs";

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
      transition={{ duration: 0.4, ease: "easeOut" }}
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

// Blackjack hand value
export function blackjackValue(hand: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.value === 14) {
      aces++;
      total += 11;
    } else if (card.value >= 10) {
      total += 10;
    } else {
      total += card.value;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && blackjackValue(hand) === 21;
}

// Poker hand evaluation
export type HandRank = {
  rank: number; // 1=high card, 2=pair, 3=two pair, 4=trips, 5=straight, 6=flush, 7=full house, 8=quads, 9=straight flush
  name: string;
  values: number[]; // tiebreaker values
};

export function evaluatePokerHand(cards: Card[]): HandRank {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map((c) => c.value);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // Check straight (including A-2-3-4-5)
  let isStraight = false;
  let straightHigh = 0;
  const uniqueVals = [...new Set(values)].sort((a, b) => b - a);
  if (uniqueVals.length >= 5) {
    if (uniqueVals[0] - uniqueVals[4] === 4) {
      isStraight = true;
      straightHigh = uniqueVals[0];
    }
    // A-2-3-4-5 (wheel)
    if (uniqueVals.includes(14) && uniqueVals.includes(5) && uniqueVals.includes(4) && uniqueVals.includes(3) && uniqueVals.includes(2)) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // Count ranks
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isStraight && isFlush) {
    return { rank: 9, name: "Straight Flush", values: [straightHigh] };
  }
  if (groups[0]?.count === 4) {
    return { rank: 8, name: "Four of a Kind", values: [groups[0].value, groups[1].value] };
  }
  if (groups[0]?.count === 3 && groups[1]?.count >= 2) {
    return { rank: 7, name: "Full House", values: [groups[0].value, groups[1].value] };
  }
  if (isFlush) {
    return { rank: 6, name: "Flush", values };
  }
  if (isStraight) {
    return { rank: 5, name: "Straight", values: [straightHigh] };
  }
  if (groups[0]?.count === 3) {
    return { rank: 4, name: "Three of a Kind", values: [groups[0].value, ...values.filter((v) => v !== groups[0].value).slice(0, 2)] };
  }
  if (groups[0]?.count === 2 && groups[1]?.count === 2) {
    return { rank: 3, name: "Two Pair", values: [groups[0].value, groups[1].value, groups[2].value] };
  }
  if (groups[0]?.count === 2) {
    return { rank: 2, name: "Pair", values: [groups[0].value, ...values.filter((v) => v !== groups[0].value).slice(0, 3)] };
  }
  return { rank: 1, name: "High Card", values };
}

export function compareHands(a: HandRank, b: HandRank): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.values.length, b.values.length); i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}

// Best 5-card hand from 7 cards (2 hole + 5 community)
export function bestHand(cards: Card[]): HandRank {
  if (cards.length <= 5) return evaluatePokerHand(cards);
  let best: HandRank | null = null;
  // Try all 5-card combinations from 7 cards (C(7,5) = 21)
  const combos: number[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            combos.push([a, b, c, d, e]);
  for (const combo of combos) {
    const hand = evaluatePokerHand(combo.map((i) => cards[i]));
    if (!best || compareHands(hand, best) > 0) best = hand;
  }
  return best!;
}

// AI names for bot players
export const AI_NAMES = ["Alex", "Sam", "Riley", "Jordan", "Casey", "Morgan", "Taylor", "Quinn"];
