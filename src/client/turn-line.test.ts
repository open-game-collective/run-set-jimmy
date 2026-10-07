import { describe, expect, it } from "vitest";
import { turnLine } from "./turn-line";

const base = { myTurn: true, phase: "draw" as const, down: false, windowOpen: false, offerFrom: null, turnName: "Ben", top: "8♦", canBuy: false, buyRequested: false };

describe("turnLine: what the phone tells its player", () => {
  it("on your draw", () => {
    expect(turnLine(base)).toEqual({ mine: true, text: "Your turn: draw a card" });
    expect(turnLine({ ...base, windowOpen: true })).toEqual({ mine: true, text: "Your turn: take the 8♦ now, or wait for the deck" });
  });
  it("when someone wants your discard", () => {
    expect(turnLine({ ...base, phase: "offer", offerFrom: "Cat" })).toEqual({ mine: true, text: "Your turn: Cat wants the 8♦" });
  });
  it("after drawing", () => {
    expect(turnLine({ ...base, phase: "play" })).toEqual({ mine: true, text: "Your turn: go down if you can, then discard" });
    expect(turnLine({ ...base, phase: "play", down: true })).toEqual({ mine: true, text: "Your turn: play cards on the table, then discard" });
  });
  it("on someone else's turn", () => {
    expect(turnLine({ ...base, myTurn: false })).toEqual({ mine: false, text: "Ben's turn" });
    expect(turnLine({ ...base, myTurn: false, windowOpen: true, canBuy: true })).toEqual({ mine: false, text: "Ben's turn · you can buy the 8♦" });
    expect(turnLine({ ...base, myTurn: false, windowOpen: true, buyRequested: true })).toEqual({ mine: false, text: "Ben's turn · you asked to buy the 8♦" });
  });
});
