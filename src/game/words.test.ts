import { describe, expect, it } from "vitest";
import { cardName, rankName, suitSymbol } from "./words";

describe("words", () => {
  it("names cards the way people say them", () => {
    expect(cardName({ id: "x", kind: "card", suit: "S", rank: 7 })).toBe("7♠");
    expect(cardName({ id: "x", kind: "card", suit: "H", rank: 1 })).toBe("A♥");
    expect(cardName({ id: "x", kind: "card", suit: "D", rank: 12 })).toBe("Q♦");
    expect(cardName({ id: "x", kind: "joker" })).toBe("Joker");
  });

  it("ranks and suits", () => {
    expect([1, 10, 11, 13, 14].map(rankName)).toEqual(["A", "10", "J", "K", "A"]);
    expect(suitSymbol("C")).toBe("♣");
  });
});
