import { standings, winners } from "./game/game";
import type { Card } from "./game/cards";
import {
  ROUND_NAMES,
  describeRequirement,
  requestBuy,
  requestsOf,
  requirementFor,
  type Phase,
  type RoundState,
  type Seat as RoundSeat,
  type TableMeld,
} from "./game/round";
import type { PlayerView, RoomPrivateContext, RoomPublicContext, RoomServerContext, RoomServerOnlyContext } from "./room.types";

/**
 * Households (OGS multiCouch). A seat sits with the household its verified token named, else with
 * the household of the room's first TV, else at "home" (no OGS at all).
 */
export const HOME = "home";

export function seatCouch(server: RoomServerOnlyContext, seat: number): string {
  const id = server.seats[seat]?.id;
  return (id && server.couchOf[id]) || server.couchOf[server.tvId] || HOME;
}

/** Households that have players, in arrival order. */
export function seatedCouches(server: RoomServerOnlyContext): string[] {
  const seated = new Set(server.seats.map((_, i) => seatCouch(server, i)));
  const known = server.couches.map((c) => c.sid).filter((sid) => seated.has(sid));
  return [...known, ...[...seated].filter((sid) => !known.includes(sid))];
}

export const isMultiCouch = (server: RoomServerOnlyContext): boolean => seatedCouches(server).length > 1;

const seatsOnCouch = (server: RoomServerOnlyContext, sid: string): number[] =>
  server.seats.flatMap((_, i) => (seatCouch(server, i) === sid ? [i] : []));

function householdView(server: RoomServerOnlyContext, sid: string): RoomPublicContext["households"][number] {
  const c = server.couches.find((x) => x.sid === sid);
  return { sid, label: c?.label ?? "Home", away: c?.away ?? false, seats: seatsOnCouch(server, sid) };
}

function householdsView(server: RoomServerOnlyContext): RoomPublicContext["households"] {
  if (!isMultiCouch(server)) return [];
  return seatedCouches(server).map((sid) => householdView(server, sid));
}

const seatIndexOf = (server: RoomServerOnlyContext, id: string) => server.seats.findIndex((s) => s.id === id);

/** The requester who would get the card if the turn player lets it go: closest after them. */
function buyerOf(r: RoundState, requests: readonly string[]): string | null {
  const n = r.seats.length;
  for (let k = 1; k < n; k++) {
    const id = r.seats[(r.turn + k) % n]?.id;
    if (id && requests.includes(id)) return id;
  }
  return null;
}

type SeatIndex = (id: string) => number;

/** The open buy window: when it closes and who has asked. */
function windowView(server: RoomServerOnlyContext, phase: Phase, index: SeatIndex): RoomPublicContext["window"] {
  return phase.kind === "draw" && phase.window === "open"
    ? { endsAt: server.windowEndsAt ?? 0, requests: phase.requests.map(index) }
    : null;
}

/** The offer to the turn player: who asked, and who would get the card. */
function offerView(r: RoundState, index: SeatIndex): RoomPublicContext["offer"] {
  if (r.phase.kind !== "offer") return null;
  const buyer = buyerOf(r, r.phase.requests);
  return buyer ? { requests: r.phase.requests.map(index), buyer: index(buyer) } : null;
}

function meldView({ id, owner, meld }: TableMeld, index: SeatIndex): RoomPublicContext["melds"][number] {
  return {
    id,
    owner: index(owner),
    kind: meld.kind,
    low: meld.kind === "run" ? meld.low : null,
    suit: meld.kind === "run" ? meld.suit : null,
    rank: meld.kind === "set" ? meld.rank : null,
    cards: meld.cards,
  };
}

/** Whose turn it is, or (once someone is out) who won the round. */
function turnView(r: RoundState, index: SeatIndex): Pick<RoomPublicContext, "turn" | "roundWinner"> {
  return r.phase.kind === "out" ? { turn: null, roundWinner: index(r.phase.winner) } : { turn: r.turn, roundWinner: null };
}

function roundView(server: RoomServerOnlyContext): Partial<RoomPublicContext> {
  const r = server.round;
  if (!r) return {};
  const index = (id: string) => seatIndexOf(server, id);
  const { turn, roundWinner } = turnView(r, index);
  return {
    turn,
    turnPhase: r.phase.kind,
    deckCount: r.deck.length,
    discardTop: r.discard.at(-1) ?? null,
    discardCount: r.discard.length,
    window: windowView(server, r.phase, index),
    offer: offerView(r, index),
    melds: r.melds.map((m) => meldView(m, index)),
    roundWinner,
  };
}

/** A seat's card count, down and buys this round (zeros between rounds). */
function inRoundView(inRound: RoundSeat | undefined): { cards: number; down: boolean; buys: number } {
  return inRound ? { cards: inRound.hand.length, down: inRound.down, buys: inRound.buys } : { cards: 0, down: false, buys: 0 };
}

/** The seat's household label, shown only when more than one household plays. */
function couchLabel(server: RoomServerOnlyContext, seat: number, multi: boolean): string | null {
  if (!multi) return null;
  return server.couches.find((c) => c.sid === seatCouch(server, seat))?.label ?? "Home";
}

function seatView(
  server: RoomServerOnlyContext,
  s: RoomServerOnlyContext["seats"][number],
  seat: number,
  roundSeats: readonly RoundSeat[],
  multi: boolean,
): RoomPublicContext["seats"][number] {
  return {
    name: s.name,
    avatar: s.avatar,
    ...inRoundView(roundSeats.find((x) => x.id === s.id)),
    couch: couchLabel(server, seat, multi),
  };
}

function requirementView(round: number): RoomPublicContext["requirement"] {
  if (round <= 0) return null;
  const req = requirementFor(round);
  return { ...req, text: describeRequirement(req), name: ROUND_NAMES[round - 1] ?? "" };
}

const dealerView = (server: RoomServerOnlyContext): number | null =>
  server.roundNumber > 0 ? (server.roundNumber - 1) % Math.max(1, server.seats.length) : null;

/** Each round's scores, the running totals and the winners, by seat. */
function sheetView(server: RoomServerOnlyContext): Pick<RoomPublicContext, "scores" | "totals" | "winners"> {
  const sheet = server.sheet;
  if (!sheet) return { scores: [], totals: server.seats.map(() => 0), winners: [] };
  return {
    scores: sheet.rounds.map((round) => server.seats.map((s) => round[s.id] ?? 0)),
    totals: standingsBySeat(server),
    winners: winners(sheet).map((id) => seatIndexOf(server, id)),
  };
}

const roundSeatsOf = (server: RoomServerOnlyContext): readonly RoundSeat[] => server.round?.seats ?? [];

export function publicView(server: RoomServerOnlyContext, base: Pick<RoomPublicContext, "roomCode">): RoomPublicContext {
  const multi = isMultiCouch(server);
  const roundSeats = roundSeatsOf(server);
  const { scores, totals, winners: won } = sheetView(server);
  return {
    roomCode: base.roomCode,
    seats: server.seats.map((s, i) => seatView(server, s, i, roundSeats, multi)),
    hostSeat: server.seats.length > 0 ? 0 : null,
    canStart: server.seats.length >= 2,
    round: server.roundNumber,
    requirement: requirementView(server.roundNumber),
    dealer: dealerView(server),
    cutter: server.cutter,
    cut: server.cut,
    turn: null,
    turnPhase: null,
    deckCount: 0,
    discardTop: null,
    discardCount: 0,
    window: null,
    offer: null,
    melds: [],
    roundWinner: null,
    ...roundView(server),
    log: server.log,
    scores,
    totals,
    winners: won,
    gameNumber: server.gameNumber,
    households: householdsView(server),
  };
}

function standingsBySeat(server: RoomServerOnlyContext): number[] {
  const table = server.sheet ? standings(server.sheet) : [];
  return server.seats.map((s) => table.find((t) => t.id === s.id)?.total ?? 0);
}

const handIn = (r: RoundState | null, id: string): Card[] => r?.seats.find((x) => x.id === id)?.hand ?? [];
const isTurnOf = (r: RoundState | null, id: string): boolean =>
  r !== null && r.phase.kind !== "out" && r.seats[r.turn]?.id === id;
const hasAskedToBuy = (r: RoundState | null, id: string): boolean => r !== null && requestsOf(r.phase).includes(id);

export function playerView(server: RoomServerOnlyContext, seat: number): PlayerView {
  const id = server.seats[seat]?.id ?? "";
  const r = server.round;
  return {
    seat,
    isHost: seat === 0,
    hand: handIn(r, id),
    myTurn: isTurnOf(r, id),
    canBuy: r !== null && requestBuy(r, id).ok,
    buyRequested: hasAskedToBuy(r, id),
    mustCut: server.cutter === seat,
    oops: server.oops[id] ?? null,
  };
}

/** Rebuilds the public context and every caller's private slot from server-only state. Run after every mutation. */
export function withViews(context: RoomServerContext): RoomServerContext {
  const { server } = context;
  const views: Record<string, RoomPrivateContext> = { [server.tvId]: { role: "tv" } };
  server.seats.forEach((s, i) => {
    views[s.id] = { role: "player", player: playerView(server, i) };
  });
  return { ...context, public: publicView(server, context.public), private: views };
}
