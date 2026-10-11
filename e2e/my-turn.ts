/** One phone with two AI players, brought to its own turn (shared by the builder and turn seam tests). */
import type { Browser, Page } from "playwright";
import { readView } from "./phone-bot";
import { newRoomCode, openTv, phoneContext, seatPlayers, wait } from "./table";

let last = "";

export async function until<T>(what: string, probe: () => Promise<T | null>, ms = 60_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const found = await probe();
    if (found !== null) return found;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what} (last seen: ${last})`);
    await wait(100);
  }
}

/** A new room: this phone hosts, two AI players fill seats, round 1 is dealt. */
export async function phoneWithTwoAi(browser: Browser): Promise<Page> {
  const code = newRoomCode();
  await openTv(browser, code);
  const page = await (await browser.newContext(phoneContext())).newPage();
  await seatPlayers([page], code);
  await page.getByTestId("add-ai").first().click();
  await page.getByTestId("add-ai").first().click();
  await page.getByRole("button", { name: /^Deal round 1/ }).click();
  return page;
}

/**
 * How this phone's turn goes on once the buy window has closed: "draw" (take the discard or draw
 * from the deck), or "offer" when someone asked to buy the discard: take it, or let it go and the
 * room draws for you (RULES.md "Buying"). Which one depends on the deal (an AI player wanting the
 * card), so each test handles both.
 */
export type TurnStart = "draw" | "offer";

export async function myTurnStarts(page: Page): Promise<TurnStart> {
  const start = await until("my turn", async (): Promise<TurnStart | null> => {
    const v = await readView(page);
    last = v ? `${JSON.stringify(v.value)} turn ${v.pub.turn} ${v.pub.turnPhase} window ${v.pub.window !== null} mine ${v.me?.myTurn}` : "no view";
    // Only once the buy window has closed is the start settled: a buy asked during the window
    // turns a "draw" into an "offer" when it closes.
    if (!v?.me?.myTurn || v.pub.window !== null) return null;
    return v.pub.turnPhase === "offer" ? "offer" : v.pub.turnPhase === "draw" ? "draw" : null;
  });
  // Which start a run met (both must pass; the logs show both were exercised).
  console.info(`[turn start] ${start}`);
  return start;
}

/** The draw from the deck: let an offer go (the room draws for you), or wait out the window and tap Draw. */
export async function drawFromDeck(page: Page, start: TurnStart, tap: "click" | "dblclick" = "click"): Promise<void> {
  if (start === "offer") {
    await page.getByRole("button", { name: "Let it go" })[tap]();
    return;
  }
  await page.getByRole("button", { name: "Draw from the deck" })[tap]();
}

/** Takes the discard: "Take it" on an offer, "Take the X" otherwise. */
export async function takeTheDiscard(page: Page, start: TurnStart): Promise<void> {
  await page.getByRole("button", { name: start === "offer" ? "Take it" : /^Take the / }).click();
}

export const myTurnToPlay = (page: Page) => until("my turn to play", async () => ((await readView(page))?.pub.turnPhase === "play" ? true : null));
