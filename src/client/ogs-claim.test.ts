import { describe, expect, it, vi } from "vitest";
import { callerToken, claimOgs, joinedRoomUrl } from "./ogs-claim";

/** Inside OGS, a page tells its room who it is and which household it sits with (POST /ogs/claim/:room). */
describe("claimOgs", () => {
  it("posts the caller id and the OGS game token", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    expect(await claimOgs({ fetch, room: "KQTP", t: "t-1", token: "jwt" })).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/ogs/claim/KQTP", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: "t-1", token: "jwt" }),
    });
  });
  it("no token (a plain browser, or OGS couldn't sign one): nothing to claim", async () => {
    const fetch = vi.fn();
    expect(await claimOgs({ fetch, room: "KQTP", t: "t-1", token: "" })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refused or offline: false (the page plays on with its TV's household)", async () => {
    expect(await claimOgs({ fetch: async () => new Response("no", { status: 401 }), room: "KQTP", t: "t", token: "j" })).toBe(false);
    expect(
      await claimOgs({
        fetch: async () => {
          throw new Error("offline");
        },
        room: "KQTP",
        t: "t",
        token: "j",
      }),
    ).toBe(false);
  });
});

describe("callerToken", () => {
  it("is the page's ?t=", () => {
    expect(callerToken("https://rsj.test/tv/KQTP?t=abc&stream=1")).toBe("abc");
    expect(callerToken("https://rsj.test/tv/KQTP")).toBeNull();
  });
});

describe("joinedRoomUrl: the OGS app opens /?ogsRoom=KQTP on a joining household's phone", () => {
  it("hosts into that room", () => {
    expect(joinedRoomUrl("https://rsj.test/?ogsRoom=KQTP")).toBe("/host?ogsRoom=KQTP");
  });
  it("no room: host a new one", () => {
    expect(joinedRoomUrl("https://rsj.test/")).toBe("/host");
    expect(joinedRoomUrl("https://rsj.test/?ogsRoom=a%20b")).toBe("/host");
  });
});
