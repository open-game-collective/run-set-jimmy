/**
 * Device sweep: plays a real game with bots and, at each key state, re-renders every phone and the
 * TV at a range of real device sizes, checking for layout bugs and saving screenshots.
 *
 *   GAME_URL=http://localhost:8797 pnpm devices            (needs `pnpm dev`)
 *   PLAYERS=7 pnpm devices                                 (the crowded table)
 *
 * Checks (phones): nothing scrolls sideways; the turn banner, actions, hand, sort buttons, builder
 * boxes and sheets are on screen; the regions (header, banner, table, actions, hand) don't overlap;
 * no button text is clipped; tap targets are at least 40 px. (TV): every element is inside the 5%
 * safe area; nothing sits in the launcher's invite corner (top-right); the table, deck pile, ticker
 * and seats don't overlap; the table's melds aren't cut off.
 * Output: recordings/devices/<players>p/<state>/<device>.png, a contact sheet per state, and
 * issues.json. Exits 1 when any check fails.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { newRoomCode, openTv, phoneContext, playTable, seatPlayers, wait } from "./table";

const PLAYERS = Number(process.env.PLAYERS ?? 4);
const OUT = `recordings/devices/${PLAYERS}p`;

export const PHONES = [
  { name: "galaxy-fold-280", width: 280, height: 653 },
  { name: "android-360x640", width: 360, height: 640 },
  { name: "galaxy-s8-360x740", width: 360, height: 740 },
  { name: "iphone-se-375x667", width: 375, height: 667 },
  { name: "iphone-mini-375x812", width: 375, height: 812 },
  { name: "iphone-15-393x852", width: 393, height: 852 },
  { name: "pixel-7-412x915", width: 412, height: 915 },
  { name: "iphone-pro-max-430x932", width: 430, height: 932 },
  { name: "phone-landscape-852x393", width: 852, height: 393 },
  { name: "ipad-mini-744x1133", width: 744, height: 1133 },
  { name: "ipad-landscape-1180x820", width: 1180, height: 820 },
];
export const TVS = [
  { name: "tv-720p", width: 1280, height: 720 },
  { name: "tv-1080p", width: 1920, height: 1080 },
  { name: "tv-4k", width: 3840, height: 2160 },
  { name: "laptop-1366x768", width: 1366, height: 768 },
  { name: "laptop-1440x900", width: 1440, height: 900 },
  { name: "old-4x3-1024x768", width: 1024, height: 768 },
];

/** Runs in the phone page: a list of human-readable layout problems. */
const PHONE_CHECKS = `(() => {
  const vw = innerWidth, vh = innerHeight, issues = [];
  const shown = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const label = (e) => (e.getAttribute("aria-label") || e.textContent || e.className || e.tagName).trim().slice(0, 40);
  if (document.documentElement.scrollWidth > vw + 1) issues.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + vw + ")");
  const must = ['[data-testid=turn-banner]', '[data-testid=actions] button', '[data-testid=hand-card]', '.hand-tools button', '.phone-foot .btn', '.sheet button', '[data-testid=builder] .slot', '[data-testid=cut-deck]', '[data-testid=lobby-seat]'];
  for (const sel of must) for (const e of shown(sel)) {
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) issues.push("off screen: " + sel + " (" + label(e) + ") at " + [r.left, r.top, r.right, r.bottom].map(Math.round).join(","));
  }
  for (const b of shown("button")) {
    const r = b.getBoundingClientRect();
    if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 2) issues.push("button text clipped: " + label(b));
    const inMeld = b.classList.contains("phone-meld");
    if (!inMeld && (r.height < 40 || r.width < 40)) issues.push("small tap target: " + label(b) + " " + Math.round(r.width) + "x" + Math.round(r.height));
  }
  const regions = ['.play-head', '[data-testid=turn-banner]', '[data-testid=phone-table]', '[data-testid=actions]', '.hand-wrap'].map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && e.getBoundingClientRect().height > 0);
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i][1].getBoundingClientRect(), b = regions[j][1].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) issues.push("overlap: " + regions[i][0] + " and " + regions[j][0] + " (" + Math.round(w) + "x" + Math.round(h) + ")");
  }
  const cards = shown("[data-hand-card]");
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i].getBoundingClientRect(), b = cards[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) { issues.push("hand cards overlap"); i = cards.length; break; }
  }
  for (const e of shown(".card .corner b")) { const r = e.getBoundingClientRect(); if (r.height < 9) { issues.push("card rank too small to read (" + Math.round(r.height) + "px)"); break; } }
  return issues;
})()`;

/** Runs in the TV page. */
const TV_CHECKS = `(() => {
  const vw = innerWidth, vh = innerHeight, issues = [];
  const s = vw / 960;
  const corner = { left: vw - (24 + 220) * s, top: 24 * s, right: vw - 24 * s, bottom: (24 + 120) * s };
  const safe = { left: vw * 0.05, top: vh * 0.05, right: vw * 0.95, bottom: vh * 0.95 };
  const stage = document.querySelector(".stage");
  if (!stage) return ["no stage"];
  const leaves = [...stage.querySelectorAll("*")].filter((e) => e.children.length === 0 && !e.closest(".lamp") && !["SVG", "svg"].includes(e.tagName));
  let outside = 0, inCorner = 0;
  for (const e of leaves) {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === "hidden") continue;
    if (r.left < safe.left - 1 || r.top < safe.top - 1 || r.right > safe.right + 1 || r.bottom > safe.bottom + 1) outside++;
    if (r.right > corner.left && r.left < corner.right && r.bottom > corner.top && r.top < corner.bottom) inCorner++;
  }
  if (outside) issues.push(outside + " elements outside the 5% safe area");
  if (inCorner) issues.push(inCorner + " elements in the OGS invite corner (top-right)");
  const regions = ['.round-banner', '.pile', '.table', '.ticker', '.seats', '.scoreboard', '.tv-cutting', '.tv-lobby'].map((x) => [x, document.querySelector(x)]).filter(([, e]) => e);
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const a = regions[i][1].getBoundingClientRect(), b = regions[j][1].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 4 && h > 4) issues.push("overlap: " + regions[i][0] + " and " + regions[j][0]);
  }
  const table = document.querySelector(".table");
  if (table && table.scrollHeight > table.clientHeight + 2) issues.push("the table's melds are cut off (" + table.scrollHeight + " > " + table.clientHeight + ")");
  for (const n of document.querySelectorAll(".seat-name")) if (n.scrollWidth > n.clientWidth + 1) { issues.push("a seat name is cut off: " + n.textContent); break; }
  return issues;
})()`;

type Issue = { state: string; device: string; screen: string; problem: string };

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const code = newRoomCode();
  const tv = await openTv(browser, code, { width: 1920, height: 1080 });
  const phones: Page[] = await Promise.all(Array.from({ length: PLAYERS }, async () => (await browser.newContext(phoneContext())).newPage()));
  const issues: Issue[] = [];
  const done = new Set<string>();

  async function sweep(state: string, focus: Page) {
    if (done.has(state)) return;
    done.add(state);
    const dir = `${OUT}/${state}`;
    mkdirSync(dir, { recursive: true });
    const base = phoneContext().viewport;
    for (const d of PHONES) {
      await focus.setViewportSize({ width: d.width, height: d.height });
      await wait(180);
      for (const problem of (await focus.evaluate(PHONE_CHECKS)) as string[]) issues.push({ state, device: d.name, screen: "phone", problem });
      await focus.screenshot({ path: `${dir}/${d.name}.png` });
    }
    await focus.setViewportSize(base);
    for (const d of TVS) {
      await tv.setViewportSize({ width: d.width, height: d.height });
      await wait(180);
      for (const problem of (await tv.evaluate(TV_CHECKS)) as string[]) issues.push({ state, device: d.name, screen: "tv", problem });
      await tv.screenshot({ path: `${dir}/${d.name}.png` });
    }
    await tv.setViewportSize({ width: 1920, height: 1080 });
    console.log(`swept ${state}`);
  }

  const turnPage = async () => {
    for (const p of phones) if (await p.evaluate(() => Reflect.get(window, "__rsjView")?.me?.myTurn === true)) return p;
    return phones[0] as Page;
  };

  await seatPlayers(phones, code);
  await sweep("lobby", phones[0] as Page);
  let downs = 0;
  let plays = 0;
  await playTable(phones, {
    rounds: 1,
    beat: 30,
    onMoment: async (name) => {
      if (name === "cutting") {
        const cutter = await Promise.all(phones.map((p) => p.evaluate(() => Reflect.get(window, "__rsjView")?.me?.mustCut === true)));
        await sweep("cut", phones[cutter.indexOf(true)] ?? (phones[0] as Page));
      }
      if (name === "turn-play" && ++plays === 2) {
        const p = await turnPage();
        await sweep("play", p);
        const goDown = p.getByRole("button", { name: "Go down" });
        if (await goDown.count()) {
          await goDown.click();
          const cards = p.getByTestId("hand-card");
          for (let i = 0; i < 5; i++) await cards.nth(i).click();
          await p.getByTestId("slot-1").click();
          for (let i = 5; i < 8; i++) await cards.nth(i).click();
          await sweep("builder", p);
          await p.getByRole("button", { name: "Cancel" }).click();
        }
      }
      if (name === "down" && ++downs === Math.min(3, PLAYERS)) await sweep("table", await turnPage());
      if (name === "roundOver") await sweep("scores", phones[1] as Page);
    },
  });
  await browser.close();

  writeFileSync(`${OUT}/issues.json`, JSON.stringify(issues, null, 1));
  for (const state of done) {
    const dir = `${OUT}/${state}`;
    const tile = (names: string[], h: number, out: string, cols: number) =>
      execFileSync("ffmpeg", [
        "-y", "-loglevel", "error",
        ...names.flatMap((n) => ["-i", `${dir}/${n}.png`]),
        "-filter_complex",
        `${names.map((n, i) => `[${i}]scale=-2:${h},pad=iw+16:ih+40:8:40:color=0x0a2725,drawtext=fontfile=/System/Library/Fonts/Supplemental/Arial.ttf:text='${n}':fontcolor=0xecd08a:fontsize=18:x=8:y=10[t${i}]`).join(";")};${names.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${names.length}:layout=${names.map((_, i) => `${i === 0 ? "0" : Array.from({ length: i % cols }, (_, k) => `w${Math.floor(i / cols) * cols + k}`).join("+") || "0"}_${Math.floor(i / cols) === 0 ? "0" : Array.from({ length: Math.floor(i / cols) }, (_, k) => `h${k * cols}`).join("+")}`).join("|")}:fill=0x061a18`,
        out,
      ]);
    tile(PHONES.map((d) => d.name), 640, `${OUT}/${state}-phones.png`, 6);
    tile(TVS.map((d) => d.name), 360, `${OUT}/${state}-tvs.png`, 3);
  }
  const byProblem = new Map<string, Issue[]>();
  for (const i of issues) byProblem.set(`${i.screen}: ${i.problem.replace(/\d+/g, "#")}`, [...(byProblem.get(`${i.screen}: ${i.problem.replace(/\d+/g, "#")}`) ?? []), i]);
  for (const [k, list] of byProblem) console.log(`${list.length}× ${k}\n   e.g. ${list[0]?.state} on ${list[0]?.device}: ${list[0]?.problem}`);
  console.log(`${issues.length} issues; screenshots in ${OUT}`);
  if (issues.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
