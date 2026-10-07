import { describe, expect, it } from "vitest";
import type { Card, Suit } from "./cards";
import { playOnRun, playOnSet, readRun, readSet, runHigh, type RunMeld, type SetMeld } from "./melds";

let n = 0;
const c = (rank: number, suit: Suit = "H"): Card => ({ id: `c${n++}`, kind: "card", suit, rank });
const J = (): Card => ({ id: `j${n++}`, kind: "joker" });
const ok = <T>(r: { ok: true; meld: T } | { ok: false; reason: string }): T => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.meld;
};
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);

describe("readRun", () => {
  it("reads four consecutive cards of one suit", () => {
    const run = ok(readRun([c(4), c(5), c(6), c(7)]));
    expect(run).toMatchObject({ kind: "run", suit: "H", low: 4 });
    expect(runHigh(run)).toBe(7);
  });

  it("allows long runs", () => {
    expect(runHigh(ok(readRun([c(2), c(3), c(4), c(5), c(6), c(7), c(8)])))).toBe(8);
  });

  it("rejects fewer than 4 cards", () => {
    expect(reason(readRun([c(4), c(5), c(6)]))).toMatch(/at least 4/);
  });

  it("rejects mixed suits", () => {
    expect(reason(readRun([c(4), c(5, "S"), c(6), c(7)]))).toMatch(/same suit/);
  });

  it("rejects gaps and out-of-order cards", () => {
    expect(reason(readRun([c(4), c(5), c(7), c(8)]))).toMatch(/in order/);
    expect(reason(readRun([c(5), c(4), c(6), c(7)]))).toMatch(/in order/);
  });

  it("rejects a repeated rank", () => {
    expect(reason(readRun([c(4), c(5), c(5), c(6)]))).toMatch(/in order/);
  });

  it("plays the Ace low", () => {
    expect(ok(readRun([c(1), c(2), c(3), c(4)])).low).toBe(1);
  });

  it("plays the Ace high", () => {
    const run = ok(readRun([c(11), c(12), c(13), c(1)]));
    expect(run.low).toBe(11);
    expect(runHigh(run)).toBe(14);
  });

  it("runs Ace to Ace (14 cards)", () => {
    const cards = [c(1), ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((r) => c(r)), c(1)];
    expect(runHigh(ok(readRun(cards)))).toBe(14);
  });

  it("never wraps K-A-2", () => {
    expect(reason(readRun([c(12), c(13), c(1), c(2)]))).toMatch(/in order/);
  });

  it("fixes a joker by its position", () => {
    const run = ok(readRun([c(5), J(), c(7), c(8)]));
    expect(run.low).toBe(5);
    expect(runHigh(run)).toBe(8);
  });

  it("anchors a run that starts with jokers", () => {
    const run = ok(readRun([J(), J(), c(7), c(8)]));
    expect(run.low).toBe(5);
  });

  it("allows any number of jokers if one card is real", () => {
    expect(ok(readRun([J(), J(), J(), c(8)])).low).toBe(5);
  });

  it("rejects an all-joker run", () => {
    expect(reason(readRun([J(), J(), J(), J()]))).toMatch(/real card/);
  });

  it("rejects jokers that would run past the Ace", () => {
    expect(reason(readRun([J(), c(1), c(2), c(3)]))).toMatch(/in order/);
    expect(reason(readRun([c(12), c(13), c(1), J()]))).toMatch(/in order/);
  });
});

describe("readSet", () => {
  it("reads three of a rank in any suits, duplicates allowed", () => {
    expect(ok(readSet([c(8, "S"), c(8, "S"), c(8, "H")]))).toMatchObject({ kind: "set", rank: 8 });
  });

  it("rejects fewer than 3 cards", () => {
    expect(reason(readSet([c(8), c(8)]))).toMatch(/at least 3/);
  });

  it("rejects mixed ranks", () => {
    expect(reason(readSet([c(8), c(8), c(9)]))).toMatch(/same rank/);
  });

  it("allows jokers but needs one real card", () => {
    expect(ok(readSet([J(), J(), c(13)])).rank).toBe(13);
    expect(reason(readSet([J(), J(), J()]))).toMatch(/real card/);
  });
});

describe("playOnRun", () => {
  const base = (): RunMeld => ok(readRun([c(5), J(), c(7), c(8)]));

  it("extends at the low end", () => {
    const run = ok(playOnRun(base(), c(4), { at: "low" }));
    expect(run.low).toBe(4);
    expect(run.cards).toHaveLength(5);
  });

  it("extends at the high end", () => {
    expect(runHigh(ok(playOnRun(base(), c(9), { at: "high" })))).toBe(9);
  });

  it("extends with a joker at either end", () => {
    expect(ok(playOnRun(base(), J(), { at: "low" })).low).toBe(4);
    expect(runHigh(ok(playOnRun(base(), J(), { at: "high" })))).toBe(9);
  });

  it("rejects the wrong card for an end", () => {
    expect(reason(playOnRun(base(), c(10), { at: "high" }))).toMatch(/doesn't fit/);
    expect(reason(playOnRun(base(), c(9, "S"), { at: "high" }))).toMatch(/doesn't fit/);
  });

  it("puts a low Ace below the 2 and a high Ace above the King", () => {
    const low = ok(readRun([c(2), c(3), c(4), c(5)]));
    expect(ok(playOnRun(low, c(1), { at: "low" })).low).toBe(1);
    const high = ok(readRun([c(10), c(11), c(12), c(13)]));
    expect(runHigh(ok(playOnRun(high, c(1), { at: "high" })))).toBe(14);
  });

  it("can't extend past the Aces", () => {
    const top = ok(readRun([c(11), c(12), c(13), c(1)]));
    expect(reason(playOnRun(top, c(2), { at: "high" }))).toMatch(/end is closed/);
    expect(reason(playOnRun(top, J(), { at: "high" }))).toMatch(/end is closed/);
    const bottom = ok(readRun([c(1), c(2), c(3), c(4)]));
    expect(reason(playOnRun(bottom, J(), { at: "low" }))).toMatch(/end is closed/);
  });

  describe("slide rule", () => {
    it("the real card takes the joker's spot and the joker slides high", () => {
      const run = base();
      const six = c(6);
      const joker = run.cards[1];
      const after = ok(playOnRun(run, six, { replace: 1, jokerTo: "high" }));
      expect(after.low).toBe(5);
      expect(after.cards.map((x) => x.id)).toEqual([run.cards[0]?.id, six.id, run.cards[2]?.id, run.cards[3]?.id, joker?.id]);
      expect(runHigh(after)).toBe(9);
    });

    it("or slides low", () => {
      const run = base();
      const after = ok(playOnRun(run, c(6), { replace: 1, jokerTo: "low" }));
      expect(after.low).toBe(4);
      expect(after.cards[0]?.kind).toBe("joker");
    });

    it("only the card the joker stands for can replace it", () => {
      expect(reason(playOnRun(base(), c(7), { replace: 1, jokerTo: "high" }))).toMatch(/stands for/);
      expect(reason(playOnRun(base(), c(6, "S"), { replace: 1, jokerTo: "high" }))).toMatch(/stands for/);
    });

    it("only a joker can be replaced", () => {
      expect(reason(playOnRun(base(), c(5), { replace: 0, jokerTo: "high" }))).toMatch(/not a joker/);
      expect(reason(playOnRun(base(), c(5), { replace: 9, jokerTo: "high" }))).toMatch(/not a joker/);
    });

    it("a joker can't replace a joker", () => {
      expect(reason(playOnRun(base(), J(), { replace: 1, jokerTo: "high" }))).toMatch(/stands for/);
    });

    it("needs the chosen end to be open", () => {
      const run = ok(readRun([c(11), J(), c(13), c(1)]));
      expect(reason(playOnRun(run, c(12), { replace: 1, jokerTo: "high" }))).toMatch(/end is closed/);
      expect(ok(playOnRun(run, c(12), { replace: 1, jokerTo: "low" })).low).toBe(10);
    });

    it("a high Ace replaces a joker standing above the King", () => {
      const run = ok(readRun([c(11), c(12), c(13), J()]));
      const after = ok(playOnRun(run, c(1), { replace: 3, jokerTo: "low" }));
      expect(after.low).toBe(10);
      expect(runHigh(after)).toBe(14);
    });

    it("does not mutate the meld", () => {
      const run = base();
      const ids = run.cards.map((x) => x.id);
      playOnRun(run, c(6), { replace: 1, jokerTo: "high" });
      playOnRun(run, c(4), { at: "low" });
      expect(run.cards.map((x) => x.id)).toEqual(ids);
      expect(run.low).toBe(5);
    });
  });
});

describe("playOnSet", () => {
  const base = (): SetMeld => ok(readSet([c(8), J(), c(8, "S")]));

  it("adds a card of the rank, or a joker", () => {
    expect(ok(playOnSet(base(), c(8, "D"))).cards).toHaveLength(4);
    expect(ok(playOnSet(base(), J())).cards).toHaveLength(4);
  });

  it("rejects another rank", () => {
    expect(reason(playOnSet(base(), c(9)))).toMatch(/doesn't fit/);
  });
});
