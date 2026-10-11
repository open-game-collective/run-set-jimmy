import { describe, expect, it } from "vitest";
import { breaches, percentile, roundTrips, summarize, timerLateness } from "./latency-stats";

describe("percentile (nearest rank)", () => {
  it("p50 and p95 of a list, in any order; null for no samples", () => {
    const xs = [50, 10, 40, 30, 20, 60, 70, 80, 90, 100];
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 95)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("round trips from a phone's clicks and its view changes", () => {
  it("a move's round trip is its last click to the first change of the phone's progress after it", () => {
    // Clicks at 100 (select a card) and 120 (send); the view changes at 125 (same progress) and 180 (moved on).
    const changes = [
      { at: 50, progress: "a" },
      { at: 125, progress: "a" },
      { at: 180, progress: "b" },
      { at: 400, progress: "c" },
    ];
    expect(roundTrips([{ clicks: [100, 120], after: "a" }], changes)).toEqual([60]);
  });

  it("a move whose result never showed is left out", () => {
    expect(roundTrips([{ clicks: [500], after: "c" }], [{ at: 400, progress: "c" }])).toEqual([]);
  });
});

describe("timer lateness from what the TV saw", () => {
  it("how long after its deadline the room's timer moved on; moves that ended it early are left out", () => {
    const seen = [
      { deadline: 1000, endedAt: 1040 },
      { deadline: 2000, endedAt: 2300 },
      { deadline: 3000, endedAt: 2500 }, // the turn player took the discard: not the timer
    ];
    expect(timerLateness(seen)).toEqual([40, 300]);
  });
});

describe("thresholds", () => {
  it("names every measure above its limit, and a measure with no samples when one is required", () => {
    const s = summarize({ roundTrip: [100, 120, 900], window: [30, 60], cut: [] });
    expect(s.roundTrip).toEqual({ n: 3, p50: 120, p95: 900, max: 900 });
    expect(breaches(s, { roundTripP95: 500, windowP95: 100, cutMax: 1000 })).toEqual([
      "round trip p95 900 ms > 500 ms",
      "cut: no samples",
    ]);
    expect(breaches(summarize({ roundTrip: [100], window: [30], cut: [200] }), { roundTripP95: 500, windowP95: 100, cutMax: 1000 })).toEqual([]);
  });
});
