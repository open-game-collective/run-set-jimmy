import { z } from "zod";

export const RoomInputPropsSchema = z.object({});

const SuitSchema = z.enum(["S", "H", "D", "C"]);
export const CardSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("card"), suit: SuitSchema, rank: z.number().int().min(1).max(13) }),
  z.object({ id: z.string(), kind: z.literal("joker") }),
]);

const CardId = z.string().min(1).max(12);
const PlacementSchema = z.union([
  z.object({ at: z.enum(["low", "high"]) }),
  z.object({ replace: z.number().int().min(0).max(13), jokerTo: z.enum(["low", "high"]) }),
]);

export const RoomClientEventSchema = z.discriminatedUnion("type", [
  // Lobby: take a seat (plain browser: typed name; OGS: the verified profile name wins).
  z.object({ type: z.literal("JOIN"), name: z.string().trim().max(16).optional() }),
  z.object({ type: z.literal("START") }),
  // Host: put a seat elsewhere in the turn order (match the couch), or take it away (lobby only).
  z.object({ type: z.literal("MOVE_SEAT"), seat: z.number().int().min(0).max(6), to: z.number().int().min(0).max(6) }),
  z.object({ type: z.literal("REMOVE_SEAT"), seat: z.number().int().min(0).max(6) }),
  // The cutter taps the deck: where along it, 0–1.
  z.object({ type: z.literal("CUT"), at: z.number().min(0).max(1) }),
  z.object({ type: z.literal("DRAW"), from: z.enum(["deck", "discard"]) }),
  z.object({ type: z.literal("BUY") }),
  z.object({ type: z.literal("ANSWER"), answer: z.enum(["take", "let-go"]) }),
  z.object({
    type: z.literal("GO_DOWN"),
    melds: z
      .array(z.object({ kind: z.enum(["run", "set"]), cardIds: z.array(CardId).min(3).max(14), spare: z.enum(["high", "low"]).optional() }))
      .min(1)
      .max(3),
  }),
  z.object({ type: z.literal("PLAY_ON"), cardId: CardId, meldId: z.string().min(1).max(8), placement: PlacementSchema.optional() }),
  z.object({ type: z.literal("DISCARD"), cardId: CardId }),
  z.object({ type: z.literal("NEXT_ROUND") }),
  z.object({ type: z.literal("NEW_GAME") }),
  // A TV parked by the OGS launcher (Home) or back (Continue): its household is away meanwhile.
  z.object({ type: z.literal("AWAY"), away: z.boolean() }),
]);

/** OGS: who a caller is (verified game token, worker.ts) and which couch they sit on. */
export const OgsClaimSchema = z.object({
  profileId: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  avatar: z.string().max(500),
  couch: z.object({ sid: z.string().min(1).max(100), label: z.string().min(1).max(60) }).nullable(),
});

export const RoomServiceEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NOOP") }),
  z.object({ type: z.literal("OGS_CLAIM"), callerId: z.string().min(1), claim: OgsClaimSchema }),
]);

const MeldViewSchema = z.object({
  id: z.string(),
  owner: z.number(),
  kind: z.enum(["run", "set"]),
  /** Runs: the value of cards[0] (1 = low Ace … 14 = high Ace) and the suit. Sets: the rank. */
  low: z.number().nullable(),
  suit: SuitSchema.nullable(),
  rank: z.number().nullable(),
  cards: z.array(CardSchema),
});

export const SeatViewSchema = z.object({
  name: z.string(),
  avatar: z.string().nullable(),
  cards: z.number(),
  down: z.boolean(),
  buys: z.number(),
  /** The household's label (OGS multiCouch), null with one household. */
  couch: z.string().nullable(),
});

const LogSchema = z.object({ seq: z.number(), seat: z.number().nullable(), text: z.string(), kind: z.string() });

// Client-visible context. Types in room.types.ts are inferred from these, and the boot payload each
// page receives is parsed with them.
export const RoomPublicContextSchema = z.object({
  roomCode: z.string(),
  seats: z.array(SeatViewSchema),
  hostSeat: z.number().nullable(),
  canStart: z.boolean(),
  round: z.number(),
  requirement: z.object({ runs: z.number(), sets: z.number(), text: z.string(), name: z.string() }).nullable(),
  dealer: z.number().nullable(),
  cutter: z.number().nullable(),
  cut: z.object({ seat: z.number(), card: CardSchema, kept: z.boolean(), seq: z.number() }).nullable(),
  turn: z.number().nullable(),
  turnPhase: z.enum(["draw", "offer", "play", "out"]).nullable(),
  deckCount: z.number(),
  discardTop: CardSchema.nullable(),
  discardCount: z.number(),
  /** The buy window: open until `endsAt` (ms since epoch); seats asking to buy, in asking order. */
  window: z.object({ endsAt: z.number(), requests: z.array(z.number()) }).nullable(),
  /** The window closed with requests: the turn player takes the discard or lets `buyer` have it. */
  offer: z.object({ requests: z.array(z.number()), buyer: z.number() }).nullable(),
  melds: z.array(MeldViewSchema),
  log: z.array(LogSchema),
  /** Per finished round, each seat's points. */
  scores: z.array(z.array(z.number())),
  totals: z.array(z.number()),
  roundWinner: z.number().nullable(),
  winners: z.array(z.number()),
  gameNumber: z.number(),
  households: z.array(z.object({ sid: z.string(), label: z.string(), away: z.boolean(), seats: z.array(z.number()) })),
});

export const PlayerViewSchema = z.object({
  seat: z.number(),
  isHost: z.boolean(),
  hand: z.array(CardSchema),
  myTurn: z.boolean(),
  /** May ask to buy the top discard right now. */
  canBuy: z.boolean(),
  buyRequested: z.boolean(),
  mustCut: z.boolean(),
  oops: z.object({ line: z.string(), seq: z.number() }).nullable(),
});

export const RoomPrivateContextSchema = z.object({
  role: z.enum(["tv", "player"]).optional(),
  player: PlayerViewSchema.optional(),
});

export const RoomStateValueSchema = z.union([
  z.enum(["lobby", "cutting", "roundOver", "gameOver"]),
  z.object({ playing: z.enum(["acting", "window"]) }),
]);

export const BootSchema = z.object({
  host: z.string(),
  roomCode: z.string(),
  accessToken: z.string(),
  checksum: z.string(),
  snapshot: z.object({
    public: RoomPublicContextSchema,
    private: RoomPrivateContextSchema,
    value: RoomStateValueSchema,
  }),
});
