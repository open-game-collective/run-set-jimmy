/**
 * The room's roles and views: who a caller is, and what each one sees. The contract (src/room.ts)
 * uses these objects, and the client builds its socket from them (actorClient<typeof RoomContract>),
 * so this module stays free of zod and the message handlers.
 */
import { localOf, matches, view } from "@actor-kit/core";
import type { RoomState } from "./room";
import { seatOf } from "./room.rules";
import { NO_DEADLINES, type Deadlines, type RoomShared, type RoomStateValue, type RoomTable } from "./room.types";
import type { RoundState } from "./game/round";
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

/** Between rounds the table's round is the one just finished (on the scores), or none. */
export const atRest = ({ finished, ...rest }: RoomShared): RoomTable => ({ ...rest, round: finished });
export const rested = ({ round, ...rest }: RoomTable): RoomShared => ({ ...rest, finished: round });
/** During play the round lives in playing's local; shared state holds none. */
export const inPlay = ({ finished: _none, ...rest }: RoomShared, round: RoundState): RoomTable => ({ ...rest, round });
export const played = ({ round: _local, ...rest }: RoomTable): RoomShared => ({ ...rest, finished: null });

/** The table in any state: the round from playing's local while playing. */
export const tableOf = (st: RoomState): RoomTable => (matches(st, "playing") ? inPlay(st.shared, localOf(st).round) : atRest(st.shared));

/** The phase as the screens name it ("playing.window"). */
export const valueOf = (st: RoomState): RoomStateValue => {
  const dotted = st.phase.join(".");
  return PHASES.find((p) => p === dotted) ?? "lobby";
};

/** The deadlines in the active state's local (the innermost level), for the screens' countdowns. */
function deadlinesOf(st: RoomState): Deadlines {
  if (matches(st, "cutting")) return { ...NO_DEADLINES, cutEndsAt: localOf(st).endsAt, aiActAt: localOf(st).aiActAt };
  if (matches(st, ["playing", "window"])) return { ...NO_DEADLINES, windowEndsAt: localOf(st).endsAt, aiActAt: localOf(st).aiActAt };
  if (matches(st, ["playing", "acting"])) return { ...NO_DEADLINES, aiActAt: localOf(st).aiActAt };
  return NO_DEADLINES;
}

/** What `caller` sees: the table, and their own seat and hand when they sit at it. */
function wire(st: RoomState, role: Role, caller: string | null): RoomWireView {
  const seat = caller === null ? -1 : seatOf(st.shared, caller);
  const table = tableOf(st);
  return {
    value: valueOf(st),
    public: publicView(table, deadlinesOf(st)),
    private: { role, player: role === "player" && seat >= 0 ? playerView(table, seat) : null },
  };
}

export const roomViews = {
  service: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "service", null)),
  // Each phone's view carries its own hand and nobody else's.
  player: view.perCaller(RoomViewSchema, (st: RoomState, caller: string) => wire(st, "player", caller)),
  tv: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "tv", null)),
  guest: view.shared(RoomViewSchema, (st: RoomState) => wire(st, "guest", null)),
};
