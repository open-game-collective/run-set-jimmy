/**
 * Typed test helpers for the room actor, over actor-kit's simulate(): the same step core as the
 * Durable Object, a virtual clock, durable timers, journals that replayJournal() can check.
 *
 * The tests read the room as v1's machine did (`value`, `context.public/private/server`): what a
 * caller sees is the view the room sends that caller, parsed back like the client parses it.
 */
import { simulate, type SimActor, type Simulation } from "@actor-kit/test";
import { botMove, wantsBuy } from "../game/bot";
import type { RoundState } from "../game/round";
import { BUY_WINDOW_MS, RoomContract, type RoomState } from "../room";
import type { OgsClaim, RoomMessage, RoomPrivateContext, RoomPublicContext, RoomTable } from "../room.types";
import { tableOf } from "../room.views";
import { RoomViewSchema, type RoomWireView } from "../room.wire";

export const TV = "tv-1";
export const PLAYERS = ["ann-1", "ben-1", "cat-1", "dan-1"] as const;
export const [ANN, BEN, CAT, DAN] = PLAYERS;
export const ROOM_CODE = "ABCD";
/** The virtual clock starts here (ms since epoch). */
export const START = Date.UTC(2026, 9, 11, 19, 0, 0);

let made = 0;

export type TestRoom = {
  sim: Simulation;
  actor: SimActor<typeof RoomContract>;
  /** The room's virtual clock: increment runs every timer that comes due. */
  clock: { increment(ms: number): void };
};

function wrap(sim: Simulation): TestRoom {
  return { sim, actor: sim.actor(RoomContract, ROOM_CODE), clock: { increment: (ms) => sim.advance(ms) } };
}

/** A fresh room in the lobby, made by the TV `tvId`. Each room deals from its own seed. */
export function createTestActor(tvId = TV): TestRoom {
  const sim = simulate({ contracts: [RoomContract], seed: ++made, now: START });
  sim.spawnSync(RoomContract, ROOM_CODE, { code: ROOM_CODE, tvId }, { caller: "worker", callerType: "service" });
  return wrap(sim);
}

export function send(room: TestRoom, callerId: string, event: RoomMessage): void {
  room.actor.send(callerId, event);
}

export function claim(room: TestRoom, callerId: string, c: OgsClaim): void {
  room.actor.send("ogs", { type: "OGS_CLAIM", callerId, claim: c }, { callerType: "service" });
}

export const state = (room: TestRoom): RoomState => room.actor.state;

/** What `callerId` sees: the view the room sends that caller (checked against its schema). */
export const seen = (room: TestRoom, callerId: string): RoomWireView => RoomViewSchema.parse(room.actor.view(callerId));

/** A caller's own slot, as v1's tests read it: a role only for the TV and seated players, a player view only for those. */
function ownSlot(p: RoomWireView["private"]): { role?: "tv" | "player"; player?: NonNullable<RoomPrivateContext["player"]> } {
  if (p.role === "tv") return { role: "tv" };
  if (p.role === "player" && p.player) return { role: "player", player: p.player };
  return {};
}

/** The room as v1's tests read it: the phase, what the TV sees, each caller's own slot, and the server-only state. */
export function snap(room: TestRoom): {
  value: string;
  context: { public: RoomPublicContext; private: Record<string, ReturnType<typeof ownSlot>>; server: RoomTable };
} {
  const st = state(room);
  const callers = [st.shared.tvId, ...st.shared.seats.filter((s) => !s.ai).map((s) => s.id)];
  return {
    value: value(room),
    context: {
      public: seen(room, TV).public,
      private: Object.fromEntries(callers.map((id) => [id, ownSlot(seen(room, id).private)])),
      // The server-only state as v1 had it: shared state with the round (from playing's local while playing).
      server: tableOf(st),
    },
  };
}

export const view = (room: TestRoom, callerId: string) => ownSlot(seen(room, callerId).private);
export const pub = (room: TestRoom) => seen(room, TV).public;
export const value = (room: TestRoom): string => state(room).phase.join(".");

export function round(room: TestRoom): RoundState {
  const r = tableOf(state(room)).round;
  if (!r) throw new Error("no round dealt");
  return r;
}

export const turnId = (room: TestRoom): string => round(room).seats[round(room).turn]?.id ?? "";

/** Seats Ann, Ben, Cat and Dan (or the first `n`), in that order. Ann hosts. */
export function joinPlayers(room: TestRoom, n = 4): void {
  for (const id of PLAYERS.slice(0, n)) send(room, id, { type: "JOIN", name: id.split("-")[0] });
}

/** Lets the cutter cut (always the same spot) so the deal happens. */
export function cut(room: TestRoom, at = 0.5): void {
  const cutter = pub(room).cutter;
  const id = cutter === null ? undefined : state(room).shared.seats[cutter]?.id;
  if (!id) throw new Error("nobody is cutting");
  send(room, id, { type: "CUT", at });
}

/** A 4-player room, started, cut and dealt: round 1 waiting on the first draw. */
export function startedRoom(n = 4): TestRoom {
  const room = createTestActor();
  joinPlayers(room, n);
  send(room, ANN, { type: "START" });
  cut(room);
  return room;
}

/** One step of the bots, sent as real client events (and the buy window's clock). */
export function botStep(room: TestRoom): void {
  const s = round(room);
  const turn = turnId(room);
  if (s.phase.kind === "draw" && s.phase.window === "open") {
    for (const seat of s.seats) if (seat.id !== turn && !seat.id.startsWith("ai:") && wantsBuy(s, seat.id) && !s.phase.requests.includes(seat.id)) send(room, seat.id, { type: "BUY" });
    const move = botMove(round(room), turn);
    if (move?.type === "draw") return send(room, turn, { type: "DRAW", from: move.from });
    room.clock.increment(BUY_WINDOW_MS);
    return;
  }
  const move = botMove(s, turn);
  if (!move) throw new Error(`no bot move in ${value(room)}`);
  switch (move.type) {
    case "draw":
      return send(room, turn, { type: "DRAW", from: move.from });
    case "answer":
      return send(room, turn, { type: "ANSWER", answer: move.answer });
    case "goDown":
      return send(room, turn, { type: "GO_DOWN", melds: move.melds });
    case "playOn":
      return send(room, turn, { type: "PLAY_ON", cardId: move.cardId, meldId: move.meldId, ...(move.placement ? { placement: move.placement } : {}) });
    case "discard":
      return send(room, turn, { type: "DISCARD", cardId: move.cardId });
  }
}

/** Bots play the current round to the end (someone goes out). */
export function playOutRound(room: TestRoom): void {
  for (let i = 0; i < 20_000 && value(room).startsWith("playing"); i++) botStep(room);
  if (value(room).startsWith("playing")) throw new Error("round never ended");
}

/**
 * What happens to the room when its Durable Object restarts (an eviction, a deploy): its state,
 * journal and pending timers are stored, so the room carries on as it was. In the simulation that
 * is an independent copy of it.
 */
export function restartRoom(room: TestRoom): TestRoom {
  return wrap(room.sim.branch());
}
