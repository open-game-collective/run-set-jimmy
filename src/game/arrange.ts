import type { Card, Joker, Natural } from "./cards";
import { playOnRun, type RunMeld, type RunPlacement } from "./melds";

const HIGHEST = 14;

/**
 * Orders a run the way the player meant it: naturals by rank, jokers filling the gaps, spare jokers
 * on the preferred end (spilling to the other end at an Ace). Null when no order makes a run.
 */
export function arrangeRun(cards: readonly Card[], spare: "high" | "low" = "high"): Card[] | null {
  const naturals = cards.filter((c): c is Natural => c.kind === "card");
  const jokers = cards.filter((c): c is Joker => c.kind === "joker");
  const suit = naturals[0]?.suit;
  if (!suit || naturals.some((c) => c.suit !== suit)) return null;

  const aces = naturals.filter((c) => c.rank === 1);
  const others = naturals.filter((c) => c.rank !== 1).map((c) => ({ card: c, value: c.rank }));
  const options: { card: Natural; value: number }[][] =
    aces.length === 0
      ? [others]
      : aces.length === 1
        ? [
            [{ card: aces[0] as Natural, value: 1 }, ...others],
            [...others, { card: aces[0] as Natural, value: HIGHEST }],
          ]
        : aces.length === 2
          ? [[{ card: aces[0] as Natural, value: 1 }, ...others, { card: aces[1] as Natural, value: HIGHEST }]]
          : [];

  for (const option of options) {
    const placed = [...option].sort((a, b) => a.value - b.value);
    const first = placed[0];
    const last = placed.at(-1);
    if (!first || !last) continue;
    if (placed.some((p, i) => i > 0 && p.value === placed[i - 1]?.value)) continue;
    const gaps = last.value - first.value + 1 - placed.length;
    if (gaps > jokers.length) continue;

    const pool = [...jokers];
    const middle: Card[] = [];
    for (let v = first.value, i = 0; v <= last.value; v++) {
      if (placed[i]?.value === v) middle.push((placed[i++] as { card: Natural }).card);
      else middle.push(pool.pop() as Joker);
    }
    let low = first.value;
    let high = last.value;
    const before: Card[] = [];
    const after: Card[] = [];
    for (const joker of pool) {
      const highOpen = high < HIGHEST;
      const lowOpen = low > 1;
      if ((spare === "high" && highOpen) || (spare === "low" && !lowOpen && highOpen)) {
        after.push(joker);
        high++;
      } else if (lowOpen) {
        before.push(joker);
        low--;
      } else return null;
    }
    return [...before, ...middle, ...after];
  }
  return null;
}

/** Every legal way to put this card on this run. */
export function placementsFor(run: RunMeld, card: Card): RunPlacement[] {
  const tries: RunPlacement[] = [{ at: "low" }, { at: "high" }];
  run.cards.forEach((x, i) => {
    if (x.kind === "joker") tries.push({ replace: i, jokerTo: "low" }, { replace: i, jokerTo: "high" });
  });
  return tries.filter((p) => playOnRun(run, card, p).ok);
}
