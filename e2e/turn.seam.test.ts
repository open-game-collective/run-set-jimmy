/**
 * A person's turn on a real phone (bug bash 2026-10-11): after taking the discard, or after opening
 * and cancelling Go down, the phone says how to discard and the discard works (findings 5 and 7);
 * a double tap on a move sends it once, with no refusal shown for the second tap (finding 6).
 */
import { chromium, type Page } from "playwright";
import { afterAll, describe, expect, it } from "vitest";
import { myTurnToDraw, myTurnToPlay, phoneWithTwoAi, until } from "./my-turn";
import { readView } from "./phone-bot";

const browserP = chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
afterAll(async () => (await browserP).close());

const handSize = async (page: Page) => (await readView(page))?.me?.hand.length ?? -1;

/** The discard control tells the player what to do, and a tapped card can then be discarded. */
async function discardsAfterTappingACard(page: Page): Promise<void> {
  const prompt = page.getByRole("button", { name: "Tap a card in your hand to discard it" });
  await expect(prompt.isDisabled()).resolves.toBe(true);
  const before = await handSize(page);
  const card = page.locator("[data-hand-card]").first();
  const id = await card.getAttribute("data-hand-card");
  await card.click();
  const discard = page.getByRole("button", { name: /^Discard the / });
  await expect(discard.isEnabled()).resolves.toBe(true);
  await discard.click();
  await until("the discard to land", async () => ((await readView(page))?.pub.discardTop?.id === id ? true : null));
  expect(await handSize(page)).toBe(before - 1);
}

describe("a person's turn on the phone", () => {
  it("after taking the discard: tap a card, then discard it (finding 5)", async () => {
    const page = await phoneWithTwoAi(await browserP);
    await myTurnToDraw(page, false);
    await page.getByRole("button", { name: /^Take the / }).click();
    await myTurnToPlay(page);
    await discardsAfterTappingACard(page);
  }, 300_000);

  it("after opening and cancelling Go down: tap a card, then discard it (finding 7)", async () => {
    const page = await phoneWithTwoAi(await browserP);
    await myTurnToDraw(page, true);
    await page.getByRole("button", { name: "Draw from the deck" }).click();
    await myTurnToPlay(page);
    await page.getByRole("button", { name: "Go down" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await discardsAfterTappingACard(page);
  }, 300_000);

  it("a double tap on Draw from the deck draws once and shows no refusal (finding 6)", async () => {
    const page = await phoneWithTwoAi(await browserP);
    await myTurnToDraw(page, true);
    const before = await handSize(page);
    await page.getByRole("button", { name: "Draw from the deck" }).dblclick();
    await myTurnToPlay(page);
    // Long enough for a second DRAW's refusal to come back and show.
    await page.waitForTimeout(1500);
    expect(await handSize(page)).toBe(before + 1);
    expect((await readView(page))?.me?.oops).toBeNull();
    await expect(page.getByTestId("oops").count()).resolves.toBe(0);
  }, 300_000);
});
