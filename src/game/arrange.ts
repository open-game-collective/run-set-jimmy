import type { Card, Joker, Natural } from "./cards";
import { playOnRun, type RunMeld, type RunPlacement } from "./melds";

const HIGHEST = 14;

/** A natural card and the run value it stands at (an Ace may stand at 1 or 14). */
type Placed = { card: Natural; value: number };
/** Naturals sorted by value, and the lowest and highest values they cover. */
type Span = { placed: Placed[]; low: number; high: number };

/** Are all the naturals of one suit (and is there at least one)? */
function oneSuit(naturals: readonly Natural[]): boolean {
  const suit = naturals[0]?.suit;
  return suit !== undefined && naturals.every((c) => c.suit === suit);
}

/** The ways to value the naturals: no Ace, one Ace low or high, two Aces low and high, else none. */
function aceOptions(naturals: readonly Natural[]): Placed[][] {
  const [first, second, ...more] = naturals.filter((c) => c.rank === 1);
  const others = naturals.filter((c) => c.rank !== 1).map((c) => ({ card: c, value: c.rank }));
  if (!first) return [others];
  if (!second) return [[{ card: first, value: 1 }, ...others], [...others, { card: first, value: HIGHEST }]];
  return more.length === 0 ? [[{ card: first, value: 1 }, ...others, { card: second, value: HIGHEST }]] : [];
}

const hasDuplicateValue = (placed: readonly Placed[]) => placed.some((p, i) => i > 0 && p.value === placed[i - 1]?.value);

/** The option sorted by value; null when it is empty or two cards want the same spot. */
function spanOf(option: readonly Placed[]): Span | null {
  const placed = [...option].sort((a, b) => a.value - b.value);
  const first = placed[0];
  const last = placed.at(-1);
  if (!first || !last || hasDuplicateValue(placed)) return null;
  return { placed, low: first.value, high: last.value };
}

const gapsIn = (span: Span) => span.high - span.low + 1 - span.placed.length;

/** The first option whose gaps the jokers can fill. */
function firstFitting(options: readonly Placed[][], jokers: number): Span | undefined {
  return options.map(spanOf).find((span): span is Span => span !== null && gapsIn(span) <= jokers);
}

/** The naturals from low to high, taking a joker from the pool for each gap. */
function fillGaps({ placed, low, high }: Span, pool: Joker[]): Card[] {
  const middle: Card[] = [];
  for (let v = low, i = 0; v <= high; v++) {
    const next = placed[i];
    if (next?.value === v) {
      middle.push(next.card);
      i++;
    } else middle.push(pool.pop() as Joker);
  }
  return middle;
}

/** A spare joker goes high when that end is open and preferred (or the low end is closed). */
const goesHigh = (spare: "high" | "low", lowOpen: boolean, highOpen: boolean) => highOpen && (spare === "high" || !lowOpen);

/** Which end the next spare joker goes on; null when both ends are closed. */
function spareEnd(spare: "high" | "low", low: number, high: number): "high" | "low" | null {
  const lowOpen = low > 1;
  if (goesHigh(spare, lowOpen, high < HIGHEST)) return "high";
  return lowOpen ? "low" : null;
}

/** Puts the spare jokers on the ends; null when they run past both Aces. */
function withSpares(middle: Card[], pool: readonly Joker[], span: Span, spare: "high" | "low"): Card[] | null {
  let { low, high } = span;
  const before: Card[] = [];
  const after: Card[] = [];
  for (const joker of pool) {
    const end = spareEnd(spare, low, high);
    if (end === null) return null;
    if (end === "high") {
      after.push(joker);
      high++;
    } else {
      before.push(joker);
      low--;
    }
  }
  return [...before, ...middle, ...after];
}

/**
 * Orders a run the way the player meant it: naturals by rank, jokers filling the gaps, spare jokers
 * on the preferred end (spilling to the other end at an Ace). Null when no order makes a run.
 */
export function arrangeRun(cards: readonly Card[], spare: "high" | "low" = "high"): Card[] | null {
  const naturals = cards.filter((c): c is Natural => c.kind === "card");
  const jokers = cards.filter((c): c is Joker => c.kind === "joker");
  if (!oneSuit(naturals)) return null;
  const span = firstFitting(aceOptions(naturals), jokers.length);
  if (!span) return null;
  const pool = [...jokers];
  return withSpares(fillGaps(span, pool), pool, span, spare);
}

/** Every legal way to put this card on this run. */
export function placementsFor(run: RunMeld, card: Card): RunPlacement[] {
  const tries: RunPlacement[] = [{ at: "low" }, { at: "high" }];
  run.cards.forEach((x, i) => {
    if (x.kind === "joker") tries.push({ replace: i, jokerTo: "low" }, { replace: i, jokerTo: "high" });
  });
  return tries.filter((p) => playOnRun(run, card, p).ok);
}
