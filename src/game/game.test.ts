import { describe, expect, it } from "vitest";
import { addRound, dealerFor, newScoreSheet, standings, winners } from "./game";

describe("dealerFor", () => {
  it("starts at seat 0 and moves one seat each round", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((r) => dealerFor(r, 3))).toEqual([0, 1, 2, 0, 1, 2, 0]);
  });
});

describe("score sheet", () => {
  it("adds rounds and totals them", () => {
    let sheet = newScoreSheet(["a", "b"]);
    sheet = addRound(sheet, { a: 0, b: 40 });
    sheet = addRound(sheet, { a: 15, b: 0 });
    expect(sheet.rounds).toEqual([
      { a: 0, b: 40 },
      { a: 15, b: 0 },
    ]);
    expect(standings(sheet)).toEqual([
      { id: "a", total: 15 },
      { id: "b", total: 40 },
    ]);
  });

  it("refuses an 8th round", () => {
    let sheet = newScoreSheet(["a", "b"]);
    for (let i = 0; i < 7; i++) sheet = addRound(sheet, { a: 0, b: 5 });
    expect(() => addRound(sheet, { a: 0, b: 5 })).toThrow(/7 rounds/);
  });

  it("the lowest total wins after round 7, and ties share the win", () => {
    let sheet = newScoreSheet(["a", "b", "c"]);
    expect(winners(sheet)).toEqual([]);
    for (let i = 0; i < 7; i++) sheet = addRound(sheet, { a: 10, b: 10, c: 20 });
    expect(winners(sheet)).toEqual(["a", "b"]);
  });
});

describe("standings order", () => {
  it("sorts lowest first whatever the seat order", () => {
    let sheet = newScoreSheet(["a", "b", "c"]);
    sheet = addRound(sheet, { a: 50, b: 5, c: 20 });
    expect(standings(sheet).map((s) => s.id)).toEqual(["b", "c", "a"]);
    sheet = addRound(sheet, { a: 0, b: 60, c: 0 });
    expect(standings(sheet)).toEqual([
      { id: "c", total: 20 },
      { id: "a", total: 50 },
      { id: "b", total: 65 },
    ]);
  });
});
