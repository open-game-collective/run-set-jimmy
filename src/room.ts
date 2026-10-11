/**
 * The room actor (actor-kit v0.3). Browser-safe: imports @actor-kit/worker/testing, not
 * cloudflare:workers, so tests share the contract (the client only needs src/room.views.ts).
 *
 * States: lobby → cutting → playing { window ⇄ acting } → roundOver → … → gameOver. `playing`
 * holds the round number in its local, which lasts while the buy window and the players' turns
 * alternate; the round itself stays in shared state (actor-kit 0.3 cannot change a kept parent's
 * local in the transition that switches its child: docs/actor-kit-v2-feedback.md).
 *
 * Every timer is a durable timer scoped to its state (cut timeout, buy window, AI pauses): it
 * survives eviction and deploys and is cancelled when the state ends. Deadlines the screens count
 * down to live in the state's local.
 */
import { setup, type Goto, type PhaseResult, type PhasedStateOf, type TypedEmit } from "@actor-kit/worker/testing";
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
import type { RoomShared } from "./room.types";
import { roomRoles, roomViews } from "./room.views";

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
  playing: {
    local: z.object({ round: z.number() }),
    states: {
      window: { local: z.object({ endsAt: Deadline, aiActAt: Deadline.nullable() }) },
      acting: { local: z.object({ aiActAt: Deadline.nullable() }) },
    },
  },
  roundOver: {},
  gameOver: {},
};

const kit = setup({ events: EVENTS, states: STATES });

export type RoomState = PhasedStateOf<typeof kit, RoomShared>;
type RoomEvents = { [K in keyof typeof EVENTS]: z.output<(typeof EVENTS)[K]> };

/** What settling a move needs from a handler's context. */
type Settler = {
  readonly phase: readonly string[];
  readonly goto: Goto<typeof STATES, RoomShared>;
  reenter(shared: RoomShared): PhaseResult<RoomShared>;
  readonly emit: TypedEmit<RoomEvents>;
};

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

/** Scores the finished round onto the sheet (entering roundOver or gameOver). */
function scoreRound(shared: RoomShared, emit: TypedEmit<RoomEvents>): RoomShared {
  const { shared: scored, points } = recordRound(shared);
  const r = shared.round;
  const winner = r && r.phase.kind === "out" ? seatOf(shared, r.phase.winner) : -1;
  emit("RoundScored", { round: scored.roundNumber, winner, points });
  return scored;
}

function gameOverEvent(shared: RoomShared, emit: TypedEmit<RoomEvents>): void {
  const sheet = shared.sheet;
  const table = sheet ? standings(sheet) : [];
  emit("GameOver", {
    game: shared.gameNumber,
    winners: sheet ? winners(sheet).map((id) => seatOf(shared, id)) : [],
    totals: shared.seats.map((s) => table.find((t) => t.id === s.id)?.total ?? 0),
  });
}

/**
 * After a change to the round: the state it puts the room in. Someone out → the round is scored
 * (roundOver, or gameOver after the seventh); a buy window open → playing.window; otherwise
 * playing.acting. Staying in the same state keeps its timers, unless `rearm` (an AI move re-enters,
 * re-arming the pause before the next one).
 */
function settle(before: RoomShared, shared: RoomShared, ctx: Settler, rearm = false): PhaseResult<RoomShared> {
  emitMoveEvents(before, shared, ctx.emit);
  if (roundOut(shared)) return ctx.goto(lastRound(shared) ? "gameOver" : "roundOver", shared);
  const target = windowOpen(shared) ? "window" : "acting";
  if (ctx.phase[0] === "playing" && ctx.phase[1] === target) return rearm ? ctx.reenter(shared) : shared;
  return ctx.goto(["playing", target], shared);
}

/** A 32-bit shuffle seed from the room's recorded randomness. */
const seedFrom = (random: () => number): number => Math.floor(random() * 0x1_0000_0000) >>> 0;

const lobby = kit.in("lobby");
const cutting = kit.in("cutting");
const playing = kit.in("playing");
const windowPhase = kit.in(["playing", "window"]);
const acting = kit.in(["playing", "acting"]);
const roundOver = kit.in("roundOver");
const gameOver = kit.in("gameOver");

/** A seated player's move during the round (in the buy window or a turn alike). */
const move = <P>(payload: z.ZodType<P>, toMove: (p: P) => PlayerMove) =>
  playing.message(payload, {
    roles: ["player"],
    handler: (s: RoomShared, p, ctx) => {
      const out = act(s, ctx.caller, toMove(p));
      return out.accepted ? settle(s, out.shared, ctx) : out.shared;
    },
  });

const Empty = z.object({}).optional();

export const RoomContract = kit.actor("room", {
  input: RoomInputSchema,
  init: (input: z.output<typeof RoomInputSchema>): RoomShared => newRoom(input.code, input.tvId),
  initial: "lobby",
  roles: roomRoles,
  // Accepted in every state.
  messages: {
    OGS_CLAIM: kit.message(OgsClaimPayload, { roles: ["service"], handler: (s: RoomShared, { callerId, claim }) => applyClaim(s, callerId, claim) }),
    AWAY: kit.message(Payloads.AWAY, (s: RoomShared, { away }, ctx) => setAway(s, ctx.caller, away)),
  },
  states: {
    lobby: lobby.state({
      messages: {
        JOIN: lobby.message(Payloads.JOIN, { roles: ["guest"], handler: (s: RoomShared, { name }, ctx) => join(s, ctx.caller, name) }),
        START: lobby.message(Payloads.START, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => canStart(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", newGame(s)),
        }),
        ADD_AI: lobby.message(Payloads.ADD_AI, { roles: ["player"], guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller), handler: (s: RoomShared) => addAi(s) }),
        MOVE_SEAT: lobby.message(Payloads.MOVE_SEAT, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, { seat, to }) => moveSeat(s, seat, to),
        }),
        REMOVE_SEAT: lobby.message(Payloads.REMOVE_SEAT, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, { seat }) => removeSeat(s, seat),
        }),
      },
    }),
    cutting: cutting.state({
      // The seat right of the dealer cuts; the room cuts for them after a while (or at once, for an AI).
      enter: (s: RoomShared, _input, ctx) => {
        const shared = setCutter(s);
        ctx.schedule("cutTimeout", { in: CUT_TIMEOUT_MS, scope: "state" });
        const ai = cutterIsAi(shared);
        if (ai) ctx.schedule("aiCut", { in: AI_THINK_MS, scope: "state" });
        return ctx.stay(shared, { endsAt: ctx.now() + CUT_TIMEOUT_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null });
      },
      messages: {
        CUT: cutting.message(Payloads.CUT, {
          roles: ["player"],
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
    playing: playing.state({
      initial: "window",
      enter: (s: RoomShared) => ({ round: s.roundNumber }),
      messages: {
        DRAW: move(Payloads.DRAW, ({ from }) => ({ type: "DRAW", from })),
        BUY: move(Payloads.BUY, () => ({ type: "BUY" })),
        ANSWER: move(Payloads.ANSWER, ({ answer }) => ({ type: "ANSWER", answer })),
        GO_DOWN: move(Payloads.GO_DOWN, ({ melds }) => ({ type: "GO_DOWN", melds })),
        PLAY_ON: move(Payloads.PLAY_ON, ({ cardId, meldId, placement }) => ({ type: "PLAY_ON", cardId, meldId, placement })),
        DISCARD: move(Payloads.DISCARD, ({ cardId }) => ({ type: "DISCARD", cardId })),
      },
      states: {
        window: windowPhase.state({
          enter: (s: RoomShared, _input, ctx) => {
            ctx.schedule("buyWindow", { in: BUY_WINDOW_MS, scope: "state" });
            // The AI on turn takes the discard it wants; AI players not on turn may ask to buy it.
            const ai = aiTurn(s) !== null;
            if (ai) ctx.schedule("aiThink", { in: AI_THINK_MS, scope: "state" });
            if (aiMightBuy(s)) ctx.schedule("aiBuy", { in: AI_BUY_MS, scope: "state" });
            return { endsAt: ctx.now() + BUY_WINDOW_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
          },
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
          timers: {
            aiThink: acting.timer(Empty, (s: RoomShared, _p, ctx) => {
              const out = aiAct(s);
              return out.accepted ? settle(s, out.shared, ctx, true) : s;
            }),
          },
        }),
      },
    }),
    roundOver: roundOver.state({
      enter: (s: RoomShared, _input, ctx) => ctx.stay(scoreRound(s, ctx.emit)),
      messages: {
        NEXT_ROUND: roundOver.message(Payloads.NEXT_ROUND, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", nextRound(s)),
        }),
      },
    }),
    gameOver: gameOver.state({
      enter: (s: RoomShared, _input, ctx) => {
        const scored = scoreRound(s, ctx.emit);
        gameOverEvent(scored, ctx.emit);
        return ctx.stay(scored);
      },
      messages: {
        NEW_GAME: gameOver.message(Payloads.NEW_GAME, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(s, ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", newGame(s)),
        }),
      },
    }),
  },
  views: roomViews,
});

export type RoomContract = typeof RoomContract;
