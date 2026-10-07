import type {
  ActorKitSystemEvent,
  BaseActorKitEvent,
  WithActorKitEvent,
  WithActorKitInput,
} from "actor-kit";
import { z } from "zod";
import { Env } from "./env";
import { 
  GameClientEventSchema, 
  GameInputPropsSchema, 
  GameServiceEventSchema,
  PublicGameActionSchema,
  PrivateGameActionSchema,
} from "./game.schemas";

// Core game types
export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

// Basic card representation - standard playing card
export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

// Jokers can substitute for any card in a run or set
export interface Joker {
  id: string;
  isJoker: true;
}

export type PlayableCard = Card | Joker;

// Requirements for each round - combinations of runs and sets needed to "go down"
export interface RoundRequirement {
  runs: number;  // Number of runs needed (4+ consecutive cards of same suit)
  sets: number;  // Number of sets needed (3+ cards of same rank)
}

// Seven rounds with increasing difficulty
export const ROUND_REQUIREMENTS: RoundRequirement[] = [
  { runs: 1, sets: 1 }, // Round 1: One Run, One Set
  { runs: 0, sets: 2 }, // Round 2: Two Sets
  { runs: 2, sets: 0 }, // Round 3: Two Runs
  { runs: 1, sets: 2 }, // Round 4: Two Sets, One Run
  { runs: 2, sets: 1 }, // Round 5: Two Runs, One Set
  { runs: 0, sets: 3 }, // Round 6: Three Sets
  { runs: 3, sets: 0 }, // Round 7: Three Runs
];

// Game progression phases
export type GamePhase = 
  | "lobby"     // Players joining, waiting to start
  | "dealing"   // Dealing 11 cards to each player
  | "playing"   // Active gameplay
  | "roundEnd"  // Scoring phase between rounds
  | "finished"; // Game complete

// Input Types
export type GameInputProps = z.infer<typeof GameInputPropsSchema>;
export type GameInput = WithActorKitInput<GameInputProps>;

// Event Types
export type GameClientEvent = z.infer<typeof GameClientEventSchema>;
export type GameServiceEvent = z.infer<typeof GameServiceEventSchema>;
export type GameEvent = (
  | WithActorKitEvent<GameClientEvent, "client">
  | WithActorKitEvent<GameServiceEvent, "service">
  | ActorKitSystemEvent
) &
  BaseActorKitEvent<Env>;

// Infer action types from schemas
export type PublicGameAction = z.infer<typeof PublicGameActionSchema>;
export type PrivateGameAction = z.infer<typeof PrivateGameActionSchema>;

// Public game state visible to all players
export type GamePublicContext = {
  id: string;
  gameCode?: string;
  hostId: string;
  hostName: string;
  players: Array<{
    id: string;
    name: string;
    score: number;
    hand: PlayableCard[];
    isDown: boolean;
    buyCount: number;
    runs: PlayableCard[][];
    sets: PlayableCard[][];
  }>;
  gamePhase: GamePhase;
  currentRound: number;
  roundRequirements: RoundRequirement;
  currentTurn: string | null;
  turnPhase: "draw" | "play" | "discard" | null;
  discardPile: PlayableCard[];
  visiblePlays: Array<{
    id: string;
    playerId: string;
    type: "run" | "set";
    cards: PlayableCard[];
    timestamp: number;
    addedCards?: Array<{
      cards: PlayableCard[];
      playerId: string;
      timestamp: number;
    }>;
  }>;
  winner: string | null;
  settings: {
    maxPlayers: number;
  };
  actionHistory: PublicGameAction[];
  // Add scores to track round-by-round scores
  scores: {
    [round in Round]?: {
      [playerId: string]: number;
    } | null;
  };
};

// Private state for each player
export type GamePrivateContext = {
  drawPile: PlayableCard[];
  privateActions: PrivateGameAction[]; // Using inferred type
};

export type GameServerContext = {
  public: GamePublicContext;
  private: Record<string, GamePrivateContext>;
};

// Extract Player type from GamePublicContext
export type Player = GamePublicContext['players'][number];

// Add Round type
export const ROUNDS = [
  "1R1S",  // One Run, One Set
  "2S",    // Two Sets
  "2R",    // Two Runs
  "2R1S",  // Two Runs, One Set
  "2S1R",  // Two Sets, One Run
  "3S",    // Three Sets
  "3R",    // Three Runs
] as const;

export type Round = typeof ROUNDS[number];
