import { describe, expect, it, vi } from "vitest";
import { hostTarget, ogsClaim } from "./ogs-claim";

/** POST /ogs/claim/:room: a verified OGS game token says who a caller is and which household they sit with. */
const T = "0b9c5d1e-1111-4222-8333-944445555666";
const claims = (couch?: { sid: string; label: string }) => ({
  iss: "https://api.test",
  aud: "run-set-jimmy",
  sub: "p_sam",
  handle: "sam",
  name: "Sam",
  avatar: "https://tv.test/a.webp",
  iat: 1,
  exp: 2,
  ...(couch ? { couch } : {}),
});
const post = (body: unknown) =>
  new Request("https://rsj.test/ogs/claim/KQTP", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

function deps(verified: ReturnType<typeof claims> | null) {
  return { verify: vi.fn(async () => verified), send: vi.fn(async () => {}) };
}

describe("ogsClaim", () => {
  it("a verified token with a couch: the room learns who the caller is and their household", async () => {
    const d = deps(claims({ sid: "s-smith", label: "Sam" }));
    const res = await ogsClaim(post({ t: T, token: "jwt" }), "KQTP", d);
    expect(res.status).toBe(204);
    expect(d.verify).toHaveBeenCalledWith("jwt");
    expect(d.send).toHaveBeenCalledWith("KQTP", {
      type: "OGS_CLAIM",
      callerId: T,
      claim: { profileId: "p_sam", name: "Sam", avatar: "https://tv.test/a.webp", couch: { sid: "s-smith", label: "Sam" } },
    });
  });

  it("a token that doesn't verify: 401, nothing sent", async () => {
    const d = deps(null);
    expect((await ogsClaim(post({ t: T, token: "jwt" }), "KQTP", d)).status).toBe(401);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("a token with no couch (a phone outside a couch session): who they are, no household", async () => {
    const d = deps(claims());
    expect((await ogsClaim(post({ t: T, token: "jwt" }), "KQTP", d)).status).toBe(204);
    expect(d.send).toHaveBeenCalledWith("KQTP", {
      type: "OGS_CLAIM",
      callerId: T,
      claim: { profileId: "p_sam", name: "Sam", avatar: "https://tv.test/a.webp", couch: null },
    });
  });

  it.each([{}, { t: "nope", token: "jwt" }, { t: T }, { t: T, token: "" }, "not json"])("a bad body (%j): 400", async (body) => {
    const d = deps(claims({ sid: "s", label: "S" }));
    const req = typeof body === "string" ? new Request("https://rsj.test/ogs/claim/KQTP", { method: "POST", body }) : post(body);
    expect((await ogsClaim(req, "KQTP", d)).status).toBe(400);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("only POST", async () => {
    const d = deps(claims({ sid: "s", label: "S" }));
    expect((await ogsClaim(new Request("https://rsj.test/ogs/claim/KQTP"), "KQTP", d)).status).toBe(405);
  });
});

describe("hostTarget: /host makes a room, /host?ogsRoom= joins one", () => {
  it("ogsRoom names an existing room: join it as a new TV's household", () => {
    expect(hostTarget(new URL("https://rsj.test/host?ogsRoom=kqtp"))).toEqual({ join: "KQTP" });
  });
  it("no room, or not a room code: make a new one", () => {
    expect(hostTarget(new URL("https://rsj.test/host"))).toEqual({ join: null });
    expect(hostTarget(new URL("https://rsj.test/host?ogsRoom=AB1"))).toEqual({ join: null });
  });
});
