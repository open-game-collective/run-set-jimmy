import { z } from "zod";

export const RoomInputSchema = z.object({
  /** The room code (4 letters). */
  code: z.string().regex(/^[A-Z]{4}$/),
  /** The caller id of the TV page that made the room. */
  tvId: z.string().min(1).max(80),
});

const CardId = z.string().min(1).max(12);
const PlacementSchema = z.union([
  z.object({ at: z.enum(["low", "high"]) }),
  z.object({ replace: z.number().int().min(0).max(13), jokerTo: z.enum(["low", "high"]) }),
]);

/** Message payloads (everything but `type`), parsed by the room before any handler runs. */
export const Payloads = {
  // Lobby: take a seat (plain browser: typed name; OGS: the verified profile name wins).
  JOIN: z.object({ name: z.string().trim().max(16).optional() }),
  START: z.object({}),
  // Host, lobby: put an AI player in the next open seat.
  ADD_AI: z.object({}),
  // Host: put a seat elsewhere in the turn order (match the couch), or take it away (lobby only).
  MOVE_SEAT: z.object({ seat: z.number().int().min(0).max(6), to: z.number().int().min(0).max(6) }),
  REMOVE_SEAT: z.object({ seat: z.number().int().min(0).max(6) }),
  // The cutter taps the deck: where along it, 0–1.
  CUT: z.object({ at: z.number().min(0).max(1) }),
  DRAW: z.object({ from: z.enum(["deck", "discard"]) }),
  BUY: z.object({}),
  ANSWER: z.object({ answer: z.enum(["take", "let-go"]) }),
  GO_DOWN: z.object({
    melds: z
      .array(z.object({ kind: z.enum(["run", "set"]), cardIds: z.array(CardId).min(3).max(14), spare: z.enum(["high", "low"]).optional() }))
      .min(1)
      .max(3),
  }),
  PLAY_ON: z.object({ cardId: CardId, meldId: z.string().min(1).max(8), placement: PlacementSchema.optional() }),
  DISCARD: z.object({ cardId: CardId }),
  NEXT_ROUND: z.object({}),
  NEW_GAME: z.object({}),
  // A TV parked by the OGS launcher (Home) or back (Continue): its household is away meanwhile.
  AWAY: z.object({ away: z.boolean() }),
} as const;

/** OGS: who a caller is (verified game token, worker.ts) and which couch they sit on. */
export const OgsClaimSchema = z.object({
  profileId: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  avatar: z.string().max(500),
  couch: z.object({ sid: z.string().min(1).max(100), label: z.string().min(1).max(60) }).nullable(),
});

/** Only the OGS service (worker.ts, after verifying a game token) says who a caller is. */
export const OgsClaimPayload = z.object({ callerId: z.string().min(1), claim: OgsClaimSchema });
