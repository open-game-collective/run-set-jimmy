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

const playText = (down: boolean) =>
  down ? "Your turn: play cards on the table, then discard" : "Your turn: go down if you can, then discard";

const drawText = (windowOpen: boolean, top: string) =>
  windowOpen ? `Your turn: take the ${top} now, or wait for the deck` : "Your turn: draw a card";

/** What to do next on your own turn. */
function myTurnText(i: TurnLineInput, top: string): string {
  if (i.phase === "offer") return `Your turn: ${i.offerFrom ?? "Someone"} wants the ${top}`;
  if (i.phase === "play") return playText(i.down);
  return drawText(i.windowOpen, top);
}

/** On someone else's turn, during the buy window: whether you asked to buy the discard, or can. */
function buyNote(i: TurnLineInput, top: string): string {
  if (!i.windowOpen) return "";
  if (i.buyRequested) return ` · you asked to buy the ${top}`;
  return i.canBuy ? ` · you can buy the ${top}` : "";
}

/** The phone's turn banner: whose turn it is and, on yours, what to do next. */
export function turnLine(i: TurnLineInput): { mine: boolean; text: string } {
  const top = i.top ?? "discard";
  if (i.myTurn) return { mine: true, text: myTurnText(i, top) };
  return { mine: false, text: `${i.turnName}'s turn${buyNote(i, top)}` };
}
