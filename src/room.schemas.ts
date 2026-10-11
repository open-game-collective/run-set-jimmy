import { z } from "zod";

export const RoomInputSchema = z.object({
  /** The room code (4 letters). */
  code: z.string().regex(/^[A-Z]{4}$/),
  /** The caller id of the TV page that made the room. */
  tvId: z.string().min(1).max(80),
});

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

export const RoomClientEventSchema = z.discriminatedUnion("type", [
  Payloads.JOIN.extend({ type: z.literal("JOIN") }),
  Payloads.START.extend({ type: z.literal("START") }),
  Payloads.ADD_AI.extend({ type: z.literal("ADD_AI") }),
  Payloads.MOVE_SEAT.extend({ type: z.literal("MOVE_SEAT") }),
  Payloads.REMOVE_SEAT.extend({ type: z.literal("REMOVE_SEAT") }),
  Payloads.CUT.extend({ type: z.literal("CUT") }),
  Payloads.DRAW.extend({ type: z.literal("DRAW") }),
  Payloads.BUY.extend({ type: z.literal("BUY") }),
  Payloads.ANSWER.extend({ type: z.literal("ANSWER") }),
  Payloads.GO_DOWN.extend({ type: z.literal("GO_DOWN") }),
  Payloads.PLAY_ON.extend({ type: z.literal("PLAY_ON") }),
  Payloads.DISCARD.extend({ type: z.literal("DISCARD") }),
  Payloads.NEXT_ROUND.extend({ type: z.literal("NEXT_ROUND") }),
  Payloads.NEW_GAME.extend({ type: z.literal("NEW_GAME") }),
  Payloads.AWAY.extend({ type: z.literal("AWAY") }),
]);

/** OGS: who a caller is (verified game token, worker.ts) and which couch they sit on. */
export const OgsClaimSchema = z.object({
  profileId: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  avatar: z.string().max(500),
  couch: z.object({ sid: z.string().min(1).max(100), label: z.string().min(1).max(60) }).nullable(),
});

/** Only the OGS service (worker.ts, after verifying a game token) says who a caller is. */
export const OgsClaimPayload = z.object({ callerId: z.string().min(1), claim: OgsClaimSchema });

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
  /** An AI player the room plays itself. */
  ai: z.boolean(),
});

const LogSchema = z.object({ seq: z.number(), seat: z.number().nullable(), text: z.string(), kind: z.string() });

// What every screen sees. Types in room.types.ts are inferred from these; the client parses each
// view it receives (src/room.wire.ts) into these shapes.
export const RoomPublicContextSchema = z.object({
  roomCode: z.string(),
  seats: z.array(SeatViewSchema),
  hostSeat: z.number().nullable(),
  canStart: z.boolean(),
  round: z.number(),
  requirement: z.object({ runs: z.number(), sets: z.number(), text: z.string(), name: z.string() }).nullable(),
  dealer: z.number().nullable(),
  cutter: z.number().nullable(),
  /** While cutting: when the room cuts for the cutter (ms since epoch). */
  cutEndsAt: z.number().nullable(),
  /** When an AI player acts next (ms since epoch). */
  aiActAt: z.number().nullable(),
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

/** What the Worker inlines into a TV or phone page: the caller's signed id and its first view. */
export const BootSchema = z.object({
  roomCode: z.string(),
  /** The caller id (the page's `t`) and its signature: the socket URL carries both (worker.ts). */
  id: z.string(),
  sig: z.string(),
  /** The view as the room sent it (src/room.wire.ts parses it). */
  view: z.unknown(),
});
