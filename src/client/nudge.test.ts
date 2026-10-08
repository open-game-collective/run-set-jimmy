import { describe, expect, it } from "vitest";
import { nudgeDue } from "./nudge";

describe("nudgeDue: a screen wakes the room once a deadline has passed", () => {
  it("not before the deadline, nor in the grace moment after it (the room's own timer usually wins)", () => {
    expect(nudgeDue([1000], 900)).toBe(false);
    expect(nudgeDue([1000], 1200)).toBe(false);
  });
  it("once a deadline is well past", () => {
    expect(nudgeDue([1000], 1600)).toBe(true);
    expect(nudgeDue([null, 1000], 1600)).toBe(true);
  });
  it("never without a deadline", () => {
    expect(nudgeDue([null, null], 99_999)).toBe(false);
    expect(nudgeDue([], 99_999)).toBe(false);
  });
});
