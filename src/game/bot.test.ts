import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { findGoDown } from "./bot";
import { playGame } from "./sim";

let n = 0;
const c = (rank: number, suit: Suit = "H"): Card => ({ id: `c${n++}`, kind: "card", suit, rank });
const J = (): Card => ({ id: `j${n++}`, kind: "joker" });

describe("findGoDown", () => {
  it("finds one run and one set", () => {
    const hand = [c(4), c(5), c(6), c(7), c(9, "S"), c(9, "D"), c(9, "C"), c(2, "S"), c(12, "D")];
    const found = findGoDown(hand, { runs: 1, sets: 1 });
    expect(found?.map((m) => [m.kind, m.cardIds.length])).toEqual([
      ["run", 4],
      ["set", 3],
    ]);
  });

  it("uses a joker to fill a gap", () => {
    const hand = [c(4), c(5), J(), c(7), c(9, "S"), c(9, "D"), c(9, "C"), c(2, "S")];
    const found = findGoDown(hand, { runs: 1, sets: 1 });
    expect(found?.[0]?.cardIds).toHaveLength(4);
  });

  it("finds three runs", () => {
    const hand = [
      ...[2, 3, 4, 5].map((r) => c(r, "S")),
      ...[8, 9, 10, 11].map((r) => c(r, "D")),
      ...[10, 11, 12, 13].map((r) => c(r, "C")),
    ];
    expect(findGoDown(hand, { runs: 3, sets: 0 })?.length).toBe(3);
  });

  it("returns null when the hand can't go down", () => {
    const hand = [c(4), c(5), c(6), c(9, "S"), c(9, "D"), c(2, "S"), c(12, "D")];
    expect(findGoDown(hand, { runs: 1, sets: 1 })).toBeNull();
  });

  it("never uses a card twice", () => {
    const hand = [c(4), c(5), c(6), c(7), c(7, "S"), c(7, "D"), c(2, "S")];
    const found = findGoDown(hand, { runs: 1, sets: 1 });
    if (found) {
      const ids = found.flatMap((m) => m.cardIds);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("bots play whole games", () => {
  it.each([1, 2, 3, 4, 5])("4 players finish all 7 rounds (seed %i)", (seed) => {
    const result = playGame({ seed, players: 4 });
    expect(result.rounds).toHaveLength(7);
    for (const r of result.rounds) {
      expect(Object.values(r.scores).filter((s) => s === 0).length).toBeGreaterThanOrEqual(1);
    }
    expect(result.winners.length).toBeGreaterThanOrEqual(1);
  });

  it.each([3, 7])("%i players finish too", (players) => {
    expect(playGame({ seed: 11, players }).rounds).toHaveLength(7);
  });
});
