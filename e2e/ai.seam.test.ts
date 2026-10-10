/**
 * AI players over the real wire: one phone joins, its host adds two AI players through the lobby's
 * open slots, and a whole round plays to someone going out, the person through their phone's
 * buttons, Vera and Sal played by the room.
 */
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { readView } from "./phone-bot";
import { newRoomCode, openTv, phoneContext, playTable, seatPlayers } from "./table";

const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

describe("one person and two AI players", () => {
  it("fills open slots with AI players and plays a whole round", async () => {
    const browser = await browserP;
    const code = newRoomCode();
    const tv = await openTv(browser, code);
    const phone = await (await browser.newContext(phoneContext())).newPage();
    await seatPlayers([phone], code);
    await expect(phone.getByRole("button", { name: /^Need 3 players/ }).isDisabled()).resolves.toBe(true);
    await phone.getByTestId("add-ai").first().click();
    await phone.getByTestId("add-ai").first().click();
    await phone.getByTestId("player-count").getByText("Players 3 / 7").waitFor();
    await tv.getByText("Vera").first().waitFor();

    await playTable([phone], { rounds: 1, beat: 30, stallMs: 45_000 });
    await tv.getByTestId("scoreboard").waitFor();
    const view = await readView(phone);
    expect(view?.pub.seats.map((s) => `${s.name}${s.ai ? " (AI)" : ""}`)).toEqual(["Jonathan", "Vera (AI)", "Sal (AI)"]);
    expect(view?.pub.scores).toHaveLength(1);
    expect(view?.pub.log.some((e) => e.text.startsWith("Vera") || e.text.startsWith("Sal"))).toBe(true);
  }, 600_000);
});
