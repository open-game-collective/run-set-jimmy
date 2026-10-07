/**
 * Seam tests for the OGS contract (ogs-docs.pages.dev/contract.md, testing.md):
 *   - the TV page in a stand-in launcher: ogs:ready, ogs:start names the couch, no room code or QR
 *     inside OGS, ogs:room and ogs:instance reported, silent while parked;
 *   - the phone page in a fake OGS WebView: joins under the verified OGS profile (no name form),
 *     declares the room's TV page, reports the sitting, follows the TV into its room;
 *   - several couches in one room (multiCouch): households on the TV.
 *
 * Run against `pnpm dev:seam` (OGS_JWKS_URL points at the test key set served on 8831).
 */
import { chromium, type Browser, type Frame, type Page } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { gameClaims } from "../src/test/ogsTestKeys";
import { ogsSeamKey } from "./ogs-jwks";
import { playTable } from "./table";

const BASE = process.env.GAME_URL ?? "http://localhost:8798";
const APP = "run-set-jimmy";
const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

const TRACK_AUDIO = `
  window.__ctxs = [];
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...a) { super(...a); window.__ctxs.push(this); }
  };
`;
const audioStates = (f: Frame) => f.evaluate(() => Reflect.get(window, "__ctxs").map((c: AudioContext) => c.state));

/** A new room's TV path (/tv/CODE), as a laptop would get it. */
async function newTvPath(): Promise<string> {
  const res = await fetch(`${BASE}/`, { redirect: "manual" });
  return new URL(res.headers.get("location") ?? "").pathname;
}

/** A stand-in launcher: one iframe, collecting what the game posts to its parent. */
async function launcher(browser: Browser, tvUrl: string): Promise<{ page: Page; frame: Frame; post: (m: object) => Promise<void>; got: () => Promise<{ type: string }[]> }> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript(TRACK_AUDIO);
  await page.setContent(
    `<script>window.__got = []; addEventListener("message", (e) => window.__got.push(e.data));</script>` +
      `<iframe id="game" allow="autoplay; fullscreen" src="${tvUrl}" style="width:1280px;height:720px;border:0"></iframe>`,
  );
  const frame = await (await page.waitForSelector("#game")).contentFrame();
  if (!frame) throw new Error("no game frame");
  const post = (m: object) =>
    page.evaluate((msg) => {
      const el = document.getElementById("game");
      if (el instanceof HTMLIFrameElement) el.contentWindow?.postMessage(msg, "*");
    }, m);
  const got = () => page.evaluate(() => Reflect.get(window, "__got") as { type: string }[]);
  return { page, frame, post, got };
}

const start = (players: { id: string; name: string }[], token = "") => ({
  type: "ogs:start",
  instanceId: "sitting-1",
  mode: "new",
  roster: [],
  token,
  players: players.map((p) => ({ ...p, handle: p.id, avatar: "https://example.com/a.png" })),
});

describe("the TV page, framed by the OGS launcher", () => {
  it("says ogs:ready, hides its room code and QR after ogs:start, and reports its room and label", async () => {
    const browser = await browserP;
    const path = await newTvPath();
    const code = path.split("/")[2] ?? "";
    const { frame, post, got } = await launcher(browser, `${BASE}${path}?stream=1`);
    await expect.poll(async () => (await got()).some((m) => m.type === "ogs:ready"), { timeout: 15_000 }).toBe(true);
    await post(start([{ id: "p1", name: "Sam" }]));
    await frame.getByText("Run").first().waitFor();
    await expect.poll(async () => frame.getByTestId("tv-join").count(), { timeout: 5000 }).toBe(0);
    await expect.poll(async () => (await got()).find((m) => m.type === "ogs:room"), { timeout: 5000 }).toEqual({ type: "ogs:room", room: code });
    await expect
      .poll(async () => (await got()).find((m) => m.type === "ogs:instance"), { timeout: 5000 })
      .toMatchObject({ type: "ogs:instance", report: { instanceId: `${APP}:${code}`, appId: APP, status: "lobby", title: `Room ${code}` } });
  }, 40_000);

  it("keeps its own room code and QR in a plain browser", async () => {
    const page = await (await (await browserP).newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const path = await newTvPath();
    await page.goto(`${BASE}${path}`);
    await page.getByTestId("tv-join").waitFor({ timeout: 10_000 });
    expect(await page.getByTestId("room-code").textContent()).toBe(path.split("/")[2]);
  });

  it("suspends its sound on ogs:suspend and resumes it on ogs:resume", async () => {
    const { frame, post, page } = await launcher(await browserP, `${BASE}${await newTvPath()}?stream=1`);
    await expect.poll(() => audioStates(frame), { timeout: 15_000 }).toEqual(["running"]);
    await post({ type: "ogs:suspend" });
    await expect.poll(() => audioStates(frame)).toEqual(["suspended"]);
    await page.waitForTimeout(500);
    expect(await audioStates(frame)).toEqual(["suspended"]);
    await post({ type: "ogs:resume" });
    await expect.poll(() => audioStates(frame)).toEqual(["running"]);
  }, 30_000);
});

const NATIVE_CAST_STATE = {
  isAvailable: true,
  devices: [{ id: "tv-1", name: "Living Room TV", type: "chromecast" }],
  session: { status: "disconnected", deviceId: null, deviceName: null, sessionId: null, streamSessionId: null },
  error: null,
  viewUrl: null,
};

/** The OGS app's WebView: answers BRIDGE_READY with its stores (cast, ogs, profile). */
const fakeWebView = (profile: Record<string, unknown> | null) => `
  window.__ogsSent = [];
  const stores = {
    cast: ${JSON.stringify(NATIVE_CAST_STATE)},
    ogs: { reported: [] },
    profile: ${JSON.stringify(profile ? { status: "ready", profile } : { status: "none" })},
  };
  window.ReactNativeWebView = {
    postMessage(raw) {
      const msg = JSON.parse(raw);
      window.__ogsSent.push(msg);
      if (msg.type === "BRIDGE_READY") {
        setTimeout(() => {
          for (const [storeKey, data] of Object.entries(stores))
            window.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "STATE_INIT", storeKey, data }) }));
        }, 50);
      }
    },
  };
`;

type Sent = { type: string; storeKey?: string; event?: { type: string; url?: string; report?: Record<string, unknown> } };

async function ogsPhone(who: { id: string; handle: string; name: string }, opts: { aud?: string; couch?: { sid: string; label: string } } = {}) {
  const key = await ogsSeamKey();
  const claims = { ...gameClaims(opts.aud ?? APP, who), ...(opts.couch ? { couch: opts.couch } : {}) };
  const token = await key.sign(claims);
  const ctx = await (await browserP).newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(fakeWebView({ ...who, avatar: claims.avatar, token }));
  const page = await ctx.newPage();
  const sent = async () => (await page.evaluate("window.__ogsSent")) as Sent[];
  return { page, sent };
}

/** The room code a phone page is in. */
const roomOf = (page: Page) => new URL(page.url()).pathname.split("/")[2] ?? "";

/** The public room as a plain browser sees it (the TV page's boot payload). */
async function tvSeats(code: string): Promise<{ name: string; avatar: string | null; couch: string | null }[]> {
  const page = await (await (await browserP).newContext()).newPage();
  await page.goto(`${BASE}/tv/${code}`);
  const seats = await page.evaluate(() => JSON.parse(document.getElementById("boot")?.textContent ?? "{}").snapshot.public.seats);
  await page.close();
  return seats;
}

describe("the phone page inside the OGS app", () => {
  it("hosts from the start page: joins under the verified profile (no name form), declares the TV page, reports the sitting", async () => {
    const { page, sent } = await ogsPhone({ id: "prof_robin", handle: "robin", name: "Robin" });
    await page.goto(`${BASE}/`);
    await page.getByTestId("lobby-seat").first().waitFor({ timeout: 15_000 });
    expect(await page.getByLabel("Your name at the table").count()).toBe(0);
    const code = roomOf(page);
    await expect.poll(async () => (await tvSeats(code))[0], { timeout: 10_000 }).toMatchObject({ name: "Robin", avatar: expect.stringMatching(/^https:/) });

    const viewUrl = async () => (await sent()).find((m) => m.event?.type === "SET_VIEW_URL")?.event?.url ?? "";
    await expect.poll(viewUrl, { timeout: 10_000 }).toMatch(new RegExp(`/tv/${code}\\?t=[0-9a-f-]{36}&stream=1$`));
    expect(await page.getByRole("button", { name: /cast/i }).count()).toBe(0);

    const reports = async () =>
      (await sent()).filter((m) => m.storeKey === "ogs" && m.event?.type === "INSTANCE_REPORT").map((m) => m.event?.report);
    await expect.poll(reports, { timeout: 10_000 }).toContainEqual(expect.objectContaining({ instanceId: `${APP}:${code}`, status: "lobby", title: `Room ${code}` }));
  }, 40_000);

  it("a couch phone following the TV (?ogsRoom=) joins that room instead of making one", async () => {
    const host = await ogsPhone({ id: "prof_ann", handle: "ann", name: "Ann" });
    await host.page.goto(`${BASE}/`);
    await host.page.getByTestId("lobby-seat").first().waitFor({ timeout: 15_000 });
    const code = roomOf(host.page);
    const follower = await ogsPhone({ id: "prof_ben", handle: "ben", name: "Ben" });
    await follower.page.goto(`${BASE}/?ogsRoom=${code}`);
    await follower.page.getByTestId("lobby-seat").nth(1).waitFor({ timeout: 15_000 });
    expect(roomOf(follower.page)).toBe(code);
    await expect.poll(async () => (await tvSeats(code)).map((s) => s.name), { timeout: 10_000 }).toEqual(["Ann", "Ben"]);
  }, 40_000);

  it("only a verified token gives a seat its OGS avatar (a token for another game does not)", async () => {
    const host = await ogsPhone({ id: "prof_cy", handle: "cy", name: "Cy" }, { aud: "some-other-game" });
    await host.page.goto(`${BASE}/`);
    await host.page.getByTestId("lobby-seat").first().waitFor({ timeout: 15_000 });
    const [seat] = await tvSeats(roomOf(host.page));
    expect(seat?.avatar).toBeNull();
  }, 40_000);

  it("still asks for a name in a plain browser", async () => {
    const page = await (await (await browserP).newContext({ viewport: { width: 393, height: 852 } })).newPage();
    await page.goto(`${BASE}/host`);
    await page.getByLabel("Your name at the table").waitFor({ timeout: 10_000 });
  });
});

describe("several couches, one room (multiCouch)", () => {
  it("two players on each of two couches: the TV labels every seat with its household", async () => {
    const couchA = { sid: "couch-smith", label: "Jonathan" };
    const couchB = { sid: "couch-ortiz", label: "Rosa" };
    const a1 = await ogsPhone({ id: "p_jon", handle: "jon", name: "Jonathan" }, { couch: couchA });
    await a1.page.goto(`${BASE}/`);
    await a1.page.getByTestId("lobby-seat").first().waitFor({ timeout: 15_000 });
    const code = roomOf(a1.page);
    const a2 = await ogsPhone({ id: "p_jun", handle: "jun", name: "Juniper" }, { couch: couchA });
    await a2.page.goto(`${BASE}/?ogsRoom=${code}`);
    // The other couch's host phone joins the room with a TV page of its own.
    const b1 = await ogsPhone({ id: "p_rosa", handle: "rosa", name: "Rosa" }, { couch: couchB });
    await b1.page.goto(`${BASE}/?ogsRoom=${code}`);
    const b2 = await ogsPhone({ id: "p_theo", handle: "theo", name: "Theo" }, { couch: couchB });
    await b2.page.goto(`${BASE}/?ogsRoom=${code}`);
    await expect
      .poll(async () => (await tvSeats(code)).map((s) => `${s.name}@${s.couch}`), { timeout: 15_000 })
      .toEqual(["Jonathan@Jonathan", "Juniper@Jonathan", "Rosa@Rosa", "Theo@Rosa"]);
    const bView = async () => (await b1.sent()).find((m) => m.event?.type === "SET_VIEW_URL")?.event?.url ?? "";
    await expect.poll(bView, { timeout: 10_000 }).toMatch(new RegExp(`/tv/${code}\\?t=`));

    // Each couch has its own TV on the room; the four phones play a whole round together.
    const tvB = await (await (await browserP).newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await tvB.goto(await bView());
    await tvB.getByTestId("seats").waitFor();
    const result = await playTable([a1.page, a2.page, b1.page, b2.page], { rounds: 1, beat: 30 });
    expect(result.rounds).toBe(1);
    await tvB.getByTestId("scoreboard").waitFor();
  }, 240_000);
});
