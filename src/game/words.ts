import type { Card, Suit } from "./cards";

const SYMBOLS: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const FACES: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K", 14: "A" };

export const suitSymbol = (suit: Suit): string => SYMBOLS[suit];
/** 1 and 14 are both the Ace. */
export const rankName = (rank: number): string => FACES[rank] ?? String(rank);
export const cardName = (card: Card): string => (card.kind === "joker" ? "Joker" : `${rankName(card.rank)}${suitSymbol(card.suit)}`);
