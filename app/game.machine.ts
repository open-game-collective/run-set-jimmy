import { ActorKitStateMachine } from "actor-kit";
import { produce } from "immer";
import { and, assign, DoneActorEvent, fromPromise, setup } from "xstate";
import type { 
  GameEvent, 
  GameInput, 
  GameServerContext, 
  GamePhase,
  PlayableCard 
} from "./game.types";
import { ROUND_REQUIREMENTS } from "./game.types";

export const gameMachine = setup({
  types: {} as {
    context: GameServerContext;
    events: GameEvent;
    input: GameInput;
  },
  guards: {
    isHost: ({ context, event }: { context: GameServerContext; event: GameEvent }) => 
      event.caller.id === context.public.hostId,
    canJoin: ({ context }: { context: GameServerContext }) => 
      context.public.players.length < context.public.settings.maxPlayers,
    isPlayerTurn: ({ context, event }: { context: GameServerContext; event: GameEvent }) => 
      event.caller.id === context.public.currentTurn,
    canBuy: ({ context, event }: { context: GameServerContext; event: GameEvent }) => {
      const player = context.public.players.find((p: { id: string }) => p.id === event.caller.id);
      return player ? player.buyCount < 3 : false;
    },
    hasValidPlay: ({ context, event }: { context: GameServerContext; event: GameEvent }) => {
      // TODO: Implement validation for runs and sets
      return true;
    },
  },
  actors: {
    generateGameCode: fromPromise(async () => {
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += characters[Math.floor(Math.random() * characters.length)];
      }
      return code;
    }),
  },
  actions: {
    updateGamePhase: assign(({ context }, { phase }: { phase: GamePhase }) => ({
      public: produce(context.public, draft => {
        draft.gamePhase = phase;
      })
    })),
    addPlayerToGame: assign(({ context }, { id, name }: { id: string; name: string }) => ({
      public: produce(context.public, draft => {
        draft.players.push({ 
          id, 
          name, 
          score: 0,
          hand: [],
          isDown: false,
          buyCount: 0,
          runs: [],
          sets: [],
        });
      })
    })),
    removePlayer: assign(({ context }, { playerId }: { playerId: string }) => ({
      public: produce(context.public, draft => {
        draft.players = draft.players.filter(p => p.id !== playerId);
      })
    })),
    initializeRound: assign(({ context }) => ({
      public: produce(context.public, draft => {
        draft.currentRound = 1;
        draft.roundRequirements = ROUND_REQUIREMENTS[0];
        draft.currentTurn = draft.players[0]?.id ?? null;
        draft.turnPhase = "draw";
        draft.players.forEach(player => {
          player.isDown = false;
          player.buyCount = 0;
        });
      })
    })),
    assignGameCode: assign(({ context }, { gameCode }: { gameCode: string }) => ({
      public: produce(context.public, draft => {
        draft.gameCode = gameCode;
      })
    })),
  },
}).createMachine({
  id: "runSetJimmy",
  context: ({ input }: { input: GameInput }) => ({
    public: {
      id: input.id,
      hostId: input.caller.id,
      hostName: input.hostName,
      gameCode: undefined,
      players: [],
      gamePhase: "lobby" as GamePhase,
      currentRound: 0,
      roundRequirements: ROUND_REQUIREMENTS[0],
      currentTurn: null,
      turnPhase: null,
      discardPile: [] as PlayableCard[],
      visiblePlays: [],
      winner: null,
      settings: {
        maxPlayers: 7,
      },
      actionHistory: [],
      scores: {},
    },
    private: {},
  }),
  initial: "lobby",
  states: {
    lobby: {
      initial: "generatingCode",
      states: {
        generatingCode: {
          invoke: {
            id: 'generateGameCode',
            src: 'generateGameCode',
            onDone: {
              target: 'ready',
              actions: {
                type: 'assignGameCode',
                params: ({ event }: { event: DoneActorEvent<string> }) => ({
                  gameCode: event.output,
                }),
              },
            },
          },
        },
        ready: {
          on: {
            JOIN_GAME: {
              guard: 'canJoin',
              actions: {
                type: 'addPlayerToGame',
                params: ({ event }: { event: Extract<GameEvent, { type: 'JOIN_GAME' }> }) => ({
                  id: event.caller.id,
                  name: event.playerName,
                }),
              },
            },
            START_GAME: {
              guard: 'isHost',
              target: '#runSetJimmy.dealing',
              actions: [
                { type: 'updateGamePhase', params: { phase: "dealing" as GamePhase } },
                'initializeRound',
              ],
            },
            REMOVE_PLAYER: {
              guard: 'isHost',
              actions: {
                type: 'removePlayer',
                params: ({ event }: { event: Extract<GameEvent, { type: 'REMOVE_PLAYER' }> }) => ({
                  playerId: event.playerId,
                }),
              },
            },
          },
        },
      },
    },
    dealing: {
      // Add dealing state implementation
    },
    playing: {
      // Add playing state implementation
    },
    roundEnd: {
      // Add round end state implementation
    },
    finished: {
      type: "final",
    },
  },
}) satisfies ActorKitStateMachine<GameEvent, GameInput, GameServerContext>;

export type GameMachine = typeof gameMachine;
