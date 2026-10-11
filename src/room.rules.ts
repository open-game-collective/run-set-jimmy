/**
 * The room's own transitions over its shared state: seats, moves through the rules engine, the
 * AI players, the deal. Pure and synchronous (randomness comes in as a number), so src/room.ts
 * only sequences them into phases and timers.
 */
import { castDraft, produce, type Draft } from "immer";
import { botMove, wantsBuy, type BotAction } from "./game/bot";
import { MIN_PLAYERS, decksFor, mulberry32, type Card } from "./game/cards";
import { addRound, dealerFor, newScoreSheet } from "./game/game";
import type { RunPlacement } from "./game/melds";
import {
  ROUNDS,
  answerOffer,
  closeBuyWindow,
  deal,
  discard,
  draw,
  goDown,
  playOn,
  requestBuy,
  scoreRound,
  windowIsOpen,
  type MeldProposal,
  type Result,
  type RoundState,
  type TableMeld,
} from "./game/round";
import { cardName } from "./game/words";
import type { OgsClaim, RoomShared, Seat } from "./room.types";
import { hostIndex } from "./views";

export const MAX_SEATS = 7;
/** AI players are supper-club regulars (docs/art-style.md). */
export const AI_NAMES = ["Vera", "Sal", "Dot", "Monty", "Lou", "Bea"] as const;
const LOG_LENGTH = 8;

export function newRoom(roomCode: string, tvId: string): RoomShared {
  return {
    tvId,
    roomCode,
    seats: [],
    claims: {},
    couchOf: {},
    couches: [],
    round: null,
    sheet: null,
    roundNumber: 0,
    gameNumber: 0,
    oops: {},
    log: [],
    seq: 0,
    cut: null,
    cutter: null,
  };
}

const update = (shared: RoomShared, recipe: (draft: Draft<RoomShared>) => void): RoomShared => produce(shared, recipe);

export const seatOf = (shared: RoomShared, callerId: string): number => shared.seats.findIndex((s) => s.id === callerId);
const nameOf = (shared: RoomShared, id: string) => shared.seats.find((s) => s.id === id)?.name ?? "Someone";

function log(d: Draft<RoomShared>, seat: number | null, kind: string, text: string): void {
  d.seq += 1;
  d.log.push({ seq: d.seq, seat, kind, text });
  if (d.log.length > LOG_LENGTH) d.log.splice(0, d.log.length - LOG_LENGTH);
}

export const isHost = (shared: RoomShared, callerId: string): boolean => {
  const seat = seatOf(shared, callerId);
  return seat >= 0 && seat === hostIndex(shared);
};

export const canStart = (shared: RoomShared, callerId: string): boolean => isHost(shared, callerId) && shared.seats.length >= MIN_PLAYERS;

export const isCutter = (shared: RoomShared, callerId: string): boolean => shared.cutter !== null && seatOf(shared, callerId) === shared.cutter;

export const lastRound = (shared: RoomShared): boolean => shared.roundNumber >= ROUNDS;

/** What the phone asked to be called (trimmed to 16), else "Player N". */
const baseName = (shared: RoomShared, wanted: string | undefined): string =>
  wanted && wanted.length > 0 ? wanted.slice(0, 16) : `Player ${shared.seats.length + 1}`;

/** A unique seat name: the verified OGS name, else what the phone typed, else "Player N". */
function seatName(shared: RoomShared, wanted: string | undefined): string {
  const base = baseName(shared, wanted);
  const taken = new Set(shared.seats.map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

// --- Moves ---

/** A player's move, with who made it and what the table looked like before it. */
type Mover = { shared: RoomShared; r: RoundState; id: string; seat: number; name: string; top: string };
/** A log line: [kind, text]. */
type LogLine = [string, string];
type Move = { result: Result; line: (next: RoundState) => LogLine };

/** A move a phone (or an AI player) makes during a round, as the rules engine takes it. */
export type PlayerMove =
  | { type: "DRAW"; from: "deck" | "discard" }
  | { type: "BUY" }
  | { type: "ANSWER"; answer: "take" | "let-go" }
  | { type: "GO_DOWN"; melds: MeldProposal[] }
  | { type: "PLAY_ON"; cardId: string; meldId: string; placement?: RunPlacement | undefined }
  | { type: "DISCARD"; cardId: string };

const topName = (r: RoundState): string => {
  const top = r.discard.at(-1);
  return top ? cardName(top) : "discard";
};
const cardLabel = (card: Card | undefined): string => (card ? cardName(card) : "card");
const handCard = (r: RoundState, cardId: string): Card | undefined => r.seats[r.turn]?.hand.find((c) => c.id === cardId);

function moverFor(shared: RoomShared, r: RoundState, id: string): Mover {
  return { shared, r, id, seat: seatOf(shared, id), name: nameOf(shared, id), top: topName(r) };
}

/** The seated caller making a move during a round; null for anyone else, or between rounds. */
function moverOf(shared: RoomShared, callerId: string): Mover | null {
  const r = shared.round;
  if (!r || seatOf(shared, callerId) < 0) return null;
  return moverFor(shared, r, callerId);
}

function drawMove(m: Mover, from: "deck" | "discard"): Move {
  return {
    result: draw(m.r, m.id, from),
    line: () => (from === "deck" ? ["draw", `${m.name} drew from the deck`] : ["take", `${m.name} took the ${m.top}`]),
  };
}

function buyMove(m: Mover): Move {
  return { result: requestBuy(m.r, m.id), line: () => ["buy", `${m.name} wants to buy the ${m.top}`] };
}

/** Whoever has one more buy after the move than before it. */
function buyerName(m: Mover, next: RoundState): string {
  const buyer = next.seats.find((x, i) => x.buys > (m.r.seats[i]?.buys ?? 0));
  return buyer ? nameOf(m.shared, buyer.id) : "Someone";
}

function answerLine(m: Mover, answer: "take" | "let-go", next: RoundState): LogLine {
  if (answer === "take") return ["take", `${m.name} took the ${m.top}`];
  return ["bought", `${buyerName(m, next)} bought the ${m.top}`];
}

function answerMove(m: Mover, answer: "take" | "let-go"): Move {
  return { result: answerOffer(m.r, m.id, answer), line: (next) => answerLine(m, answer, next) };
}

function goDownMove(m: Mover, melds: MeldProposal[]): Move {
  return { result: goDown(m.r, m.id, melds), line: () => ["down", `${m.name} went down!`] };
}

/** "their run", "Ann's set", or "the table" when there's no such meld. */
function meldLabel(m: Mover, target: TableMeld | undefined): string {
  if (!target) return "the table";
  const whose = target.owner === m.id ? "their" : `${nameOf(m.shared, target.owner)}'s`;
  return `${whose} ${target.meld.kind}`;
}

function playOnMove(m: Mover, cardId: string, meldId: string, placement: RunPlacement | undefined): Move {
  const card = handCard(m.r, cardId);
  const target = m.r.melds.find((x) => x.id === meldId);
  return {
    result: playOn(m.r, m.id, cardId, meldId, placement),
    line: () => ["play", `${m.name} played the ${cardLabel(card)} on ${meldLabel(m, target)}`],
  };
}

function discardMove(m: Mover, cardId: string): Move {
  const card = handCard(m.r, cardId);
  return { result: discard(m.r, m.id, cardId), line: () => ["discard", `${m.name} discarded the ${cardLabel(card)}`] };
}

function playerMove(m: Mover, move: PlayerMove): Move {
  switch (move.type) {
    case "DRAW":
      return drawMove(m, move.from);
    case "BUY":
      return buyMove(m);
    case "ANSWER":
      return answerMove(m, move.answer);
    case "GO_DOWN":
      return goDownMove(m, move.melds);
    case "PLAY_ON":
      return playOnMove(m, move.cardId, move.meldId, move.placement);
    case "DISCARD":
      return discardMove(m, move.cardId);
  }
}

/** The rules said no: tell only that phone why. */
function refuse(shared: RoomShared, id: string, reason: string): RoomShared {
  return update(shared, (d) => {
    d.seq += 1;
    d.oops[id] = { line: reason, seq: d.seq };
  });
}

/** The move stands: the round moves on, the phone's last refusal clears, and the table log says what happened. */
function accept(shared: RoomShared, m: Mover, next: RoundState, entry: LogLine): RoomShared {
  return update(shared, (d) => {
    d.round = castDraft(next);
    delete d.oops[m.id];
    log(d, m.seat, entry[0], entry[1]);
    if (next.phase.kind === "out") log(d, m.seat, "out", `${m.name} went out!`);
  });
}

/** What a move did, for the room's domain events: who moved, and whether the rules let it stand. */
export type MoveOutcome = { shared: RoomShared; accepted: boolean; seat: number };

/** Runs a player's move through the rules; a refusal goes back to that phone only. */
export function act(shared: RoomShared, callerId: string, move: PlayerMove): MoveOutcome {
  const m = moverOf(shared, callerId);
  if (!m) return { shared, accepted: false, seat: -1 };
  const { result, line } = playerMove(m, move);
  if (!result.ok) return { shared: refuse(shared, m.id, result.reason), accepted: false, seat: m.seat };
  return { shared: accept(shared, m, result.state, line(result.state)), accepted: true, seat: m.seat };
}

// --- The cut and the deal ---

export function setCutter(shared: RoomShared): RoomShared {
  const n = shared.seats.length;
  const dealer = dealerFor(shared.roundNumber, n);
  return update(shared, (d) => {
    d.cutter = (dealer - 1 + n) % n;
  });
}

/** Deals the round, cut `at` (0–1) along the shoe; `seed` shuffles it (from the room's ctx.random()). */
export function dealRound(shared: RoomShared, at: number, seed: number): RoomShared {
  const seatIds = shared.seats.map((s) => s.id);
  const shoeSize = decksFor(seatIds.length) * 54;
  const r = deal({
    seatIds,
    round: shared.roundNumber,
    dealer: dealerFor(shared.roundNumber, seatIds.length),
    rng: mulberry32(seed),
    cutAt: Math.min(shoeSize - 1, Math.floor(at * shoeSize)),
  });
  return update(shared, (d) => {
    d.round = castDraft(r);
    d.cutter = null;
    d.oops = {};
    const cut = r.cut;
    if (cut) {
      const seat = seatIds.indexOf(cut.seat);
      d.seq += 1;
      d.cut = { seat, card: cut.card, kept: cut.kept, seq: d.seq };
      const who = nameOf(shared, cut.seat);
      log(d, seat, cut.kept ? "joker" : "cut", cut.kept ? `${who} cut a Joker and keeps it!` : `${who} cut the ${cardName(cut.card)}`);
    }
  });
}

export function newGame(shared: RoomShared): RoomShared {
  return update(shared, (d) => {
    d.sheet = newScoreSheet(shared.seats.map((s) => s.id));
    d.roundNumber = 1;
    d.gameNumber += 1;
    d.round = null;
    d.cut = null;
  });
}

export function nextRound(shared: RoomShared): RoomShared {
  return update(shared, (d) => {
    d.roundNumber += 1;
    d.round = null;
    d.cut = null;
  });
}

/** The buy window's time is up: an offer to the turn player, or on to their draw. */
export function closeWindow(shared: RoomShared): RoomShared {
  const r = shared.round;
  if (!r) return shared;
  const closed = closeBuyWindow(r);
  if (!closed.ok) return shared;
  return update(shared, (d) => {
    d.round = castDraft(closed.state);
  });
}

/** Adds the finished round's points to the score sheet; returns them by seat too. */
export function recordRound(shared: RoomShared): { shared: RoomShared; points: number[] } {
  const r = shared.round;
  const sheet = shared.sheet;
  if (!r || !sheet) return { shared, points: [] };
  const scored = scoreRound(r);
  return {
    shared: update(shared, (d) => {
      d.sheet = addRound(sheet, scored);
    }),
    points: shared.seats.map((s) => scored[s.id] ?? 0),
  };
}

export const roundOut = (shared: RoomShared): boolean => shared.round?.phase.kind === "out";
export const windowOpen = (shared: RoomShared): boolean => shared.round !== null && windowIsOpen(shared.round.phase);

// --- Seats ---

/** A caller who may take a seat: a phone (not the TV), not already seated, while seats are left. */
function canSeat(shared: RoomShared, id: string): boolean {
  return id !== shared.tvId && !shared.seats.some((s) => s.id === id) && shared.seats.length < MAX_SEATS;
}

/** A new seat, named and pictured by the caller's verified OGS claim when there is one. */
function newSeat(shared: RoomShared, id: string, typed: string | undefined): Seat {
  const claim = shared.claims[id];
  return { id, name: seatName(shared, claim?.name ?? typed), avatar: claim?.avatar || null, ai: false };
}

export function join(shared: RoomShared, callerId: string, name: string | undefined): RoomShared {
  if (!canSeat(shared, callerId)) return shared;
  const seat = newSeat(shared, callerId, name);
  return update(shared, (d) => {
    d.seats.push(seat);
  });
}

/** The next AI player: the first regular not yet at the table, with an id no phone can have. */
function newAiSeat(shared: RoomShared): Seat {
  const taken = new Set(shared.seats.map((s) => s.name));
  const ids = new Set(shared.seats.map((s) => s.id));
  let n = 1;
  while (ids.has(`ai:${n}`)) n++;
  return { id: `ai:${n}`, name: seatName(shared, AI_NAMES.find((x) => !taken.has(x)) ?? "Vera"), avatar: null, ai: true };
}

export function addAi(shared: RoomShared): RoomShared {
  if (shared.seats.length >= MAX_SEATS) return shared;
  const seat = newAiSeat(shared);
  return update(shared, (d) => {
    d.seats.push(seat);
  });
}

/** Moves one item of a list to another index, in place. */
function moveIn<T>(list: T[], from: number, to: number): void {
  const [moved] = list.splice(from, 1);
  if (moved) list.splice(to, 0, moved);
}

const seatsExist = (shared: RoomShared, ...seats: number[]) => seats.every((s) => s < shared.seats.length);

export function moveSeat(shared: RoomShared, seat: number, to: number): RoomShared {
  if (!seatsExist(shared, seat, to)) return shared;
  return update(shared, (d) => moveIn(d.seats, seat, to));
}

export function removeSeat(shared: RoomShared, seat: number): RoomShared {
  if (seat >= shared.seats.length) return shared;
  return update(shared, (d) => {
    d.seats.splice(seat, 1);
  });
}

// --- OGS ---

/** A seat taken before the claim arrived takes the verified name (unique among the others) and avatar too. */
function renameSeat(d: Draft<RoomShared>, shared: RoomShared, callerId: string, claim: OgsClaim): void {
  const seat = d.seats.find((s) => s.id === callerId);
  if (!seat) return;
  seat.name = seatName({ ...shared, seats: shared.seats.filter((s) => s.id !== callerId) }, claim.name);
  seat.avatar = claim.avatar || null;
}

/** The caller sits with this household; a new household joins the room's list, a known one takes the latest label. */
function seatOnCouch(d: Draft<RoomShared>, callerId: string, { sid, label }: { sid: string; label: string }): void {
  d.couchOf[callerId] = sid;
  const known = d.couches.find((c) => c.sid === sid);
  if (known) known.label = label;
  else d.couches.push({ sid, label, away: false });
}

export function applyClaim(shared: RoomShared, callerId: string, claim: OgsClaim): RoomShared {
  return update(shared, (d) => {
    d.claims[callerId] = claim;
    renameSeat(d, shared, callerId, claim);
    if (claim.couch) seatOnCouch(d, callerId, claim.couch);
  });
}

export function setAway(shared: RoomShared, callerId: string, away: boolean): RoomShared {
  const sid = shared.couchOf[callerId];
  if (sid === undefined) return shared;
  return update(shared, (d) => {
    const couch = d.couches.find((x) => x.sid === sid);
    if (couch) couch.away = away;
  });
}

// --- AI players ---

const isAi = (shared: RoomShared, id: string): boolean => shared.seats.some((s) => s.id === id && s.ai);

/** The AI player on turn and what it would do now; null when a person is on turn or it waits. */
export function aiTurn(shared: RoomShared): { id: string; action: BotAction } | null {
  const r = shared.round;
  const id = r?.seats[r.turn]?.id;
  if (!r || !id || !isAi(shared, id) || r.phase.kind === "out") return null;
  const action = botMove(r, id);
  return action ? { id, action } : null;
}

/** The bot's choice as a move, through the same rules and log lines as a phone's. */
function aiMove(m: Mover, a: BotAction): Move {
  switch (a.type) {
    case "draw":
      return drawMove(m, a.from);
    case "answer":
      return answerMove(m, a.answer);
    case "goDown":
      return goDownMove(m, a.melds);
    case "playOn":
      return playOnMove(m, a.cardId, a.meldId, a.placement);
    case "discard":
      return discardMove(m, a.cardId);
  }
}

/** The AI player on turn makes its move. */
export function aiAct(shared: RoomShared): MoveOutcome {
  const turn = aiTurn(shared);
  const r = shared.round;
  if (!turn || !r) return { shared, accepted: false, seat: -1 };
  const m = moverFor(shared, r, turn.id);
  const { result, line } = aiMove(m, turn.action);
  return result.ok ? { shared: accept(shared, m, result.state, line(result.state)), accepted: true, seat: m.seat } : { shared, accepted: false, seat: m.seat };
}

/** AI players (not on turn) that want the fresh discard. */
export function aiBuyers(shared: RoomShared): string[] {
  const r = shared.round;
  if (!r) return [];
  const turnId = r.seats[r.turn]?.id;
  return shared.seats.filter((s) => s.ai && s.id !== turnId && wantsBuy(r, s.id)).map((s) => s.id);
}

/** Each AI player that wants the fresh discard asks to buy it. */
export function aiBuy(shared: RoomShared): RoomShared {
  return aiBuyers(shared).reduce((acc, id) => act(acc, id, { type: "BUY" }).shared, shared);
}

export const cutterIsAi = (shared: RoomShared): boolean => {
  const id = shared.cutter === null ? undefined : shared.seats[shared.cutter]?.id;
  return id !== undefined && isAi(shared, id);
};


/** Does an AI player not on turn sit at the table (someone who might buy)? */
export const aiMightBuy = (shared: RoomShared): boolean => {
  const turnId = shared.round?.seats[shared.round.turn]?.id;
  return shared.seats.some((s) => s.ai && s.id !== turnId);
};
