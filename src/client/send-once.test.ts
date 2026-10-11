import { describe, expect, it } from "vitest";
import { moveKey, sendOnce } from "./send-once";

const view = (over: Partial<Parameters<typeof moveKey>[0]> = {}) => ({ logSeq: 5, turnPhase: "draw", handSize: 11, buyRequested: false, oopsSeq: 0, ...over });

describe("a move is sent once until the phone's view moves on (bug bash 2026-10-11, finding 6)", () => {
  it("a second tap on the same view is dropped", () => {
    const once = sendOnce();
    const sent: string[] = [];
    once(moveKey(view()), () => sent.push("DRAW"));
    once(moveKey(view()), () => sent.push("DRAW"));
    expect(sent).toEqual(["DRAW"]);
  });

  it("once the view moved on (a new card, a refusal, a buy asked, the turn), the next tap is sent", () => {
    for (const next of [{ handSize: 12 }, { oopsSeq: 1 }, { buyRequested: true }, { turnPhase: "play" }, { logSeq: 6 }]) {
      const once = sendOnce();
      const sent: string[] = [];
      once(moveKey(view()), () => sent.push("a"));
      once(moveKey(view(next)), () => sent.push("b"));
      expect(sent).toEqual(["a", "b"]);
    }
  });
});
