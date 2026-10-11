/**
 * The room's roles and views: who a caller is, and what each one sees. The contract (src/room.ts)
 * uses these objects, and the client builds its socket from them (actorClient<typeof RoomContract>),
 * so this module stays free of zod and the message handlers.
 */
import { view } from "@actor-kit/core";
import type { RoomState } from "./room";
import { seatOf } from "./room.rules";
import { NO_DEADLINES, type Deadlines, type RoomStateValue } from "./room.types";
import { PHASES, RoomViewSchema, type RoomWireView } from "./room.wire";
import { playerView, publicView } from "./views";

/** First match wins: OGS (the Worker, after verifying a token), a seated phone, the room's TV, anyone else. */
export const roomRoles = {
  service: (_s: RoomState, _caller: string, { callerType }: { callerType: "user" | "service" }) => callerType === "service",
  player: (s: RoomState, caller: string) => seatOf(s.shared, caller) >= 0,
  tv: (s: RoomState, caller: string) => caller === s.shared.tvId,
  guest: () => true,
};

type Role = keyof typeof roomRoles;

const isNumber = (x: unknown): x is number => typeof x === "number";

/** A local that counts down to something (the cut, the buy window) or holds an AI player's next move. */
const field = (local: unknown, key: "endsAt" | "aiActAt"): number | null => {
  if (typeof local !== "object" || local === null || !(key in local)) return null;
  const value: unknown = Reflect.get(local, key);
  return isNumber(value) ? value : null;
};

/** The phase as the screens name it ("playing.window"). */
export const valueOf = (st: RoomState): RoomStateValue => {
  const dotted = st.phase.join(".");
  return PHASES.find((p) => p === dotted) ?? "lobby";
};

/** The deadlines in the active state's local (the innermost level), for the screens' countdowns. */
function deadlinesOf(st: RoomState): Deadlines {
  const local: unknown = st.locals.at(-1);
  const at = valueOf(st);
  return {
    ...NO_DEADLINES,
    cutEndsAt: at === "cutting" ? field(local, "endsAt") : null,
    windowEndsAt: at === "playing.window" ? field(local, "endsAt") : null,
    aiActAt: field(local, "aiActAt"),
  };
}

/** What `caller` sees: the table, and their own seat and hand when they sit at it. */
function wire(st: RoomState, role: Role, caller: string | null): RoomWireView {
  const seat = caller === null ? -1 : seatOf(st.shared, caller);
  return {
    value: valueOf(st),
    public: publicView(st.shared, deadlinesOf(st)),
    private: { role, player: role === "player" && seat >= 0 ? playerView(st.shared, seat) : null },
  };
}

export const roomViews = {
  service: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "service", null)),
  // Each phone's view carries its own hand and nobody else's.
  player: view.perCaller(RoomViewSchema, (st: RoomState, caller: string) => wire(st, "player", caller)),
  tv: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "tv", null)),
  guest: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "guest", null)),
};
