import type { Meta, StoryObj } from "@storybook/react";
import { withActorKit } from "actor-kit/storybook";
import { SpectatorView } from "../app/components/spectator-view";
import { GameContext } from "../app/game.context";
import type { GameMachine } from "../app/game.machine";
import { defaultGameSnapshot } from "./utils";

const meta = {
  title: "Views/SpectatorView",
  component: SpectatorView,
  parameters: {
    layout: "fullscreen",
    viewport: {
      defaultViewport: "tablet",
      defaultOrientation: "landscape",
    }
  },
  decorators: [
    withActorKit<GameMachine>({
      actorType: "game",
      context: GameContext,
    }),
  ],
} satisfies Meta<typeof SpectatorView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InGame: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-1",
            players: [
              { 
                id: "host-123", 
                name: "Host", 
                score: 0, 
                hand: [
                  { suit: "hearts", rank: "A" },
                  { suit: "diamonds", rank: "2" },
                  { suit: "clubs", rank: "3" },
                ],
                isDown: false,
                buyCount: 0,
              },
              { 
                id: "player-1", 
                name: "Player 1", 
                score: 0, 
                hand: [
                  { suit: "spades", rank: "K" },
                  { suit: "hearts", rank: "Q" },
                ],
                isDown: true,
                buyCount: 0,
              },
            ],
          },
        },
      },
    },
  },
};

export const PlayerDown: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-2",
            players: [
              { 
                id: "host-123", 
                name: "Host", 
                score: 0, 
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["hearts", "diamonds", "clubs", "spades"][i % 4],
                  rank: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][i % 13],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { 
                id: "player-1", 
                name: "Player 1", 
                score: 0, 
                hand: [
                  { suit: "spades", rank: "K" },
                  { suit: "hearts", rank: "Q" },
                ],
                isDown: true,
                buyCount: 0,
                runs: [
                  // A run of hearts
                  [
                    { suit: "hearts", rank: "7" },
                    { suit: "hearts", rank: "8" },
                    { suit: "hearts", rank: "9" },
                  ],
                  // A run of clubs
                  [
                    { suit: "clubs", rank: "4" },
                    { suit: "clubs", rank: "5" },
                    { suit: "clubs", rank: "6" },
                  ],
                ],
                sets: [
                  // A set of Jacks
                  [
                    { suit: "diamonds", rank: "J" },
                    { suit: "clubs", rank: "J" },
                    { suit: "spades", rank: "J" },
                  ],
                ],
              },
              { 
                id: "player-2", 
                name: "Player 2", 
                score: 0, 
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["hearts", "diamonds", "clubs", "spades"][i % 4],
                  rank: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][i % 13],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
            ],
          },
        },
      },
    },
  },
};

export const EightPlayers: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-3",
            round: "1R1S",
            players: [
              { 
                id: "host-123", 
                name: "Host", 
                score: 50,
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["hearts", "diamonds"][i % 2],
                  rank: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { 
                id: "player-1", 
                name: "Alice", 
                score: 30,
                hand: [{ suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 0,
                runs: [
                  [
                    { suit: "hearts", rank: "4" },
                    { suit: "hearts", rank: "5" },
                    { suit: "hearts", rank: "6" },
                  ],
                ],
                sets: [
                  [
                    { suit: "diamonds", rank: "Q" },
                    { suit: "clubs", rank: "Q" },
                    { suit: "spades", rank: "Q" },
                  ],
                ],
              },
              { 
                id: "player-2", 
                name: "Bob", 
                score: 40,
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["clubs", "spades"][i % 2],
                  rank: ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3"][i],
                })),
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
              { 
                id: "player-3", 
                name: "Charlie", 
                score: 35,
                hand: [{ suit: "diamonds", rank: "2" }],
                isDown: true,
                buyCount: 2,
                runs: [
                  [
                    { suit: "diamonds", rank: "7" },
                    { suit: "diamonds", rank: "8" },
                    { suit: "diamonds", rank: "9" },
                    { suit: "diamonds", rank: "10" },
                  ],
                ],
                sets: [
                  [
                    { suit: "hearts", rank: "K" },
                    { suit: "diamonds", rank: "K" },
                    { suit: "spades", rank: "K" },
                  ],
                ],
              },
              { 
                id: "player-4", 
                name: "Diana", 
                score: 45,
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["hearts", "clubs"][i % 2],
                  rank: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { 
                id: "player-5", 
                name: "Ethan", 
                score: 25,
                hand: [{ suit: "clubs", rank: "A" }],
                isDown: true,
                buyCount: 1,
                runs: [
                  [
                    { suit: "spades", rank: "8" },
                    { suit: "spades", rank: "9" },
                    { suit: "spades", rank: "10" },
                  ],
                ],
                sets: [
                  [
                    { suit: "hearts", rank: "3" },
                    { suit: "diamonds", rank: "3" },
                    { suit: "clubs", rank: "3" },
                  ],
                ],
              },
              { 
                id: "player-6", 
                name: "Fiona", 
                score: 0,
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["diamonds", "spades"][i % 2],
                  rank: ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4"][i],
                })),
                isDown: false,
                buyCount: 3,
                runs: [],
                sets: [],
              },
              { 
                id: "player-7", 
                name: "George", 
                score: 0,
                hand: Array(11).fill(null).map((_, i) => ({
                  suit: ["clubs", "hearts"][i % 2],
                  rank: ["5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
            ],
            scores: {
              "1R1S": { "host-123": 50, "player-1": 30, "player-2": 40, "player-3": 35, "player-4": 45, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2S": { "host-123": 40, "player-1": 45, "player-2": 30, "player-3": 35, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2R": { "host-123": 35, "player-1": 25, "player-2": 30, "player-3": 30, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2R1S": null,
              "2S1R": null,
              "3R": null,
              "3S": null,
            }
          },
        },
      },
    },
  },
};

export const ComplexGame: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-3",
            round: "3R",
            players: [
              { // Host
                id: "host-123", 
                name: "Host", 
                score: 50,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["hearts", "diamonds"][i % 2],
                  rank: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { // Alice
                id: "player-1", 
                name: "Alice", 
                score: 30,
                hand: [{ type: 'standard', suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 0,
                runs: [
                  [
                    { type: 'standard', suit: "hearts", rank: "4" },
                    { type: 'standard', suit: "hearts", rank: "5" },
                    { type: 'standard', suit: "hearts", rank: "6" },
                    { type: 'standard', suit: "hearts", rank: "7" },
                  ],
                ],
                sets: [
                  [
                    { type: 'standard', suit: "diamonds", rank: "Q" },
                    { type: 'standard', suit: "clubs", rank: "Q" },
                    { type: 'standard', suit: "spades", rank: "Q" },
                  ],
                ],
              },
              { // Bob
                id: "player-2", 
                name: "Bob", 
                score: 40,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["clubs", "spades"][i % 2],
                  rank: ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3"][i],
                })),
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
              { // Charlie
                id: "player-3", 
                name: "Charlie", 
                score: 35,
                hand: [{ type: 'standard', suit: "diamonds", rank: "2" }],
                isDown: true,
                buyCount: 2,
                runs: [
                  [
                    { type: 'standard', suit: "diamonds", rank: "7" },
                    { type: 'standard', suit: "diamonds", rank: "8" },
                    { type: 'standard', suit: "diamonds", rank: "9" },
                    { type: 'standard', suit: "diamonds", rank: "10" },
                  ],
                ],
                sets: [
                  [
                    { type: 'standard', suit: "hearts", rank: "K" },
                    { type: 'standard', suit: "diamonds", rank: "K" },
                    { type: 'standard', suit: "spades", rank: "K" },
                  ],
                ],
              },
              { // Diana
                id: "player-4", 
                name: "Diana", 
                score: 45,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["hearts", "clubs"][i % 2],
                  rank: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { // Ethan
                id: "player-5", 
                name: "Ethan", 
                score: 25,
                hand: [{ type: 'standard', suit: "clubs", rank: "A" }],
                isDown: true,
                buyCount: 1,
                runs: [
                  [
                    { type: 'standard', suit: "spades", rank: "8" },
                    { type: 'standard', suit: "spades", rank: "9" },
                    { type: 'standard', suit: "spades", rank: "10" },
                    { type: 'standard', suit: "spades", rank: "J" },
                  ],
                ],
                sets: [
                  [
                    { type: 'standard', suit: "hearts", rank: "3" },
                    { type: 'standard', suit: "diamonds", rank: "3" },
                    { type: 'standard', suit: "clubs", rank: "3" },
                  ],
                ],
              },
              { // Fiona
                id: "player-6", 
                name: "Fiona", 
                score: 0,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["diamonds", "spades"][i % 2],
                  rank: ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4"][i],
                })),
                isDown: false,
                buyCount: 3,
                runs: [],
                sets: [],
              },
              { // George
                id: "player-7", 
                name: "George", 
                score: 0,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["clubs", "hearts"][i % 2],
                  rank: ["5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
            ],
            scores: {
              "1R1S": { "host-123": 50, "player-1": 30, "player-2": 40, "player-3": 35, "player-4": 45, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2S": { "host-123": 40, "player-1": 45, "player-2": 30, "player-3": 35, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2R": { "host-123": 35, "player-1": 25, "player-2": 30, "player-3": 30, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "3R": null,
              "2R1S": null,
              "3S": null,
            }
          },
        },
      },
    },
  },
};

export const TwoRunsOneSet: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-3",
            round: "2R1S",
            players: [
              { // Host
                id: "host-123", 
                name: "Host", 
                score: 50,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["hearts", "diamonds"][i % 2],
                  rank: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { // Alice - Down with 2 runs and 1 set
                id: "player-1", 
                name: "Alice", 
                score: 30,
                hand: [{ type: 'standard', suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 0,
                runs: [
                  [
                    { type: 'standard', suit: "hearts", rank: "4" },
                    { type: 'standard', suit: "hearts", rank: "5" },
                    { type: 'standard', suit: "hearts", rank: "6" },
                    { type: 'standard', suit: "hearts", rank: "7" },
                  ],
                  [
                    { type: 'standard', suit: "diamonds", rank: "8" },
                    { type: 'standard', suit: "diamonds", rank: "9" },
                    { type: 'standard', suit: "diamonds", rank: "10" },
                    { type: 'standard', suit: "diamonds", rank: "J" },
                  ],
                ],
                sets: [
                  [
                    { type: 'standard', suit: "diamonds", rank: "Q" },
                    { type: 'standard', suit: "clubs", rank: "Q" },
                    { type: 'standard', suit: "spades", rank: "Q" },
                  ],
                ],
              },
              // ... rest of players similar to ComplexGame ...
            ],
            scores: {
              "1R1S": { "host-123": 50, "player-1": 30, "player-2": 40, "player-3": 35, "player-4": 45, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2S": { "host-123": 40, "player-1": 45, "player-2": 30, "player-3": 35, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2R": { "host-123": 35, "player-1": 25, "player-2": 30, "player-3": 30, "player-4": 30, "player-5": 25, "player-6": 0, "player-7": 0 },
              "2S1R": null,
              "2R1S": null,
              "3S": null,
              "3R": null,
            }
          },
        },
      },
    },
  },
};

export const TwoSets: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-2",
            round: "2S",
            players: [
              { // Host
                id: "host-123", 
                name: "Host", 
                score: 40,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["hearts", "diamonds"][i % 2],
                  rank: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"][i],
                })),
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
              { // Player down with two sets
                id: "player-1", 
                name: "Alice", 
                score: 35,
                hand: [{ type: 'standard', suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 0,
                runs: [],
                sets: [
                  [
                    { type: 'standard', suit: "diamonds", rank: "Q" },
                    { type: 'standard', suit: "clubs", rank: "Q" },
                    { type: 'standard', suit: "spades", rank: "Q" },
                  ],
                  [
                    { type: 'standard', suit: "hearts", rank: "7" },
                    { type: 'standard', suit: "diamonds", rank: "7" },
                    { type: 'standard', suit: "clubs", rank: "7" },
                  ],
                ],
              },
              { // Player with joker
                id: "player-2", 
                name: "Bob", 
                score: 30,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["clubs", "spades"][i % 2],
                  rank: ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3"][i],
                })),
                isDown: false,
                buyCount: 2,
                runs: [],
                sets: [],
              },
            ],
            scores: {
              "1R1S": { "host-123": 50, "player-1": 35, "player-2": 30 },
              "2S": null,
              "2R": null,
              "2S1R": null,
              "2R1S": null,
              "3R": null,
              "3S": null,
            }
          },
        },
      },
    },
  },
};

export const ThreeSets: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            currentTurn: "player-3",
            round: "3S",
            players: [
              { // Host
                id: "host-123", 
                name: "Host", 
                score: 45,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["hearts", "diamonds"][i % 2],
                  rank: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J"][i],
                })),
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              { // Player with three sets
                id: "player-1", 
                name: "Alice", 
                score: 40,
                hand: [{ type: 'standard', suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 1,
                runs: [],
                sets: [
                  [
                    { type: 'standard', suit: "diamonds", rank: "A" },
                    { type: 'standard', suit: "clubs", rank: "A" },
                    { type: 'standard', suit: "spades", rank: "A" },
                  ],
                  [
                    { type: 'standard', suit: "hearts", rank: "7" },
                    { type: 'standard', suit: "diamonds", rank: "7" },
                    { type: 'standard', suit: "clubs", rank: "7" },
                  ],
                  [
                    { type: 'standard', suit: "hearts", rank: "J" },
                    { type: 'standard', suit: "diamonds", rank: "J" },
                    { type: 'joker' },
                  ],
                ],
              },
              { // Player 2
                id: "player-2", 
                name: "Bob", 
                score: 35,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["clubs", "spades"][i % 2],
                  rank: ["K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3"][i],
                })),
                isDown: false,
                buyCount: 2,
                runs: [],
                sets: [],
              },
              { // Player 3
                id: "player-3", 
                name: "Charlie", 
                score: 30,
                hand: Array(11).fill(null).map((_, i) => ({
                  type: 'standard',
                  suit: ["diamonds", "hearts"][i % 2],
                  rank: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q"][i],
                })),
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
            ],
            scores: {
              "1R1S": { "host-123": 45, "player-1": 40, "player-2": 35, "player-3": 30 },
              "2S": { "host-123": 40, "player-1": 35, "player-2": 30, "player-3": 25 },
              "2R": { "host-123": 35, "player-1": 30, "player-2": 25, "player-3": 20 },
              "2S1R": { "host-123": 25, "player-1": 20, "player-2": 15, "player-3": 10 },
              "2R1S": null,
              "3S": null,
              "3R": null,
            }
          },
        },
      },
    },
  },
};
