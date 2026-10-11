import { z } from "zod";
import type { RoomState } from "../room";

/**
 * The room's persisted state, as a simulated actor holds it. simulate() types `state` as what init
 * returns, but an actor with states persists `{ shared, phase, local, stateTimers }`
 * (docs/actor-kit-v2-feedback.md), so it is checked here.
 */
const Envelope = z.object({
  shared: z.object({ seats: z.array(z.unknown()) }),
  phase: z.enum(["lobby", "cutting", "window", "acting", "roundOver", "gameOver"]),
  stateTimers: z.array(z.string()),
});
const RoomStateZ = z.custom<RoomState>((x) => Envelope.safeParse(x).success);

export const roomState = (raw: unknown): RoomState => RoomStateZ.parse(raw);
