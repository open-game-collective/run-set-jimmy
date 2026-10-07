import { describe, expect, it } from "vitest";
import { firstBroken, type Rule } from "./refusal";

describe("firstBroken", () => {
  it("is null when every rule holds", () => {
    expect(firstBroken([[() => false, "a"], [() => false, "b"]])).toBeNull();
    expect(firstBroken([])).toBeNull();
  });

  it("gives the first broken rule's reason and stops checking there", () => {
    const checked: string[] = [];
    const rule = (name: string, broken: boolean): Rule => [() => (checked.push(name), broken), name];
    expect(firstBroken([rule("a", false), rule("b", true), rule("c", true)])).toBe("b");
    expect(checked).toEqual(["a", "b"]);
  });
});
