/**
 * The room actor (actor-kit v0.3). Browser-safe: imports @actor-kit/worker/testing, not
 * cloudflare:workers, so tests and the client share the contract.
 *
 * Phases: lobby → cutting → window ⇄ acting → roundOver → … → gameOver. `window` and `acting` are
 * v1's `playing.window` / `playing.acting`: flat for now, with the round in shared state, so they
 * become children of one `playing` state when actor-kit has nested states (ADR-019 A).
 *
 * Every timer is a durable timer scoped to its phase (cut timeout, buy window, AI pauses): it
 * survives eviction and deploys and is cancelled when the phase ends. Deadlines the screens count
 * down to live in the phase's local.
 */
import { view } from "@actor-kit/core";
import { defineActor, setup, type Goto, type PhasedStateOf, type PhaseResult, type TypedEmit } from "@actor-kit/worker/testing";
import { z } from "zod";
import { standings, winners } from "./game/game";
import {
  act,
  addAi,
  aiAct,
  aiBuy,
  aiBuyers,
  aiMightBuy,
  aiTurn,
  applyClaim,
  canStart,
  closeWindow,
  cutterIsAi,
  dealRound,
  isCutter,
  isHost,
  join,
  lastRound,
  moveSeat,
  newGame,
  newRoom,
  nextRound,
  recordRound,
  removeSeat,
  roundOut,
  seatOf,
  setAway,
  setCutter,
  windowOpen,
  type PlayerMove,
} from "./room.rules";
import { OgsClaimPayload, Payloads, RoomInputSchema } from "./room.schemas";
import { NO_DEADLINES, type Deadlines, type RoomShared, type RoomStateValue } from "./room.types";
import { RoomViewSchema, toWire, type RoomWireView } from "./room.wire";
import { playerView, publicView } from "./views";

export { MAX_SEATS, AI_NAMES } from "./room.rules";

/** How long others may ask to buy a fresh discard (RULES.md "Buying"). */
export const BUY_WINDOW_MS = 3000;
/** If the cutter doesn't tap the deck, the room cuts for them. */
export const CUT_TIMEOUT_MS = 20_000;
/** An AI player's pause before each move, so the table can follow it on the TV. */
export const AI_THINK_MS = 1400;
/** How long into a buy window an AI player decides whether to buy. */
export const AI_BUY_MS = 1100;

const EVENTS = {
  /** A seat laid down its contract this round. */
  WentDown: z.object({ seat: z.number(), round: z.number() }),
  /** A seat bought the discard (the turn player let it go). */
  Bought: z.object({ seat: z.number(), round: z.number() }),
  /** Someone went out: each seat's points for the round. */
  RoundScored: z.object({ round: z.number(), winner: z.number(), points: z.array(z.number()) }),
  /** The seventh round was scored. */
  GameOver: z.object({ game: z.number(), winners: z.array(z.number()), totals: z.array(z.number()) }),
};

const Deadline = z.number();
const STATES = {
  lobby: {},
  cutting: { local: z.object({ endsAt: Deadline, aiActAt: Deadline.nullable() }) },
  window: { local: z.object({ endsAt: Deadline, aiActAt: Deadline.nullable() }) },
  acting: { local: z.object({ aiActAt: Deadline.nullable() }) },
  roundOver: {},
  gameOver: {},
};

const kit = setup({ events: EVENTS, states: STATES });

export type RoomState = PhasedStateOf<typeof kit, RoomShared>;
type Phase = RoomState["phase"];
type RoomEvents = { [K in keyof typeof EVENTS]: z.output<(typeof EVENTS)[K]> };

/** What settling a move needs from a handler's context. */
type Settler = { readonly phase: Phase; readonly goto: Goto<typeof STATES, RoomShared>; readonly emit: TypedEmit<RoomEvents> };

const seatsWhere = (before: RoomShared, after: RoomShared, changed: (was: { down: boolean; buys: number }, now: { down: boolean; buys: number }) => boolean): number[] => {
  const was = before.round;
  const now = after.round;
  if (!was || !now || was.round !== now.round) return [];
  return now.seats.flatMap((seat, i) => {
    const prev = was.seats[i];
    return prev && changed(prev, seat) ? [seatOf(after, seat.id)] : [];
  });
};

/** The domain events a move made: who went down, who bought. */
function emitMoveEvents(before: RoomShared, after: RoomShared, emit: TypedEmit<RoomEvents>): void {
  const round = after.roundNumber;
  for (const seat of seatsWhere(before, after, (was, now) => !was.down && now.down)) emit("WentDown", { seat, round });
  for (const seat of seatsWhere(before, after, (was, now) => now.buys > was.buys)) emit("Bought", { seat, round });
}

/** Scores the finished round (and the game after the seventh). */
function scoreRound(shared: RoomShared, ctx: Settler): PhaseResult<RoomShared> {
  const { shared: scored, points } = recordRound(shared);
  const r = shared.round;
  const winner = r && r.phase.kind === "out" ? seatOf(shared, r.phase.winner) : -1;
  ctx.emit("RoundScored", { round: scored.roundNumber, winner, points });
  if (!lastRound(scored)) return ctx.goto("roundOver", scored);
  const sheet = scored.sheet;
  const won = sheet ? winners(sheet).map((id) => seatOf(scored, id)) : [];
  const table = sheet ? standings(sheet) : [];
  const totals = scored.seats.map((s) => table.find((t) => t.id === s.id)?.total ?? 0);
  ctx.emit("GameOver", { game: scored.gameNumber, winners: won, totals });
  return ctx.goto("gameOver", scored);
}

/**
 * After a change to the round: the phase it puts the room in. A buy window open → window; someone
 * out → the round is scored; otherwise acting. Staying in the same phase keeps its timers, unless
 * `reenter` (an AI move re-arms the pause before the next one).
 */
function settle(before: RoomShared, shared: RoomShared, ctx: Settler, reenter = false): PhaseResult<RoomShared> {
  emitMoveEvents(before, shared, ctx.emit);
  if (roundOut(shared)) return scoreRound(shared, ctx);
  const target = windowOpen(shared) ? "window" : "acting";
  if (target === ctx.phase && !reenter) return shared;
  return ctx.goto(target, shared);
}

/** Into the cut before a round: the seat right of the dealer cuts. */
const toCutting = (shared: RoomShared, ctx: Settler): PhaseResult<RoomShared> => ctx.goto("cutting", setCutter(shared));

/** A 32-bit shuffle seed from the room's recorded randomness. */
const seedFrom = (random: () => number): number => Math.floor(random() * 0x1_0000_0000) >>> 0;

const lobby = kit.in("lobby");
const cutting = kit.in("cutting");
const windowPhase = kit.in("window");
const acting = kit.in("acting");
const roundOver = kit.in("roundOver");
const gameOver = kit.in("gameOver");

/** The round's moves, the same in both phases of play (one `playing` parent once states nest). */
function moveMessages<P extends "window" | "acting">(h: ReturnType<typeof kit.in<P>>) {
  const move = <P>(payload: z.ZodType<P>, toMove: (p: P) => PlayerMove) =>
    h.message(payload, (s: RoomShared, p, ctx) => {
      const out = act(s, ctx.caller, toMove(p));
      return out.accepted ? settle(s, out.shared, ctx) : out.shared;
    });
  return {
    DRAW: move(Payloads.DRAW, ({ from }) => ({ type: "DRAW", from })),
    BUY: move(Payloads.BUY, () => ({ type: "BUY" })),
    ANSWER: move(Payloads.ANSWER, ({ answer }) => ({ type: "ANSWER", answer })),
    GO_DOWN: move(Payloads.GO_DOWN, ({ melds }) => ({ type: "GO_DOWN", melds })),
    PLAY_ON: move(Payloads.PLAY_ON, ({ cardId, meldId, placement }) => ({ type: "PLAY_ON", cardId, meldId, placement })),
    DISCARD: move(Payloads.DISCARD, ({ cardId }) => ({ type: "DISCARD", cardId })),
  };
}

const Empty = z.object({}).optional();

/** The deadlines in the current phase's local, for the screens. */
function deadlinesOf(st: RoomState): Deadlines {
  switch (st.phase) {
    case "cutting":
      return { ...NO_DEADLINES, cutEndsAt: st.local.endsAt, aiActAt: st.local.aiActAt };
    case "window":
      return { ...NO_DEADLINES, windowEndsAt: st.local.endsAt, aiActAt: st.local.aiActAt };
    case "acting":
      return { ...NO_DEADLINES, aiActAt: st.local.aiActAt };
    default:
      return NO_DEADLINES;
  }
}

const valueOf = (phase: Phase): RoomStateValue => (phase === "window" || phase === "acting" ? { playing: phase } : phase);

/** What `caller` sees: the table, and their own seat and hand when they sit at it. */
function wire(st: RoomState, role: string, caller: string | null): RoomWireView {
  const seat = caller === null ? -1 : seatOf(st.shared, caller);
  return toWire(role, valueOf(st.phase), publicView(st.shared, deadlinesOf(st)), seat >= 0 ? playerView(st.shared, seat) : null);
}

export const RoomContract = defineActor("room", {
  input: RoomInputSchema,
  init: (input: z.output<typeof RoomInputSchema>): RoomShared => newRoom(input.code, input.tvId),
  events: kit.events,
  initial: "lobby",
  // First match wins: OGS (the Worker, after verifying a token), a seated phone, the room's TV, anyone else.
  roles: {
    service: (_s: RoomState, _caller: string, { callerType }: { callerType: "user" | "service" }) => callerType === "service",
    player: (s: RoomState, caller: string) => seatOf(s.shared, caller) >= 0,
    tv: (s: RoomState, caller: string) => caller === s.shared.tvId,
    guest: () => true,
  },
  // Accepted in every phase.
  messages: {
    OGS_CLAIM: kit.message(OgsClaimPayload, {
      guard: (_s: RoomShared, _p, ctx) => ctx.callerType === "service",
      handler: (s: RoomShared, { callerId, claim }) => applyClaim(s, callerId, claim),
    }),
    AWAY: kit.message(Payloads.AWAY, (s: RoomShared, { away }, ctx) => setAway(s, ctx.caller, away)),
  },
  states: {
    lobby: lobby.state({
      messages: {
        JOIN: lobby.message(Payloads.JOIN, (s: RoomShared, { name }, ctx) => join(s, ctx.caller, name)),
        START: lobby.message(Payloads.START, {
          guard: (s: RoomShared, _p, ctx) => canStart(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => toCutting(newGame(s), ctx),
        }),
        ADD_AI: lobby.message(Payloads.ADD_AI, { guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller), handler: (s: RoomShared) => addAi(s) }),
        MOVE_SEAT: lobby.message(Payloads.MOVE_SEAT, {
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, { seat, to }) => moveSeat(s, seat, to),
        }),
        REMOVE_SEAT: lobby.message(Payloads.REMOVE_SEAT, {
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, { seat }) => removeSeat(s, seat),
        }),
      },
    }),
    cutting: cutting.state({
      enter: (s: RoomShared, _input, ctx) => {
        ctx.schedule("cutTimeout", { in: CUT_TIMEOUT_MS, scope: "state" });
        const ai = cutterIsAi(s);
        if (ai) ctx.schedule("aiCut", { in: AI_THINK_MS, scope: "state" });
        return { endsAt: ctx.now() + CUT_TIMEOUT_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
      },
      messages: {
        CUT: cutting.message(Payloads.CUT, {
          guard: (s: RoomShared, _p, ctx) => isCutter(s, ctx.caller),
          handler: (s: RoomShared, { at }, ctx) => settle(s, dealRound(s, at, seedFrom(ctx.random)), ctx),
        }),
      },
      timers: {
        // Nobody tapped the deck: the room cuts for the cutter.
        cutTimeout: cutting.timer(Empty, (s: RoomShared, _p, ctx) => settle(s, dealRound(s, ctx.random(), seedFrom(ctx.random)), ctx)),
        aiCut: cutting.timer(Empty, (s: RoomShared, _p, ctx) => (cutterIsAi(s) ? settle(s, dealRound(s, ctx.random(), seedFrom(ctx.random)), ctx) : s)),
      },
    }),
    window: windowPhase.state({
      enter: (s: RoomShared, _input, ctx) => {
        ctx.schedule("buyWindow", { in: BUY_WINDOW_MS, scope: "state" });
        // The AI on turn takes the discard it wants; AI players not on turn may ask to buy it.
        const ai = aiTurn(s) !== null;
        if (ai) ctx.schedule("aiThink", { in: AI_THINK_MS, scope: "state" });
        if (aiMightBuy(s)) ctx.schedule("aiBuy", { in: AI_BUY_MS, scope: "state" });
        return { endsAt: ctx.now() + BUY_WINDOW_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
      },
      messages: moveMessages(windowPhase),
      timers: {
        buyWindow: windowPhase.timer(Empty, (s: RoomShared, _p, ctx) => settle(s, closeWindow(s), ctx)),
        aiThink: windowPhase.timer(Empty, (s: RoomShared, _p, ctx) => {
          const out = aiAct(s);
          return out.accepted ? settle(s, out.shared, ctx) : s;
        }),
        aiBuy: windowPhase.timer(Empty, (s: RoomShared) => (aiBuyers(s).length > 0 ? aiBuy(s) : s)),
      },
    }),
    acting: acting.state({
      enter: (s: RoomShared, _input, ctx) => {
        const ai = aiTurn(s) !== null;
        if (ai) ctx.schedule("aiThink", { in: AI_THINK_MS, scope: "state" });
        return { aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
      },
      messages: moveMessages(acting),
      timers: {
        // Each AI move re-enters, re-arming the pause before its next one.
        aiThink: acting.timer(Empty, (s: RoomShared, _p, ctx) => {
          const out = aiAct(s);
          return out.accepted ? settle(s, out.shared, ctx, true) : s;
        }),
      },
    }),
    roundOver: roundOver.state({
      messages: {
        NEXT_ROUND: roundOver.message(Payloads.NEXT_ROUND, {
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => toCutting(nextRound(s), ctx),
        }),
      },
    }),
    gameOver: gameOver.state({
      messages: {
        NEW_GAME: gameOver.message(Payloads.NEW_GAME, {
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => toCutting(newGame(s), ctx),
        }),
      },
    }),
  },
  views: {
    service: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "service", null)),
    // Each phone's view carries its own hand and nobody else's.
    player: view.perCaller(RoomViewSchema, (st: RoomState, caller: string) => wire(st, "player", caller)),
    tv: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "tv", null)),
    guest: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "guest", null)),
  },
});

export type RoomContract = typeof RoomContract;
