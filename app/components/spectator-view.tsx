import { motion } from "framer-motion";
import { GameContext } from "~/game.context";
import type { PlayableCard, Card, Player } from "~/game.types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

// Define all possible rounds in order
const ROUNDS = ["1R1S", "2S", "2R", "2S1R", "2R1S", "3S", "3R"] as const;
type Round = typeof ROUNDS[number];

export const SpectatorView = () => {
  const gameState = GameContext.useSelector((state) => {
    const { players, hostId, currentTurn, scores } = state.public;
    return {
      players: players.map(player => ({
        ...player,
        runs: player.runs || [],
        sets: player.sets || [],
      })) as Player[],
      hostId,
      currentTurn,
      scores,
    };
  });

  const { players, hostId, currentTurn, scores } = gameState;

  const discardCard: Card = {
    id: 'discard-top',
    suit: 'hearts',
    rank: 'K',
  };

  return (
    <div className="h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col overflow-hidden">
      {/* Game header - make it more compact */}
      <div className="flex justify-between items-center p-3 bg-gray-800/50">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Run Set Jimmy
        </h1>
        <div className="text-xl font-bold text-center text-blue-400">
          Round: 3 Runs
        </div>
      </div>

      {/* Main play area - use grid for better space management */}
      <div className="flex-1 grid grid-cols-5 gap-3 p-3 overflow-hidden">
        {/* Left column with draw, discard, and scores */}
        <div className="col-span-1 flex flex-col gap-3 overflow-hidden">
          {/* Draw pile */}
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="flex justify-between items-center mb-1">
              <div className="text-sm text-gray-400">Draw</div>
              <div className="text-sm text-blue-400">
                {players.find(p => p.id === currentTurn)?.name}'s Turn
              </div>
            </div>
            <div className="relative w-20 h-28">
              {/* Stack effect */}
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-md"
                  style={{ 
                    transform: `rotate(${Math.random() * 2 - 1}deg) translateY(${i * -1}px)`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Discard pile */}
          <div className="bg-gray-800/50 rounded-lg p-2">
            <div className="flex justify-between items-center mb-1">
              <div className="text-sm text-gray-400">Discard</div>
              <div className="text-sm text-gray-400">From: Bob</div>
            </div>
            <div className="w-20 h-28 bg-white rounded-lg shadow-md p-1">
              {renderCard(discardCard)}
            </div>
          </div>

          {/* Scores table - make it scrollable */}
          <div className="bg-gray-800/50 rounded-lg p-2 flex-1 overflow-hidden flex flex-col">
            <div className="text-sm font-semibold mb-1">Scores</div>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-800/50">
                  <tr className="text-gray-400">
                    <th className="text-left pb-1">Round</th>
                    {players.map(p => (
                      <th key={p.id} className="text-center pb-1">
                        {p.name.slice(0, 2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROUNDS.map((round: Round) => (
                    <tr key={round} className="border-t border-gray-700/50">
                      <td className="py-1">{round}</td>
                      {players.map(p => (
                        <td key={p.id} className="text-center py-1">
                          {scores?.[round]?.[p.id] ?? "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Player areas - make them scrollable */}
        <div className="col-span-4 grid grid-cols-4 gap-3 overflow-hidden">
          {players.map((player) => (
            <div
              key={player.id}
              className={`bg-gray-800/50 rounded-lg p-2 flex flex-col overflow-hidden ${
                player.id === currentTurn ? "ring-2 ring-blue-500/50" : ""
              }`}
            >
              {/* Player info */}
              <div className="mb-2">
                <div className="text-lg font-semibold mb-1 truncate">
                  {player.name}
                  {player.id === hostId && (
                    <span className="ml-1 text-sm text-blue-400">(Host)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold">
                    {player.hand.length}
                  </div>
                  <div className="flex gap-1">
                    {[...Array(player.buyCount)].map((_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-green-500"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Down cards - scrollable */}
              {player.isDown && (
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2">
                    {/* Runs and sets rendering stays the same */}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper function to render card content
const renderCard = (card: PlayableCard) => {
  if ('suit' in card) {
    const { suit, rank } = card;
    return (
      <div className={`text-sm font-bold ${
        suit === 'hearts' || suit === 'diamonds' 
          ? 'text-red-500' 
          : 'text-gray-900'
      }`}>
        {rank}
        <span className="ml-1">
          {suit === 'hearts' ? '♥' :
           suit === 'diamonds' ? '♦' :
           suit === 'clubs' ? '♣' : '♠'}
        </span>
      </div>
    );
  }

  // Must be a joker
  return <div className="text-sm font-bold text-purple-500">JOKER</div>;
};
