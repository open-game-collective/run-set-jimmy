import { z } from "zod";

// Input Schema
export const GameInputPropsSchema = z.object({
  hostName: z.string(),
});

// Card Schemas
export const SuitSchema = z.enum(["hearts", "diamonds", "clubs", "spades"]);
export const RankSchema = z.enum(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);

export const CardSchema = z.object({
  suit: SuitSchema,
  rank: RankSchema,
  id: z.string(),
});

export const JokerSchema = z.object({
  id: z.string(),
  isJoker: z.literal(true),
});

export const PlayableCardSchema = z.union([CardSchema, JokerSchema]);

// Event Schemas
export const GameClientEventSchema = z.discriminatedUnion("type", [
  // Host Events
  z.object({
    type: z.literal("START_GAME"),
  }),
  z.object({
    type: z.literal("END_GAME"),
  }),

  // Player Events
  z.object({
    type: z.literal("JOIN_GAME"),
    playerName: z.string(),
  }),
  z.object({
    type: z.literal("PLAY_CARDS"),
    cards: z.array(PlayableCardSchema),
    playType: z.enum(["run", "set"]),
  }),
  z.object({
    type: z.literal("BUY_CARDS"),
  }),
  z.object({
    type: z.literal("DRAW_CARD"),
  }),
  z.object({
    type: z.literal("TAKE_DISCARD"),
  }),
  z.object({
    type: z.literal("DISCARD_CARD"),
    card: PlayableCardSchema,
  }),
  z.object({
    type: z.literal("GO_DOWN"),
    plays: z.array(z.object({
      cards: z.array(PlayableCardSchema),
      type: z.enum(["run", "set"]),
    })),
  }),
  z.object({
    type: z.literal("END_ROUND"),
  }),
  z.object({
    type: z.literal("REMOVE_PLAYER"),
    playerId: z.string(),
  }),
]);

// Public action schemas
export const PublicGameActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("discard"),
    playerId: z.string(),
    card: PlayableCardSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("buy"),
    playerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("draw"),
    playerId: z.string(),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("go_down"),
    playerId: z.string(),
    plays: z.array(z.object({
      type: z.enum(["run", "set"]),
      cards: z.array(PlayableCardSchema),
    })),
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("play_on_existing"),
    playerId: z.string(),
    playId: z.string(),
    cards: z.array(PlayableCardSchema),
    timestamp: z.number(),
  }),
]);

// Private action schemas
export const PrivateGameActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("draw"),
    card: PlayableCardSchema,
    timestamp: z.number(),
  }),
  z.object({
    type: z.literal("buy"),
    cards: z.tuple([PlayableCardSchema, PlayableCardSchema]),
    timestamp: z.number(),
  }),
]);

// Update GameServiceEventSchema to include history
export const GameServiceEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SYNC_GAME_STATE"),
    gameState: z.object({
      players: z.array(z.object({
        id: z.string(),
        name: z.string(),
        score: z.number(),
        hand: z.array(PlayableCardSchema),
        isDown: z.boolean(),
        buyCount: z.number(),
      })),
      discardPile: z.array(PlayableCardSchema),
      currentTurn: z.string().nullable(),
      gamePhase: z.enum(["lobby", "dealing", "playing", "roundEnd", "finished"]),
      currentRound: z.number(),
      actionHistory: z.array(PublicGameActionSchema),
      visiblePlays: z.array(z.object({
        id: z.string(),
        playerId: z.string(),
        type: z.enum(["run", "set"]),
        cards: z.array(PlayableCardSchema),
        timestamp: z.number(),
        addedCards: z.array(z.object({
          cards: z.array(PlayableCardSchema),
          playerId: z.string(),
          timestamp: z.number(),
        })).optional(),
      })),
    }),
  }),
]);
