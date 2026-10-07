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
export const fills = (card: Natural, value: number) => card.rank === value || (card.rank === 1 && value === HIGHEST);

export const runHigh = (run: RunMeld): number => run.low + run.cards.length - 1;

/** The run's suit-setting first real card, or why these cards can't be a run in any order. */
function runAnchor(cards: readonly Card[]): { ok: true; first: Natural } | { ok: false; reason: string } {
  if (cards.length < MIN_RUN) return fail("A run needs at least 4 cards");
  const real = naturals(cards);
  const first = real[0];
  if (!first) return fail("A run needs at least one real card");
  if (real.some((c) => c.suit !== first.suit)) return fail("A run's cards must all be the same suit");
  return { ok: true, first };
}

/** Do the cards, laid out from value `low` upwards, stay within Ace–Ace and match their spots? */
function runFitsFrom(cards: readonly Card[], low: number): boolean {
  return low >= LOWEST && low + cards.length - 1 <= HIGHEST && cards.every((c, i) => c.kind === "joker" || fills(c, low + i));
}

/** The value of the run's first spot, trying an Ace low then high; undefined when no order works. */
function runLowFor(cards: readonly Card[], first: Natural): number | undefined {
  const at = cards.indexOf(first);
  // Stryker disable next-line ArithmeticOperator: equivalent: an Ace past index 0 can't be low (low <= 0); 1 + at puts it at 1 + 2·at, which an Ace never fills
  const lows = first.rank === 1 ? [1 - at, HIGHEST - at] : [first.rank - at];
  return lows.find((l) => runFitsFrom(cards, l));
}

/** Read cards, in the order the player laid them out, as a run. */
export function readRun(cards: readonly Card[]): MeldResult<RunMeld> {
  const anchor = runAnchor(cards);
  if (!anchor.ok) return anchor;
  const { first } = anchor;
  const low = runLowFor(cards, first);
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

/** The value a card would take just past this end of the run. */
const valueBeyond = (run: RunMeld, end: "low" | "high") => (end === "low" ? run.low - 1 : runHigh(run) + 1);

/** A joker fits any spot; a real card must be the run's suit and the spot's rank. */
const fitsSpot = (run: RunMeld, card: Card, value: number) =>
  card.kind === "joker" || (card.suit === run.suit && fills(card, value));

/** The run with one more card on this end. */
const addAtEnd = (run: RunMeld, card: Card, end: "low" | "high"): RunMeld =>
  end === "low" ? { ...run, low: run.low - 1, cards: [card, ...run.cards] } : { ...run, cards: [...run.cards, card] };

function extendRun(run: RunMeld, card: Card, end: "low" | "high"): MeldResult<RunMeld> {
  if (!endOpen(run, end)) return fail("That end is closed");
  if (!fitsSpot(run, card, valueBeyond(run, end))) return fail("That card doesn't fit this run");
  return { ok: true, meld: addAtEnd(run, card, end) };
}

/** Only the natural card a joker stands for can take its spot. */
const standsFor = (run: RunMeld, card: Card, spot: number) =>
  // Stryker disable next-line ConditionalExpression: equivalent: a joker has no suit, so the suit check refuses it anyway
  card.kind === "card" && card.suit === run.suit && fills(card, run.low + spot);

const swapAt = (cards: readonly Card[], spot: number, card: Card): Card[] => cards.map((c, i) => (i === spot ? card : c));

function replaceJoker(run: RunMeld, card: Card, { replace, jokerTo }: { replace: number; jokerTo: "low" | "high" }): MeldResult<RunMeld> {
  const joker = run.cards[replace];
  if (joker?.kind !== "joker") return fail("That spot is not a joker");
  if (!standsFor(run, card, replace)) return fail("Only the card the joker stands for can replace it");
  if (!endOpen(run, jokerTo)) return fail("That end is closed, so the joker can't slide there");
  return { ok: true, meld: addAtEnd({ ...run, cards: swapAt(run.cards, replace, card) }, joker, jokerTo) };
}

/** Play one card onto a run: extend an open end, or replace a joker (which then slides to an end). */
export function playOnRun(run: RunMeld, card: Card, placement: RunPlacement): MeldResult<RunMeld> {
  return "at" in placement ? extendRun(run, card, placement.at) : replaceJoker(run, card, placement);
}

/** Play one card onto a set: one more of its rank, or a joker. */
export function playOnSet(set: SetMeld, card: Card): MeldResult<SetMeld> {
  if (card.kind === "card" && card.rank !== set.rank) return fail("That card doesn't fit this set");
  return { ok: true, meld: { ...set, cards: [...set.cards, card] } };
}
