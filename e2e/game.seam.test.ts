/**
 * Plays rounds over the real wire: a TV and four phones, every move through the phones' buttons.
 * Also: a phone that reloads mid-round gets its own seat and hand back.
 */
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { readView } from "./phone-bot";
import { newRoomCode, openTv, phoneContext, playTable, seatPlayers } from "./table";

const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

describe("a table of four", () => {
  it("plays round 1 to someone going out; a phone reloaded mid-round keeps its seat and hand", async () => {
    const browser = await browserP;
    const code = newRoomCode();
    const tv = await openTv(browser, code);
    const phones = await Promise.all([0, 1, 2, 3].map(async () => (await browser.newContext(phoneContext())).newPage()));
    await seatPlayers(phones, code);

    // A few actions in, Juniper's phone reloads.
    let reloaded = false;
    const before: { hand: string[] } = { hand: [] };
    await playTable(phones, {
      rounds: 1,
      beat: 30,
      onMoment: async (name) => {
        // Mid-round: after someone has gone down or bought (not the cut, before the deal).
        if (reloaded || !["down", "bought"].includes(name)) return;
        reloaded = true;
        const juniper = phones[1];
        if (!juniper) return;
        before.hand = ((await readView(juniper))?.me?.hand ?? []).map((c) => c.id).sort();
        await juniper.reload();
        await juniper.getByTestId("phone-play").waitFor();
        // The page publishes its view a moment after the play screen first renders.
        await expect
          .poll(async () => ((await readView(juniper))?.me?.hand ?? []).map((c) => c.id).sort(), { timeout: 5000 })
          .toEqual(before.hand);
      },
    });
    expect(reloaded).toBe(true);
    await tv.getByTestId("scoreboard").waitFor();
    const view = await readView(phones[0]!);
    expect(view?.pub.scores).toHaveLength(1);
    expect(view?.pub.scores[0]?.filter((p) => p === 0).length).toBeGreaterThanOrEqual(1);
  }, 600_000);
});
