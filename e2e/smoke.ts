/** Quick look: TV + 4 phones play round 1 headless; screenshots in recordings/smoke/. */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { newRoomCode, openTv, phoneContext, playTable, seatPlayers } from "./table";

const OUT = "recordings/smoke";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const code = newRoomCode();
const tv = await openTv(browser, code, { width: 1920, height: 1080 });
tv.on("pageerror", (e) => console.log("[tv]", e.message));
const phones = await Promise.all([0, 1, 2, 3].map(async () => (await browser.newContext(phoneContext())).newPage()));
phones.forEach((p, i) => p.on("pageerror", (e) => console.log(`[phone ${i}]`, e.message)));
await seatPlayers(phones, code);
await tv.screenshot({ path: `${OUT}/tv-lobby.png` });
await phones[0]!.screenshot({ path: `${OUT}/phone-lobby.png` });
let shots = 0;
const result = await playTable(phones, {
  rounds: Number(process.env.ROUNDS ?? 1),
  beat: 40,
  onMoment: async (name) => {
    if (shots++ > 12) return;
    await tv.screenshot({ path: `${OUT}/tv-${shots}-${name}.png` });
    await phones[0]!.screenshot({ path: `${OUT}/phone-${shots}-${name}.png` });
  },
}).catch(async (e) => {
  await tv.screenshot({ path: `${OUT}/fail-tv.png` });
  for (const [i, p] of phones.entries()) await p.screenshot({ path: `${OUT}/fail-phone${i}.png` });
  throw e;
});
await tv.screenshot({ path: `${OUT}/tv-end.png` });
for (const [i, p] of phones.entries()) await p.screenshot({ path: `${OUT}/phone${i}-end.png` });
console.log("done", result);
await browser.close();
