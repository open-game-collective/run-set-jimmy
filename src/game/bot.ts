import { placementsFor } from "./arrange";
import { SUITS, cardPoints, type Card, type Natural, type Suit } from "./cards";
import { fills, playOnSet } from "./melds";
import {
  answerOffer,
  canPlayAnywhere,
  discard as discardCard,
  draw,
  goDown,
  playOn,
  type Phase,
  type Result,
  requirementFor,
  type MeldProposal,
  type Requirement,
  type RoundState,
  type Seat,
  type TableMeld,
  windowIsOpen,
} from "./round";
import type { RunPlacement } from "./melds";

/**
 * A simple, deterministic player for playtests, simulations and recordings. It plays legal moves
 * sensibly; it is not meant to be strong.
 */

type Candidate = { kind: "run" | "set"; naturals: string[]; jokers: number };

const naturalsOf = (hand: readonly Card[]) => hand.filter((c): c is Natural => c.kind === "card");
const jokersOf = (hand: readonly Card[]) => hand.filter((c) => c.kind === "joker");
const MAX_STEPS = 50_000;

/** Card ids grouped by rank, in the order the ranks first appear. */
function groupByRank(naturals: readonly Natural[]): Map<number, string[]> {
  const byRank = new Map<number, string[]>();
  for (const c of naturals) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.id]);
  return byRank;
}

/** Three or more of a rank make a set; a pair makes one with a joker, if there is one. */
function setCandidate(ids: string[], jokers: number): Candidate | null {
  if (ids.length >= 3) return { kind: "set", naturals: ids, jokers: 0 };
  return ids.length === 2 && jokers >= 1 ? { kind: "set", naturals: ids, jokers: 1 } : null;
}

function setCandidates(hand: readonly Card[], jokers: number): Candidate[] {
  return [...groupByRank(naturalsOf(hand)).values()]
    .map((ids) => setCandidate(ids, jokers))
    .filter((c): c is Candidate => c !== null);
}

/** The first card seen at each rank takes that value; a second Ace takes 14. */
function placeValue(byValue: Map<number, string>, c: Natural): void {
  if (!byValue.has(c.rank)) byValue.set(c.rank, c.id);
  else if (c.rank === 1 && !byValue.has(14)) byValue.set(14, c.id);
}

/** An Ace may also sit at 14 when it isn't needed at 1. */
function aceHigh(byValue: Map<number, string>): void {
  const ace = byValue.get(1);
  if (ace && !byValue.has(14)) byValue.set(14, ace);
}

/** One card id per run value (1–14) for this suit. */
function valuesOf(naturals: readonly Natural[], suit: Suit): Map<number, string> {
  const byValue = new Map<number, string>();
  for (const c of naturals.filter((x) => x.suit === suit)) placeValue(byValue, c);
  aceHigh(byValue);
  return byValue;
}

/** Run ends for a window starting at `start`: 4–8 long, not past 14. */
const windowEnds = (start: number) => Array.from({ length: 5 }, (_, k) => start + 3 + k).filter((end) => end <= 14);

/** The distinct card ids covering start..end, and how many values have none. */
function windowIds(byValue: Map<number, string>, start: number, end: number): { ids: string[]; missing: number } {
  const ids: string[] = [];
  let missing = 0;
  for (let v = start; v <= end; v++) {
    const id = byValue.get(v);
    if (id && !ids.includes(id)) ids.push(id);
    else missing++;
  }
  return { ids, missing };
}

/** A run from start to end with real cards at both ends, if the jokers cover its gaps. */
function runWindow(byValue: Map<number, string>, start: number, end: number, jokers: number): Candidate | null {
  if (!byValue.has(end)) return null;
  const { ids, missing } = windowIds(byValue, start, end);
  return missing <= jokers && ids.length >= 2 ? { kind: "run", naturals: ids, jokers: missing } : null;
}

function runsFrom(byValue: Map<number, string>, jokers: number): Candidate[] {
  const out: Candidate[] = [];
  for (let start = 1; start <= 11; start++) {
    if (!byValue.has(start)) continue;
    for (const end of windowEnds(start)) {
      const run = runWindow(byValue, start, end, jokers);
      if (run) out.push(run);
    }
  }
  return out;
}

/** Runs whose two ends are real cards, gaps filled by jokers: 4–8 long. */
function runCandidates(hand: readonly Card[], jokers: number): Candidate[] {
  const naturals = naturalsOf(hand);
  return SUITS.flatMap((suit) => runsFrom(valuesOf(naturals, suit), jokers));
}

/** A way to meet the round's requirement from this hand, using the most real cards; null if none. */
export function findGoDown(hand: readonly Card[], req: Requirement): MeldProposal[] | null {
  return goDownOptions(hand, req)[0] ?? null;
}

type Pick = { pool: readonly Candidate[]; need: number; from: number; used: Set<string>; jokers: number; picks: Candidate[] };

const fits = (cand: Candidate, used: Set<string>, jokers: number) =>
  cand.jokers <= jokers && !cand.naturals.some((id) => used.has(id));

/** Every way to pick `need` candidates that share no cards and fit the jokers; calls `next` for each. */
function pickCombos(p: Pick, budget: { steps: number }, next: () => void): void {
  if (p.need === 0) return next();
  for (let i = p.from; i < p.pool.length && budget.steps < MAX_STEPS; i++) {
    budget.steps++;
    const cand = p.pool[i] as Candidate;
    if (!fits(cand, p.used, p.jokers)) continue;
    p.picks.push(cand);
    const used = new Set([...p.used, ...cand.naturals]);
    pickCombos({ ...p, need: p.need - 1, from: i + 1, used, jokers: p.jokers - cand.jokers }, budget, next);
    p.picks.pop();
  }
}

const jokersIn = (picks: readonly Candidate[]) => picks.reduce((sum, p) => sum + p.jokers, 0);
const realIn = (picks: readonly Candidate[]) => picks.reduce((sum, p) => sum + p.naturals.length, 0);

/** The picks as proposals, handing out the hand's joker ids in order. */
function withJokerIds(picks: readonly Candidate[], jokerIds: readonly string[]): MeldProposal[] {
  const pool = [...jokerIds];
  return picks.map((p) => ({ kind: p.kind, cardIds: [...p.naturals, ...pool.splice(0, p.jokers)] }));
}

/** Ways to go down, best first (most real cards placed, then fewest jokers). */
export function goDownOptions(hand: readonly Card[], req: Requirement): MeldProposal[][] {
  const jokerIds = jokersOf(hand).map((c) => c.id);
  const runs = runCandidates(hand, jokerIds.length);
  const sets = setCandidates(hand, jokerIds.length);
  const found: { picks: Candidate[]; score: number }[] = [];
  const budget = { steps: 0 };

  const runPicks: Candidate[] = [];
  const fromRuns: Pick = { pool: runs, need: req.runs, from: 0, used: new Set(), jokers: jokerIds.length, picks: runPicks };
  pickCombos(fromRuns, budget, () => {
    const setPicks: Candidate[] = [];
    const used = new Set(runPicks.flatMap((p) => p.naturals));
    const fromSets: Pick = { pool: sets, need: req.sets, from: 0, used, jokers: jokerIds.length - jokersIn(runPicks), picks: setPicks };
    pickCombos(fromSets, budget, () => {
      const all = [...runPicks, ...setPicks];
      found.push({ picks: all, score: realIn(all) * 10 - jokersIn(all) });
    });
  });

  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ picks }) => withJokerIds(picks, jokerIds));
}

/** The unkept cards of this suit filling start..start+3 (one per value). */
function windowCards(naturals: readonly Natural[], keep: Set<string>, suit: Suit, start: number): string[] {
  const ids: string[] = [];
  for (let v = start; v < start + 4; v++) {
    const card = naturals.find((c) => c.suit === suit && !keep.has(c.id) && !ids.includes(c.id) && fills(c, v));
    if (card) ids.push(card.id);
  }
  return ids;
}

/** The fullest 4-value window of one suit among the unkept cards (first found wins ties). */
function bestRunWindow(naturals: readonly Natural[], keep: Set<string>): string[] {
  let best: string[] = [];
  for (const suit of SUITS) {
    for (let start = 1; start <= 11; start++) {
      const ids = windowCards(naturals, keep, suit, start);
      if (ids.length > best.length) best = ids;
    }
  }
  return best;
}

/** The biggest rank group among the unkept cards. */
const biggestRankGroup = (naturals: readonly Natural[], keep: Set<string>): string[] =>
  [...groupByRank(naturals.filter((c) => !keep.has(c.id))).values()].sort((a, b) => b.length - a.length)[0] ?? [];

/**
 * The bot's plan for this round: its best partial runs (4-value windows of one suit) and sets (the
 * biggest rank groups), chosen greedily and without sharing cards. `score` counts the real cards in
 * the plan; cards outside it are the ones to throw away.
 */
export function plan(hand: readonly Card[], req: Requirement): { keep: Set<string>; score: number } {
  const naturals = naturalsOf(hand);
  const keep = new Set(jokersOf(hand).map((c) => c.id));
  let score = 0;
  for (let k = 0; k < req.runs; k++) {
    const best = bestRunWindow(naturals, keep);
    for (const id of best) keep.add(id);
    score += best.length;
  }
  for (let k = 0; k < req.sets; k++) {
    const best = biggestRankGroup(naturals, keep);
    for (const id of best.slice(0, 4)) keep.add(id);
    score += Math.min(best.length, 3);
  }
  return { keep, score };
}

const improves = (card: Card, hand: readonly Card[], req: Requirement) =>
  card.kind === "joker" || plan([...hand, card], req).score > plan(hand, req).score;

export type BotAction =
  | { type: "draw"; from: "deck" | "discard" }
  | { type: "answer"; answer: "take" | "let-go" }
  | { type: "goDown"; melds: MeldProposal[] }
  | { type: "playOn"; cardId: string; meldId: string; placement?: RunPlacement }
  | { type: "discard"; cardId: string };

function playableSpot(card: Card, melds: readonly TableMeld[]): { meldId: string; placement?: RunPlacement } | null {
  for (const m of melds) {
    if (m.meld.kind === "set") {
      if (playOnSet(m.meld, card).ok) return { meldId: m.id };
    } else {
      const p = placementsFor(m.meld, card)[0];
      if (p) return { meldId: m.id, placement: p };
    }
  }
  return null;
}

/** Would this card help: once down, can it go on the table; before, does it improve the plan? */
const discardHelps = (s: RoundState, seat: Seat, top: Card) =>
  seat.down ? canPlayAnywhere(top, s.melds) : improves(top, seat.hand, requirementFor(s.round));

/** Wants the top discard? */
function wantsDiscard(s: RoundState, seatId: string): boolean {
  const seat = s.seats.find((x) => x.id === seatId);
  const top = s.discard.at(-1);
  if (!seat || !top) return false;
  return top.kind === "joker" || discardHelps(s, seat, top);
}

/** Not down yet, with buys left. */
const mayBuy = (seat: Seat) => !seat.down && seat.buys < 3;

/** During a buy window: does this (non-turn) seat ask to buy? */
export function wantsBuy(s: RoundState, seatId: string): boolean {
  const seat = s.seats.find((x) => x.id === seatId);
  const top = s.discard.at(-1);
  if (!seat || !mayBuy(seat) || !top) return false;
  return improves(top, seat.hand, requirementFor(s.round));
}

function answerMove(s: RoundState, seat: Seat): BotAction {
  return { type: "answer", answer: wantsDiscard(s, seat.id) ? "take" : "let-go" };
}

/** Take a wanted discard; otherwise wait out an open buy window, then draw from the deck. */
function drawMove(s: RoundState, seat: Seat): BotAction | null {
  if (wantsDiscard(s, seat.id)) return { type: "draw", from: "discard" };
  return windowIsOpen(s.phase) ? null : { type: "draw", from: "deck" };
}

/** The best way down that the rules accept. */
function goDownMove(s: RoundState, seat: Seat): BotAction | null {
  const melds = goDownOptions(seat.hand, requirementFor(s.round)).find((m) => goDown(s, seat.id, m).ok);
  return melds ? { type: "goDown", melds } : null;
}

/** The first card in hand that the rules let it play on the table. */
function playOnMove(s: RoundState, seat: Seat): BotAction | null {
  for (const card of seat.hand) {
    const spot = playableSpot(card, s.melds);
    if (!spot) continue;
    const action: BotAction = { type: "playOn", cardId: card.id, ...spot };
    if (applyBot(s, seat.id, action).ok) return action;
  }
  return null;
}

const tableWorth = (c: Card, melds: readonly TableMeld[]) => (canPlayAnywhere(c, melds) ? 2 : 0);
const planWorth = (c: Card, keep: Set<string>) => (keep.has(c.id) ? 1 : 0);

/** Once down, keep cards that fit the table (they are the way out); otherwise keep the plan. Jokers always. */
function cardWorth(c: Card, seat: Seat, melds: readonly TableMeld[], keep: Set<string>): number {
  if (c.kind === "joker") return 3;
  return seat.down ? tableWorth(c, melds) : planWorth(c, keep);
}

/** Toss the most expensive card worth least. */
function discardMove(s: RoundState, seat: Seat): BotAction | null {
  const { keep } = plan(seat.hand, requirementFor(s.round));
  const worth = (c: Card) => cardWorth(c, seat, s.melds, keep);
  const toss = [...seat.hand].sort((a, b) => worth(a) - worth(b) || cardPoints(b) - cardPoints(a))[0];
  return toss ? { type: "discard", cardId: toss.id } : null;
}

/** Go down (or play on the table, once down), else discard. */
function playMove(s: RoundState, seat: Seat): BotAction | null {
  return (seat.down ? playOnMove(s, seat) : goDownMove(s, seat)) ?? discardMove(s, seat);
}

const MOVES: Record<Phase["kind"], (s: RoundState, seat: Seat) => BotAction | null> = {
  offer: answerMove,
  draw: drawMove,
  play: playMove,
  out: () => null,
};

/** The turn player's next action, or null when it isn't the bot's move. */
export function botMove(s: RoundState, seatId: string): BotAction | null {
  const seat = s.seats[s.turn];
  if (!seat || seat.id !== seatId) return null;
  return MOVES[s.phase.kind](s, seat);
}

/** Applies a bot action to the round. */
export function applyBot(s: RoundState, seatId: string, action: BotAction): Result {
  switch (action.type) {
    case "draw":
      return draw(s, seatId, action.from);
    case "answer":
      return answerOffer(s, seatId, action.answer);
    case "goDown":
      return goDown(s, seatId, action.melds);
    case "playOn":
      return playOn(s, seatId, action.cardId, action.meldId, action.placement);
    case "discard":
      return discardCard(s, seatId, action.cardId);
  }
}
