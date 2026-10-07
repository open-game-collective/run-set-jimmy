/**
 * Repro tests for the 2026-10-07 bug bash findings (.bug-bash/2026-10-07T11-18/report.md).
 */
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readView } from "./phone-bot";
import { newRoomCode, openTv, phoneContext, seatPlayers, wait } from "./table";

const browserP = chromium.launch({ channel: "chrome" });
afterAll(async () => (await browserP).close());

let phones: Page[] = [];

/** Four phones (the first at 375×667, an older small phone), dealt and waiting on the first draw. */
beforeAll(async () => {
  const browser = await browserP;
  const code = newRoomCode();
  await openTv(browser, code);
  phones = [];
  for (let i = 0; i < 4; i++) {
    const opts = phoneContext();
    const viewport = i === 1 ? { width: 375, height: 667 } : opts.viewport;
    phones.push(await (await browser.newContext({ ...opts, viewport })).newPage());
  }
  await seatPlayers(phones, code);
  await phones[0]?.getByRole("button", { name: /^Deal One run, one set/ }).click();
  const cutter = phones[3];
  await cutter?.getByTestId("cut-deck").click();
  await phones[1]?.getByTestId("phone-play").waitFor();
  await wait(500);
}, 60_000);

const turnPhone = async () => {
  for (const p of phones) if ((await readView(p))?.me?.myTurn) return p;
  throw new Error("nobody's turn");
};

describe("bug bash", () => {
  it("BB-001: the phone whose turn it is says so, and says what to do", async () => {
    const p = await turnPhone();
    await expect.poll(() => p.getByTestId("turn-banner").textContent(), { timeout: 5000 }).toMatch(/Your turn/);
    expect(await p.getByTestId("turn-banner").textContent()).toMatch(/draw|take/i);
  });

  it("BB-002: on a 375×667 phone the whole hand and the action buttons are on screen without scrolling", async () => {
    const small = phones[1];
    if (!small) throw new Error("no small phone");
    const cards = small.getByTestId("hand-card");
    const n = await cards.count();
    expect(n).toBeGreaterThanOrEqual(11);
    const last = await cards.nth(n - 1).boundingBox();
    expect((last?.y ?? 9999) + (last?.height ?? 0)).toBeLessThanOrEqual(667);
    const actions = await small.getByTestId("actions").boundingBox();
    const tools = await small.getByText(/Your hand ·/).boundingBox();
    expect((actions?.y ?? 0) + (actions?.height ?? 0)).toBeLessThanOrEqual(tools?.y ?? 0);
  });

  it("BB-003 (adversarial): a phone that isn't on turn has no Take button", async () => {
    const turn = await turnPhone();
    for (const p of phones) if (p !== turn) expect(await p.getByRole("button", { name: /^Take the/ }).count()).toBe(0);
  });

  it("BB-004 (error-paths): before drawing there is no Discard button", async () => {
    const turn = await turnPhone();
    await turn.getByTestId("hand-card").first().click();
    expect(await turn.getByRole("button", { name: /^Discard the/ }).count()).toBe(0);
  });
});
