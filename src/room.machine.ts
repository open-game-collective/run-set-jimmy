import { produce, type Draft } from "immer";
import { assign, not, setup } from "xstate";
import { decksFor, mulberry32, type Card } from "./game/cards";
import { addRound, dealerFor, newScoreSheet } from "./game/game";
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
  type MeldProposal,
  type Result,
  type RoundState,
  type TableMeld,
} from "./game/round";
import { cardName } from "./game/words";
import type { OgsClaim, RoomEvent, RoomInput, RoomServerContext, RoomServerOnlyContext } from "./room.types";
import { withViews } from "./views";

/** How long others may ask to buy a fresh discard (RULES.md "Buying"). */
export const BUY_WINDOW_MS = 3000;
/** If the cutter doesn't tap the deck, the room cuts for them. */
export const CUT_TIMEOUT_MS = 20_000;
export const MAX_SEATS = 7;
const LOG_LENGTH = 8;

type Args = { context: RoomServerContext; event: RoomEvent };

const callerId = (event: RoomEvent): string | null => ("caller" in event && event.caller.type === "client" ? event.caller.id : null);
const seatOf = (context: RoomServerContext, event: RoomEvent): number => {
  const id = callerId(event);
  return id === null ? -1 : context.server.seats.findIndex((s) => s.id === id);
};
const nameOf = (server: RoomServerOnlyContext, id: string) => server.seats.find((s) => s.id === id)?.name ?? "Someone";

/** Applies an immer recipe to the whole context, then re-projects every view. */
function update(context: RoomServerContext, recipe: (draft: Draft<RoomServerContext>) => void): RoomServerContext {
  return withViews(produce(context, recipe));
}

function log(d: Draft<RoomServerContext>, seat: number | null, kind: string, text: string): void {
  d.server.seq += 1;
  d.server.log.push({ seq: d.server.seq, seat, kind, text });
  if (d.server.log.length > LOG_LENGTH) d.server.log.splice(0, d.server.log.length - LOG_LENGTH);
}

const fromHost = (args: Args) => seatOf(args.context, args.event) === 0;
const fromService = ({ event }: Args) => "caller" in event && event.caller.type === "service";

/** What the phone asked to be called (trimmed to 16), else "Player N". */
const baseName = (server: RoomServerOnlyContext, wanted: string | undefined): string =>
  wanted && wanted.length > 0 ? wanted.slice(0, 16) : `Player ${server.seats.length + 1}`;

/** A unique seat name: the verified OGS name, else what the phone typed, else "Player N". */
function seatName(server: RoomServerOnlyContext, wanted: string | undefined): string {
  const base = baseName(server, wanted);
  const taken = new Set(server.seats.map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** A player's move, with who made it and what the table looked like before it. */
type Mover = { server: RoomServerOnlyContext; r: RoundState; id: string; seat: number; name: string; top: string };
/** A log line: [kind, text]. */
type LogLine = [string, string];
type Move = { result: Result; line: (next: RoundState) => LogLine };
type MoveEvent = Extract<RoomEvent, { type: "DRAW" | "BUY" | "ANSWER" | "GO_DOWN" | "PLAY_ON" | "DISCARD" }>;

const MOVE_TYPES: ReadonlySet<RoomEvent["type"]> = new Set(["DRAW", "BUY", "ANSWER", "GO_DOWN", "PLAY_ON", "DISCARD"]);
const isMove = (event: RoomEvent): event is MoveEvent => MOVE_TYPES.has(event.type);

const topName = (r: RoundState): string => {
  const top = r.discard.at(-1);
  return top ? cardName(top) : "discard";
};
const cardLabel = (card: Card | undefined): string => (card ? cardName(card) : "card");
const handCard = (r: RoundState, cardId: string): Card | undefined => r.seats[r.turn]?.hand.find((c) => c.id === cardId);

/** The seated caller making a move during a round; null for anyone else, or between rounds. */
function moverOf(context: RoomServerContext, event: RoomEvent): Mover | null {
  const { server } = context;
  const r = server.round;
  const id = callerId(event);
  const seat = seatOf(context, event);
  if (!r || id === null || seat < 0) return null;
  return { server, r, id, seat, name: nameOf(server, id), top: topName(r) };
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
  return buyer ? nameOf(m.server, buyer.id) : "Someone";
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
  const whose = target.owner === m.id ? "their" : `${nameOf(m.server, target.owner)}'s`;
  return `${whose} ${target.meld.kind}`;
}

function playOnMove(m: Mover, event: Extract<MoveEvent, { type: "PLAY_ON" }>): Move {
  const card = handCard(m.r, event.cardId);
  const target = m.r.melds.find((x) => x.id === event.meldId);
  return {
    result: playOn(m.r, m.id, event.cardId, event.meldId, event.placement),
    line: () => ["play", `${m.name} played the ${cardLabel(card)} on ${meldLabel(m, target)}`],
  };
}

function discardMove(m: Mover, cardId: string): Move {
  const card = handCard(m.r, cardId);
  return { result: discard(m.r, m.id, cardId), line: () => ["discard", `${m.name} discarded the ${cardLabel(card)}`] };
}

function playerMove(m: Mover, event: MoveEvent): Move {
  switch (event.type) {
    case "DRAW":
      return drawMove(m, event.from);
    case "BUY":
      return buyMove(m);
    case "ANSWER":
      return answerMove(m, event.answer);
    case "GO_DOWN":
      return goDownMove(m, event.melds);
    case "PLAY_ON":
      return playOnMove(m, event);
    case "DISCARD":
      return discardMove(m, event.cardId);
  }
}

/** The rules said no: tell only that phone why. */
function refuse(context: RoomServerContext, id: string, reason: string): RoomServerContext {
  return update(context, (d) => {
    d.server.seq += 1;
    d.server.oops[id] = { line: reason, seq: d.server.seq };
  });
}

/** The move stands: the round moves on, the phone's last refusal clears, and the table log says what happened. */
function accept(context: RoomServerContext, m: Mover, next: RoundState, entry: LogLine): RoomServerContext {
  return update(context, (d) => {
    d.server.round = next as Draft<RoundState>;
    delete d.server.oops[m.id];
    log(d, m.seat, entry[0], entry[1]);
    if (next.phase.kind === "out") log(d, m.seat, "out", `${m.name} went out!`);
  });
}

/** Runs a player's move through the rules; a refusal goes back to that phone only. */
function act(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  const m = moverOf(context, event);
  if (!m || !isMove(event)) return context;
  const { result, line } = playerMove(m, event);
  if (!result.ok) return refuse(context, m.id, result.reason);
  return accept(context, m, result.state, line(result.state));
}

function dealRound(context: RoomServerContext, at: number): RoomServerContext {
  const { server } = context;
  const seatIds = server.seats.map((s) => s.id);
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const shoeSize = decksFor(seatIds.length) * 54;
  const r = deal({
    seatIds,
    round: server.roundNumber,
    dealer: dealerFor(server.roundNumber, seatIds.length),
    rng: mulberry32(seed),
    cutAt: Math.min(shoeSize - 1, Math.floor(at * shoeSize)),
  });
  return update(context, (d) => {
    d.server.round = r as Draft<RoundState>;
    d.server.cutter = null;
    d.server.oops = {};
    const cut = r.cut;
    if (cut) {
      const seat = seatIds.indexOf(cut.seat);
      d.server.seq += 1;
      d.server.cut = { seat, card: cut.card, kept: cut.kept, seq: d.server.seq };
      const who = nameOf(server, cut.seat);
      log(d, seat, cut.kept ? "joker" : "cut", cut.kept ? `${who} cut a Joker and keeps it!` : `${who} cut the ${cardName(cut.card)}`);
    }
  });
}

/** A caller who may take a seat: a phone (not the TV), not already seated, while seats are left. */
function canSeat(server: RoomServerOnlyContext, id: string | null): id is string {
  return id !== null && id !== server.tvId && !server.seats.some((s) => s.id === id) && server.seats.length < MAX_SEATS;
}

/** A new seat, named and pictured by the caller's verified OGS claim when there is one. */
function newSeat(server: RoomServerOnlyContext, id: string, typed: string | undefined): RoomServerOnlyContext["seats"][number] {
  const claim = server.claims[id];
  return { id, name: seatName(server, claim?.name ?? typed), avatar: claim?.avatar || null };
}

function join(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  const id = callerId(event);
  if (event.type !== "JOIN" || !canSeat(context.server, id)) return context;
  const seat = newSeat(context.server, id, event.name);
  return update(context, (d) => {
    d.server.seats.push(seat);
  });
}

/** Moves one item of a list to another index, in place. */
function moveIn<T>(list: T[], from: number, to: number): void {
  const [moved] = list.splice(from, 1);
  if (moved) list.splice(to, 0, moved);
}

const seatsExist = (context: RoomServerContext, ...seats: number[]) => seats.every((s) => s < context.server.seats.length);

function moveSeat(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  if (event.type !== "MOVE_SEAT" || !seatsExist(context, event.seat, event.to)) return context;
  return update(context, (d) => moveIn(d.server.seats, event.seat, event.to));
}

/** A seat taken before the claim arrived takes the verified name (unique among the others) and avatar too. */
function renameSeat(d: Draft<RoomServerContext>, server: RoomServerOnlyContext, callerId: string, claim: OgsClaim): void {
  const seat = d.server.seats.find((s) => s.id === callerId);
  if (!seat) return;
  seat.name = seatName({ ...server, seats: server.seats.filter((s) => s.id !== callerId) }, claim.name);
  seat.avatar = claim.avatar || null;
}

/** The caller sits with this household; a new household joins the room's list, a known one takes the latest label. */
function seatOnCouch(d: Draft<RoomServerContext>, callerId: string, { sid, label }: { sid: string; label: string }): void {
  d.server.couchOf[callerId] = sid;
  const known = d.server.couches.find((c) => c.sid === sid);
  if (known) known.label = label;
  else d.server.couches.push({ sid, label, away: false });
}

function applyClaim(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  if (event.type !== "OGS_CLAIM") return context;
  const { callerId: id, claim } = event;
  return update(context, (d) => {
    d.server.claims[id] = claim;
    renameSeat(d, context.server, id, claim);
    if (claim.couch) seatOnCouch(d, id, claim.couch);
  });
}

/** The household the caller sits with, if OGS named one. */
function couchOfCaller(context: RoomServerContext, event: RoomEvent): string | undefined {
  const id = callerId(event);
  return id === null ? undefined : context.server.couchOf[id];
}

function markAway(d: Draft<RoomServerContext>, sid: string, away: boolean): void {
  const couch = d.server.couches.find((x) => x.sid === sid);
  if (couch) couch.away = away;
}

function setAway(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  const sid = couchOfCaller(context, event);
  if (event.type !== "AWAY" || sid === undefined) return context;
  return update(context, (d) => markAway(d, sid, event.away));
}

export const roomMachine = setup({
  types: {} as {
    context: RoomServerContext;
    events: RoomEvent;
    input: RoomInput;
  },
  guards: {
    fromHost,
    fromService,
    canStart: (args) => fromHost(args) && args.context.server.seats.length >= 2,
    fromCutter: (args) => args.context.server.cutter !== null && seatOf(args.context, args.event) === args.context.server.cutter,
    windowOpen: ({ context }) => {
      const p = context.server.round?.phase;
      return p?.kind === "draw" && p.window === "open";
    },
    roundOut: ({ context }) => context.server.round?.phase.kind === "out",
    lastRound: ({ context }) => context.server.roundNumber >= ROUNDS,
  },
  actions: {
    join: assign(({ context, event }) => join(context, event)),
    moveSeat: assign(({ context, event }) => moveSeat(context, event)),
    removeSeat: assign(({ context, event }) => {
      if (event.type !== "REMOVE_SEAT" || event.seat >= context.server.seats.length) return context;
      return update(context, (d) => {
        d.server.seats.splice(event.seat, 1);
      });
    }),
    newGame: assign(({ context }) =>
      update(context, (d) => {
        d.server.sheet = newScoreSheet(context.server.seats.map((s) => s.id));
        d.server.roundNumber = 1;
        d.server.gameNumber += 1;
        d.server.round = null;
        d.server.cut = null;
      }),
    ),
    nextRound: assign(({ context }) =>
      update(context, (d) => {
        d.server.roundNumber += 1;
        d.server.round = null;
        d.server.cut = null;
      }),
    ),
    setCutter: assign(({ context }) => {
      const n = context.server.seats.length;
      const dealer = dealerFor(context.server.roundNumber, n);
      return update(context, (d) => {
        d.server.cutter = (dealer - 1 + n) % n;
      });
    }),
    cutHere: assign(({ context, event }) => (event.type === "CUT" ? dealRound(context, event.at) : context)),
    cutForThem: assign(({ context }) => dealRound(context, Math.random())),
    act: assign(({ context, event }) => act(context, event)),
    stampWindow: assign(({ context }) =>
      update(context, (d) => {
        d.server.windowEndsAt = Date.now() + BUY_WINDOW_MS;
      }),
    ),
    closeWindow: assign(({ context }) => {
      const r = context.server.round;
      if (!r) return context;
      const closed = closeBuyWindow(r);
      if (!closed.ok) return context;
      return update(context, (d) => {
        d.server.round = closed.state as Draft<RoundState>;
        d.server.windowEndsAt = null;
      });
    }),
    recordRound: assign(({ context }) => {
      const r = context.server.round;
      const sheet = context.server.sheet;
      if (!r || !sheet) return context;
      return update(context, (d) => {
        d.server.sheet = addRound(sheet, scoreRound(r));
      });
    }),
    claim: assign(({ context, event }) => applyClaim(context, event)),
    setAway: assign(({ context, event }) => setAway(context, event)),
  },
}).createMachine({
  id: "room",
  context: ({ input }) =>
    withViews({
      public: {
        roomCode: input.id,
        seats: [],
        hostSeat: null,
        canStart: false,
        round: 0,
        requirement: null,
        dealer: null,
        cutter: null,
        cut: null,
        turn: null,
        turnPhase: null,
        deckCount: 0,
        discardTop: null,
        discardCount: 0,
        window: null,
        offer: null,
        melds: [],
        log: [],
        scores: [],
        totals: [],
        roundWinner: null,
        winners: [],
        gameNumber: 0,
        households: [],
      },
      private: {},
      server: {
        tvId: input.caller.id,
        seats: [],
        claims: {},
        couchOf: {},
        couches: [],
        round: null,
        sheet: null,
        roundNumber: 0,
        gameNumber: 0,
        windowEndsAt: null,
        oops: {},
        log: [],
        seq: 0,
        cut: null,
        cutter: null,
      },
    }),
  initial: "lobby",
  on: {
    OGS_CLAIM: { guard: "fromService", actions: "claim" },
    AWAY: { actions: "setAway" },
  },
  states: {
    lobby: {
      on: {
        JOIN: { actions: "join" },
        START: { guard: "canStart", target: "cutting", actions: "newGame" },
        MOVE_SEAT: { guard: "fromHost", actions: "moveSeat" },
        REMOVE_SEAT: { guard: "fromHost", actions: "removeSeat" },
      },
    },
    cutting: {
      entry: "setCutter",
      on: { CUT: { guard: "fromCutter", target: "playing", actions: "cutHere" } },
      after: { [CUT_TIMEOUT_MS]: { target: "playing", actions: "cutForThem" } },
    },
    playing: {
      initial: "window",
      always: { guard: "roundOut", target: "roundOver" },
      on: {
        DRAW: { actions: "act" },
        BUY: { actions: "act" },
        ANSWER: { actions: "act" },
        GO_DOWN: { actions: "act" },
        PLAY_ON: { actions: "act" },
        DISCARD: { actions: "act" },
      },
      states: {
        window: {
          entry: "stampWindow",
          always: { guard: not("windowOpen"), target: "acting" },
          after: { [BUY_WINDOW_MS]: { target: "acting", actions: "closeWindow" } },
        },
        acting: {
          always: { guard: "windowOpen", target: "window" },
        },
      },
    },
    roundOver: {
      entry: "recordRound",
      always: { guard: "lastRound", target: "gameOver" },
      on: { NEXT_ROUND: { guard: "fromHost", target: "cutting", actions: "nextRound" } },
    },
    gameOver: {
      on: { NEW_GAME: { guard: "fromHost", target: "cutting", actions: "newGame" } },
    },
  },
});
