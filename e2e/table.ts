/**
 * A table of real browser pages: one TV and N phones, every phone played by the bot through the
 * real buttons. Used by the recorder, the playtest seam test and the bug bash.
 */
import type { Browser, BrowserContextOptions, Page } from "playwright";
import { devices } from "playwright";
import { decide, perform, progress, readView, stateName, type PhoneView } from "./phone-bot";

export const BASE = process.env.GAME_URL ?? "http://localhost:8797";
export const NAMES = ["Jonathan", "Juniper", "Grandpa Al", "Aunt Rosa", "Theo", "Mags", "Dev"];

export function phoneContext(): BrowserContextOptions & { viewport: { width: number; height: number } } {
  const d = devices["iPhone 15"];
  if (!d) throw new Error("no iPhone 15 profile");
  const { defaultBrowserType: _ignored, ...opts } = d;
  return { ...opts, viewport: d.viewport };
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function newRoomCode(): string {
  return Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ"[Math.floor(Math.random() * 23)]).join("");
}

/** Phones join the TV's room by name, in order (the first one hosts). */
export async function seatPlayers(phones: Page[], roomCode: string, beat = 0): Promise<void> {
  for (const [i, phone] of phones.entries()) {
    await phone.goto(`${BASE}/join/${roomCode}`);
    await phone.getByLabel("Your name at the table").fill(NAMES[i] ?? `P${i + 1}`);
    await phone.getByRole("button", { name: "Take a seat" }).click();
    await phone.getByTestId("lobby-seat").first().waitFor();
    if (beat) await wait(beat);
  }
}

export type PlayOptions = {
  /** Stop after this many rounds have been scored (default: the whole game). */
  rounds?: number;
  /** Pause between actions, so a person can follow along in a recording. */
  beat?: number;
  /** Called at notable moments (for recordings and stills). */
  onMoment?: (name: string, view: PhoneView) => void | Promise<void>;
  /** Give up if nothing changes for this long. */
  stallMs?: number;
  /** Before dealing, wait until this many seats are taken (a person joining a bot table). */
  waitForSeats?: number;
};

/** Plays the room with the bots until the game ends (or `rounds` rounds are scored). */
export async function playTable(phones: Page[], opts: PlayOptions = {}): Promise<{ rounds: number; actions: number }> {
  const beat = opts.beat ?? 150;
  const stallMs = opts.stallMs ?? 30_000;
  let actions = 0;
  let lastChange = Date.now();
  let lastPrint = "";
  let lastLogSeq = 0;
  const host = phones[0];
  if (!host) throw new Error("no phones");
  if (opts.waitForSeats) await host.getByTestId("lobby-seat").nth(opts.waitForSeats - 1).waitFor({ timeout: 0 });
  await host.getByRole("button", { name: /^Deal One run, one set/ }).click();
  for (;;) {
    const views = await Promise.all(phones.map(readView));
    const v0 = views[0];
    if (!v0) throw new Error("host phone has no view");
    const state = stateName(v0.value);
    const fingerprint = views.map(progress).join("/");
    if (fingerprint !== lastPrint) {
      lastPrint = fingerprint;
      lastChange = Date.now();
    } else if (Date.now() - lastChange > stallMs) {
      throw new Error(`stalled in ${state}: ${fingerprint}`);
    }
    for (const e of v0.pub.log) {
      if (e.seq > lastLogSeq) {
        lastLogSeq = e.seq;
        if (["down", "out", "joker", "bought"].includes(e.kind)) await opts.onMoment?.(e.kind, v0);
      }
    }

    if (state === "gameOver") {
      await opts.onMoment?.("gameOver", v0);
      return { rounds: v0.pub.scores.length, actions };
    }
    if (state === "roundOver") {
      await opts.onMoment?.("roundOver", v0);
      if (opts.rounds !== undefined && v0.pub.scores.length >= opts.rounds) return { rounds: v0.pub.scores.length, actions };
      await wait(beat * 6);
      await host.getByRole("button", { name: /^Deal / }).click();
      // Wait for the host's own view to leave the scores, so a stale view can't deal twice.
      for (let t = 0; t < 100 && stateName((await readView(host))?.value ?? "roundOver") === "roundOver"; t++) await wait(60);
      continue;
    }
    if (state === "cutting") {
      await opts.onMoment?.("cutting", v0);
      const cutter = views.findIndex((v) => v?.me?.mustCut);
      const page = phones[cutter];
      if (page) {
        await wait(beat * 3);
        const deck = page.getByTestId("cut-deck");
        const box = await deck.boundingBox();
        if (box) await page.mouse.click(box.x + box.width * (0.2 + Math.random() * 0.6), box.y + box.height / 2);
        actions++;
        await waitForChange(phones, views);
      } else await wait(100);
      continue;
    }
    if (!state.startsWith("playing")) {
      await wait(100);
      continue;
    }
    // Act only on a settled table: every phone has seen the same latest event and turn.
    const sync = (v: PhoneView | null) => `${v?.pub.log.at(-1)?.seq}|${v?.pub.turn}|${v?.pub.turnPhase}|${v?.pub.window?.requests.length}`;
    if (new Set(views.map(sync)).size > 1) {
      await wait(60);
      continue;
    }

    // Buyers first (during the window), then the turn player.
    let acted = false;
    for (const [i, view] of views.entries()) {
      const page = phones[i];
      if (!view || !page || view.me?.myTurn) continue;
      const action = decide(view);
      if (action?.type === "buy") {
        await perform(page, view, action, beat).catch(() => undefined);
        actions++;
        acted = true;
      }
    }
    const turnIndex = views.findIndex((v) => v?.me?.myTurn);
    const turnView = views[turnIndex];
    const turnPage = phones[turnIndex];
    if (turnView && turnPage) {
      const action = decide(turnView);
      if (turnView.pub.turnPhase === "play") await opts.onMoment?.("turn-play", turnView);
      if (action) {
        await wait(beat);
        await perform(turnPage, turnView, action, beat).catch((e: unknown) => {
          throw new Error(`${NAMES[turnIndex]} couldn't ${action.type} (${JSON.stringify(action).slice(0, 160)}): ${String(e).split("\n")[0]}`);
        });
        actions++;
        acted = true;
        await waitForChange(phones, views);
      }
    }
    if (!acted) await wait(120);
  }
}

/** Waits until any phone's view moves on (an action landed), up to 8 s. */
async function waitForChange(phones: Page[], before: (PhoneView | null)[]): Promise<void> {
  const was = before.map(progress).join("/");
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    const now = (await Promise.all(phones.map(readView))).map(progress).join("/");
    if (now !== was) return;
    await wait(60);
  }
}

/** A browser page for the TV at the given size, opened on a room. */
export async function openTv(browser: Browser, roomCode: string, size = { width: 1280, height: 720 }, query = ""): Promise<Page> {
  const ctx = await browser.newContext({ viewport: size });
  const tv = await ctx.newPage();
  await tv.goto(`${BASE}/tv/${roomCode}${query}`);
  return tv;
}
