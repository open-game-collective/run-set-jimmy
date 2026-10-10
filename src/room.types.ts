import type { ActorKitSystemEvent, BaseActorKitEvent, WithActorKitEvent, WithActorKitInput } from "actor-kit";
import type { z } from "zod";
import type { Env } from "./env";
import type { ScoreSheet } from "./game/game";
import type { RoundState } from "./game/round";
import type {
  BootSchema,
  OgsClaimSchema,
  PlayerViewSchema,
  RoomClientEventSchema,
  RoomInputPropsSchema,
  RoomPrivateContextSchema,
  RoomPublicContextSchema,
  RoomServiceEventSchema,
  RoomStateValueSchema,
} from "./room.schemas";

export type RoomInputProps = z.infer<typeof RoomInputPropsSchema>;
export type RoomInput = WithActorKitInput<RoomInputProps>;

export type RoomClientEvent = z.infer<typeof RoomClientEventSchema>;
export type RoomServiceEvent = z.infer<typeof RoomServiceEventSchema>;

export type RoomEvent = (WithActorKitEvent<RoomClientEvent, "client"> | WithActorKitEvent<RoomServiceEvent, "service"> | ActorKitSystemEvent) &
  BaseActorKitEvent<Env>;

export type RoomPublicContext = z.infer<typeof RoomPublicContextSchema>;
export type PlayerView = z.infer<typeof PlayerViewSchema>;
/** Each caller receives only its own slot: its hand and nobody else's. */
export type RoomPrivateContext = z.infer<typeof RoomPrivateContextSchema>;
export type RoomStateValue = z.infer<typeof RoomStateValueSchema>;
export type Boot = z.infer<typeof BootSchema>;
export type OgsClaim = z.infer<typeof OgsClaimSchema>;

/** A seat at the table: a person's phone, or an AI player the room plays itself (`ai`). */
export type Seat = { id: string; name: string; avatar: string | null; ai: boolean };
export type Couch = { sid: string; label: string; away: boolean };
export type LogEntry = RoomPublicContext["log"][number];

/** Never sent to any client: every hand and the deck live here. */
export type RoomServerOnlyContext = {
  /** The first TV (the room's creator). Other households' TVs are viewers too. */
  tvId: string;
  /** Turn order. The first seat is the host. */
  seats: Seat[];
  /** OGS: verified identities by caller id. */
  claims: Record<string, OgsClaim>;
  /** OGS households: caller id → couch session id. */
  couchOf: Record<string, string>;
  couches: Couch[];
  round: RoundState | null;
  sheet: ScoreSheet | null;
  roundNumber: number;
  gameNumber: number;
  windowEndsAt: number | null;
  /** When the room cuts for a cutter who hasn't (ms since epoch), while cutting. */
  cutEndsAt: number | null;
  /** When the AI player on turn (or cutting) acts next (ms since epoch); null when no AI is to move. */
  aiActAt: number | null;
  oops: Record<string, { line: string; seq: number }>;
  log: LogEntry[];
  seq: number;
  cut: RoomPublicContext["cut"];
  /** Seat index that cuts before this round's deal (while cutting). */
  cutter: number | null;
};

export type RoomServerContext = {
  public: RoomPublicContext;
  private: Record<string, RoomPrivateContext>;
  server: RoomServerOnlyContext;
};
