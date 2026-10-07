import { describe, expect, it } from "vitest";
import { buildShoe, cardPoints, decksFor, handPoints, mulberry32, shuffle, type Card } from "./cards";

const natural = (rank: number, suit: "S" | "H" | "D" | "C" = "S"): Card => ({
  id: `t-${suit}${rank}`,
  kind: "card",
  suit,
  rank,
});
const joker: Card = { id: "t-J", kind: "joker" };

describe("decksFor", () => {
  it.each([
    [2, 2],
    [3, 2],
    [4, 3],
    [7, 3],
  ])("%i players play with %i decks", (players, decks) => {
    expect(decksFor(players)).toBe(decks);
  });

  it.each([1, 8])("rejects %i players", (players) => {
    expect(() => decksFor(players)).toThrow(/2–7 players/);
  });
});

describe("buildShoe", () => {
  it("has 108 cards and 4 jokers for 3 players", () => {
    const shoe = buildShoe(3);
    expect(shoe).toHaveLength(108);
    expect(shoe.filter((c) => c.kind === "joker")).toHaveLength(4);
  });

  it("has 162 cards and 6 jokers for 4 players", () => {
    const shoe = buildShoe(4);
    expect(shoe).toHaveLength(162);
    expect(shoe.filter((c) => c.kind === "joker")).toHaveLength(6);
  });

  it("gives every card a unique id", () => {
    const shoe = buildShoe(7);
    expect(new Set(shoe.map((c) => c.id)).size).toBe(shoe.length);
  });

  it("has each suit and rank once per deck", () => {
    const shoe = buildShoe(2);
    const sevensOfHearts = shoe.filter((c) => c.kind === "card" && c.suit === "H" && c.rank === 7);
    expect(sevensOfHearts).toHaveLength(2);
    const ranks = new Set(shoe.flatMap((c) => (c.kind === "card" ? [c.rank] : [])));
    expect([...ranks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});

describe("cardPoints", () => {
  it.each([
    [2, 5],
    [7, 5],
    [8, 10],
    [10, 10],
    [13, 10],
    [1, 20],
  ])("rank %i scores %i", (rank, points) => {
    expect(cardPoints(natural(rank))).toBe(points);
  });

  it("a joker scores 50", () => {
    expect(cardPoints(joker)).toBe(50);
  });

  it("sums a hand", () => {
    expect(handPoints([natural(2), natural(9), natural(1), joker])).toBe(85);
    expect(handPoints([])).toBe(0);
  });
});

describe("shuffle", () => {
  it("is a permutation and does not mutate its input", () => {
    const shoe = buildShoe(2);
    const before = shoe.map((c) => c.id);
    const out = shuffle(shoe, mulberry32(42));
    expect(shoe.map((c) => c.id)).toEqual(before);
    expect([...out.map((c) => c.id)].sort()).toEqual([...before].sort());
    expect(out.map((c) => c.id)).not.toEqual(before);
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const shoe = buildShoe(2);
    const a = shuffle(shoe, mulberry32(7)).map((c) => c.id);
    expect(shuffle(shoe, mulberry32(7)).map((c) => c.id)).toEqual(a);
    expect(shuffle(shoe, mulberry32(8)).map((c) => c.id)).not.toEqual(a);
  });
});

describe("mulberry32", () => {
  it("yields numbers in [0, 1)", () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
