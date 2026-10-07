/**
 * Builds the OGS art kit (assets/ogs/run-set-jimmy/) from the Codex paintings in assets/art/:
 * the logo and the cover's title are lettered in code with the game's own wordmark (Fraunces), so
 * the text is exact. `pnpm exec tsx scripts/art-kit.ts`
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = "assets/ogs/run-set-jimmy";
const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,900;1,9..144,600&display=swap">`;
const dataUrl = (path: string) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
const wordmark = (size: number, shadow: string) => `
  <h1 style="font-family:Fraunces;font-weight:900;font-size:${size}px;margin:0;display:flex;gap:.26em;align-items:baseline;color:#f6efe0;letter-spacing:-.01em;line-height:1.05;text-shadow:${shadow}">
    <span>Run</span><span style="font-style:italic;font-weight:600;color:#ecd08a">Set</span><span>Jimmy</span>
  </h1>`;

const browser = await chromium.launch({ channel: "chrome" });
async function render(html: string, size: { width: number; height: number }, path: string, transparent = false) {
  const page = await browser.newPage({ viewport: size });
  await page.setContent(`<!doctype html><html><head>${FONTS}</head><body style="margin:0;background:${transparent ? "transparent" : "#0a2725"}">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path, omitBackground: transparent, ...(path.endsWith(".jpg") ? { type: "jpeg", quality: 90 } : {}) });
  await page.close();
}

// Logo: the wordmark alone, on transparency.
await render(`<div style="width:1200px;height:300px;display:grid;place-items:center">${wordmark(150, "0 6px 24px rgba(0,0,0,.45)")}</div>`, { width: 1200, height: 300 }, `${OUT}/logo.png`, true);

// Cover (2:3, with the title): the cover painting, the wordmark lettered over its calm top third.
await render(
  `<div style="position:relative;width:600px;height:900px;background:url(${dataUrl("assets/art/cover-src.png")}) center/cover">
     <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,26,24,.82),rgba(6,26,24,.35) 38%,transparent 55%)"></div>
     <div style="position:absolute;left:0;right:0;top:70px;display:grid;justify-items:center;gap:14px;text-align:center">
       ${wordmark(84, "0 4px 18px rgba(0,0,0,.6)")}
       <p style="margin:0;font-family:Fraunces;font-style:italic;font-weight:600;font-size:28px;color:#ecd08a">Seven rounds of runs and sets</p>
     </div>
   </div>`,
  { width: 600, height: 900 },
  `${OUT}/cover.jpg`,
);
await browser.close();

// Icon 512², clean hero 1920×1080 (no text), and the TV tile (a real game screenshot).
execFileSync("sips", ["-z", "512", "512", "assets/art/icon-src.png", "--out", `${OUT}/icon.png`], { stdio: "ignore" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "assets/art/hero-clean-src.png", "-vf", "scale=1920:1080:flags=lanczos", "-q:v", "3", `${OUT}/hero-clean.jpg`]);
copyFileSync("assets/art/tv-tile-src.jpg", `${OUT}/tv.jpg`);
console.log(`art kit in ${OUT}`);
