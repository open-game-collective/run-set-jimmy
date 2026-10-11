import type { z } from "zod";
import type { ScoreSheet } from "./game/game";
import type { RoundState } from "./game/round";
import type {
  BootSchema,
  OgsClaimSchema,
  PlayerViewSchema,
  RoomClientEventSchema,
  RoomPrivateContextSchema,
  RoomPublicContextSchema,
  RoomStateValueSchema,
} from "./room.schemas";

/** Every message a phone or TV may send (the TV only sends AWAY). */
export type RoomClientEvent = z.infer<typeof RoomClientEventSchema>;

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

/**
 * The room's state, shared by every phase. Never sent to any client: every hand and the deck live
 * here; views (src/views.ts) project what each caller may see.
 */
export type RoomShared = {
  /** The first TV (the room's creator). Other households' TVs are viewers too. */
  tvId: string;
  roomCode: string;
  /** Turn order. The first person is the host. */
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
  oops: Record<string, { line: string; seq: number }>;
  log: LogEntry[];
  seq: number;
  cut: RoomPublicContext["cut"];
  /** Seat index that cuts before this round's deal (while cutting). */
  cutter: number | null;
};

/**
 * When the room acts next by itself (ms since epoch), for the screens' countdowns. These live in
 * the phase's local (src/room.ts): the timers that act on them are the phase's own.
 */
export type Deadlines = {
  /** The open buy window closes. */
  windowEndsAt: number | null;
  /** The room cuts for a cutter who hasn't. */
  cutEndsAt: number | null;
  /** The AI player on turn (or cutting) acts. */
  aiActAt: number | null;
};

export const NO_DEADLINES: Deadlines = { windowEndsAt: null, cutEndsAt: null, aiActAt: null };
