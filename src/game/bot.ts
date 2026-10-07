import { placementsFor } from "./arrange";
import { cardPoints, type Card, type Natural } from "./cards";
import { playOnSet } from "./melds";
import {
  answerOffer,
  canPlayAnywhere,
  discard as discardCard,
  draw,
  goDown,
  playOn,
  type Result,
  requirementFor,
  type MeldProposal,
  type Requirement,
  type RoundState,
  type TableMeld,
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

function setCandidates(hand: readonly Card[], jokers: number): Candidate[] {
  const byRank = new Map<number, string[]>();
  for (const c of naturalsOf(hand)) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.id]);
  const out: Candidate[] = [];
  for (const ids of byRank.values()) {
    if (ids.length >= 3) out.push({ kind: "set", naturals: ids, jokers: 0 });
    else if (ids.length === 2 && jokers >= 1) out.push({ kind: "set", naturals: ids, jokers: 1 });
  }
  return out;
}

/** Runs whose two ends are real cards, gaps filled by jokers: 4–8 long. */
function runCandidates(hand: readonly Card[], jokers: number): Candidate[] {
  const out: Candidate[] = [];
  for (const suit of ["S", "H", "D", "C"] as const) {
    const byValue = new Map<number, string>();
    for (const c of naturalsOf(hand)) {
      if (c.suit !== suit) continue;
      if (!byValue.has(c.rank)) byValue.set(c.rank, c.id);
      else if (c.rank === 1 && !byValue.has(14)) byValue.set(14, c.id);
    }
    // An Ace may also sit at 14 when it isn't needed at 1.
    const ace = byValue.get(1);
    if (ace && !byValue.has(14)) byValue.set(14, ace);
    for (let start = 1; start <= 11; start++) {
      if (!byValue.has(start)) continue;
      for (let len = 4; len <= 8 && start + len - 1 <= 14; len++) {
        const end = start + len - 1;
        if (!byValue.has(end)) continue;
        const ids: string[] = [];
        let missing = 0;
        for (let v = start; v <= end; v++) {
          const id = byValue.get(v);
          if (id && !ids.includes(id)) ids.push(id);
          else missing++;
        }
        if (missing <= jokers && ids.length >= 2) out.push({ kind: "run", naturals: ids, jokers: missing });
      }
    }
  }
  return out;
}

/** A way to meet the round's requirement from this hand, using the most real cards; null if none. */
export function findGoDown(hand: readonly Card[], req: Requirement): MeldProposal[] | null {
  return goDownOptions(hand, req)[0] ?? null;
}

/** Ways to go down, best first (most real cards placed, then fewest jokers). */
export function goDownOptions(hand: readonly Card[], req: Requirement): MeldProposal[][] {
  const jokerIds = jokersOf(hand).map((c) => c.id);
  const runs = runCandidates(hand, jokerIds.length);
  const sets = setCandidates(hand, jokerIds.length);
  const found: { picks: Candidate[]; score: number }[] = [];
  let steps = 0;

  const pick = (pool: Candidate[], need: number, from: number, used: Set<string>, jokers: number, picks: Candidate[], next: () => void) => {
    if (need === 0) return next();
    for (let i = from; i < pool.length && steps < MAX_STEPS; i++) {
      steps++;
      const cand = pool[i] as Candidate;
      if (cand.jokers > jokers || cand.naturals.some((id) => used.has(id))) continue;
      picks.push(cand);
      pick(pool, need - 1, i + 1, new Set([...used, ...cand.naturals]), jokers - cand.jokers, picks, next);
      picks.pop();
    }
  };

  const runPicks: Candidate[] = [];
  pick(runs, req.runs, 0, new Set(), jokerIds.length, runPicks, () => {
    const used = new Set(runPicks.flatMap((p) => p.naturals));
    const jokersLeft = jokerIds.length - runPicks.reduce((sum, p) => sum + p.jokers, 0);
    const setPicks: Candidate[] = [];
    pick(sets, req.sets, 0, used, jokersLeft, setPicks, () => {
      const all = [...runPicks, ...setPicks];
      const real = all.reduce((sum, p) => sum + p.naturals.length, 0);
      const jokersUsed = all.reduce((sum, p) => sum + p.jokers, 0);
      found.push({ picks: all, score: real * 10 - jokersUsed });
    });
  });

  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ picks }) => {
      const pool = [...jokerIds];
      return picks.map((p) => ({ kind: p.kind, cardIds: [...p.naturals, ...pool.splice(0, p.jokers)] }));
    });
}

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
    let best: string[] = [];
    for (const suit of ["S", "H", "D", "C"] as const) {
      for (let start = 1; start <= 11; start++) {
        const ids: string[] = [];
        for (let v = start; v < start + 4; v++) {
          const card = naturals.find(
            (c) => c.suit === suit && !keep.has(c.id) && !ids.includes(c.id) && (c.rank === v || (c.rank === 1 && v === 14)),
          );
          if (card) ids.push(card.id);
        }
        if (ids.length > best.length) best = ids;
      }
    }
    for (const id of best) keep.add(id);
    score += best.length;
  }
  for (let k = 0; k < req.sets; k++) {
    const byRank = new Map<number, string[]>();
    for (const c of naturals) if (!keep.has(c.id)) byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), c.id]);
    const best = [...byRank.values()].sort((a, b) => b.length - a.length)[0] ?? [];
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

/** Wants the top discard? */
function wantsDiscard(s: RoundState, seatId: string): boolean {
  const seat = s.seats.find((x) => x.id === seatId);
  const top = s.discard.at(-1);
  if (!seat || !top) return false;
  if (top.kind === "joker") return true;
  return seat.down ? canPlayAnywhere(top, s.melds) : improves(top, seat.hand, requirementFor(s.round));
}

/** During a buy window: does this (non-turn) seat ask to buy? */
export function wantsBuy(s: RoundState, seatId: string): boolean {
  const seat = s.seats.find((x) => x.id === seatId);
  if (!seat || seat.down || seat.buys >= 3) return false;
  const top = s.discard.at(-1);
  if (!top) return false;
  return improves(top, seat.hand, requirementFor(s.round));
}

/** The turn player's next action, or null when it isn't the bot's move. */
export function botMove(s: RoundState, seatId: string): BotAction | null {
  const seat = s.seats[s.turn];
  if (!seat || seat.id !== seatId) return null;
  const phase = s.phase;
  if (phase.kind === "offer") return { type: "answer", answer: wantsDiscard(s, seatId) ? "take" : "let-go" };
  if (phase.kind === "draw") {
    if (wantsDiscard(s, seatId) || phase.window === "open") {
      return wantsDiscard(s, seatId) ? { type: "draw", from: "discard" } : null;
    }
    return { type: "draw", from: "deck" };
  }
  if (phase.kind !== "play") return null;

  if (!seat.down) {
    for (const melds of goDownOptions(seat.hand, requirementFor(s.round))) {
      if (goDown(s, seatId, melds).ok) return { type: "goDown", melds };
    }
  } else {
    for (const card of seat.hand) {
      const spot = playableSpot(card, s.melds);
      if (!spot) continue;
      const action: BotAction = { type: "playOn", cardId: card.id, ...spot };
      if (applyBot(s, seatId, action).ok) return action;
    }
  }

  const { keep } = plan(seat.hand, requirementFor(s.round));
  // Once down, keep cards that fit the table (they are the way out); otherwise keep the plan.
  // Toss the most expensive card worth least.
  const worth = (c: Card) => (c.kind === "joker" ? 3 : seat.down ? (canPlayAnywhere(c, s.melds) ? 2 : 0) : keep.has(c.id) ? 1 : 0);
  const ranked = [...seat.hand].sort((a, b) => worth(a) - worth(b) || cardPoints(b) - cardPoints(a));
  const toss = ranked[0];
  return toss ? { type: "discard", cardId: toss.id } : null;
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
