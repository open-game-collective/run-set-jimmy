/**
 * Typed test helpers for the room machine (same shape as Night Flight's).
 */
import type { ActorKitStorage } from "actor-kit";
import { createActor, SimulatedClock } from "xstate";
import type { Env } from "../env";
import { botMove, wantsBuy } from "../game/bot";
import type { RoundState } from "../game/round";
import { BUY_WINDOW_MS, roomMachine } from "../room.machine";
import type { OgsClaim, RoomClientEvent, RoomEvent, RoomInput, RoomPrivateContext } from "../room.types";

export const TV = "tv-1";
export const PLAYERS = ["ann-1", "ben-1", "cat-1", "dan-1"] as const;
export const [ANN, BEN, CAT, DAN] = PLAYERS;

const TEST_ENV: Env = { ACTOR_KIT_SECRET: "test-secret" };
/** The machine never touches storage; actor-kit's type demands a DurableObjectStorage. */
const TEST_STORAGE = {} as unknown as ActorKitStorage;

const inputFor = (tvId: string): RoomInput => ({
  id: "ABCD",
  caller: { type: "client", id: tvId },
  env: TEST_ENV,
  storage: TEST_STORAGE,
});

export function createTestActor(tvId = TV) {
  const clock = new SimulatedClock();
  const actor = createActor(roomMachine, { clock, input: inputFor(tvId) });
  actor.start();
  return { actor, clock };
}

export type TestRoom = ReturnType<typeof createTestActor>;

export function send({ actor }: TestRoom, callerId: string, event: RoomClientEvent): void {
  const full: RoomEvent = { ...event, caller: { type: "client", id: callerId }, env: TEST_ENV, storage: TEST_STORAGE };
  actor.send(full);
}

export function claim({ actor }: TestRoom, callerId: string, c: OgsClaim): void {
  const full: RoomEvent = {
    type: "OGS_CLAIM",
    callerId,
    claim: c,
    caller: { type: "service", id: "ogs" },
    env: TEST_ENV,
    storage: TEST_STORAGE,
  };
  actor.send(full);
}

export const snap = ({ actor }: TestRoom) => actor.getSnapshot();
export const view = (room: TestRoom, callerId: string): RoomPrivateContext => snap(room).context.private[callerId] ?? {};
export const pub = (room: TestRoom) => snap(room).context.public;
export const value = (room: TestRoom) => {
  const v = snap(room).value;
  return typeof v === "string" ? v : `playing.${String((v as { playing: string }).playing)}`;
};

export function round(room: TestRoom): RoundState {
  const r = snap(room).context.server.round;
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
  const id = cutter === null ? undefined : snap(room).context.server.seats[cutter]?.id;
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
    for (const seat of s.seats) if (seat.id !== turn && wantsBuy(s, seat.id) && !s.phase.requests.includes(seat.id)) send(room, seat.id, { type: "BUY" });
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
 * What actor-kit does when a Durable Object restarts mid-game (a deploy, an eviction): persist the
 * snapshot, build a fresh actor from it (pending timers are NOT restored) and send RESUME. With
 * `resume: false`, the room stays asleep: no RESUME until something wakes it.
 */
export function restartRoom(room: TestRoom, opts: { resume?: boolean } = {}): TestRoom {
  const persisted = room.actor.getPersistedSnapshot();
  room.actor.stop();
  const clock = new SimulatedClock();
  const actor = createActor(roomMachine, { clock, snapshot: persisted, input: inputFor(TV) });
  actor.start();
  if (opts.resume !== false) actor.send({ type: "RESUME", caller: { type: "system", id: "ABCD" }, env: TEST_ENV, storage: TEST_STORAGE } as RoomEvent);
  return { actor, clock };
}
