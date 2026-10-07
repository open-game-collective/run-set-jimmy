import { arrangeRun, placementsFor } from "./arrange";
import { buildShoe, handPoints, mulberry32, shuffle, type Card, type Rng } from "./cards";
import { playOnRun, playOnSet, readRun, readSet, type Meld, type RunMeld, type RunPlacement } from "./melds";

export type Requirement = { runs: number; sets: number };

/** RULES.md "Rounds". */
export const REQUIREMENTS: readonly Requirement[] = [
  { runs: 1, sets: 1 },
  { runs: 0, sets: 2 },
  { runs: 2, sets: 0 },
  { runs: 1, sets: 2 },
  { runs: 2, sets: 1 },
  { runs: 0, sets: 3 },
  { runs: 3, sets: 0 },
];
export const ROUNDS = REQUIREMENTS.length;
/** What people at the table call each round (RULES.md "Rounds"). */
export const ROUND_NAMES = ["One run, one set", "Two sets", "Two runs", "Two sets, one run", "Two runs, one set", "Three sets", "Three runs"] as const;
export const HAND_SIZE = 11;
export const MAX_BUYS = 3;

export type Seat = { id: string; hand: Card[]; down: boolean; buys: number };
export type TableMeld = { id: string; owner: string; meld: Meld };

/**
 * - `draw`: the turn player must draw. While `window` is open, others may ask to buy the top
 *   discard (`requests`) and the turn player may take it, but not draw from the deck.
 * - `offer`: the window closed with requests: the turn player takes the discard or lets it go.
 * - `play`: drew; may go down, play on melds, then discards.
 * - `out`: someone went out; the round is over.
 */
export type Phase =
  | { kind: "draw"; window: "open" | "closed"; requests: string[] }
  | { kind: "offer"; requests: string[] }
  | { kind: "play" }
  | { kind: "out"; winner: string };

export type RoundState = {
  round: number;
  dealer: number;
  /** Seat index whose turn it is. */
  turn: number;
  seats: Seat[];
  /** Top of the deck is index 0. */
  deck: Card[];
  /** Top of the discard pile is the last card. */
  discard: Card[];
  melds: TableMeld[];
  phase: Phase;
  lastDiscarder: string | null;
  nextMeldId: number;
  /** Seeds the next reshuffle, so the round stays a pure function of its inputs. */
  seed: number;
  cut: { seat: string; card: Card; kept: boolean } | null;
};

export type Result = { ok: true; state: RoundState } | { ok: false; reason: string };
/** A run's cards may come in any order; `spare` says which end its spare jokers go on. */
export type MeldProposal = { kind: "run" | "set"; cardIds: string[]; spare?: "high" | "low" };

const fail = (reason: string): Result => ({ ok: false, reason });
const done = (state: RoundState): Result => ({ ok: true, state });

const leftOf = (seat: number, seats: number) => (seat + 1) % seats;
const rightOf = (seat: number, seats: number) => (seat - 1 + seats) % seats;

export function describeRequirement({ runs, sets }: Requirement): string {
  const part = (count: number, word: string) => (count === 0 ? null : `${count} ${word}${count === 1 ? "" : "s"}`);
  return [part(runs, "run"), part(sets, "set")].filter((p) => p !== null).join(" and ");
}

export function requirementFor(round: number): Requirement {
  const req = REQUIREMENTS[round - 1];
  if (!req) throw new Error(`No round ${round}`);
  return req;
}

/** Shuffle, cut, deal 11 each starting left of the dealer, and flip the first discard. */
export function deal(opts: { seatIds: readonly string[]; round: number; dealer: number; rng: Rng; cutAt: number }): RoundState {
  const { seatIds, round, dealer, rng } = opts;
  requirementFor(round);
  const count = seatIds.length;
  let deck = shuffle(buildShoe(count), rng);
  const hands: Card[][] = seatIds.map(() => []);

  const cutter = rightOf(dealer, count);
  const cutAt = ((Math.floor(opts.cutAt) % deck.length) + deck.length) % deck.length;
  const cutCard = deck[cutAt] as Card;
  const kept = cutCard.kind === "joker";
  if (kept) {
    deck = deck.filter((_, i) => i !== cutAt);
    hands[cutter]?.push(cutCard);
  }

  const first = leftOf(dealer, count);
  for (let dealt = 0; hands.some((h) => h.length < HAND_SIZE); dealt++) {
    const hand = hands[(first + dealt) % count] as Card[];
    if (hand.length < HAND_SIZE) hand.push(deck.shift() as Card);
  }
  const flipped = deck.shift() as Card;

  return {
    round,
    dealer,
    turn: first,
    seats: seatIds.map((id, i) => ({ id, hand: hands[i] ?? [], down: false, buys: 0 })),
    deck,
    discard: [flipped],
    melds: [],
    phase: { kind: "draw", window: "open", requests: [] },
    lastDiscarder: null,
    nextMeldId: 1,
    seed: Math.floor(rng() * 2 ** 32),
    cut: { seat: seatIds[cutter] ?? "", card: cutCard, kept },
  };
}

const turnSeat = (s: RoundState): Seat => s.seats[s.turn] as Seat;
const findSeat = (s: RoundState, id: string) => s.seats.find((x) => x.id === id);
const updateSeat = (s: RoundState, id: string, f: (seat: Seat) => Seat): RoundState => ({
  ...s,
  seats: s.seats.map((x) => (x.id === id ? f(x) : x)),
});

/** Take the top deck card, reshuffling the discards (all but the top) first if the deck is empty. */
function takeFromDeck(s: RoundState): { state: RoundState; card: Card } | null {
  let state = s;
  if (state.deck.length === 0) {
    const top = state.discard.at(-1);
    const rest = state.discard.slice(0, -1);
    if (!top || rest.length === 0) return null;
    state = { ...state, deck: shuffle(rest, mulberry32(state.seed)), discard: [top], seed: state.seed + 1 };
  }
  const [card, ...deck] = state.deck;
  if (!card) return null;
  return { state: { ...state, deck }, card };
}

function takeDiscard(s: RoundState, seatId: string): Result {
  const top = s.discard.at(-1);
  if (!top) return fail("The discard pile is empty");
  const state = { ...s, discard: s.discard.slice(0, -1), phase: { kind: "play" } as const };
  return done(updateSeat(state, seatId, (x) => ({ ...x, hand: [...x.hand, top] })));
}

function drawFromDeck(s: RoundState, seatId: string): Result {
  const taken = takeFromDeck(s);
  if (!taken) return fail("There are no cards left to draw");
  const state: RoundState = { ...taken.state, phase: { kind: "play" } };
  return done(updateSeat(state, seatId, (x) => ({ ...x, hand: [...x.hand, taken.card] })));
}

/** Common checks for the turn player's actions. */
function turnCheck(s: RoundState, seatId: string): string | null {
  if (s.phase.kind === "out") return "The round is over";
  if (turnSeat(s).id !== seatId) return "It's not your turn";
  return null;
}

export function draw(s: RoundState, seatId: string, from: "deck" | "discard"): Result {
  const bad = turnCheck(s, seatId);
  if (bad) return fail(bad);
  if (s.phase.kind === "play") return fail("You already drew this turn");
  if (s.phase.kind === "offer") return fail("Someone wants to buy the discard: take it or let it go");
  if (s.phase.kind !== "draw") return fail("You can't draw now");
  if (from === "discard") return takeDiscard(s, seatId);
  if (s.phase.window === "open") return fail("Wait for the buy window to close, or take the discard");
  return drawFromDeck(s, seatId);
}

export function requestBuy(s: RoundState, seatId: string): Result {
  if (s.phase.kind === "out") return fail("The round is over");
  if (s.phase.kind !== "draw" || s.phase.window !== "open") return fail("The buy window is closed");
  const seat = findSeat(s, seatId);
  if (!seat) return fail("You're not in this game");
  if (turnSeat(s).id === seatId) return fail("It's your draw: just take the discard");
  if (s.lastDiscarder === seatId) return fail("You can't buy your own discard");
  if (s.phase.requests.includes(seatId)) return fail("You already asked to buy it");
  if (seat.buys >= MAX_BUYS) return fail("You've used your 3 buys this round");
  if (s.discard.length === 0) return fail("There's nothing to buy");
  return done({ ...s, phase: { ...s.phase, requests: [...s.phase.requests, seatId] } });
}

export function closeBuyWindow(s: RoundState): Result {
  if (s.phase.kind !== "draw" || s.phase.window !== "open") return fail("No buy window is open");
  const { requests } = s.phase;
  return done({
    ...s,
    phase: requests.length === 0 ? { kind: "draw", window: "closed", requests: [] } : { kind: "offer", requests },
  });
}

export function answerOffer(s: RoundState, seatId: string, answer: "take" | "let-go"): Result {
  if (s.phase.kind === "out") return fail("The round is over");
  if (s.phase.kind !== "offer") return fail("There's no offer to answer");
  if (turnSeat(s).id !== seatId) return fail("It's not your turn");
  if (answer === "take") return takeDiscard(s, seatId);

  const { requests } = s.phase;
  const count = s.seats.length;
  const buyer = Array.from({ length: count - 1 }, (_, k) => s.seats[(s.turn + 1 + k) % count] as Seat).find((x) =>
    requests.includes(x.id),
  );
  const top = s.discard.at(-1);
  if (!buyer || !top) return drawFromDeck(s, seatId);
  const taken = takeFromDeck({ ...s, discard: s.discard.slice(0, -1) });
  const bought = taken ? [top, taken.card] : [top];
  const afterBuy = updateSeat(taken ? taken.state : { ...s, discard: s.discard.slice(0, -1) }, buyer.id, (x) => ({
    ...x,
    hand: [...x.hand, ...bought],
    buys: x.buys + 1,
  }));
  return drawFromDeck(afterBuy, seatId);
}

/** Every way this card could go onto the table right now. */
export function canPlayAnywhere(card: Card, melds: readonly TableMeld[]): boolean {
  return melds.some(({ meld }) => {
    if (meld.kind === "set") return playOnSet(meld, card).ok;
    return placementsFor(meld, card).length > 0;
  });
}

/** After plays a hand is empty (out), or 2+ cards, or 1 card that can still be played. */
function settle(s: RoundState, seatId: string): Result {
  const hand = findSeat(s, seatId)?.hand ?? [];
  if (hand.length === 0) return done({ ...s, phase: { kind: "out", winner: seatId } });
  const last = hand[0];
  if (hand.length === 1 && last && !canPlayAnywhere(last, s.melds)) {
    return fail("You can't be left with a last card that has nowhere to go");
  }
  return done(s);
}

function playCheck(s: RoundState, seatId: string): string | null {
  const bad = turnCheck(s, seatId);
  if (bad) return bad;
  if (s.phase.kind !== "play") return "You need to draw first";
  return null;
}

/** Keeps an order that already reads as a run; otherwise arranges the cards (jokers fill the gaps). */
const asRun = (cards: Card[], spare: "high" | "low" = "high"): Card[] =>
  readRun(cards).ok ? cards : (arrangeRun(cards, spare) ?? cards);

export function goDown(s: RoundState, seatId: string, proposals: readonly MeldProposal[]): Result {
  const bad = playCheck(s, seatId);
  if (bad) return fail(bad);
  const seat = turnSeat(s);
  if (seat.down) return fail("You're already down this round");

  const req = requirementFor(s.round);
  const runs = proposals.filter((p) => p.kind === "run").length;
  if (runs !== req.runs || proposals.length - runs !== req.sets) {
    return fail(`You need exactly ${describeRequirement(req)} to go down`);
  }

  const used = proposals.flatMap((p) => p.cardIds);
  if (new Set(used).size !== used.length) return fail("You used a card twice");
  const byId = new Map(seat.hand.map((x) => [x.id, x]));
  if (used.some((id) => !byId.has(id))) return fail("That card is not in your hand");

  const melds: TableMeld[] = [];
  for (const [i, p] of proposals.entries()) {
    const cards = p.cardIds.map((id) => byId.get(id) as Card);
    const read = p.kind === "run" ? readRun(asRun(cards, p.spare)) : readSet(cards);
    if (!read.ok) return fail(read.reason);
    melds.push({ id: `m${s.nextMeldId + i}`, owner: seatId, meld: read.meld });
  }

  const usedSet = new Set(used);
  const state = updateSeat(
    { ...s, melds: [...s.melds, ...melds], nextMeldId: s.nextMeldId + melds.length },
    seatId,
    (x) => ({ ...x, down: true, hand: x.hand.filter((c) => !usedSet.has(c.id)) }),
  );
  return settle(state, seatId);
}

export function playOn(s: RoundState, seatId: string, cardId: string, meldId: string, placement?: RunPlacement): Result {
  const bad = playCheck(s, seatId);
  if (bad) return fail(bad);
  const seat = turnSeat(s);
  if (!seat.down) return fail("You need to go down first");
  const card = seat.hand.find((x) => x.id === cardId);
  if (!card) return fail("That card is not in your hand");
  const target = s.melds.find((m) => m.id === meldId);
  if (!target) return fail("There's no such meld");

  let meld: Meld;
  if (target.meld.kind === "run") {
    if (!placement) return fail("Choose which end (or which joker) it goes on");
    const r = playOnRun(target.meld as RunMeld, card, placement);
    if (!r.ok) return fail(r.reason);
    meld = r.meld;
  } else {
    const r = playOnSet(target.meld, card);
    if (!r.ok) return fail(r.reason);
    meld = r.meld;
  }

  const state = updateSeat(
    { ...s, melds: s.melds.map((m) => (m.id === meldId ? { ...m, meld } : m)) },
    seatId,
    (x) => ({ ...x, hand: x.hand.filter((c) => c.id !== cardId) }),
  );
  return settle(state, seatId);
}

export function discard(s: RoundState, seatId: string, cardId: string): Result {
  const bad = playCheck(s, seatId);
  if (bad) return fail(bad);
  const seat = turnSeat(s);
  const card = seat.hand.find((x) => x.id === cardId);
  if (!card) return fail("That card is not in your hand");
  if (seat.hand.length < 2) return fail("You can't discard your last card");
  const state = updateSeat(s, seatId, (x) => ({ ...x, hand: x.hand.filter((c) => c.id !== cardId) }));
  return done({
    ...state,
    discard: [...state.discard, card],
    turn: leftOf(s.turn, s.seats.length),
    lastDiscarder: seatId,
    phase: { kind: "draw", window: "open", requests: [] },
  });
}

/** Points left in each hand; the player who went out scores 0. */
export function scoreRound(s: RoundState): Record<string, number> {
  return Object.fromEntries(s.seats.map((x) => [x.id, handPoints(x.hand)]));
}
