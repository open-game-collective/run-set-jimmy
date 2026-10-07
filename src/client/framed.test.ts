import { describe, expect, it } from "vitest";
import { isFramed } from "./framed";

describe("is another page framing this one (the OGS TV launcher)?", () => {
  it("is framed when its top window is another window", () => {
    const top = {};
    expect(isFramed({ self: {}, top })).toBe(true);
  });

  it("is not framed when it is its own top window", () => {
    const win: { self: unknown; top: unknown } = { self: null, top: null };
    win.self = win;
    win.top = win;
    expect(isFramed(win)).toBe(false);
  });
});
