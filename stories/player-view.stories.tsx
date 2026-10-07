import type { Meta, StoryObj } from "@storybook/react";
import { withActorKit } from "actor-kit/storybook";
import { PlayerView } from "../app/components/player-view";
import { GameContext } from "../app/game.context";
import type { GameMachine } from "../app/game.machine";
import { SessionContext } from "../app/session.context";
import type { SessionMachine } from "../app/session.machine";
import { defaultGameSnapshot, defaultSessionSnapshot } from "./utils";

const meta = {
  title: "Views/PlayerView",
  component: PlayerView,
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [
    withActorKit<GameMachine>({
      actorType: "game",
      context: GameContext,
    }),
    withActorKit<SessionMachine>({
      actorType: "session",
      context: SessionContext,
    }),
  ],
} satisfies Meta<typeof PlayerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewPlayer: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "new-player",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [],
          },
        },
      },
    },
  },
};

export const InGame: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            players: [
              {
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  { id: "1", suit: "hearts", rank: "A" },
                  { id: "2", suit: "diamonds", rank: "2" },
                  { id: "3", suit: "clubs", rank: "3" },
                  { id: "4", suit: "spades", rank: "K" },
                ],
                isDown: false,
                buyCount: 1,
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

export const PlayerDown: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          public: {
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            players: [
              {
                id: "player-1",
                name: "You",
                score: 0,
                hand: [{ id: "1", suit: "hearts", rank: "A" }],
                isDown: true,
                buyCount: 2,
                runs: [
                  [
                    { id: "2", suit: "diamonds", rank: "7" },
                    { id: "3", suit: "diamonds", rank: "8" },
                    { id: "4", suit: "diamonds", rank: "9" },
                    { id: "5", suit: "diamonds", rank: "10" },
                  ],
                ],
                sets: [
                  [
                    { id: "6", suit: "hearts", rank: "K" },
                    { id: "7", suit: "diamonds", rank: "K" },
                    { id: "8", suit: "spades", rank: "K" },
                  ],
                ],
              },
            ],
          },
        },
      },
    },
  },
};

export const MidGame: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            players: [
              {
                // Current player
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  { id: "1", suit: "hearts", rank: "A" },
                  { id: "2", suit: "diamonds", rank: "2" },
                  { id: "3", suit: "clubs", rank: "3" },
                ],
                isDown: false,
                buyCount: 2,
                runs: [],
                sets: [],
              },
              {
                // Player who is down
                id: "player-2",
                name: "Alice",
                score: 0,
                hand: [{ id: "4", suit: "spades", rank: "K" }],
                isDown: true,
                buyCount: 1,
                runs: [
                  [
                    { id: "5", suit: "hearts", rank: "4" },
                    { id: "6", suit: "hearts", rank: "5" },
                    { id: "7", suit: "hearts", rank: "6" },
                    { id: "8", suit: "hearts", rank: "7" },
                  ],
                ],
                sets: [
                  [
                    { id: "9", suit: "diamonds", rank: "Q" },
                    { id: "10", suit: "clubs", rank: "Q" },
                    { id: "11", suit: "spades", rank: "Q" },
                  ],
                ],
              },
              {
                // Player with lots of cards
                id: "player-3",
                name: "Bob",
                score: 0,
                hand: Array(15)
                  .fill(null)
                  .map((_, i) => ({
                    id: `bob-${i}`,
                    suit: ["hearts", "diamonds", "clubs", "spades"][i % 4],
                    rank: [
                      "A",
                      "2",
                      "3",
                      "4",
                      "5",
                      "6",
                      "7",
                      "8",
                      "9",
                      "10",
                      "J",
                      "Q",
                      "K",
                    ][i % 13],
                  })),
                isDown: false,
                buyCount: 3,
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

export const EndGame: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            players: [
              {
                // Winner
                id: "player-1",
                name: "You",
                score: 0,
                hand: [],
                isDown: true,
                buyCount: 0,
                runs: [
                  [
                    { id: "1", suit: "hearts", rank: "4" },
                    { id: "2", suit: "hearts", rank: "5" },
                    { id: "3", suit: "hearts", rank: "6" },
                    { id: "4", suit: "hearts", rank: "7" },
                  ],
                  [
                    { id: "5", suit: "diamonds", rank: "8" },
                    { id: "6", suit: "diamonds", rank: "9" },
                    { id: "7", suit: "diamonds", rank: "10" },
                    { id: "8", suit: "diamonds", rank: "J" },
                  ],
                  [
                    { id: "9", suit: "clubs", rank: "2" },
                    { id: "10", suit: "clubs", rank: "3" },
                    { id: "11", suit: "clubs", rank: "4" },
                    { id: "12", suit: "clubs", rank: "5" },
                  ],
                ],
                sets: [],
              },
              // ... add other players with remaining cards ...
            ],
          },
        },
      },
    },
  },
};

export const StartOfRound: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            round: "1R1S", // First round - need 1 run and 1 set
            players: [
              {
                // Current player with starting hand
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  { id: "1", suit: "hearts", rank: "4" },
                  { id: "2", suit: "hearts", rank: "5" },
                  { id: "3", suit: "hearts", rank: "6" },
                  { id: "4", suit: "diamonds", rank: "Q" },
                  { id: "5", suit: "clubs", rank: "Q" },
                  { id: "6", suit: "spades", rank: "Q" },
                  { id: "7", suit: "diamonds", rank: "2" },
                  { id: "8", suit: "clubs", rank: "7" },
                  { id: "9", suit: "spades", rank: "A" },
                  { id: "10", suit: "hearts", rank: "K" },
                  { id: "11", suit: "diamonds", rank: "3" },
                ],
                isDown: false,
                buyCount: 0,
                runs: [],
                sets: [],
              },
              // Add other players with 11 cards each
            ],
          },
        },
      },
    },
  },
};

export const AboutToGoDown: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            round: "2R", // Need two runs
            players: [
              {
                // Current player ready to go down
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  // First run
                  { id: "1", suit: "hearts", rank: "4" },
                  { id: "2", suit: "hearts", rank: "5" },
                  { id: "3", suit: "hearts", rank: "6" },
                  { id: "4", suit: "hearts", rank: "7" },
                  // Second run
                  { id: "5", suit: "diamonds", rank: "8" },
                  { id: "6", suit: "diamonds", rank: "9" },
                  { id: "7", suit: "diamonds", rank: "10" },
                  { id: "8", suit: "diamonds", rank: "J" },
                  // Extra cards
                  { id: "9", suit: "clubs", rank: "2" },
                  { id: "10", suit: "spades", rank: "K" },
                  { id: "11", suit: "hearts", rank: "A" },
                ],
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
              {
                // Another player who is down
                id: "player-2",
                name: "Alice",
                score: 0,
                hand: [{ id: "12", suit: "spades", rank: "3" }],
                isDown: true,
                buyCount: 2,
                runs: [
                  [
                    { id: "13", suit: "clubs", rank: "5" },
                    { id: "14", suit: "clubs", rank: "6" },
                    { id: "15", suit: "clubs", rank: "7" },
                    { id: "16", suit: "clubs", rank: "8" },
                  ],
                  [
                    { id: "17", suit: "spades", rank: "9" },
                    { id: "18", suit: "spades", rank: "10" },
                    { id: "19", suit: "spades", rank: "J" },
                    { id: "20", suit: "spades", rank: "Q" },
                  ],
                ],
                sets: [],
              },
            ],
          },
        },
      },
    },
  },
};

export const MaximumHand: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            round: "2R", // Need two runs
            players: [
              {
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  // First potential run
                  { id: "1", suit: "hearts", rank: "4" },
                  { id: "2", suit: "hearts", rank: "5" },
                  { id: "3", suit: "hearts", rank: "6" },
                  { id: "4", suit: "hearts", rank: "7" },
                  // Second potential run
                  { id: "5", suit: "diamonds", rank: "8" },
                  { id: "6", suit: "diamonds", rank: "9" },
                  { id: "7", suit: "diamonds", rank: "10" },
                  { id: "8", suit: "diamonds", rank: "J" },
                  // Random cards to fill up hand
                  { id: "9", suit: "clubs", rank: "2" },
                  { id: "10", suit: "spades", rank: "K" },
                  { id: "11", suit: "hearts", rank: "A" },
                  { id: "12", suit: "clubs", rank: "3" },
                  { id: "13", suit: "spades", rank: "4" },
                  { id: "14", suit: "hearts", rank: "8" },
                  { id: "15", suit: "diamonds", rank: "2" },
                  { id: "16", suit: "clubs", rank: "Q" },
                  { id: "17", suit: "spades", rank: "10" },
                  { id: "18", suit: "hearts", rank: "3" }, // Just drew this card
                ],
                isDown: false,
                buyCount: 2,
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

export const MultipleOptions: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            round: "1R1S", // Need one run and one set
            players: [
              {
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  // First possible run
                  { id: "1", suit: "hearts", rank: "4" },
                  { id: "2", suit: "hearts", rank: "5" },
                  { id: "3", suit: "hearts", rank: "6" },
                  { id: "4", suit: "hearts", rank: "7" },
                  // Second possible run
                  { id: "5", suit: "diamonds", rank: "8" },
                  { id: "6", suit: "diamonds", rank: "9" },
                  { id: "7", suit: "diamonds", rank: "10" },
                  { id: "8", suit: "diamonds", rank: "J" },
                  // First possible set
                  { id: "9", suit: "hearts", rank: "Q" },
                  { id: "10", suit: "diamonds", rank: "Q" },
                  { id: "11", suit: "spades", rank: "Q" },
                  // Second possible set
                  { id: "12", suit: "hearts", rank: "K" },
                  { id: "13", suit: "diamonds", rank: "K" },
                  { id: "14", suit: "spades", rank: "K" },
                ],
                isDown: false,
                buyCount: 1,
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

export const ChooseDiscard: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-1",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            currentTurn: "player-1",
            turnPhase: "discard",  // Important: shows we're in discard phase
            round: "2R",
            players: [
              {
                id: "player-1",
                name: "You",
                score: 0,
                hand: [
                  // First potential run
                  { id: "1", suit: "hearts", rank: "4" },
                  { id: "2", suit: "hearts", rank: "5" },
                  { id: "3", suit: "hearts", rank: "6" },
                  { id: "4", suit: "hearts", rank: "7" },
                  // Second potential run
                  { id: "5", suit: "diamonds", rank: "8" },
                  { id: "6", suit: "diamonds", rank: "9" },
                  { id: "7", suit: "diamonds", rank: "10" },
                  { id: "8", suit: "diamonds", rank: "J" },
                  // Just drew this card - might want to discard
                  { id: "9", suit: "clubs", rank: "2" },
                ],
                isDown: false,
                buyCount: 1,
                runs: [],
                sets: [],
              },
            ],
            discardPile: [
              { id: "discard-1", suit: "spades", rank: "K" },
            ],
          },
        },
      },
    },
  },
};
