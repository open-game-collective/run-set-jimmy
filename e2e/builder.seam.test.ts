/**
 * The go-down builder on a real phone page (bug bash 2026-10-11, findings 1–4): the help line names
 * the box being filled, a tapped card goes into that box and nowhere else, the phone says why "Lay
 * down" is off, and the hand header counts exactly the cards shown.
 */
import { chromium, type Page } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { builderSlots, layDownHint } from "../src/client/hand";
import { myTurnToDraw, myTurnToPlay, phoneWithTwoAi } from "./my-turn";
import { readView } from "./phone-bot";

const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

/** One person and two AI players; returns when it is the person's turn to play (after drawing). */
async function toMyPlay(page: Page): Promise<void> {
  await myTurnToDraw(page, true);
  await page.getByRole("button", { name: "Draw from the deck" }).click();
  await myTurnToPlay(page);
}

const slotCards = (page: Page, i: number) => page.getByTestId(`slot-${i}`).locator("[data-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-card")));

describe("the go-down builder", () => {
  it("names the box, puts each tapped card in it, says why Lay down is off, and counts the hand it shows", async () => {
    const browser = await browserP;
    const page = await phoneWithTwoAi(browser);
    await toMyPlay(page);

    const view = await readView(page);
    const hand = view?.me?.hand ?? [];
    const req = view?.pub.requirement;
    if (!req) throw new Error("no requirement");

    // Finding 1: the header counts the cards the phone shows.
    await expect(page.locator(".hand-tools .kicker").textContent()).resolves.toBe(`Your hand · ${hand.length}`);
    await expect(page.locator("[data-hand-card]").count()).resolves.toBe(hand.length);

    await page.getByRole("button", { name: "Go down" }).click();
    // Finding 2: the help line names the box being filled.
    await expect(page.locator(".builder-help").innerText()).resolves.toMatch(/^Adding to Run: tap cards in your hand/);
    // Finding 4: Lay down is off, and the phone says why.
    await expect(page.getByRole("button", { name: "Lay down" }).isDisabled()).resolves.toBe(true);
    await expect(page.getByTestId("lay-down-hint").innerText()).resolves.toBe(layDownHint(builderSlots(req), hand, req));

    // Finding 3: each tapped card goes into the active box, in tapping order, and nowhere else.
    const [a, b, c, d] = hand;
    if (!a || !b || !c || !d) throw new Error("short hand");
    for (const card of [a, b, c]) await page.locator(`[data-hand-card="${card.id}"]`).click();
    await expect(slotCards(page, 0)).resolves.toEqual([a.id, b.id, c.id]);
    await expect(slotCards(page, 1)).resolves.toEqual([]);
    await page.getByTestId("slot-1").click();
    await expect(page.locator(".builder-help").innerText()).resolves.toMatch(/^Adding to Set: /);
    await page.locator(`[data-hand-card="${d.id}"]`).click();
    await expect(slotCards(page, 1)).resolves.toEqual([d.id]);
    await expect(slotCards(page, 0)).resolves.toEqual([a.id, b.id, c.id]);
    const slots = builderSlots(req).map((s, i) => ({ ...s, cards: i === 0 ? [a, b, c] : [d] }));
    await expect(page.getByTestId("lay-down-hint").innerText()).resolves.toBe(layDownHint(slots, hand, req));
  }, 300_000);
});
