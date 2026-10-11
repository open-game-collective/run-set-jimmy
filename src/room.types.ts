import type { ContractMessages, Infer } from "@actor-kit/core";
import type { z } from "zod";
import type { ScoreSheet } from "./game/game";
import type { RoundState } from "./game/round";
import type { RoomContract } from "./room";
import type { OgsClaimSchema } from "./room.schemas";
import type { PlayerSchema, PublicSchema, RoomWireView } from "./room.wire";

/** Every message the room accepts (OGS_CLAIM too), typed from the contract. */
export type RoomMessage = ContractMessages<RoomContract>;

export type RoomPublicContext = Infer<typeof PublicSchema>;
export type PlayerView = Infer<typeof PlayerSchema>;
/** Each caller receives only its own slot: its hand and nobody else's. */
export type RoomPrivateContext = RoomWireView["private"];
/** The phase, as the screens see it: "lobby", "playing.window", … */
export type RoomStateValue = RoomWireView["value"];
export type OgsClaim = z.infer<typeof OgsClaimSchema>;

/** What the Worker inlines into a TV or phone page: the caller's signed id and its first view. */
export type Boot = { roomCode: string; id: string; sig: string; view: unknown };

/** A seat at the table: a person's phone, or an AI player the room plays itself (`ai`). */
export type Seat = { id: string; name: string; avatar: string | null; ai: boolean };
export type Couch = { sid: string; label: string; away: boolean };
export type LogEntry = RoomPublicContext["log"][number];

/**
 * The table: the room's state with the round being played (or the last one, between rounds). The
 * rules (src/room.rules.ts) and views (src/views.ts) work on it. Never sent to any client: every
 * hand and the deck live here; views project what each caller may see.
 */
export type RoomTable = {
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
 * The room's shared state (every state sees it). During play the round lives in `playing`'s local
 * (src/room.ts); between rounds the one just finished stays here for the scores.
 */
export type RoomShared = Omit<RoomTable, "round"> & { finished: RoundState | null };

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
