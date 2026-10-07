export type TurnLineInput = {
  myTurn: boolean;
  phase: "draw" | "offer" | "play" | "out" | null;
  down: boolean;
  windowOpen: boolean;
  /** Who would buy the discard, during an offer. */
  offerFrom: string | null;
  turnName: string;
  /** The top discard's name ("8♦"). */
  top: string | null;
  canBuy: boolean;
  buyRequested: boolean;
};

/** The phone's turn banner: whose turn it is and, on yours, what to do next. */
export function turnLine(i: TurnLineInput): { mine: boolean; text: string } {
  const top = i.top ?? "discard";
  if (i.myTurn) {
    if (i.phase === "offer") return { mine: true, text: `Your turn: ${i.offerFrom ?? "Someone"} wants the ${top}` };
    if (i.phase === "play") return { mine: true, text: i.down ? "Your turn: play cards on the table, then discard" : "Your turn: go down if you can, then discard" };
    return { mine: true, text: i.windowOpen ? `Your turn: take the ${top} now, or wait for the deck` : "Your turn: draw a card" };
  }
  const extra = i.windowOpen && i.buyRequested ? ` · you asked to buy the ${top}` : i.windowOpen && i.canBuy ? ` · you can buy the ${top}` : "";
  return { mine: false, text: `${i.turnName}'s turn${extra}` };
}
