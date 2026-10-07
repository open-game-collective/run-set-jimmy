import { arrangeRun } from "../game/arrange";
import type { Card, Natural } from "../game/cards";
import { readRun, readSet, runHigh, type RunMeld, type RunPlacement } from "../game/melds";
import { firstBroken } from "../game/refusal";
import type { MeldProposal, Requirement } from "../game/round";
import { rankName, rankPlural, suitSymbol } from "../game/words";

const SUIT_ORDER = { S: 0, H: 1, D: 2, C: 3 } as const;
const suitKey = (c: Card) => (c.kind === "joker" ? 9 : SUIT_ORDER[c.suit]);
const rankKey = (c: Card) => (c.kind === "joker" ? 99 : c.rank);

/** The phone's sort buttons. Aces sort low; jokers go last. */
export function sortHand(hand: readonly Card[], by: "suit" | "rank"): Card[] {
  return [...hand].sort((a, b) =>
    by === "suit" ? suitKey(a) - suitKey(b) || rankKey(a) - rankKey(b) : rankKey(a) - rankKey(b) || suitKey(a) - suitKey(b),
  );
}

/** The hand in the player's own order; cards they haven't placed yet (just drawn) go at the end. */
export function applyOrder(hand: readonly Card[], order: readonly string[]): Card[] {
  const byId = new Map(hand.map((c) => [c.id, c]));
  const placed = order.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
  const seen = new Set(placed.map((c) => c.id));
  return [...placed, ...hand.filter((c) => !seen.has(c.id))];
}

export function moveCard(order: readonly string[], id: string, to: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const next = order.filter((x) => x !== id);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
}

export type Slot = { kind: "run" | "set"; label: string; cards: Card[]; spare: "high" | "low" };

export function builderSlots(req: Requirement): Slot[] {
  const make = (kind: "run" | "set", count: number) =>
    Array.from({ length: count }, (_, i): Slot => ({
      kind,
      label: `${kind === "run" ? "Run" : "Set"}${count > 1 ? ` ${i + 1}` : ""}`,
      cards: [],
      spare: "high",
    }));
  return [...make("run", req.runs), ...make("set", req.sets)];
}

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

type SlotStatus = { ok: boolean; line: string };

const no = (line: string): SlotStatus => ({ ok: false, line });
const moreCards = (missing: number) => `${missing} more card${missing === 1 ? "" : "s"}`;
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);
const naturalsIn = (cards: readonly Card[]) => cards.filter((c): c is Natural => c.kind === "card");

/** Mixed ranks, or too few cards, for a set. */
function setProblem(cards: readonly Card[], naturals: readonly Natural[]): string | null {
  return firstBroken([
    [() => naturals.some((c) => c.rank !== naturals[0]?.rank), "Same rank only"],
    [() => cards.length < 3, moreCards(3 - cards.length)],
  ]);
}

function setStatus(cards: readonly Card[]): SlotStatus {
  const naturals = naturalsIn(cards);
  const first = naturals[0];
  const problem = setProblem(cards, naturals);
  if (problem) return no(problem);
  if (!first || !readSet(cards).ok) return no("Needs a real card");
  return { ok: true, line: `${countWord(cards.length)} ${rankPlural(first.rank)}` };
}

/** Mixed suits, or too few cards, for a run. */
function runProblem(cards: readonly Card[], naturals: readonly Natural[]): string | null {
  return firstBroken([
    [() => naturals.some((c) => c.suit !== naturals[0]?.suit), "One suit only"],
    [() => cards.length < 4, moreCards(4 - cards.length)],
  ]);
}

/** The run these cards make, as laid out or arranged (jokers filling the gaps); null if none. */
function slotRun(cards: readonly Card[], spare: "high" | "low"): RunMeld | null {
  const arranged = readRun(cards).ok ? [...cards] : arrangeRun(cards, spare);
  const run = arranged ? readRun(arranged) : null;
  return run?.ok ? run.meld : null;
}

function runStatus(cards: readonly Card[], spare: "high" | "low"): SlotStatus {
  const naturals = naturalsIn(cards);
  const problem = runProblem(cards, naturals);
  if (problem) return no(problem);
  const run = slotRun(cards, spare);
  if (!run) return no(naturals.length === 0 ? "Needs a real card" : "Not in a row");
  const s = suitSymbol(run.suit);
  return { ok: true, line: `${rankName(run.low)}${s} to ${rankName(runHigh(run))}${s}` };
}

/** Whether a builder slot is ready to lay down, and a short line saying what it is or what's missing. */
export function slotStatus(kind: "run" | "set", cards: readonly Card[], spare: "high" | "low" = "high"): SlotStatus {
  if (cards.length === 0) return no("Tap cards to add");
  return kind === "set" ? setStatus(cards) : runStatus(cards, spare);
}

export const toProposals = (slots: readonly Slot[]): MeldProposal[] =>
  slots.map((s) =>
    s.kind === "run" ? { kind: "run", cardIds: s.cards.map((c) => c.id), spare: s.spare } : { kind: "set", cardIds: s.cards.map((c) => c.id) },
  );

/** Where a card would go on a run, in words. */
export function placementLabel(run: RunMeld, p: RunPlacement): string {
  const s = suitSymbol(run.suit);
  if ("at" in p) return p.at === "low" ? `Below the ${rankName(run.low)}${s}` : `Above the ${rankName(runHigh(run))}${s}`;
  const to = p.jokerTo === "low" ? run.low - 1 : runHigh(run) + 1;
  return `Swap for the Joker, Joker to ${rankName(to)}${s}`;
}
