/**
 * Plays whole seeded games through simulate(): people played by the bot through the same messages
 * a phone sends, AI players played by the room, every timer on the virtual clock. After every step
 * it checks that no caller's view holds a card from someone else's hand; at the end it replays the
 * room's journal (replayJournal checks every after-state's checksum and the emitted events).
 */
import { replayJournal, simulate, type AnyContract, type SimEvent } from "@actor-kit/test";
import { botMove, wantsBuy } from "../game/bot";
import { mulberry32, type Rng } from "../game/cards";
import { AI_THINK_MS, BUY_WINDOW_MS, CUT_TIMEOUT_MS, RoomContract } from "../room";
import type { RoomClientEvent } from "../room.types";
import { RoomWireViewZ } from "../room.wire";
import { roomState } from "./room-state";

const ROOM: AnyContract = RoomContract;
const CODE = "FUZZ";
const TV = "tv-fuzz";
const MAX_STEPS = 60_000;

export type FuzzResult = {
  seed: number;
  seats: number;
  ai: number;
  steps: number;
  rounds: number;
  phase: string;
  events: SimEvent[];
  replayed: number;
  /** Every hidden-hand breach seen: who saw whose card, at which step. */
  leaks: string[];
};

type Wire = ReturnType<typeof RoomWireViewZ.parse>;

/**
 * Every card id a view shows besides the cut: the table, the discard, its own hand. (The cut card
 * is shown to everyone by the rules and then dealt, so it is public wherever it goes.)
 */
function cardIdsIn(view: Wire): Set<string> {
  const ids = new Set<string>();
  for (const m of view.melds) for (const c of m.cards) ids.add(c.id);
  if (view.discardTop) ids.add(view.discardTop.id);
  for (const c of view.me?.hand ?? []) ids.add(c.id);
  return ids;
}

export async function playFuzzGame(seed: number): Promise<FuzzResult> {
  const rng: Rng = mulberry32(seed * 7919 + 1);
  const pick = (n: number) => Math.floor(rng() * n);
  const seats = 3 + pick(5); // 3–7
  const ai = pick(seats); // 0 … seats-1: at least one person hosts
  const people = Array.from({ length: seats - ai }, (_, i) => `p${i + 1}-${seed}`);

  const sim = simulate({ contracts: [RoomContract], seed, now: Date.UTC(2026, 9, 11) + seed * 1000 });
  await sim.spawn(RoomContract, CODE, { code: CODE, tvId: TV }, { caller: "worker", callerType: "service" });
  const room = sim.actor(RoomContract, CODE);
  const send = (caller: string, event: RoomClientEvent) => sim.send(ROOM, CODE, caller, event);
  const st = () => roomState(room.state);

  const host = people[0] ?? "";
  /** The host is the first person in the seat order (it moves when the seats do). */
  const hostOf = () => st().shared.seats.find((x) => !x.ai)?.id ?? host;
  for (const id of people) send(id, { type: "JOIN", name: id.slice(0, 8) });
  for (let i = 0; i < ai; i++) send(host, { type: "ADD_AI" });
  // The host shuffles the seats a little, as a couch would.
  if (seats > 1) send(host, { type: "MOVE_SEAT", seat: pick(seats), to: pick(seats) });
  send(hostOf(), { type: "START" });

  const leaks: string[] = [];
  const callers = [TV, ...people, "stranger"];
  let steps = 0;

  const check = () => {
    const r = st().shared.round;
    for (const caller of callers) {
      const view = RoomWireViewZ.parse(room.view(caller));
      const ids = cardIdsIn(view);
      for (const seat of r?.seats ?? []) {
        if (seat.id === caller) continue;
        for (const card of seat.hand) if (ids.has(card.id)) leaks.push(`step ${steps}: ${caller} saw ${seat.id}'s ${card.id}`);
      }
      const own = (r?.seats.find((x) => x.id === caller)?.hand ?? []).map((c) => c.id).join();
      const shown = (view.me?.hand ?? []).map((c) => c.id).join();
      if (shown !== own) leaks.push(`step ${steps}: ${caller} was shown the hand [${shown}], not its own [${own}]`);
    }
  };

  for (; steps < MAX_STEPS; steps++) {
    const s = st();
    const phase = s.phase;
    if (phase === "gameOver") break;
    const sh = s.shared;
    if (phase === "lobby") throw new Error(`seed ${seed}: never started`);
    if (phase === "roundOver") {
      send(hostOf(), { type: "NEXT_ROUND" });
    } else if (phase === "cutting") {
      const cutter = sh.cutter === null ? undefined : sh.seats[sh.cutter];
      if (cutter && !cutter.ai && rng() < 0.85) send(cutter.id, { type: "CUT", at: rng() });
      else sim.advance(cutter?.ai ? AI_THINK_MS : CUT_TIMEOUT_MS);
    } else {
      const r = sh.round;
      if (!r) throw new Error(`seed ${seed}: playing without a round`);
      const turn = r.seats[r.turn]?.id ?? "";
      const turnIsAi = sh.seats.some((x) => x.id === turn && x.ai);
      if (phase === "window") {
        for (const seat of r.seats)
          if (seat.id !== turn && people.includes(seat.id) && wantsBuy(r, seat.id) && rng() < 0.8) send(seat.id, { type: "BUY" });
        const after = st().shared.round;
        const move = after && !turnIsAi ? botMove(after, turn) : null;
        if (move?.type === "draw" && rng() < 0.9) send(turn, { type: "DRAW", from: move.from });
        else sim.advance(turnIsAi ? AI_THINK_MS : BUY_WINDOW_MS);
      } else if (turnIsAi) {
        sim.advance(AI_THINK_MS);
      } else {
        const move = botMove(r, turn);
        if (!move) throw new Error(`seed ${seed}: no bot move for ${turn} in ${r.phase.kind}`);
        // Now and then a phone sends a move the rules refuse (the room tells only that phone).
        if (rng() < 0.03) send(turn, { type: "DISCARD", cardId: "nope" });
        if (rng() < 0.02) send(people[pick(people.length)] ?? turn, { type: "DRAW", from: "deck" });
        switch (move.type) {
          case "draw":
            send(turn, { type: "DRAW", from: move.from });
            break;
          case "answer":
            send(turn, { type: "ANSWER", answer: move.answer });
            break;
          case "goDown":
            send(turn, { type: "GO_DOWN", melds: move.melds });
            break;
          case "playOn":
            send(turn, { type: "PLAY_ON", cardId: move.cardId, meldId: move.meldId, ...(move.placement ? { placement: move.placement } : {}) });
            break;
          case "discard":
            send(turn, { type: "DISCARD", cardId: move.cardId });
            break;
        }
      }
    }
    check();
  }

  const end = st();
  const { replayed } = await replayJournal(RoomContract, room.journal);
  return {
    seed,
    seats,
    ai,
    steps,
    rounds: end.shared.sheet?.rounds.length ?? 0,
    phase: end.phase,
    events: sim.events(),
    replayed,
    leaks,
  };
}
