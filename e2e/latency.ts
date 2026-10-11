/**
 * Latency on a real deployment: a TV and 3 bot phones (real pages, real buttons) play one round in a
 * new room. Reports each move's round trip (the phone's last tap to its own screen showing the move),
 * and how late the room's own timers moved on: the buy window (vs. the `endsAt` the screens count down
 * to) and the cut (the bots never tap the deck, so the room cuts at `cutEndsAt`). Exits non-zero when a
 * number is over its limit.
 *
 *   GAME_URL=https://run-set-jimmy.jonathanrmumm.workers.dev pnpm exec tsx e2e/latency.ts
 *
 * Works against v1 (actor-kit 0.52) and v2 alike: it only reads what a phone's page puts on
 * `window.__rsjView`. Timer lateness compares the server's deadline with this machine's clock (NTP
 * skew, typically well under 50 ms, is included).
 */
import { chromium, type Page } from "playwright";
import { breaches, roundTrips, summarize, timerLateness, type MoveClicks, type Thresholds, type TimerSeen, type ViewChange } from "../src/test/latency-stats";
import { BASE, newRoomCode, openTv, phoneContext, playTable, seatPlayers } from "./table";

/**
 * Limits: about 2.5× v1 production's p95 on 2026-10-11 (version 10c45a6d, two runs, docs/spec.md):
 * round trip p95 136–176 ms, buy window late p95 114–126 ms, cut late 28–47 ms. Override with
 * LAT_RT_P95 / LAT_WINDOW_P95 / LAT_CUT_MAX (ms).
 */
const LIMITS: Thresholds = {
  roundTripP95: Number(process.env.LAT_RT_P95 ?? 400),
  windowP95: Number(process.env.LAT_WINDOW_P95 ?? 400),
  cutMax: Number(process.env.LAT_CUT_MAX ?? 1000),
};

/** Runs in every page before its scripts: notes taps, and every change of the page's own view. */
function instrument(): void {
  type Lat = { clicks: number[]; changes: { at: number; progress: string }[]; timers: { kind: string; deadline: number; endedAt: number }[] };
  const lat: Lat = { clicks: [], changes: [], timers: [] };
  Reflect.set(window, "__lat", lat);
  let current: unknown;
  let windowEnds: number | null = null;
  let cutEnds: number | null = null;
  const get = (o: unknown, k: string): unknown => (typeof o === "object" && o !== null ? Reflect.get(o, k) : undefined);
  const num = (x: unknown): number | null => (typeof x === "number" ? x : null);
  const progressOf = (v: unknown): string => {
    const pub = get(v, "pub");
    const log = get(pub, "log");
    const last = Array.isArray(log) ? log[log.length - 1] : undefined;
    const me = get(v, "me");
    const hand = get(me, "hand");
    return [num(get(last, "seq")), get(pub, "turnPhase"), Array.isArray(hand) ? hand.length : -1, get(me, "buyRequested"), num(get(get(me, "oops"), "seq"))].join("|");
  };
  Object.defineProperty(window, "__rsjView", {
    configurable: true,
    get: () => current,
    set: (v: unknown) => {
      current = v;
      const now = performance.now();
      lat.changes.push({ at: now, progress: progressOf(v) });
      const pub = get(v, "pub");
      const value = get(v, "value");
      const win = get(pub, "window");
      const ends = num(get(win, "endsAt"));
      if (ends !== null) windowEnds = ends;
      else if (windowEnds !== null) {
        lat.timers.push({ kind: "window", deadline: windowEnds, endedAt: Date.now() });
        windowEnds = null;
      }
      if (value === "cutting") cutEnds = num(get(pub, "cutEndsAt")) ?? cutEnds;
      else if (cutEnds !== null) {
        lat.timers.push({ kind: "cut", deadline: cutEnds, endedAt: Date.now() });
        cutEnds = null;
      }
    },
  });
  addEventListener("click", () => lat.clicks.push(performance.now()), true);
}

type PageLat = { clicks: number[]; changes: ViewChange[]; timers: (TimerSeen & { kind: string })[] };

async function latOf(page: Page): Promise<PageLat> {
  const raw: unknown = await page.evaluate(() => Reflect.get(window, "__lat"));
  if (typeof raw !== "object" || raw === null) throw new Error("page not instrumented");
  const pick = <T>(k: string, ok: (x: unknown) => x is T): T[] => {
    const xs: unknown = Reflect.get(raw, k);
    return Array.isArray(xs) ? xs.filter(ok) : [];
  };
  const isNum = (x: unknown): x is number => typeof x === "number";
  const isChange = (x: unknown): x is ViewChange => typeof x === "object" && x !== null && isNum(Reflect.get(x, "at")) && typeof Reflect.get(x, "progress") === "string";
  const isTimer = (x: unknown): x is TimerSeen & { kind: string } =>
    typeof x === "object" && x !== null && isNum(Reflect.get(x, "deadline")) && isNum(Reflect.get(x, "endedAt")) && typeof Reflect.get(x, "kind") === "string";
  return { clicks: pick("clicks", isNum), changes: pick("changes", isChange), timers: pick("timers", isTimer) };
}

const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const started = Date.now();
try {
  const code = newRoomCode();
  console.log(`room ${code} on ${BASE}`);
  const tv = await openTv(browser, code, { width: 1280, height: 720 });
  const phones = await Promise.all(
    [0, 1, 2].map(async () => {
      const ctx = await browser.newContext(phoneContext());
      // tsx compiles named inner functions with esbuild's __name helper, which the page lacks.
      await ctx.addInitScript({ content: "globalThis.__name = (f) => f;" });
      await ctx.addInitScript(instrument);
      return ctx.newPage();
    }),
  );
  await seatPlayers(phones, code);

  const moves = new Map<Page, MoveClicks[]>();
  const marks = new Map<Page, { clicks: number; after: string }>();
  await playTable(phones, {
    rounds: 1,
    beat: 40,
    letRoomCut: true,
    stallMs: 60_000,
    measure: {
      before: async (page) => {
        const l = await latOf(page);
        marks.set(page, { clicks: l.clicks.length, after: l.changes.at(-1)?.progress ?? "" });
      },
      after: async (page) => {
        const mark = marks.get(page);
        if (!mark) return;
        const l = await latOf(page);
        moves.set(page, [...(moves.get(page) ?? []), { clicks: l.clicks.slice(mark.clicks), after: mark.after }]);
      },
    },
  });

  const all = await Promise.all(phones.map(latOf));
  const roundTrip = phones.flatMap((page, i) => roundTrips(moves.get(page) ?? [], all[i]?.changes ?? [])).map(Math.round);
  // Every phone sees the same timers: the host's view is the table's.
  const timers = all[0]?.timers ?? [];
  const summary = summarize({
    roundTrip,
    window: timerLateness(timers.filter((t) => t.kind === "window")),
    cut: timerLateness(timers.filter((t) => t.kind === "cut")),
  });
  const failed = breaches(summary, LIMITS);
  console.log(JSON.stringify({ base: BASE, room: code, seconds: Math.round((Date.now() - started) / 1000), summary, limits: LIMITS, failed }, null, 2));
  await tv.close();
  process.exitCode = failed.length > 0 ? 1 : 0;
} finally {
  await browser.close();
}
