/**
 * The room's views on the wire (actor-kit binary schemas) and their way back into the shapes the
 * screens use (room.schemas.ts). Every role gets the same schema: the table, plus `me` (the
 * caller's own seat and hand) for a seated player and null for everyone else.
 *
 * Binary schemas have no unions yet (actor-kit ADR-019 C), so a card travels flat (`joker`, and
 * `suit`/`rank` empty for a joker) and `value` is the phase path as a string. Browser-safe.
 */
import { array, boolean, float64, nullable, schema, string, uint8, uint16, uint32, type Infer } from "@actor-kit/core";
import { z } from "zod";
import type { Card } from "./game/cards";
import { PlayerViewSchema, RoomPublicContextSchema } from "./room.schemas";
import type { PlayerView, RoomPrivateContext, RoomPublicContext, RoomStateValue } from "./room.types";

const CardW = schema({ id: string, joker: boolean, suit: string, rank: uint8 });
const SeatW = schema({ name: string, avatar: nullable(string), cards: uint8, down: boolean, buys: uint8, couch: nullable(string), ai: boolean });
const MeldW = schema({
  id: string,
  owner: uint8,
  kind: string,
  low: nullable(uint8),
  suit: nullable(string),
  rank: nullable(uint8),
  cards: array(CardW),
});
const LogW = schema({ seq: uint32, seat: nullable(uint8), text: string, kind: string });
const HouseholdW = schema({ sid: string, label: string, away: boolean, seats: array(uint8) });
const PlayerW = schema({
  seat: uint8,
  isHost: boolean,
  hand: array(CardW),
  myTurn: boolean,
  canBuy: boolean,
  buyRequested: boolean,
  mustCut: boolean,
  oops: nullable(schema({ line: string, seq: uint32 })),
});

export const RoomViewSchema = schema({
  /** "tv" | "player" | "guest" | "service". */
  role: string,
  /** The phase: "lobby", "cutting", "playing.window", "playing.acting", "roundOver", "gameOver". */
  value: string,
  roomCode: string,
  seats: array(SeatW),
  hostSeat: nullable(uint8),
  canStart: boolean,
  round: uint8,
  requirement: nullable(schema({ runs: uint8, sets: uint8, text: string, name: string })),
  dealer: nullable(uint8),
  cutter: nullable(uint8),
  cutEndsAt: nullable(float64),
  aiActAt: nullable(float64),
  cut: nullable(schema({ seat: uint8, card: CardW, kept: boolean, seq: uint32 })),
  turn: nullable(uint8),
  turnPhase: nullable(string),
  deckCount: uint16,
  discardTop: nullable(CardW),
  discardCount: uint16,
  window: nullable(schema({ endsAt: float64, requests: array(uint8) })),
  offer: nullable(schema({ requests: array(uint8), buyer: uint8 })),
  melds: array(MeldW),
  log: array(LogW),
  scores: array(array(uint16)),
  totals: array(uint16),
  roundWinner: nullable(uint8),
  winners: array(uint8),
  gameNumber: uint16,
  households: array(HouseholdW),
  me: nullable(PlayerW),
});

export type RoomWireView = Infer<typeof RoomViewSchema>;
type CardWire = RoomWireView["melds"][number]["cards"][number];

const cardToWire = (card: Card): CardWire =>
  card.kind === "joker" ? { id: card.id, joker: true, suit: "", rank: 0 } : { id: card.id, joker: false, suit: card.suit, rank: card.rank };

/** The table (and the caller's own seat) as one wire view. */
export function toWire(role: string, value: RoomStateValue, pub: RoomPublicContext, me: PlayerView | null): RoomWireView {
  return {
    role,
    value: typeof value === "string" ? value : `playing.${value.playing}`,
    ...pub,
    requirement: pub.requirement,
    cut: pub.cut && { ...pub.cut, card: cardToWire(pub.cut.card) },
    discardTop: pub.discardTop && cardToWire(pub.discardTop),
    melds: pub.melds.map((m) => ({ ...m, cards: m.cards.map(cardToWire) })),
    me: me && { ...me, hand: me.hand.map(cardToWire) },
  };
}

// --- Back from the wire (the client, and tests reading what a caller sees) ---

const CardWireZ = z.object({ id: z.string(), joker: z.boolean(), suit: z.string(), rank: z.number() });
const n = z.number();
const PlayerWireZ = z.object({
  seat: n,
  isHost: z.boolean(),
  hand: z.array(CardWireZ),
  myTurn: z.boolean(),
  canBuy: z.boolean(),
  buyRequested: z.boolean(),
  mustCut: z.boolean(),
  oops: z.object({ line: z.string(), seq: n }).nullable(),
});

/** The wire view exactly as RoomViewSchema carries it (boot JSON, or a decoded frame). */
export const RoomWireViewZ = z.object({
  role: z.string(),
  value: z.string(),
  roomCode: z.string(),
  seats: z.array(z.object({ name: z.string(), avatar: z.string().nullable(), cards: n, down: z.boolean(), buys: n, couch: z.string().nullable(), ai: z.boolean() })),
  hostSeat: n.nullable(),
  canStart: z.boolean(),
  round: n,
  requirement: z.object({ runs: n, sets: n, text: z.string(), name: z.string() }).nullable(),
  dealer: n.nullable(),
  cutter: n.nullable(),
  cutEndsAt: n.nullable(),
  aiActAt: n.nullable(),
  cut: z.object({ seat: n, card: CardWireZ, kept: z.boolean(), seq: n }).nullable(),
  turn: n.nullable(),
  turnPhase: z.string().nullable(),
  deckCount: n,
  discardTop: CardWireZ.nullable(),
  discardCount: n,
  window: z.object({ endsAt: n, requests: z.array(n) }).nullable(),
  offer: z.object({ requests: z.array(n), buyer: n }).nullable(),
  melds: z.array(
    z.object({ id: z.string(), owner: n, kind: z.string(), low: n.nullable(), suit: z.string().nullable(), rank: n.nullable(), cards: z.array(CardWireZ) }),
  ),
  log: z.array(z.object({ seq: n, seat: n.nullable(), text: z.string(), kind: z.string() })),
  scores: z.array(z.array(n)),
  totals: z.array(n),
  roundWinner: n.nullable(),
  winners: z.array(n),
  gameNumber: n,
  households: z.array(z.object({ sid: z.string(), label: z.string(), away: z.boolean(), seats: z.array(n) })),
  me: PlayerWireZ.nullable(),
});

const cardFromWire = (c: CardWire): unknown => (c.joker ? { id: c.id, kind: "joker" } : { id: c.id, kind: "card", suit: c.suit, rank: c.rank });

const VALUES: Record<string, RoomStateValue> = {
  lobby: "lobby",
  cutting: "cutting",
  roundOver: "roundOver",
  gameOver: "gameOver",
  "playing.window": { playing: "window" },
  "playing.acting": { playing: "acting" },
};

function valueFromWire(v: string): RoomStateValue {
  const value = VALUES[v];
  if (value === undefined) throw new Error(`unknown phase ${v}`);
  return value;
}

/** What the screens read: the phase, the table, and the caller's own slot (as before actor-kit v2). */
export type RoomSnapshot = { value: RoomStateValue; public: RoomPublicContext; private: RoomPrivateContext };

const privateOf = (role: string, me: PlayerView | null): RoomPrivateContext => {
  if (role === "tv") return { role: "tv" };
  if (role === "player" && me) return { role: "player", player: me };
  return {};
};

/** A wire view back into the screens' shapes, checked by the same schemas the room's views follow. */
export function fromWire(raw: unknown): RoomSnapshot {
  const { role, value, me, ...wire } = RoomWireViewZ.parse(raw);
  const pub = RoomPublicContextSchema.parse({
    ...wire,
    cut: wire.cut && { ...wire.cut, card: cardFromWire(wire.cut.card) },
    discardTop: wire.discardTop && cardFromWire(wire.discardTop),
    melds: wire.melds.map((m) => ({ ...m, cards: m.cards.map(cardFromWire) })),
  });
  const player = me && PlayerViewSchema.parse({ ...me, hand: me.hand.map(cardFromWire) });
  return { value: valueFromWire(value), public: pub, private: privateOf(role, player) };
}
