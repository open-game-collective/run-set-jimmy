import { describe, expect, it } from "vitest";
import type { Card, Suit } from "../game/cards";
import type { RunMeld } from "../game/melds";
import { applyOrder, builderSlots, moveCard, placementLabel, slotStatus, sortHand, toProposals } from "./hand";

let n = 0;
const c = (rank: number, suit: Suit = "H"): Card => ({ id: `c${n++}`, kind: "card", suit, rank });
const J = (): Card => ({ id: `j${n++}`, kind: "joker" });
const show = (cards: readonly Card[]) => cards.map((x) => (x.kind === "joker" ? "J" : `${x.rank}${x.suit}`));

describe("sortHand", () => {
  const hand = [c(9, "S"), J(), c(2, "H"), c(9, "D"), c(1, "S"), c(13, "C")];
  it("by suit, then rank (Aces low), jokers last", () => {
    expect(show(sortHand(hand, "suit"))).toEqual(["1S", "9S", "2H", "9D", "13C", "J"]);
  });
  it("by rank, then suit, jokers last", () => {
    expect(show(sortHand(hand, "rank"))).toEqual(["1S", "2H", "9S", "9D", "13C", "J"]);
  });
});

describe("applyOrder / moveCard: the player's own arrangement", () => {
  it("keeps the player's order and puts new cards at the end", () => {
    const [a, b, d] = [c(2), c(3), c(4)];
    const hand = [a, b, d].map((x) => x as Card);
    expect(applyOrder(hand, [d?.id ?? "", a?.id ?? ""]).map((x) => x.id)).toEqual([d?.id, a?.id, b?.id]);
  });
  it("drops cards that left the hand", () => {
    const a = c(2);
    expect(applyOrder([a], ["gone", a.id]).map((x) => x.id)).toEqual([a.id]);
  });
  it("moves a card to a new position", () => {
    expect(moveCard(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveCard(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveCard(["a", "b"], "zz", 0)).toEqual(["a", "b"]);
  });
});

describe("go-down builder", () => {
  it("has a slot per run and set the round needs", () => {
    expect(builderSlots({ runs: 2, sets: 1 }).map((s) => s.label)).toEqual(["Run 1", "Run 2", "Set"]);
    expect(builderSlots({ runs: 0, sets: 3 }).map((s) => s.label)).toEqual(["Set 1", "Set 2", "Set 3"]);
  });

  it("says when a slot is ready, or what's missing", () => {
    expect(slotStatus("run", [c(5), c(7), J(), c(6)])).toEqual({ ok: true, line: "5♥ to 8♥" });
    expect(slotStatus("run", [c(5), c(6)])).toEqual({ ok: false, line: "2 more cards" });
    expect(slotStatus("run", [c(5), c(6), c(7), c(9, "S")])).toEqual({ ok: false, line: "One suit only" });
    expect(slotStatus("run", [c(5), c(6), c(7), c(10)])).toEqual({ ok: false, line: "Not in a row" });
    expect(slotStatus("set", [c(8), c(8, "S"), J()])).toEqual({ ok: true, line: "Three 8s" });
    expect(slotStatus("set", [c(8), c(8, "S"), c(8, "D"), c(8, "C")])).toEqual({ ok: true, line: "Four 8s" });
    expect(slotStatus("set", [c(8), c(9)])).toEqual({ ok: false, line: "Same rank only" });
    expect(slotStatus("set", [c(8)])).toEqual({ ok: false, line: "2 more cards" });
    expect(slotStatus("set", [])).toEqual({ ok: false, line: "Tap cards to add" });
  });

  it("turns the slots into the GO_DOWN melds", () => {
    const run = [c(5), c(6), c(7), J()];
    const set = [c(8), c(8, "S"), c(8, "D")];
    expect(
      toProposals([
        { kind: "run", label: "Run", cards: run, spare: "low" },
        { kind: "set", label: "Set", cards: set, spare: "high" },
      ]),
    ).toEqual([
      { kind: "run", cardIds: run.map((x) => x.id), spare: "low" },
      { kind: "set", cardIds: set.map((x) => x.id) },
    ]);
  });
});

describe("placementLabel", () => {
  const run: RunMeld = { kind: "run", suit: "H", low: 5, cards: [c(5), J(), c(7), c(8)] };
  it("names the end or the joker swap in cards people know", () => {
    expect(placementLabel(run, { at: "low" })).toBe("Below the 5♥");
    expect(placementLabel(run, { at: "high" })).toBe("Above the 8♥");
    expect(placementLabel(run, { replace: 1, jokerTo: "low" })).toBe("Swap for the Joker, Joker to 4♥");
    expect(placementLabel(run, { replace: 1, jokerTo: "high" })).toBe("Swap for the Joker, Joker to 9♥");
  });
});
