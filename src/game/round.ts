import { arrangeRun, placementsFor } from "./arrange";
import { buildShoe, handPoints, mulberry32, shuffle, type Card, type Rng } from "./cards";
import { playOnRun, playOnSet, readRun, readSet, type Meld, type MeldResult, type RunPlacement } from "./melds";
import { firstBroken } from "./refusal";

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
/** Short names for tight spaces (the scoreboard's columns). */
export const ROUND_SHORT = ["1R 1S", "2S", "2R", "2S 1R", "2R 1S", "3S", "3R"] as const;
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

/** Where the cut lands, wrapped into the deck. */
const cutIndex = (at: number, size: number) => ((Math.floor(at) % size) + size) % size;

/** Cuts the shuffled deck; a cut joker leaves the deck for the cutter's hand. */
function cutDeck(deck: Card[], at: number, cutterHand: Card[] | undefined): { deck: Card[]; card: Card; kept: boolean } {
  const cutAt = cutIndex(at, deck.length);
  const card = deck[cutAt] as Card;
  const kept = card.kind === "joker";
  if (!kept) return { deck, card, kept };
  cutterHand?.push(card);
  return { deck: deck.filter((_, i) => i !== cutAt), card, kept };
}

/** Deals one card at a time, starting with seat `first`, until every hand holds HAND_SIZE. */
function dealHands(deck: Card[], hands: Card[][], first: number): void {
  for (let dealt = 0; hands.some((h) => h.length < HAND_SIZE); dealt++) {
    const hand = hands[(first + dealt) % hands.length] as Card[];
    if (hand.length < HAND_SIZE) hand.push(deck.shift() as Card);
  }
}

/** Shuffle, cut, deal 11 each starting left of the dealer, and flip the first discard. */
export function deal(opts: { seatIds: readonly string[]; round: number; dealer: number; rng: Rng; cutAt: number }): RoundState {
  const { seatIds, round, dealer, rng } = opts;
  requirementFor(round);
  const count = seatIds.length;
  const hands: Card[][] = seatIds.map(() => []);

  const cutter = rightOf(dealer, count);
  const cut = cutDeck(shuffle(buildShoe(count), rng), opts.cutAt, hands[cutter]);
  const { deck } = cut;

  const first = leftOf(dealer, count);
  dealHands(deck, hands, first);
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
    cut: { seat: seatIds[cutter] ?? "", card: cut.card, kept: cut.kept },
  };
}

const turnSeat = (s: RoundState): Seat => s.seats[s.turn] as Seat;
const findSeat = (s: RoundState, id: string) => s.seats.find((x) => x.id === id);
const handOf = (s: RoundState, id: string): Card[] => findSeat(s, id)?.hand ?? [];
const buysOf = (s: RoundState, id: string): number => findSeat(s, id)?.buys ?? 0;
const updateSeat = (s: RoundState, id: string, f: (seat: Seat) => Seat): RoundState => ({
  ...s,
  seats: s.seats.map((x) => (x.id === id ? f(x) : x)),
});

/** Is the buy window open (the turn player hasn't drawn and others may still ask to buy)? */
export const windowIsOpen = (phase: Phase): boolean => phase.kind === "draw" && phase.window === "open";
/** Who has asked to buy the discard (only while drawing or during an offer). */
export const requestsOf = (phase: Phase): readonly string[] => ("requests" in phase ? phase.requests : []);

/** The discards (all but the top) shuffled into a fresh deck; null when there are none to shuffle. */
function reshuffled(s: RoundState): RoundState | null {
  const top = s.discard.at(-1);
  const rest = s.discard.slice(0, -1);
  if (!top || rest.length === 0) return null;
  return { ...s, deck: shuffle(rest, mulberry32(s.seed)), discard: [top], seed: s.seed + 1 };
}

function takeTop(s: RoundState): { state: RoundState; card: Card } | null {
  const [card, ...deck] = s.deck;
  return card ? { state: { ...s, deck }, card } : null;
}

/** Take the top deck card, reshuffling the discards (all but the top) first if the deck is empty. */
function takeFromDeck(s: RoundState): { state: RoundState; card: Card } | null {
  const state = s.deck.length === 0 ? reshuffled(s) : s;
  return state ? takeTop(state) : null;
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

/** Why the turn player can't draw from `from` in this phase, or null. */
function drawRefusal(phase: Phase, from: "deck" | "discard"): string | null {
  return firstBroken([
    [() => phase.kind === "play", "You already drew this turn"],
    [() => phase.kind === "offer", "Someone wants to buy the discard: take it or let it go"],
    [() => phase.kind !== "draw", "You can't draw now"],
    [() => from === "deck" && windowIsOpen(phase), "Wait for the buy window to close, or take the discard"],
  ]);
}

export function draw(s: RoundState, seatId: string, from: "deck" | "discard"): Result {
  const bad = turnCheck(s, seatId) ?? drawRefusal(s.phase, from);
  if (bad) return fail(bad);
  return from === "discard" ? takeDiscard(s, seatId) : drawFromDeck(s, seatId);
}

export function requestBuy(s: RoundState, seatId: string): Result {
  const bad = firstBroken([
    [() => s.phase.kind === "out", "The round is over"],
    [() => !windowIsOpen(s.phase), "The buy window is closed"],
    [() => !findSeat(s, seatId), "You're not in this game"],
    [() => turnSeat(s).id === seatId, "It's your draw: just take the discard"],
    [() => s.lastDiscarder === seatId, "You can't buy your own discard"],
    [() => requestsOf(s.phase).includes(seatId), "You already asked to buy it"],
    [() => buysOf(s, seatId) >= MAX_BUYS, "You've used your 3 buys this round"],
    [() => s.discard.length === 0, "There's nothing to buy"],
  ]);
  if (bad) return fail(bad);
  return done({ ...s, phase: { kind: "draw", window: "open", requests: [...requestsOf(s.phase), seatId] } });
}

export function closeBuyWindow(s: RoundState): Result {
  if (s.phase.kind !== "draw" || s.phase.window !== "open") return fail("No buy window is open");
  const { requests } = s.phase;
  return done({
    ...s,
    phase: requests.length === 0 ? { kind: "draw", window: "closed", requests: [] } : { kind: "offer", requests },
  });
}

/** The requester closest after the turn player. */
function firstBuyer(s: RoundState, requests: readonly string[]): Seat | undefined {
  const count = s.seats.length;
  return Array.from({ length: count - 1 }, (_, k) => s.seats[(s.turn + 1 + k) % count] as Seat).find((x) =>
    requests.includes(x.id),
  );
}

/** The buyer takes the top discard plus the top deck card (when there is one), using a buy. */
function sellTop(s: RoundState, buyerId: string, top: Card): RoundState {
  const rest = { ...s, discard: s.discard.slice(0, -1) };
  const taken = takeFromDeck(rest);
  const bought = taken ? [top, taken.card] : [top];
  return updateSeat(taken ? taken.state : rest, buyerId, (x) => ({ ...x, hand: [...x.hand, ...bought], buys: x.buys + 1 }));
}

/** The turn player lets the discard go: the first requester buys it, then the turn player draws. */
function letGo(s: RoundState, seatId: string): Result {
  const buyer = firstBuyer(s, requestsOf(s.phase));
  const top = s.discard.at(-1);
  if (!buyer || !top) return drawFromDeck(s, seatId);
  return drawFromDeck(sellTop(s, buyer.id, top), seatId);
}

export function answerOffer(s: RoundState, seatId: string, answer: "take" | "let-go"): Result {
  const bad = firstBroken([
    [() => s.phase.kind === "out", "The round is over"],
    [() => s.phase.kind !== "offer", "There's no offer to answer"],
    [() => turnSeat(s).id !== seatId, "It's not your turn"],
  ]);
  if (bad) return fail(bad);
  return answer === "take" ? takeDiscard(s, seatId) : letGo(s, seatId);
}

/** Every way this card could go onto the table right now. */
export function canPlayAnywhere(card: Card, melds: readonly TableMeld[]): boolean {
  return melds.some(({ meld }) => {
    if (meld.kind === "set") return playOnSet(meld, card).ok;
    return placementsFor(meld, card).length > 0;
  });
}

/** A one-card hand whose card has nowhere to go on the table. */
const strandedLastCard = (hand: readonly Card[], melds: readonly TableMeld[]) =>
  hand.length === 1 && hand.every((c) => !canPlayAnywhere(c, melds));

/** After plays a hand is empty (out), or 2+ cards, or 1 card that can still be played. */
function settle(s: RoundState, seatId: string): Result {
  const hand = handOf(s, seatId);
  if (hand.length === 0) return done({ ...s, phase: { kind: "out", winner: seatId } });
  if (strandedLastCard(hand, s.melds)) return fail("You can't be left with a last card that has nowhere to go");
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

const meetsRequirement = (proposals: readonly MeldProposal[], req: Requirement) => {
  const runs = proposals.filter((p) => p.kind === "run").length;
  return runs === req.runs && proposals.length - runs === req.sets;
};

/** Why the turn player can't go down with these proposals (before reading the melds), or null. */
function goDownRefusal(s: RoundState, proposals: readonly MeldProposal[]): string | null {
  const seat = turnSeat(s);
  const req = requirementFor(s.round);
  const used = proposals.flatMap((p) => p.cardIds);
  const inHand = new Set(seat.hand.map((x) => x.id));
  return firstBroken([
    [() => seat.down, "You're already down this round"],
    [() => !meetsRequirement(proposals, req), `You need exactly ${describeRequirement(req)} to go down`],
    [() => new Set(used).size !== used.length, "You used a card twice"],
    [() => used.some((id) => !inHand.has(id)), "That card is not in your hand"],
  ]);
}

const readProposal = (p: MeldProposal, cards: Card[]): MeldResult<Meld> =>
  p.kind === "run" ? readRun(asRun(cards, p.spare)) : readSet(cards);

/** Reads each proposal from the hand as a meld; the first that doesn't read refuses them all. */
function readProposals(proposals: readonly MeldProposal[], hand: readonly Card[]): { ok: true; melds: Meld[] } | { ok: false; reason: string } {
  const byId = new Map(hand.map((x) => [x.id, x]));
  const melds: Meld[] = [];
  for (const p of proposals) {
    const read = readProposal(p, p.cardIds.map((id) => byId.get(id) as Card));
    if (!read.ok) return read;
    melds.push(read.meld);
  }
  return { ok: true, melds };
}

export function goDown(s: RoundState, seatId: string, proposals: readonly MeldProposal[]): Result {
  const bad = playCheck(s, seatId) ?? goDownRefusal(s, proposals);
  if (bad) return fail(bad);
  const read = readProposals(proposals, turnSeat(s).hand);
  if (!read.ok) return fail(read.reason);

  const melds = read.melds.map((meld, i): TableMeld => ({ id: `m${s.nextMeldId + i}`, owner: seatId, meld }));
  const usedSet = new Set(proposals.flatMap((p) => p.cardIds));
  const state = updateSeat(
    { ...s, melds: [...s.melds, ...melds], nextMeldId: s.nextMeldId + melds.length },
    seatId,
    (x) => ({ ...x, down: true, hand: x.hand.filter((c) => !usedSet.has(c.id)) }),
  );
  return settle(state, seatId);
}

/** The turn player's checks for playing on the table: drawn, and already down. */
function playOnCheck(s: RoundState, seatId: string): string | null {
  const bad = playCheck(s, seatId);
  if (bad) return bad;
  return turnSeat(s).down ? null : "You need to go down first";
}

/** The card in the turn player's hand and the meld it goes on, or why the play is refused. */
function playTarget(s: RoundState, seatId: string, cardId: string, meldId: string): { card: Card; target: TableMeld } | string {
  const bad = playOnCheck(s, seatId);
  if (bad) return bad;
  const card = turnSeat(s).hand.find((x) => x.id === cardId);
  if (!card) return "That card is not in your hand";
  const target = s.melds.find((m) => m.id === meldId);
  return target ? { card, target } : "There's no such meld";
}

/** Plays a card on a set, or on a run at the chosen placement. */
function playOnMeld(meld: Meld, card: Card, placement: RunPlacement | undefined): MeldResult<Meld> {
  if (meld.kind === "set") return playOnSet(meld, card);
  if (!placement) return { ok: false, reason: "Choose which end (or which joker) it goes on" };
  return playOnRun(meld, card, placement);
}

const replaceMeld = (melds: readonly TableMeld[], id: string, meld: Meld): TableMeld[] =>
  melds.map((m) => (m.id === id ? { ...m, meld } : m));

export function playOn(s: RoundState, seatId: string, cardId: string, meldId: string, placement?: RunPlacement): Result {
  const found = playTarget(s, seatId, cardId, meldId);
  if (typeof found === "string") return fail(found);
  const played = playOnMeld(found.target.meld, found.card, placement);
  if (!played.ok) return fail(played.reason);
  const state = updateSeat({ ...s, melds: replaceMeld(s.melds, meldId, played.meld) }, seatId, (x) => ({
    ...x,
    hand: x.hand.filter((c) => c.id !== cardId),
  }));
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
