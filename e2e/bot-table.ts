/**
 * A table of bots waiting for one person: makes a room, seats 3 bot phones (the first hosts), and
 * once a 4th player joins, deals and plays every bot turn through the bots' own phone pages, for
 * the whole game. The person (or an exploring agent) plays from /join/CODE.
 *
 *   GAME_URL=http://localhost:8797 pnpm exec tsx e2e/bot-table.ts [CODE] [BOTS]
 *
 * Prints JOIN <url> once the bots are seated.
 */
import { chromium } from "playwright";
import { BASE, newRoomCode, phoneContext, playTable, seatPlayers } from "./table";

const code = (process.argv[2] ?? newRoomCode()).toUpperCase();
const bots = Number(process.argv[3] ?? 3);
const browser = await chromium.launch({ channel: "chrome" });
await fetch(`${BASE}/tv/${code}`); // the room exists once its TV page has been served
const phones = await Promise.all(Array.from({ length: bots }, async () => (await browser.newContext(phoneContext())).newPage()));
await seatPlayers(phones, code);
console.log(`JOIN ${BASE}/join/${code}`);
console.log(`TV ${BASE}/tv/${code}`);
const result = await playTable(phones, { waitForSeats: bots + 1, beat: 400, stallMs: 24 * 3600_000 });
console.log("game over", result);
await browser.close();
