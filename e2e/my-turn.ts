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

/** Waits for this phone's turn to draw. `windowClosed`: also wait for the buy window to close. */
export async function myTurnToDraw(page: Page, windowClosed: boolean): Promise<void> {
  await until("my turn to draw", async () => {
    const v = await readView(page);
    last = v ? `${JSON.stringify(v.value)} turn ${v.pub.turn} ${v.pub.turnPhase} window ${v.pub.window !== null} mine ${v.me?.myTurn}` : "no view";
    return v?.me?.myTurn && v.pub.turnPhase === "draw" && (!windowClosed || v.pub.window === null) ? true : null;
  });
}

export const myTurnToPlay = (page: Page) => until("my turn to play", async () => ((await readView(page))?.pub.turnPhase === "play" ? true : null));
