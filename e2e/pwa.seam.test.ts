/**
 * Run Set Jimmy as an installable web app (for players without the OGS app): the manifest and its
 * icons, Chrome's own installability check, the start screen the installed app opens on, rejoining
 * your table from it, and the offline page.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterAll, describe, expect, it } from "vitest";

const BASE = process.env.GAME_URL ?? "http://localhost:8798";
const browserP = chromium.launch({ channel: "chrome" });
afterAll(async () => (await browserP).close());

/** Width and height from a PNG's IHDR chunk. */
async function pngSize(path: string): Promise<{ type: string | null; width: number; height: number }> {
  const res = await fetch(`${BASE}${path}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const view = new DataView(bytes.buffer);
  return { type: res.headers.get("content-type"), width: view.getUint32(16), height: view.getUint32(20) };
}

const phone = async () => (await browserP).newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });

describe("installable web app", () => {
  it("serves a manifest that opens the start screen, standalone, with real icons", async () => {
    const res = await fetch(`${BASE}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/manifest\+json|application\/json/);
    const m = (await res.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    expect(m).toMatchObject({ name: "Run Set Jimmy", short_name: "Run Set Jimmy", start_url: "/start?source=app", scope: "/", display: "standalone" });
    for (const size of [192, 512]) {
      const icon = m.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose !== "maskable");
      expect(icon).toBeDefined();
      expect(await pngSize(icon?.src ?? "")).toEqual({ type: "image/png", width: size, height: size });
    }
    const maskable = m.icons.find((i) => i.purpose === "maskable");
    expect(await pngSize(maskable?.src ?? "")).toMatchObject({ width: 512, height: 512 });
    expect(await pngSize("/icons/apple-touch-icon.png")).toMatchObject({ width: 180, height: 180 });
  });

  it("every page links the manifest and the iOS home-screen tags", async () => {
    for (const path of ["/start", "/tv/ABCD", "/join/ABCD"]) {
      const html = await (await fetch(`${BASE}${path}`)).text();
      if (html.includes("No game with that code")) continue; // /join of a room that doesn't exist
      expect(html, path).toContain('rel="manifest" href="/manifest.webmanifest"');
      expect(html, path).toContain('rel="apple-touch-icon"');
      expect(html, path).toContain('name="apple-mobile-web-app-capable" content="yes"');
      expect(html, path).toContain('name="theme-color"');
    }
  });

  it("passes Chrome's installability check (manifest, icons, service worker)", async () => {
    // A real profile: Chrome never offers to install from a private (incognito) context.
    const profile = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "rsj-pwa-")), { channel: "chrome" });
    const page = await profile.newPage();
    await page.goto(`${BASE}/start`);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(() => true), undefined, { timeout: 10_000 });
    await page.reload();
    const cdp = await page.context().newCDPSession(page);
    await expect
      .poll(async () => ((await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: unknown[] }).installabilityErrors, { timeout: 10_000 })
      .toEqual([]);
    await profile.close();
  }, 30_000);

  it("the start screen hosts, joins with a code, or makes this device the TV", async () => {
    const page = await (await phone()).newPage();
    await page.goto(`${BASE}/start?source=app`);
    await expect(page.getByRole("link", { name: "Host a game" }).getAttribute("href")).resolves.toBe("/host");
    await page.getByLabel(/join with the code/i).waitFor();
    await expect(page.getByRole("link", { name: /this screen as the TV/i }).getAttribute("href")).resolves.toBe("/?as=tv");
  });

  it("offers to go back to the table this phone sat at", async () => {
    const ctx = await phone();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/host`);
    await page.getByLabel("Your name at the table").fill("Rosa");
    await page.getByRole("button", { name: "Take a seat" }).click();
    await page.getByTestId("lobby-seat").first().waitFor();
    const seat = new URL(page.url());
    await page.goto(`${BASE}/start?source=app`);
    const back = page.getByRole("link", { name: new RegExp(`Back to table ${seat.pathname.split("/")[2]}`) });
    await expect(back.getAttribute("href")).resolves.toBe(`${seat.pathname}?t=${seat.searchParams.get("t")}`);
  }, 30_000);

  it("shows an offline page instead of the browser's error when there's no connection", async () => {
    const ctx = await phone();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/start`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await ctx.setOffline(true);
    await page.goto(`${BASE}/join/ABCD`).catch(() => undefined);
    await page.getByText(/You're offline/).waitFor({ timeout: 5000 });
    await page.goto(`${BASE}/start`).catch(() => undefined);
    await page.getByRole("link", { name: "Host a game" }).waitFor({ timeout: 5000 });
  }, 30_000);
});
