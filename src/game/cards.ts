export const SUITS = ["S", "H", "D", "C"] as const;
export type Suit = (typeof SUITS)[number];

/** 1 = Ace, 11 = Jack, 12 = Queen, 13 = King. In runs an Ace may also sit above the King (14). */
export type Natural = { id: string; kind: "card"; suit: Suit; rank: number };
export type Joker = { id: string; kind: "joker" };
export type Card = Natural | Joker;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;

const isPlayerCount = (players: number) => Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS;

/** 2 decks for 3 players, 3 decks for 4–7. */
export function decksFor(players: number): number {
  if (!isPlayerCount(players)) {
    throw new Error(`Run Set Jimmy is for 3–7 players, got ${players}`);
  }
  return players <= 3 ? 2 : 3;
}

/** Every card in play for this many players, unshuffled. Two jokers per deck. */
export function buildShoe(players: number): Card[] {
  const shoe: Card[] = [];
  for (let deck = 0; deck < decksFor(players); deck++) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) shoe.push({ id: `${deck}${suit}${rank}`, kind: "card", suit, rank });
    }
    shoe.push({ id: `${deck}J0`, kind: "joker" }, { id: `${deck}J1`, kind: "joker" });
  }
  return shoe;
}

/** 2–7: 5 · 8–K: 10 · Ace: 20 · Joker: 50. */
export function cardPoints(card: Card): number {
  if (card.kind === "joker") return 50;
  if (card.rank === 1) return 20;
  return card.rank <= 7 ? 5 : 10;
}

export function handPoints(hand: readonly Card[]): number {
  return hand.reduce((sum, card) => sum + cardPoints(card), 0);
}

export type Rng = () => number;

/** Small seeded PRNG so deals replay in tests. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
