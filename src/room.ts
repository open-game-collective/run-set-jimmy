/**
 * The room actor (actor-kit v0.3). Browser-safe: imports @actor-kit/worker/testing, not
 * cloudflare:workers, so tests share the contract (the client only needs src/room.views.ts).
 *
 * States: lobby → cutting → playing { window ⇄ acting } → roundOver → … → gameOver. The round lives
 * in `playing`'s local: every move updates it there, and it lasts while the buy window and the
 * players' turns alternate. Between rounds the one just finished stays in shared state for the
 * scores. The rules work on the table: shared state plus the round wherever it lives
 * (src/room.views.ts: atRest/rested between rounds, inPlay/played during play).
 *
 * Every timer is a durable timer scoped to its state (cut timeout, buy window, AI pauses): it
 * survives eviction and deploys and is cancelled when the state ends. Deadlines the screens count
 * down to live in the state's local.
 */
import { setup, type PhasedStateOf, type TypedEmit } from "@actor-kit/worker/testing";
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
import type { RoundState } from "./game/round";
import type { RoomShared, RoomTable } from "./room.types";
import { atRest, inPlay, played, rested, roomRoles, roomViews } from "./room.views";

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
/** The round in playing's local: the engine's own state (src/game/round.ts), checked for its shape. */
const RoundZ = z.custom<RoundState>(
  (x) => typeof x === "object" && x !== null && Array.isArray(Reflect.get(x, "seats")) && Array.isArray(Reflect.get(x, "deck")),
  "the round in playing's local",
);
const STATES = {
  lobby: {},
  cutting: { local: z.object({ endsAt: Deadline, aiActAt: Deadline.nullable() }) },
  playing: {
    local: z.object({ round: RoundZ }),
    input: z.object({ round: RoundZ }),
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

const seatsWhere = (before: RoomTable, after: RoomTable, changed: (was: { down: boolean; buys: number }, now: { down: boolean; buys: number }) => boolean): number[] => {
  const was = before.round;
  const now = after.round;
  if (!was || !now || was.round !== now.round) return [];
  return now.seats.flatMap((seat, i) => {
    const prev = was.seats[i];
    return prev && changed(prev, seat) ? [seatOf(after, seat.id)] : [];
  });
};

/** The domain events a move made: who went down, who bought. */
function emitMoveEvents(before: RoomTable, after: RoomTable, emit: TypedEmit<RoomEvents>): void {
  const round = after.roundNumber;
  for (const seat of seatsWhere(before, after, (was, now) => !was.down && now.down)) emit("WentDown", { seat, round });
  for (const seat of seatsWhere(before, after, (was, now) => now.buys > was.buys)) emit("Bought", { seat, round });
}

/** Scores the finished round onto the sheet (entering roundOver or gameOver). */
function scoreRound(shared: RoomTable, emit: TypedEmit<RoomEvents>): RoomTable {
  const { shared: scored, points } = recordRound(shared);
  const r = shared.round;
  const winner = r && r.phase.kind === "out" ? seatOf(shared, r.phase.winner) : -1;
  emit("RoundScored", { round: scored.roundNumber, winner, points });
  return scored;
}

function gameOverEvent(shared: RoomTable, emit: TypedEmit<RoomEvents>): void {
  const sheet = shared.sheet;
  const table = sheet ? standings(sheet) : [];
  emit("GameOver", {
    game: shared.gameNumber,
    winners: sheet ? winners(sheet).map((id) => seatOf(shared, id)) : [],
    totals: shared.seats.map((s) => table.find((t) => t.id === s.id)?.total ?? 0),
  });
}

/** Where a change to the round takes the room; each handler carries it out with its own ctx. */
type Plan =
  | { kind: "over"; to: "roundOver" | "gameOver"; shared: RoomShared }
  | { kind: "stay"; shared: RoomShared; round: RoundState }
  | { kind: "rearm"; shared: RoomShared; round: RoundState }
  | { kind: "switch"; to: "window" | "acting"; shared: RoomShared; round: RoundState };

/**
 * After a change to the round: someone out → the round is scored (roundOver, or gameOver after the
 * seventh); a buy window open → playing.window; otherwise playing.acting. Staying in the same state
 * keeps its timers, unless `rearm` (an AI move re-enters, re-arming the pause before the next one).
 */
function settle(before: RoomTable, after: RoomTable, leaf: string | undefined, emit: TypedEmit<RoomEvents>, rearm = false): Plan {
  emitMoveEvents(before, after, emit);
  const round = after.round;
  if (round === null || roundOut(after)) return { kind: "over", to: lastRound(after) ? "gameOver" : "roundOver", shared: rested(after) };
  const target = windowOpen(after) ? "window" : "acting";
  if (leaf !== target) return { kind: "switch", to: target, shared: played(after), round };
  return { kind: rearm ? "rearm" : "stay", shared: played(after), round };
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

/** A seated player's move during the round (in the buy window or a turn alike), at playing's level. */
const move = <P>(payload: z.ZodType<P>, toMove: (p: P) => PlayerMove) =>
  playing.message(payload, {
    roles: ["player"],
    handler: (s: RoomShared, p, ctx) => {
      const table = inPlay(s, ctx.local.round);
      const out = act(table, ctx.caller, toMove(p));
      if (!out.accepted) return ctx.stay(played(out.shared), { round: ctx.local.round });
      const plan = settle(table, out.shared, ctx.phase[1], ctx.emit);
      if (plan.kind === "over") return ctx.goto(plan.to, plan.shared);
      if (plan.kind === "switch") return ctx.goto(["playing", plan.to], plan.shared, undefined, { locals: { playing: { round: plan.round } } });
      return ctx.stay(plan.shared, { round: plan.round });
    },
  });

/** After the deal (the cutter's tap or the room's own cut): play starts in the first discard's buy window. */
function deal(s: RoomShared, at: number, seed: number) {
  const dealt = dealRound(atRest(s), at, seed);
  return { shared: played(dealt), round: dealt.round };
}

const Empty = z.object({}).optional();

/** A change between rounds, on the table (the round just finished, or none). */
const rest = (s: RoomShared, change: (t: RoomTable) => RoomTable): RoomShared => rested(change(atRest(s)));

export const RoomContract = kit.actor("room", {
  input: RoomInputSchema,
  init: (input: z.output<typeof RoomInputSchema>): RoomShared => newRoom(input.code, input.tvId),
  initial: "lobby",
  roles: roomRoles,
  // Accepted in every state. Neither touches the round (rest() keeps the shared state's as it was).
  messages: {
    OGS_CLAIM: kit.message(OgsClaimPayload, {
      roles: ["service"],
      handler: (s: RoomShared, { callerId, claim }) => rest(s, (t) => applyClaim(t, callerId, claim)),
    }),
    AWAY: kit.message(Payloads.AWAY, (s: RoomShared, { away }, ctx) => rest(s, (t) => setAway(t, ctx.caller, away))),
  },
  states: {
    lobby: lobby.state({
      messages: {
        JOIN: lobby.message(Payloads.JOIN, { roles: ["guest"], handler: (s: RoomShared, { name }, ctx) => rest(s, (t) => join(t, ctx.caller, name)) }),
        START: lobby.message(Payloads.START, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => canStart(atRest(s), ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", rest(s, newGame)),
        }),
        ADD_AI: lobby.message(Payloads.ADD_AI, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(atRest(s), ctx.caller),
          handler: (s: RoomShared) => rest(s, addAi),
        }),
        MOVE_SEAT: lobby.message(Payloads.MOVE_SEAT, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(atRest(s), ctx.caller),
          handler: (s: RoomShared, { seat, to }) => rest(s, (t) => moveSeat(t, seat, to)),
        }),
        REMOVE_SEAT: lobby.message(Payloads.REMOVE_SEAT, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(atRest(s), ctx.caller),
          handler: (s: RoomShared, { seat }) => rest(s, (t) => removeSeat(t, seat)),
        }),
      },
    }),
    cutting: cutting.state({
      // The seat right of the dealer cuts; the room cuts for them after a while (or at once, for an AI).
      enter: (s: RoomShared, _input, ctx) => {
        const shared = rest(s, setCutter);
        ctx.schedule("cutTimeout", { in: CUT_TIMEOUT_MS, scope: "state" });
        const ai = cutterIsAi(atRest(shared));
        if (ai) ctx.schedule("aiCut", { in: AI_THINK_MS, scope: "state" });
        return ctx.stay(shared, { endsAt: ctx.now() + CUT_TIMEOUT_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null });
      },
      messages: {
        CUT: cutting.message(Payloads.CUT, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isCutter(atRest(s), ctx.caller),
          handler: (s: RoomShared, { at }, ctx) => {
            const d = deal(s, at, seedFrom(ctx.random));
            return d.round ? ctx.goto("playing", d.shared, { round: d.round }) : s;
          },
        }),
      },
      timers: {
        // Nobody tapped the deck: the room cuts for the cutter.
        cutTimeout: cutting.timer(Empty, (s: RoomShared, _p, ctx) => {
          const d = deal(s, ctx.random(), seedFrom(ctx.random));
          return d.round ? ctx.goto("playing", d.shared, { round: d.round }) : s;
        }),
        aiCut: cutting.timer(Empty, (s: RoomShared, _p, ctx) => {
          if (!cutterIsAi(atRest(s))) return s;
          const d = deal(s, ctx.random(), seedFrom(ctx.random));
          return d.round ? ctx.goto("playing", d.shared, { round: d.round }) : s;
        }),
      },
    }),
    playing: playing.state({
      initial: "window",
      // The dealt round: every move changes it here, and it lasts while window and acting alternate.
      enter: (_s: RoomShared, { round }) => ({ round }),
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
            const table = inPlay(s, ctx.local.round);
            ctx.schedule("buyWindow", { in: BUY_WINDOW_MS, scope: "state" });
            // The AI on turn takes the discard it wants; AI players not on turn may ask to buy it.
            const ai = aiTurn(table) !== null;
            if (ai) ctx.schedule("aiThink", { in: AI_THINK_MS, scope: "state" });
            if (aiMightBuy(table)) ctx.schedule("aiBuy", { in: AI_BUY_MS, scope: "state" });
            return { endsAt: ctx.now() + BUY_WINDOW_MS, aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
          },
          timers: {
            buyWindow: windowPhase.timer(Empty, (s: RoomShared, _p, ctx) => {
              const table = inPlay(s, ctx.local.round);
              const plan = settle(table, closeWindow(table), "window", ctx.emit);
              if (plan.kind === "over") return ctx.goto(plan.to, plan.shared);
              if (plan.kind === "switch") return ctx.goto(["playing", plan.to], plan.shared, undefined, { locals: { playing: { round: plan.round } } });
              return ctx.stay(plan.shared, { ...ctx.local, round: plan.round });
            }),
            aiThink: windowPhase.timer(Empty, (s: RoomShared, _p, ctx) => {
              const table = inPlay(s, ctx.local.round);
              const out = aiAct(table);
              if (!out.accepted) return s;
              const plan = settle(table, out.shared, "window", ctx.emit);
              if (plan.kind === "over") return ctx.goto(plan.to, plan.shared);
              if (plan.kind === "switch") return ctx.goto(["playing", plan.to], plan.shared, undefined, { locals: { playing: { round: plan.round } } });
              return ctx.stay(plan.shared, { ...ctx.local, round: plan.round });
            }),
            aiBuy: windowPhase.timer(Empty, (s: RoomShared, _p, ctx) => {
              const table = inPlay(s, ctx.local.round);
              if (aiBuyers(table).length === 0) return s;
              const next = aiBuy(table);
              return next.round ? ctx.stay(played(next), { ...ctx.local, round: next.round }) : s;
            }),
          },
        }),
        acting: acting.state({
          enter: (s: RoomShared, _input, ctx) => {
            const ai = aiTurn(inPlay(s, ctx.local.round)) !== null;
            if (ai) ctx.schedule("aiThink", { in: AI_THINK_MS, scope: "state" });
            return { aiActAt: ai ? ctx.now() + AI_THINK_MS : null };
          },
          timers: {
            aiThink: acting.timer(Empty, (s: RoomShared, _p, ctx) => {
              const table = inPlay(s, ctx.local.round);
              const out = aiAct(table);
              if (!out.accepted) return s;
              const plan = settle(table, out.shared, "acting", ctx.emit, true);
              if (plan.kind === "over") return ctx.goto(plan.to, plan.shared);
              if (plan.kind === "switch") return ctx.goto(["playing", plan.to], plan.shared, undefined, { locals: { playing: { round: plan.round } } });
              if (plan.kind === "rearm") return ctx.reenter(plan.shared, undefined, { locals: { playing: { round: plan.round } } });
              return ctx.stay(plan.shared, { ...ctx.local, round: plan.round });
            }),
          },
        }),
      },
    }),
    roundOver: roundOver.state({
      enter: (s: RoomShared, _input, ctx) => ctx.stay(rest(s, (t) => scoreRound(t, ctx.emit))),
      messages: {
        NEXT_ROUND: roundOver.message(Payloads.NEXT_ROUND, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(atRest(s), ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", rest(s, nextRound)),
        }),
      },
    }),
    gameOver: gameOver.state({
      enter: (s: RoomShared, _input, ctx) => {
        const scored = scoreRound(atRest(s), ctx.emit);
        gameOverEvent(scored, ctx.emit);
        return ctx.stay(rested(scored));
      },
      messages: {
        NEW_GAME: gameOver.message(Payloads.NEW_GAME, {
          roles: ["player"],
          guard: (s: RoomShared, _p, ctx) => isHost(atRest(s), ctx.caller),
          handler: (s: RoomShared, _p, ctx) => ctx.goto("cutting", rest(s, newGame)),
        }),
      },
    }),
  },
  views: roomViews,
});

export type RoomContract = typeof RoomContract;
