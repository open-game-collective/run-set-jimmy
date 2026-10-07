import { useCallback, useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { GameContext } from "~/game.context";
import { SessionContext } from "~/session.context";
import { Share2, Copy } from "lucide-react";

interface Player {
  id: string;
  name: string;
  score: number;
  hand: any[];
  isDown: boolean;
  buyCount: number;
}

export function LobbyView() {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const client = GameContext.useClient();
  const gameState = GameContext.useSelector((state) => state.public);
  const sessionState = SessionContext.useSelector((state) => state.public);
  const {
    gamePhase,
    players,
    hostId,
    gameCode,
    settings,
  } = gameState;

  const isHost = sessionState.userId === hostId;
  const canStartGame = players.length >= 3 && players.length <= settings.maxPlayers;

  const handleCopy = useCallback(async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await navigator.share({
        title: "Join my Run Set Jimmy game!",
        url: window.location.href,
      });
    } catch (err) {
      console.error("Error sharing:", err);
    }
  }, []);

  const handleRemovePlayer = useCallback((playerId: string) => {
    client.send({ type: "REMOVE_PLAYER", playerId });
  }, [client]);

  const handleStartGame = useCallback(() => {
    client.send({ type: "START_GAME" });
  }, [client]);

  // Create array of all possible player slots
  const playerSlots = Array.from({ length: settings.maxPlayers }, (_, i) => {
    return players[i] || null;
  });

  // Check if Web Share API is available
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.share);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Run Set Jimmy
          </h1>
          <div className="flex flex-col gap-4 items-center">
            {isHost && (
              <Button
                disabled={!canStartGame}
                onClick={handleStartGame}
                className={`text-lg px-8 py-3 ${
                  canStartGame 
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'
                    : 'bg-gray-600 cursor-not-allowed'
                }`}
              >
                Start Game
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleCopy}
                className="text-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              {canShare && (
                <Button
                  onClick={handleShare}
                  className="text-lg bg-gray-800 hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </Button>
              )}
            </div>
            {isHost && !canStartGame && (
              <p className="text-gray-400">
                {players.length < 3 
                  ? "Need at least 3 players to start"
                  : "Maximum number of players reached"}
              </p>
            )}
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">
            Players ({players.length}/{settings.maxPlayers})
          </h2>
          <ul className="space-y-3">
            {playerSlots.map((player, index) => (
              <li key={player?.id || `empty-${index}`}>
                {index === 3 && (
                  <div className="border-t border-gray-700 my-4 relative">
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-gray-800 px-2 text-xs text-gray-400">
                      Minimum Players
                    </span>
                  </div>
                )}
                <div className={`flex justify-between items-center rounded-lg p-3 ${
                  player ? 'bg-gray-700' : 'bg-gray-800/50'
                }`}>
                  {player ? (
                    <>
                      <span className="text-lg">
                        {player.name}
                        {player.id === hostId && (
                          <span className="ml-2 text-sm text-blue-400">(Host)</span>
                        )}
                      </span>
                      {isHost && player.id !== hostId && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleRemovePlayer(player.id)}
                          className="hover:bg-red-700 transition-colors"
                        >
                          Remove
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className="text-lg text-gray-500 italic">
                      Waiting for player...
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}