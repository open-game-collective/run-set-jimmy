/**
 * A tap sends its move once: until the phone's view shows the room took it (or refused it), a second
 * tap on the same screen is dropped, so a double tap never comes back as "You already drew this turn".
 */

/** What changes on the phone's view whenever the room acts on one of its moves. */
export type MoveView = { logSeq: number; turnPhase: string | null; handSize: number; buyRequested: boolean; oopsSeq: number };

export const moveKey = (v: MoveView): string => [v.logSeq, v.turnPhase, v.handSize, v.buyRequested, v.oopsSeq].join("|");

/** A sender that runs `send` only when the view's key differs from the one of the last move it sent. */
export function sendOnce(): (key: string, send: () => void) => void {
  let lastKey: string | null = null;
  return (key, send) => {
    if (key === lastKey) return;
    lastKey = key;
    send();
  };
}
