import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { arrangeRun, placementsFor } from "./arrange";
import { readRun, type RunMeld } from "./melds";

let n = 0;
const c = (rank: number, suit: Suit = "H"): Card => ({ id: `c${n++}`, kind: "card", suit, rank });
const J = (): Card => ({ id: `j${n++}`, kind: "joker" });
const shape = (cards: readonly Card[] | null) => cards?.map((x) => (x.kind === "joker" ? "J" : x.rank));

describe("arrangeRun", () => {
  it("orders cards given in any order", () => {
    expect(shape(arrangeRun([c(7), c(5), c(8), c(6)]))).toEqual([5, 6, 7, 8]);
  });

  it("fills gaps with jokers", () => {
    expect(shape(arrangeRun([c(8), J(), c(5), c(7)]))).toEqual([5, "J", 7, 8]);
    expect(shape(arrangeRun([c(9), J(), c(5), J(), J()]))).toEqual([5, "J", "J", "J", 9]);
    expect(arrangeRun([c(9), J(), c(5), J()])).toBeNull();
  });

  it("puts spare jokers on the high end by default, or the low end", () => {
    expect(shape(arrangeRun([c(5), c(6), c(7), J()]))).toEqual([5, 6, 7, "J"]);
    expect(shape(arrangeRun([c(5), c(6), c(7), J()], "low"))).toEqual(["J", 5, 6, 7]);
  });

  it("spills spare jokers to the other end when one end is at the Ace", () => {
    expect(shape(arrangeRun([c(12), c(13), c(1), J()]))).toEqual(["J", 12, 13, 1]);
    expect(shape(arrangeRun([c(1), c(2), c(3), J()], "low"))).toEqual([1, 2, 3, "J"]);
  });

  it("plays an Ace low or high, whichever fits", () => {
    expect(shape(arrangeRun([c(3), c(1), c(2), c(4)]))).toEqual([1, 2, 3, 4]);
    expect(shape(arrangeRun([c(1), c(12), c(11), c(13)]))).toEqual([11, 12, 13, 1]);
  });

  it("plays two Aces at both ends", () => {
    const cards = [c(1), c(1), ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => c(r))];
    expect(shape(arrangeRun(cards))?.[0]).toBe(1);
    expect(shape(arrangeRun(cards))?.at(-1)).toBe(1);
  });

  it("gives up on mixed suits, repeats, too few jokers or no real card", () => {
    expect(arrangeRun([c(4), c(5, "S"), c(6), c(7)])).toBeNull();
    expect(arrangeRun([c(4), c(5), c(5), c(6)])).toBeNull();
    expect(arrangeRun([c(4), c(9), c(6), J()])).toBeNull();
    expect(arrangeRun([J(), J(), J(), J()])).toBeNull();
  });

  it("whatever it returns reads as a run", () => {
    for (const cards of [
      [c(8), J(), c(5), c(7)],
      [c(12), c(13), c(1), J()],
      [c(2), J(), J(), c(5), J()],
    ]) {
      const arranged = arrangeRun(cards);
      expect(arranged).not.toBeNull();
      expect(readRun(arranged ?? []).ok).toBe(true);
    }
  });
});

describe("placementsFor", () => {
  const run = (cards: Card[]): RunMeld => {
    const r = readRun(cards);
    if (!r.ok) throw new Error(r.reason);
    return r.meld;
  };

  it("lists the ends a card fits", () => {
    expect(placementsFor(run([c(5), c(6), c(7), c(8)]), c(9))).toEqual([{ at: "high" }]);
    expect(placementsFor(run([c(5), c(6), c(7), c(8)]), c(4))).toEqual([{ at: "low" }]);
    expect(placementsFor(run([c(5), c(6), c(7), c(8)]), c(2))).toEqual([]);
  });

  it("a joker fits both open ends", () => {
    expect(placementsFor(run([c(5), c(6), c(7), c(8)]), J())).toEqual([{ at: "low" }, { at: "high" }]);
  });

  it("the card a joker stands for can replace it, sliding it to either open end", () => {
    expect(placementsFor(run([c(5), J(), c(7), c(8)]), c(6))).toEqual([
      { replace: 1, jokerTo: "low" },
      { replace: 1, jokerTo: "high" },
    ]);
  });
});

describe("mutation gaps: arrangeRun", () => {
  it("refuses a repeat at the low end", () => {
    expect(arrangeRun([c(5), c(5), c(6), c(7)])).toBeNull();
    expect(arrangeRun([c(5), c(5), c(6), c(7), J()])).toBeNull();
  });

  it("refuses a third Ace: a run has only two Ace spots", () => {
    const middle = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => c(r));
    expect(arrangeRun([c(1), c(1), c(1), ...middle])).toBeNull();
  });

  it("refuses a spare joker when the run already reaches both Aces", () => {
    const middle = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => c(r));
    expect(arrangeRun([c(1), c(1), ...middle, J()])).toBeNull();
  });

  it("spills the second spare joker once the first reaches the high Ace", () => {
    expect(shape(arrangeRun([c(11), c(12), c(13), J(), J()]))).toEqual(["J", 11, 12, 13, "J"]);
  });

  it("spills the second spare joker once the first reaches the low Ace", () => {
    expect(shape(arrangeRun([c(2), c(3), c(4), J(), J()], "low"))).toEqual(["J", 2, 3, 4, "J"]);
  });
});
