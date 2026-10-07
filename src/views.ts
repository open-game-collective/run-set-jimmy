import { standings, winners } from "./game/game";
import { describeRequirement, requestBuy, requirementFor, type RoundState } from "./game/round";
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

function householdsView(server: RoomServerOnlyContext): RoomPublicContext["households"] {
  if (!isMultiCouch(server)) return [];
  return seatedCouches(server).map((sid) => {
    const c = server.couches.find((x) => x.sid === sid);
    return {
      sid,
      label: c?.label ?? "Home",
      away: c?.away ?? false,
      seats: server.seats.flatMap((_, i) => (seatCouch(server, i) === sid ? [i] : [])),
    };
  });
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

function roundView(server: RoomServerOnlyContext): Partial<RoomPublicContext> {
  const r = server.round;
  if (!r) return {};
  const index = (id: string) => seatIndexOf(server, id);
  const phase = r.phase;
  const buyer = phase.kind === "offer" ? buyerOf(r, phase.requests) : null;
  return {
    turn: phase.kind === "out" ? null : r.turn,
    turnPhase: phase.kind,
    deckCount: r.deck.length,
    discardTop: r.discard.at(-1) ?? null,
    discardCount: r.discard.length,
    window:
      phase.kind === "draw" && phase.window === "open"
        ? { endsAt: server.windowEndsAt ?? 0, requests: phase.requests.map(index) }
        : null,
    offer: phase.kind === "offer" && buyer ? { requests: phase.requests.map(index), buyer: index(buyer) } : null,
    melds: r.melds.map(({ id, owner, meld }) => ({
      id,
      owner: index(owner),
      kind: meld.kind,
      low: meld.kind === "run" ? meld.low : null,
      suit: meld.kind === "run" ? meld.suit : null,
      rank: meld.kind === "set" ? meld.rank : null,
      cards: meld.cards,
    })),
    roundWinner: phase.kind === "out" ? index(phase.winner) : null,
  };
}

export function publicView(server: RoomServerOnlyContext, base: Pick<RoomPublicContext, "roomCode">): RoomPublicContext {
  const r = server.round;
  const multi = isMultiCouch(server);
  const req = server.roundNumber > 0 ? requirementFor(server.roundNumber) : null;
  const sheet = server.sheet;
  const totals = sheet ? standingsBySeat(server) : server.seats.map(() => 0);
  return {
    roomCode: base.roomCode,
    seats: server.seats.map((s, i) => {
      const inRound = r?.seats.find((x) => x.id === s.id);
      const couch = server.couches.find((c) => c.sid === seatCouch(server, i));
      return {
        name: s.name,
        avatar: s.avatar,
        cards: inRound?.hand.length ?? 0,
        down: inRound?.down ?? false,
        buys: inRound?.buys ?? 0,
        couch: multi ? (couch?.label ?? "Home") : null,
      };
    }),
    hostSeat: server.seats.length > 0 ? 0 : null,
    canStart: server.seats.length >= 2,
    round: server.roundNumber,
    requirement: req ? { ...req, text: describeRequirement(req) } : null,
    dealer: server.roundNumber > 0 ? (server.roundNumber - 1) % Math.max(1, server.seats.length) : null,
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
    scores: sheet ? sheet.rounds.map((round) => server.seats.map((s) => round[s.id] ?? 0)) : [],
    totals,
    winners: sheet ? winners(sheet).map((id) => seatIndexOf(server, id)) : [],
    gameNumber: server.gameNumber,
    households: householdsView(server),
  };
}

function standingsBySeat(server: RoomServerOnlyContext): number[] {
  const table = server.sheet ? standings(server.sheet) : [];
  return server.seats.map((s) => table.find((t) => t.id === s.id)?.total ?? 0);
}

export function playerView(server: RoomServerOnlyContext, seat: number): PlayerView {
  const s = server.seats[seat];
  const r = server.round;
  const id = s?.id ?? "";
  const inRound = r?.seats.find((x) => x.id === id);
  const phase = r?.phase;
  return {
    seat,
    isHost: seat === 0,
    hand: inRound?.hand ?? [],
    myTurn: r !== null && phase?.kind !== "out" && r.seats[r.turn]?.id === id,
    canBuy: r !== null && requestBuy(r, id).ok,
    buyRequested: (phase?.kind === "draw" || phase?.kind === "offer") && phase.requests.includes(id),
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
