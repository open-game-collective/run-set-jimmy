import type { Card, Natural, Suit } from "./cards";

/**
 * A run's cards in table order. `cards[i]` is worth `low + i`, where 1 is a low Ace and 14 a high
 * Ace. A joker is whatever its position says (fixed by position, RULES.md "Jokers").
 */
export type RunMeld = { kind: "run"; suit: Suit; low: number; cards: Card[] };
export type SetMeld = { kind: "set"; rank: number; cards: Card[] };
export type Meld = RunMeld | SetMeld;

export type MeldResult<M> = { ok: true; meld: M } | { ok: false; reason: string };

/** Where a card goes on a run: an open end, or the spot of a joker it stands for. */
export type RunPlacement = { at: "low" | "high" } | { replace: number; jokerTo: "low" | "high" };

const MIN_RUN = 4;
const MIN_SET = 3;
const LOWEST = 1;
const HIGHEST = 14;

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const naturals = (cards: readonly Card[]): Natural[] => cards.filter((c): c is Natural => c.kind === "card");

/** Does this card's rank fill the run value `value` (1–14)? An Ace fills 1 and 14. */
const fills = (card: Natural, value: number) => card.rank === value || (card.rank === 1 && value === HIGHEST);

export const runHigh = (run: RunMeld): number => run.low + run.cards.length - 1;

/** Read cards, in the order the player laid them out, as a run. */
export function readRun(cards: readonly Card[]): MeldResult<RunMeld> {
  if (cards.length < MIN_RUN) return fail("A run needs at least 4 cards");
  const real = naturals(cards);
  const first = real[0];
  if (!first) return fail("A run needs at least one real card");
  if (real.some((c) => c.suit !== first.suit)) return fail("A run's cards must all be the same suit");

  const at = cards.indexOf(first);
  const lows = first.rank === 1 ? [1 - at, HIGHEST - at] : [first.rank - at];
  const low = lows.find(
    (l) =>
      l >= LOWEST &&
      l + cards.length - 1 <= HIGHEST &&
      cards.every((c, i) => c.kind === "joker" || fills(c, l + i)),
  );
  if (low === undefined) return fail("A run's cards must be in order, with no gaps and no wrapping past the Ace");
  return { ok: true, meld: { kind: "run", suit: first.suit, low, cards: [...cards] } };
}

/** Read cards as a set: 3+ of one rank, any suits. */
export function readSet(cards: readonly Card[]): MeldResult<SetMeld> {
  if (cards.length < MIN_SET) return fail("A set needs at least 3 cards");
  const real = naturals(cards);
  const first = real[0];
  if (!first) return fail("A set needs at least one real card");
  if (real.some((c) => c.rank !== first.rank)) return fail("A set's cards must all be the same rank");
  return { ok: true, meld: { kind: "set", rank: first.rank, cards: [...cards] } };
}

const endOpen = (run: RunMeld, end: "low" | "high") => (end === "low" ? run.low > LOWEST : runHigh(run) < HIGHEST);

/** Play one card onto a run: extend an open end, or replace a joker (which then slides to an end). */
export function playOnRun(run: RunMeld, card: Card, placement: RunPlacement): MeldResult<RunMeld> {
  if ("at" in placement) {
    const end = placement.at;
    if (!endOpen(run, end)) return fail("That end is closed");
    const value = end === "low" ? run.low - 1 : runHigh(run) + 1;
    if (card.kind === "card" && (card.suit !== run.suit || !fills(card, value))) {
      return fail("That card doesn't fit this run");
    }
    return end === "low"
      ? { ok: true, meld: { ...run, low: run.low - 1, cards: [card, ...run.cards] } }
      : { ok: true, meld: { ...run, cards: [...run.cards, card] } };
  }

  const { replace, jokerTo } = placement;
  const joker = run.cards[replace];
  if (joker?.kind !== "joker") return fail("That spot is not a joker");
  if (card.kind !== "card" || card.suit !== run.suit || !fills(card, run.low + replace)) {
    return fail("Only the card the joker stands for can replace it");
  }
  if (!endOpen(run, jokerTo)) return fail("That end is closed, so the joker can't slide there");
  const cards = run.cards.map((c, i) => (i === replace ? card : c));
  return jokerTo === "low"
    ? { ok: true, meld: { ...run, low: run.low - 1, cards: [joker, ...cards] } }
    : { ok: true, meld: { ...run, cards: [...cards, joker] } };
}

/** Play one card onto a set: one more of its rank, or a joker. */
export function playOnSet(set: SetMeld, card: Card): MeldResult<SetMeld> {
  if (card.kind === "card" && card.rank !== set.rank) return fail("That card doesn't fit this set");
  return { ok: true, meld: { ...set, cards: [...set.cards, card] } };
}
