/**
 * The TV stage is drawn at 1920×1080 and scaled to the screen: at every TV size the launcher or a
 * browser uses, it must fill the screen exactly (no offset, nothing cut off).
 */
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.GAME_URL ?? "http://localhost:8798";
const browserP = chromium.launch({ channel: "chrome" });
afterAll(async () => (await browserP).close());

describe("the TV stage", () => {
  it.each([
    [1280, 720],
    [1920, 1080],
    [3840, 2160],
  ])("fills a %i×%i screen", async (width, height) => {
    const page = await (await (await browserP).newContext({ viewport: { width, height } })).newPage();
    await page.goto(`${BASE}/`);
    const box = await page.locator(".stage").boundingBox();
    expect(box).not.toBeNull();
    expect(Math.round(box?.x ?? -1)).toBe(0);
    expect(Math.round(box?.y ?? -1)).toBe(0);
    expect(Math.round(box?.width ?? 0)).toBe(width);
    expect(Math.round(box?.height ?? 0)).toBe(height);
  });
});
