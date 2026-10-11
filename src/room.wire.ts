/**
 * What every screen receives: the phase, the table, and the caller's own slot, as one actor-kit
 * binary schema (the same for every role). The screens read it as it arrives; the schema itself
 * validates the view the Worker inlines into a page. No zod here: this module is in the browser.
 */
import { array, boolean, enumOf, float64, nullable, schema, string, type Infer, uint8, uint16, uint32, union } from "@actor-kit/core";

const Card = union("kind", {
  card: schema({ id: string, suit: enumOf(["S", "H", "D", "C"]), rank: uint8 }),
  joker: schema({ id: string }),
});

const Seat = schema({ name: string, avatar: nullable(string), cards: uint8, down: boolean, buys: uint8, couch: nullable(string), ai: boolean });
const Meld = schema({
  id: string,
  owner: uint8,
  kind: enumOf(["run", "set"]),
  /** Runs: the value of cards[0] (1 = low Ace … 14 = high Ace) and the suit. Sets: the rank. */
  low: nullable(uint8),
  suit: nullable(enumOf(["S", "H", "D", "C"])),
  rank: nullable(uint8),
  cards: array(Card),
});

export const PublicSchema = schema({
  roomCode: string,
  seats: array(Seat),
  hostSeat: nullable(uint8),
  canStart: boolean,
  round: uint8,
  requirement: nullable(schema({ runs: uint8, sets: uint8, text: string, name: string })),
  dealer: nullable(uint8),
  cutter: nullable(uint8),
  /** While cutting: when the room cuts for the cutter (ms since epoch). */
  cutEndsAt: nullable(float64),
  /** When an AI player acts next (ms since epoch). */
  aiActAt: nullable(float64),
  cut: nullable(schema({ seat: uint8, card: Card, kept: boolean, seq: uint32 })),
  turn: nullable(uint8),
  turnPhase: nullable(enumOf(["draw", "offer", "play", "out"])),
  deckCount: uint16,
  discardTop: nullable(Card),
  discardCount: uint16,
  /** The buy window: open until `endsAt` (ms since epoch); seats asking to buy, in asking order. */
  window: nullable(schema({ endsAt: float64, requests: array(uint8) })),
  /** The window closed with requests: the turn player takes the discard or lets `buyer` have it. */
  offer: nullable(schema({ requests: array(uint8), buyer: uint8 })),
  melds: array(Meld),
  log: array(schema({ seq: uint32, seat: nullable(uint8), text: string, kind: string })),
  /** Per finished round, each seat's points. */
  scores: array(array(uint16)),
  totals: array(uint16),
  roundWinner: nullable(uint8),
  winners: array(uint8),
  gameNumber: uint16,
  households: array(schema({ sid: string, label: string, away: boolean, seats: array(uint8) })),
});

export const PlayerSchema = schema({
  seat: uint8,
  isHost: boolean,
  hand: array(Card),
  myTurn: boolean,
  /** May ask to buy the top discard right now. */
  canBuy: boolean,
  buyRequested: boolean,
  mustCut: boolean,
  oops: nullable(schema({ line: string, seq: uint32 })),
});

export const PHASES = ["lobby", "cutting", "playing.window", "playing.acting", "roundOver", "gameOver"] as const;

export const RoomViewSchema = schema({
  value: enumOf(PHASES),
  public: PublicSchema,
  /** The caller's own slot: a seated phone's seat and hand (null for the TV, guests and services). */
  private: schema({ role: enumOf(["service", "player", "tv", "guest"]), player: nullable(PlayerSchema) }),
});

export type RoomWireView = Infer<typeof RoomViewSchema>;
