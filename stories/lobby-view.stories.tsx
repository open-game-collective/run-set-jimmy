import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { LobbyView } from "../app/components/lobby-view";
import { GameContext } from "../app/game.context";
import { SessionContext } from "../app/session.context";
import { withActorKit } from "actor-kit/storybook";
import type { GameMachine } from "../app/game.machine";
import type { SessionMachine } from "../app/session.machine";
import { defaultGameSnapshot, defaultSessionSnapshot } from "./utils";
import { expect } from "@storybook/test";
import { userEvent } from "@storybook/testing-library";
import { within, waitFor } from "@storybook/testing-library";
import { createActorKitMockClient } from "actor-kit/test";

const meta = {
  title: "Components/LobbyView",
  component: LobbyView,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: 'dark',
    },
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
    withActorKit<SessionMachine>({
      actorType: "session",
      context: SessionContext,
    }),
    (Story) => (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LobbyView>;

export default meta;
type Story = StoryObj<typeof meta>;

// Helper function to create a default player object
const createPlayer = (id: string, name: string) => ({
  id,
  name,
  score: 0,
  hand: [],
  isDown: false,
  buyCount: 0,
  runs: [],
  sets: [],
});

export const EmptyAsHost: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "host-123",
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

export const EmptyAsPlayer: Story = {
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
            hostId: "different-host",
            players: [],
          },
        },
      },
    },
  },
};

export const WithPlayersAsHost: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "host-123",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "Host Player"),
              createPlayer("player-2", "Player 2"),
            ],
          },
        },
      },
    },
  },
};

export const WithPlayersAsPlayer: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "player-2",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "Host"),
              createPlayer("player-2", "You"),
              createPlayer("player-3", "Other Player"),
            ],
          },
        },
      },
    },
  },
};

export const FullAsHost: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "host-123",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "You (Host)"),
              ...Array.from({ length: 6 }, (_, i) => 
                createPlayer(`player-${i + 1}`, `Player ${i + 1}`)
              ),
            ],
          },
        },
      },
    },
  },
};

export const FullAsPlayer: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": {
          ...defaultSessionSnapshot,
          public: {
            ...defaultSessionSnapshot.public,
            userId: "current-player",
          },
        },
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "Host"),
              createPlayer("current-player", "You"),
              ...Array.from({ length: 5 }, (_, i) => 
                createPlayer(`player-${i + 1}`, `Player ${i + 1}`)
              ),
            ],
          },
        },
      },
    },
  },
};

export const InteractionsAsHost: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "Host"),
              createPlayer("player-2", "Player 2"),
              createPlayer("player-3", "Player 3"),
            ],
          },
        },
      },
    },
  },
  play: async ({ canvasElement, mount, step }) => {
    const canvas = within(canvasElement);
    const client = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        public: {
          ...defaultGameSnapshot.public,
          hostId: "host-123",
          players: [
            createPlayer("host-123", "Host"),
            createPlayer("player-2", "Player 2"),
            createPlayer("player-3", "Player 3"),
          ],
        },
        private: defaultGameSnapshot.private,
        value: defaultGameSnapshot.value,
      },
    });

    const sessionClient = createActorKitMockClient<SessionMachine>({
      initialSnapshot: {
        ...defaultSessionSnapshot,
        public: {
          ...defaultSessionSnapshot.public,
          userId: "host-123",
        },
      },
    });

    await mount(
      <SessionContext.ProviderFromClient client={sessionClient}>
        <GameContext.ProviderFromClient client={client}>
          <LobbyView />
        </GameContext.ProviderFromClient>
      </SessionContext.ProviderFromClient>
    );

    await step("Verify start game button is enabled with enough players", async () => {
      const startButton = canvas.getByRole("button", { name: /start game/i });
      expect(startButton).toHaveClass("bg-gradient-to-r");
      expect(startButton).toHaveClass("from-blue-500");
      expect(startButton).toHaveClass("to-purple-600");
      expect(startButton).not.toBeDisabled();
    });

    await step("Remove a player", async () => {
      const removeButton = canvas.getAllByRole("button", { name: /remove/i })[0];
      await userEvent.click(removeButton);

      // Update the client state to simulate server response
      client.produce((draft) => {
        draft.public.players = draft.public.players.slice(0, 2);
      });

      // Wait for the game state to update and check for disabled style
      await waitFor(async () => {
        const startButton = canvas.getByRole("button", { name: /start game/i });
        expect(startButton).toHaveClass("bg-gray-600");
        expect(startButton).toHaveClass("cursor-not-allowed");
      });
      
      // Verify player count message
      const message = await canvas.findByText(/need at least 3 players/i);
      expect(message).toBeInTheDocument();
    });
  },
};

export const CopyLinkInteraction: Story = {
  parameters: {
    actorKit: {
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              { 
                id: "player-1", 
                name: "You", 
                score: 0, 
                hand: [], 
                isDown: false, 
                buyCount: 0,
                runs: [],
                sets: [],
              }
            ],
          },
        },
      },
    },
  },
  play: async ({ canvasElement, mount, step }) => {
    const canvas = within(canvasElement);
    const client = createActorKitMockClient<GameMachine>({
      initialSnapshot: {
        ...defaultGameSnapshot,
        public: {
          ...defaultGameSnapshot.public,
          hostId: "host-123",
          players: [createPlayer("player-1", "You")],
        },
      },
    });

    const sessionClient = createActorKitMockClient<SessionMachine>({
      initialSnapshot: {
        ...defaultSessionSnapshot,
        public: {
          ...defaultSessionSnapshot.public,
          userId: "player-1",
        },
      },
    });

    // Mock clipboard API
    let clipboardText = '';
    const mockClipboard = {
      writeText: async (text: string) => {
        clipboardText = text;
        return Promise.resolve();
      },
    };

    // Properly mock the clipboard API
    Object.defineProperty(window.navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true,
    });

    await mount(
      <SessionContext.ProviderFromClient client={sessionClient}>
        <GameContext.ProviderFromClient client={client}>
          <LobbyView />
        </GameContext.ProviderFromClient>
      </SessionContext.ProviderFromClient>
    );

    await step("Click copy link button and verify changes", async () => {
      // Find and click the copy button
      const copyButton = await canvas.findByRole("button", { name: /copy link/i });
      await userEvent.click(copyButton);

      // Verify clipboard was called with the current URL
      expect(clipboardText).toBe(window.location.href);

      // Verify button text changes to "Copied!"
      await waitFor(
        () => {
          const copiedText = canvas.queryByText(/copied!/i);
          expect(copiedText).toBeInTheDocument();
        },
        { timeout: 1000 }
      );

      // Wait for button text to revert back
      await waitFor(
        () => {
          const copyText = canvas.queryByText(/copy link/i);
          expect(copyText).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    // Clean up
    Object.defineProperty(window.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
  },
};

export const StartGameInteraction: Story = {
  parameters: {
    actorKit: {
      session: {
        "session-123": defaultSessionSnapshot,
      },
      game: {
        "game-123": {
          ...defaultGameSnapshot,
          public: {
            ...defaultGameSnapshot.public,
            hostId: "host-123",
            players: [
              createPlayer("host-123", "Host"),
              createPlayer("player-2", "Player 2"),
              createPlayer("player-3", "Player 3"),
            ],
          },
        },
      },
    },
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step("Start the game", async () => {
      const startButton = canvas.getByRole("button", { name: /start game/i });
      expect(startButton).toBeEnabled();
      await userEvent.click(startButton);
    });
  },
}; 