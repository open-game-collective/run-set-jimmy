import { useStore } from "@nanostores/react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";
import { GameContext } from "~/game.context";
import type { Card, PlayableCard, Player } from "~/game.types";
import { SessionContext } from "~/session.context";
import { $drawerState, setDrawerOpen } from "~/stores/drawer";

const renderCard = (card: PlayableCard) => {
  if ("suit" in card) {
    const { suit, rank } = card;
    return (
      <div
        className={`text-sm font-bold ${
          suit === "hearts" || suit === "diamonds"
            ? "text-red-500"
            : "text-gray-900"
        }`}
      >
        {rank}
        <span className="ml-1">
          {suit === "hearts"
            ? "♥"
            : suit === "diamonds"
            ? "♦"
            : suit === "clubs"
            ? "♣"
            : "♠"}
        </span>
      </div>
    );
  }

  // Must be a joker
  return <div className="text-sm font-bold text-purple-500">JOKER</div>;
};

const PlayerStats = ({ players }: { players: Player[] }) => {
  return (
    <div className="bg-gray-800/50 border-b border-gray-700/50">
      <div className="p-2 flex flex-wrap gap-4">
        {players.map((player) => (
          <div key={player.id} className="flex items-center gap-2">
            <div className="text-sm font-medium truncate max-w-[80px]">
              {player.name}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-sm text-gray-400">{player.hand.length}</div>
              {!player.isDown ? (
                <div className="flex gap-1">
                  {[...Array(player.buyCount)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-green-500"
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400">({player.buyCount})</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper types for card combinations
type CardGroup = PlayableCard[];
type ValidatedHand = {
  runs: CardGroup[];
  sets: CardGroup[];
  remainingCards: PlayableCard[];
};

// Helper functions to validate cards
const isConsecutive = (a: string, b: string): boolean => {
  const ranks = [
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
  ];
  const aIndex = ranks.indexOf(a);
  const bIndex = ranks.indexOf(b);
  return Math.abs(aIndex - bIndex) === 1;
};

const findRuns = (cards: PlayableCard[]): CardGroup[] => {
  // Group cards by suit
  const bySuit = cards.reduce((acc, card) => {
    if ("suit" in card) {
      acc[card.suit] = acc[card.suit] || [];
      acc[card.suit].push(card);
    }
    return acc;
  }, {} as Record<string, Card[]>);

  // Find runs in each suit
  const runs: CardGroup[] = [];
  Object.values(bySuit).forEach((suitCards) => {
    // Sort by rank
    suitCards.sort((a, b) => {
      const ranks = [
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
      ];
      return ranks.indexOf(a.rank) - ranks.indexOf(b.rank);
    });

    // Find consecutive sequences
    let currentRun: Card[] = [suitCards[0]];
    for (let i = 1; i < suitCards.length; i++) {
      if (isConsecutive(suitCards[i - 1].rank, suitCards[i].rank)) {
        currentRun.push(suitCards[i]);
      } else if (currentRun.length >= 4) {
        runs.push([...currentRun]);
        currentRun = [suitCards[i]];
      } else {
        currentRun = [suitCards[i]];
      }
    }
    if (currentRun.length >= 4) {
      runs.push([...currentRun]);
    }
  });

  return runs;
};

const findSets = (cards: PlayableCard[]): CardGroup[] => {
  // Group cards by rank
  const byRank = cards.reduce((acc, card) => {
    if ("suit" in card) {
      acc[card.rank] = acc[card.rank] || [];
      acc[card.rank].push(card);
    }
    return acc;
  }, {} as Record<string, Card[]>);

  // Find sets of 3 or more
  return Object.values(byRank)
    .filter((rankCards) => rankCards.length >= 3)
    .map((rankCards) => rankCards.slice(0, 3));
};

const validateHand = (hand: PlayableCard[]): ValidatedHand => {
  const runs = findRuns(hand);
  const sets = findSets(hand);

  // Track which cards are used
  const usedCardIds = new Set([
    ...runs.flat().map((c) => c.id),
    ...sets.flat().map((c) => c.id),
  ]);

  const remainingCards = hand.filter((card) => !usedCardIds.has(card.id));

  return { runs, sets, remainingCards };
};

const canGoDown = (
  hand: PlayableCard[],
  requirements: { runs: number; sets: number }
): boolean => {
  const { runs, sets } = validateHand(hand);
  return runs.length >= requirements.runs && sets.length >= requirements.sets;
};

// Add types for selection
type CardCombination = {
  type: "run" | "set";
  cards: PlayableCard[];
  id: string; // For selection tracking
};

// Define snap points for different hand views
const snapPoints = ["25vh", "50vh", "75vh"];

// Add new state and types
type GoDownStep = {
  type: "run" | "set";
  index: number;
  total: number;
};

export const PlayerView = () => {
  const gameState = GameContext.useSelector((state) => state.public);
  const sessionState = SessionContext.useSelector((state) => state.public);
  const userId = sessionState.userId;
  const send = GameContext.useSend();

  const player = gameState.players?.find((p) => p.id === userId);
  const [selectedCard, setSelectedCard] = useState<PlayableCard | null>(null);
  const [selectedCombinations, setSelectedCombinations] = useState<Set<string>>(
    new Set()
  );
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);
  const [goingDown, setGoingDown] = useState(false);
  const [goDownStep, setGoDownStep] = useState<GoDownStep | null>(null);
  const [selectedPlays, setSelectedPlays] = useState<{
    runs: PlayableCard[][];
    sets: PlayableCard[][];
  }>({
    runs: [],
    sets: [],
  });

  const drawerState = useStore($drawerState);

  const handleDrawerOpenChange = (open: boolean) => {
    console.log("Drawer open change:", open);
    setDrawerOpen(open);
  };

  const toggleDrawer = () => {
    setDrawerOpen(!drawerState.isOpen);
  };

  if (!player) {
    return (
      <NameInputDisplay
        onSubmit={(name) => send({ type: "JOIN_GAME", playerName: name })}
      />
    );
  }

  const handleDiscard = (card: PlayableCard) => {
    send({
      type: "DISCARD_CARD",
      card,
    });
    setSelectedCard(null);
  };

  // Validate hand and find all possible combinations
  const { possibleRuns, possibleSets } = useMemo(() => {
    const runs = findRuns(player.hand);
    const sets = findSets(player.hand);
    return {
      possibleRuns: runs.map((cards, i) => ({
        type: "run" as const,
        cards,
        id: `run-${i}`,
      })),
      possibleSets: sets.map((cards, i) => ({
        type: "set" as const,
        cards,
        id: `set-${i}`,
      })),
    };
  }, [player.hand]);

  // Check if selected combinations meet requirements
  const canGoDownWithSelection = useMemo(() => {
    const selectedRuns = possibleRuns.filter((r) =>
      selectedCombinations.has(r.id)
    );
    const selectedSets = possibleSets.filter((s) =>
      selectedCombinations.has(s.id)
    );
    return (
      selectedRuns.length >= gameState.roundRequirements.runs &&
      selectedSets.length >= gameState.roundRequirements.sets
    );
  }, [
    selectedCombinations,
    possibleRuns,
    possibleSets,
    gameState.roundRequirements,
  ]);

  const handleGoDown = () => {
    const selectedRuns = possibleRuns.filter((r) =>
      selectedCombinations.has(r.id)
    );
    const selectedSets = possibleSets.filter((s) =>
      selectedCombinations.has(s.id)
    );

    send({
      type: "GO_DOWN",
      plays: [
        ...selectedRuns.map(({ cards }) => ({ type: "run" as const, cards })),
        ...selectedSets.map(({ cards }) => ({ type: "set" as const, cards })),
      ],
    });
  };

  const toggleCombination = (combination: CardCombination) => {
    setSelectedCombinations((prev) => {
      const next = new Set(prev);
      if (next.has(combination.id)) {
        next.delete(combination.id);
      } else {
        next.add(combination.id);
      }
      return next;
    });
  };

  // Render possible combinations when not down
  const renderPossibleCombinations = () => {
    if (player.isDown) return null;

    return (
      <div className="p-4 space-y-4">
        {possibleRuns.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-blue-400">
              Possible Runs
            </div>
            {possibleRuns.map((run) => (
              <button
                key={run.id}
                onClick={() => toggleCombination(run)}
                className={`w-full p-2 rounded ${
                  selectedCombinations.has(run.id)
                    ? "bg-blue-900/40 border-2 border-blue-500"
                    : "bg-blue-900/20 border border-blue-500/20"
                }`}
              >
                <div className="flex -space-x-8">
                  {run.cards.map((card, i) => (
                    <div
                      key={i}
                      className="w-16 h-24 first:ml-0"
                      style={{
                        transform: `rotate(${Math.random() * 2 - 1}deg)`,
                      }}
                    >
                      <div className="w-full h-full bg-white rounded shadow-md p-1">
                        {renderCard(card)}
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}

        {possibleSets.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-purple-400">
              Possible Sets
            </div>
            {possibleSets.map((set) => (
              <button
                key={set.id}
                onClick={() => toggleCombination(set)}
                className={`w-full p-2 rounded ${
                  selectedCombinations.has(set.id)
                    ? "bg-purple-900/40 border-2 border-purple-500"
                    : "bg-purple-900/20 border border-purple-500/20"
                }`}
              >
                {/* Similar card rendering as runs */}
              </button>
            ))}
          </div>
        )}

        {canGoDownWithSelection && (
          <button
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
            onClick={handleGoDown}
          >
            Go Down with Selected Combinations
          </button>
        )}
      </div>
    );
  };

  const isMyTurn = player.id === gameState.currentTurn;

  const renderHandCards = (cards: PlayableCard[], turnPhase: string | null) => {
    // Split into rows of 6 and 5
    const firstRow = cards.slice(0, 6);
    const secondRow = cards.slice(6, 11);
    const remainingCards = cards.slice(11);

    return (
      <div className="space-y-4">
        {/* Discard instruction */}
        {turnPhase === "discard" && (
          <div className="text-center text-sm text-gray-400 mb-4">
            Choose a card to discard
          </div>
        )}

        {/* First row - 6 cards */}
        {firstRow.length > 0 && (
          <div className="flex justify-center">
            <div className="flex -space-x-14"> {/* Increased overlap */}
              {firstRow.map((card, index) => (
                <motion.div
                  key={card.id}
                  className="relative transition-transform cursor-pointer"
                  style={{ 
                    zIndex: selectedCard?.id === card.id ? 50 : index,
                  }}
                  initial={false}
                  animate={{ 
                    y: selectedCard?.id === card.id ? -48 : 0,
                    scale: selectedCard?.id === card.id ? 1.1 : 1,
                  }}
                  transition={{ 
                    duration: 0.15,
                    ease: "easeOut"
                  }}
                  whileHover={{ 
                    y: selectedCard?.id === card.id ? -48 : -16,
                    scale: selectedCard?.id === card.id ? 1.1 : 1.05,
                    transition: {
                      duration: 0.1,
                      ease: "easeOut"
                    }
                  }}
                  onClick={() => setSelectedCard(card)}
                >
                  <div 
                    className={clsx(
                      "w-20 h-32 bg-white rounded-lg shadow-lg p-2 transition-all duration-150",
                      selectedCard?.id === card.id && "ring-2 ring-blue-500 shadow-xl"
                    )}
                  >
                    {renderCard(card)}
                  </div>
                  {/* Discard button with faster animation */}
                  {selectedCard?.id === card.id && gameState.turnPhase === "discard" && (
                    <motion.button
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDiscard(card);
                      }}
                    >
                      Discard
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Second row - 5 cards */}
        {secondRow.length > 0 && (
          <div className="flex justify-center">
            <div className="flex -space-x-14 ml-7"> {/* Increased overlap and adjusted centering */}
              {secondRow.map((card, index) => (
                <motion.div
                  key={card.id}
                  className="relative transition-transform cursor-pointer"
                  style={{ 
                    zIndex: selectedCard?.id === card.id ? 50 : index,
                  }}
                  initial={false}
                  animate={{ 
                    y: selectedCard?.id === card.id ? -48 : 0,
                    scale: selectedCard?.id === card.id ? 1.1 : 1,
                  }}
                  transition={{ 
                    duration: 0.15,
                    ease: "easeOut"
                  }}
                  whileHover={{ 
                    y: selectedCard?.id === card.id ? -48 : -16,
                    scale: selectedCard?.id === card.id ? 1.1 : 1.05,
                    transition: {
                      duration: 0.1,
                      ease: "easeOut"
                    }
                  }}
                  onClick={() => setSelectedCard(card)}
                >
                  <div 
                    className={clsx(
                      "w-20 h-32 bg-white rounded-lg shadow-lg p-2 transition-all duration-150",
                      selectedCard?.id === card.id && "ring-2 ring-blue-500 shadow-xl"
                    )}
                  >
                    {renderCard(card)}
                  </div>
                  {/* Discard button with faster animation */}
                  {selectedCard?.id === card.id && gameState.turnPhase === "discard" && (
                    <motion.button
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDiscard(card);
                      }}
                    >
                      Discard
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Additional rows if needed */}
        {remainingCards.length > 0 && (
          <div className="flex justify-center">
            <div className="flex -space-x-14">
              {remainingCards.map((card, index) => (
                <motion.div
                  key={card.id}
                  className="relative transition-transform cursor-pointer"
                  style={{ 
                    zIndex: selectedCard?.id === card.id ? 50 : index,
                  }}
                  initial={false}
                  animate={{ 
                    y: selectedCard?.id === card.id ? -48 : 0,
                    scale: selectedCard?.id === card.id ? 1.1 : 1,
                  }}
                  transition={{ 
                    duration: 0.15,
                    ease: "easeOut"
                  }}
                  whileHover={{ 
                    y: selectedCard?.id === card.id ? -48 : -16,
                    scale: selectedCard?.id === card.id ? 1.1 : 1.05,
                    transition: {
                      duration: 0.1,
                      ease: "easeOut"
                    }
                  }}
                  onClick={() => setSelectedCard(card)}
                >
                  <div 
                    className={clsx(
                      "w-20 h-32 bg-white rounded-lg shadow-lg p-2 transition-all duration-150",
                      selectedCard?.id === card.id && "ring-2 ring-blue-500 shadow-xl"
                    )}
                  >
                    {renderCard(card)}
                  </div>
                  {/* Discard button with faster animation */}
                  {selectedCard?.id === card.id && gameState.turnPhase === "discard" && (
                    <motion.button
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-3 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDiscard(card);
                      }}
                    >
                      Discard
                    </motion.button>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Helper to determine what's needed for current round
  const roundRequirements = useMemo(() => {
    const requirements = {
      "1R1S": { runs: 1, sets: 1 },
      "2S": { runs: 0, sets: 2 },
      "2R": { runs: 2, sets: 0 },
      "2R1S": { runs: 2, sets: 1 },
      "2S1R": { runs: 1, sets: 2 },
      "3S": { runs: 0, sets: 3 },
      "3R": { runs: 3, sets: 0 },
    }[gameState.currentRound];
    return requirements || { runs: 0, sets: 0 };
  }, [gameState.currentRound]);

  // Start going down process
  const startGoingDown = () => {
    setGoingDown(true);
    if (roundRequirements.runs > 0) {
      setGoDownStep({ type: "run", index: 0, total: roundRequirements.runs });
    } else if (roundRequirements.sets > 0) {
      setGoDownStep({ type: "set", index: 0, total: roundRequirements.sets });
    }
  };

  // Handle confirming a selection
  const confirmSelection = (cards: PlayableCard[]) => {
    if (!goDownStep) return;

    if (goDownStep.type === "run") {
      setSelectedPlays((prev) => ({
        ...prev,
        runs: [...prev.runs, cards],
      }));

      // Move to next step
      if (goDownStep.index + 1 < goDownStep.total) {
        setGoDownStep({ ...goDownStep, index: goDownStep.index + 1 });
      } else if (roundRequirements.sets > 0) {
        setGoDownStep({ type: "set", index: 0, total: roundRequirements.sets });
      } else {
        completeGoingDown();
      }
    } else {
      setSelectedPlays((prev) => ({
        ...prev,
        sets: [...prev.sets, cards],
      }));

      // Move to next step
      if (goDownStep.index + 1 < goDownStep.total) {
        setGoDownStep({ ...goDownStep, index: goDownStep.index + 1 });
      } else {
        completeGoingDown();
      }
    }
  };

  // Complete the going down process
  const completeGoingDown = () => {
    send({
      type: "GO_DOWN",
      plays: [
        ...selectedPlays.runs.map((cards) => ({ type: "run" as const, cards })),
        ...selectedPlays.sets.map((cards) => ({ type: "set" as const, cards })),
      ],
    });
    setGoingDown(false);
    setGoDownStep(null);
    setSelectedPlays({ runs: [], sets: [] });
  };

  // Cancel going down
  const cancelGoingDown = () => {
    setGoingDown(false);
    setGoDownStep(null);
    setSelectedPlays({ runs: [], sets: [] });
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Game Info Header */}
      <div className="p-3 bg-gray-800/50">
        <div className="flex justify-between items-center mb-2">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Run Set Jimmy
          </h1>
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-400">Round: 3 Runs</div>
            <button
              onClick={toggleDrawer}
              className="p-2 rounded-full bg-gray-700/50 hover:bg-gray-700 transition-colors"
            >
              {drawerState.isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
        <PlayerStats players={gameState.players} />
      </div>

      {/* Scrollable main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-3">
          {/* Draw and Discard Area */}
          <div className="p-3 bg-gray-800/30">
            <div className="flex justify-center gap-8 items-start">
              {/* Draw Pile */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-20 h-28">
                  {/* Stack effect */}
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-md"
                      style={{
                        transform: `rotate(${
                          Math.random() * 2 - 1
                        }deg) translateY(${i * -1}px)`,
                      }}
                    />
                  ))}
                </div>
                <button
                  className={`w-full font-bold py-2 px-4 rounded text-sm ${
                    isMyTurn
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-gray-600 text-gray-400 cursor-not-allowed"
                  }`}
                  onClick={() => send({ type: "DRAW_CARD" })}
                  disabled={!isMyTurn}
                >
                  Draw
                </button>
              </div>

              {/* Discard Pile */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-28 bg-white rounded-lg shadow-md p-1">
                  {gameState.discardPile[0] &&
                    renderCard(gameState.discardPile[0])}
                </div>
                <button
                  className={`w-full font-bold py-2 px-4 rounded text-sm ${
                    isMyTurn
                      ? "bg-purple-500 hover:bg-purple-600 text-white"
                      : "bg-gray-600 text-gray-400 cursor-not-allowed"
                  }`}
                  onClick={() => send({ type: "TAKE_DISCARD" })}
                  disabled={!isMyTurn}
                >
                  Take
                </button>
              </div>
            </div>
            {/* Turn indicator */}
            <div className="text-center mt-2 text-sm text-gray-400">
              {isMyTurn
                ? "Your turn"
                : `${
                    gameState.players.find(
                      (p) => p.id === gameState.currentTurn
                    )?.name
                  }'s turn`}
            </div>
          </div>

          {/* Play Area */}
          <div className="p-3">
            {player.isDown ? (
              <DisplayDownCards player={player} />
            ) : (
              renderPossibleCombinations()
            )}
          </div>
        </div>
      </div>

      {/* Hand drawer */}
      <Drawer.Root open={drawerState.isOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Content
            className={clsx(
              "bg-gray-800/95 backdrop-blur-sm flex flex-col rounded-t-[10px] fixed bottom-0 left-0 right-0 outline-none border-t border-gray-700 z-60",
              {
                "overflow-y-auto":
                  drawerState.activeSnapPoint === snapPoints[2],
                "overflow-hidden":
                  drawerState.activeSnapPoint !== snapPoints[2],
              }
            )}
          >
            <div className="p-4 flex-1">
              <button
                onClick={toggleDrawer}
                className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-gray-600 mb-8 hover:bg-gray-500 transition-colors"
              />

              <div className="max-w-4xl mx-auto">
                {renderHandCards(player.hand, gameState.turnPhase)}
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </div>
  );
};

const DisplayDownCards = ({
  player,
}: {
  player: { runs: PlayableCard[][]; sets: PlayableCard[][] };
}) => {
  return (
    <div className="p-4 space-y-4">
      {/* Runs */}
      {player.runs.map((run, runIndex) => (
        <div
          key={`run-${runIndex}`}
          className="bg-blue-900/20 border border-blue-500/20 rounded p-2"
        >
          <div className="text-xs text-blue-400 mb-1">Run {runIndex + 1}</div>
          <div className="flex -space-x-8">
            {run.map((card, cardIndex) => (
              <div
                key={cardIndex}
                className="w-16 h-24 flex-shrink-0 first:ml-0"
                style={{ transform: `rotate(${Math.random() * 2 - 1}deg)` }}
              >
                <div className="w-full h-full bg-white rounded shadow-md p-1">
                  {renderCard(card)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sets */}
      {player.sets.map((set, setIndex) => (
        <div
          key={`set-${setIndex}`}
          className="bg-purple-900/20 border border-purple-500/20 rounded p-2"
        >
          <div className="text-xs text-purple-400 mb-1">Set {setIndex + 1}</div>
          <div className="flex -space-x-8">
            {set.map((card, cardIndex) => (
              <div
                key={cardIndex}
                className="w-16 h-24 flex-shrink-0 first:ml-0"
                style={{ transform: `rotate(${Math.random() * 2 - 1}deg)` }}
              >
                <div className="w-full h-full bg-white rounded shadow-md p-1">
                  {renderCard(card)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const NameInputDisplay = ({
  onSubmit,
}: {
  onSubmit: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (name.length > 20) {
      setError("Name must be 20 characters or less");
      return;
    }
    if (!/^[a-zA-Z0-9\s]+$/.test(name)) {
      setError("Name can only contain letters, numbers and spaces");
      return;
    }

    setIsSubmitting(true);
    onSubmit(name.trim());
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative">
      {/* Background Animation */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500"
            animate={{
              rotate: [0, 360],
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </div>
      </div>

      <motion.div
        data-testid="name-input-form"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-md bg-gray-800/30 backdrop-blur-sm rounded-2xl p-8 border border-gray-700/50"
      >
        <h1 className="text-3xl font-bold text-center mb-6 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Join Game
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="playerName"
              className="block text-sm font-medium text-indigo-300 mb-2"
            >
              Your Name
            </label>
            <input
              data-testid="name-input"
              id="playerName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="w-full px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter your name"
              maxLength={20}
              disabled={isSubmitting}
            />
            {error && (
              <motion.p
                data-testid="name-input-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-sm text-red-400"
              >
                {error}
              </motion.p>
            )}
          </div>
          <motion.button
            data-testid="join-button"
            type="submit"
            whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
            whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
            className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition duration-300 flex items-center justify-center ${
              isSubmitting ? "opacity-75 cursor-not-allowed" : ""
            }`}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Joining...
              </>
            ) : (
              "Join Game"
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
