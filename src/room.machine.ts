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
  type Result,
  type RoundState,
} from "./game/round";
import { cardName } from "./game/words";
import type { RoomEvent, RoomInput, RoomServerContext, RoomServerOnlyContext } from "./room.types";
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

/** A unique seat name: the verified OGS name, else what the phone typed, else "Player N". */
function seatName(server: RoomServerOnlyContext, wanted: string | undefined): string {
  const base = wanted && wanted.length > 0 ? wanted.slice(0, 16) : `Player ${server.seats.length + 1}`;
  const taken = new Set(server.seats.map((s) => s.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Runs a player's move through the rules; a refusal goes back to that phone only. */
function act(context: RoomServerContext, event: RoomEvent): RoomServerContext {
  const r = context.server.round;
  const id = callerId(event);
  if (!r || id === null || seatOf(context, event) < 0) return context;
  const top = r.discard.at(-1);
  const name = nameOf(context.server, id);
  const seat = seatOf(context, event);
  let result: Result;
  let line: (next: RoundState) => [string, string] | null;
  switch (event.type) {
    case "DRAW":
      result = draw(r, id, event.from);
      line = () => (event.from === "deck" ? ["draw", `${name} drew from the deck`] : ["take", `${name} took the ${top ? cardName(top) : "discard"}`]);
      break;
    case "BUY":
      result = requestBuy(r, id);
      line = () => ["buy", `${name} wants to buy the ${top ? cardName(top) : "discard"}`];
      break;
    case "ANSWER": {
      result = answerOffer(r, id, event.answer);
      line = (next) => {
        if (event.answer === "take") return ["take", `${name} took the ${top ? cardName(top) : "discard"}`];
        const buyer = next.seats.find((x, i) => x.buys > (r.seats[i]?.buys ?? 0));
        return ["bought", `${buyer ? nameOf(context.server, buyer.id) : "Someone"} bought the ${top ? cardName(top) : "discard"}`];
      };
      break;
    }
    case "GO_DOWN":
      result = goDown(r, id, event.melds);
      line = () => ["down", `${name} went down!`];
      break;
    case "PLAY_ON": {
      result = playOn(r, id, event.cardId, event.meldId, event.placement);
      const card = r.seats[r.turn]?.hand.find((c) => c.id === event.cardId);
      const target = r.melds.find((m) => m.id === event.meldId);
      line = () => [
        "play",
        `${name} played the ${card ? cardName(card) : "card"} on ${target ? `${target.owner === id ? "their" : `${nameOf(context.server, target.owner)}'s`} ${target.meld.kind}` : "the table"}`,
      ];
      break;
    }
    case "DISCARD": {
      result = discard(r, id, event.cardId);
      const card: Card | undefined = r.seats[r.turn]?.hand.find((c) => c.id === event.cardId);
      line = () => ["discard", `${name} discarded the ${card ? cardName(card) : "card"}`];
      break;
    }
    default:
      return context;
  }

  if (!result.ok) {
    const reason = result.reason;
    return update(context, (d) => {
      d.server.seq += 1;
      d.server.oops[id] = { line: reason, seq: d.server.seq };
    });
  }
  const next = result.state;
  const entry = line(next);
  return update(context, (d) => {
    d.server.round = next as Draft<RoundState>;
    delete d.server.oops[id];
    if (entry) log(d, seat, entry[0], entry[1]);
    if (next.phase.kind === "out") log(d, seat, "out", `${name} went out!`);
  });
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
    join: assign(({ context, event }) => {
      const id = callerId(event);
      const { server } = context;
      if (event.type !== "JOIN" || id === null || id === server.tvId) return context;
      if (server.seats.some((s) => s.id === id) || server.seats.length >= MAX_SEATS) return context;
      const claim = server.claims[id];
      return update(context, (d) => {
        d.server.seats.push({ id, name: seatName(server, claim?.name ?? event.name), avatar: claim?.avatar || null });
      });
    }),
    moveSeat: assign(({ context, event }) => {
      if (event.type !== "MOVE_SEAT") return context;
      const n = context.server.seats.length;
      if (event.seat >= n || event.to >= n) return context;
      return update(context, (d) => {
        const [moved] = d.server.seats.splice(event.seat, 1);
        if (moved) d.server.seats.splice(event.to, 0, moved);
      });
    }),
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
    claim: assign(({ context, event }) => {
      if (event.type !== "OGS_CLAIM") return context;
      const { claim } = event;
      return update(context, (d) => {
        d.server.claims[event.callerId] = claim;
        // A seat taken before the claim arrived takes the verified name too.
        const seat = d.server.seats.find((s) => s.id === event.callerId);
        if (seat) {
          seat.name = seatName({ ...context.server, seats: context.server.seats.filter((s) => s.id !== event.callerId) }, claim.name);
          seat.avatar = claim.avatar || null;
        }
        if (claim.couch) {
          const { sid, label } = claim.couch;
          d.server.couchOf[event.callerId] = sid;
          const known = d.server.couches.find((c) => c.sid === sid);
          if (known) known.label = label;
          else d.server.couches.push({ sid, label, away: false });
        }
      });
    }),
    setAway: assign(({ context, event }) => {
      const id = callerId(event);
      const sid = id === null ? undefined : context.server.couchOf[id];
      if (event.type !== "AWAY" || sid === undefined) return context;
      return update(context, (d) => {
        const c = d.server.couches.find((x) => x.sid === sid);
        if (c) c.away = event.away;
      });
    }),
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
