/**
 * Durable Object eviction (v1 lost its timers in production on 10-07: rooms froze in the buy
 * window). Each test runs its own `wrangler dev`, kills it (process and all: every room in memory
 * is gone, as on an eviction or a deploy), starts it again on the same storage and then sends the
 * room NOTHING: no page, no socket, no TICK. It reads the room's SQLite file directly, so only the
 * room's own alarm can move it on.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { replayJournal } from "@actor-kit/test";
import { readJournal } from "@actor-kit/worker/testing";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { z } from "zod";
import { RoomContract } from "../src/room";
import { AI_THINK_MS, BUY_WINDOW_MS, CUT_TIMEOUT_MS } from "../src/room";
import type { RoomClientEvent } from "../src/room.types";
import { JWKS_PORT } from "./ogs-jwks";

const PORT = Number(process.env.EVICTION_PORT ?? 8899);
const BASE = `http://localhost:${PORT}`;
const STATE = ".wrangler/eviction-state";
const DO_DIR = join(STATE, "v3", "do", "run-set-jimmy-RoomActor");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- The server ---

let server: ChildProcess | null = null;

/** Starts `wrangler dev` on the eviction port and waits until it serves. Returns when it is ready (ms). */
async function startServer(): Promise<number> {
  const child = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE, "--var", `OGS_JWKS_URL:http://localhost:${JWKS_PORT}/.well-known/jwks.json`], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server = child;
  let out = "";
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
  // Retry a slow start on a loaded machine rather than raising the limit.
  for (let i = 0; i < 240; i++) {
    if (out.includes("Ready on")) return Date.now();
    if (child.exitCode !== null) throw new Error(`wrangler dev exited: ${out.slice(-800)}`);
    await wait(250);
  }
  throw new Error(`wrangler dev did not start: ${out.slice(-800)}`);
}

/** Kills the server and every process it started (workerd too): the rooms in memory are gone. */
async function killServer(): Promise<void> {
  const child = server;
  server = null;
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // already gone
  }
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await wait(100);
}

afterEach(killServer);

// --- Reading a room without waking it ---

const Row = z.object({ state: z.string() });
const EventRow = z.object({ seq: z.number(), cause_type: z.string(), name: z.string().nullable(), caller: z.string().nullable(), created_at: z.number() });
const TimerRow = z.object({ name: z.string(), fire_at: z.number() });
const StateZ = z.object({
  phase: z.string(),
  local: z.unknown(),
  shared: z.object({
    seats: z.array(z.object({ id: z.string(), ai: z.boolean() })),
    cutter: z.number().nullable(),
    log: z.array(z.object({ seq: z.number(), text: z.string() })),
    round: z.object({ turn: z.number(), seats: z.array(z.object({ id: z.string() })) }).nullable(),
  }),
});
const DeadlineZ = z.object({ endsAt: z.number() });

/** The room's SQLite file (read-only; workerd keeps writing it). */
function roomDb(code: string): DatabaseSync {
  for (const file of readdirSync(DO_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")) {
    const db = new DatabaseSync(join(DO_DIR, file), { readOnly: true });
    const row = db.prepare("SELECT actor_id FROM snapshots").get();
    if (row && row["actor_id"] === code) return db;
    db.close();
  }
  throw new Error(`no stored room ${code}`);
}

function read(code: string) {
  const db = roomDb(code);
  try {
    const state = StateZ.parse(JSON.parse(Row.parse(db.prepare("SELECT state FROM snapshots").get()).state));
    const events = db.prepare("SELECT seq, cause_type, name, caller, created_at FROM events ORDER BY seq").all().map((r) => EventRow.parse(r));
    const timers = db.prepare("SELECT name, fire_at FROM timers ORDER BY fire_at").all().map((r) => TimerRow.parse(r));
    return { state, events, timers };
  } finally {
    db.close();
  }
}

/** The room's journal, as the runtime reads it, through node:sqlite. */
function journalOf(code: string) {
  const db = roomDb(code);
  try {
    return readJournal({
      exec: (query: string, ...bindings: (string | number | null)[]) => ({ toArray: () => db.prepare(query).all(...bindings) }),
    });
  } finally {
    db.close();
  }
}

async function until<T>(what: string, probe: () => T | null, ms = 30_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    let found: T | null = null;
    try {
      found = probe();
    } catch {
      found = null; // mid-write: read again
    }
    if (found !== null) return found;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await wait(100);
  }
}

// --- Phones (sockets as the Worker signs them) ---

const BootZ = z.object({ id: z.string(), sig: z.string() });

async function bootOf(path: string): Promise<z.infer<typeof BootZ>> {
  const html = await (await fetch(`${BASE}${path}`)).text();
  const json = /<script id="boot" type="application\/json">(.*?)<\/script>/.exec(html)?.[1];
  if (!json) throw new Error(`no boot payload at ${path}`);
  return BootZ.parse(JSON.parse(json));
}

type Phone = { id: string; send: (e: RoomClientEvent) => void; close: () => void };

async function phone(code: string): Promise<Phone> {
  const boot = await bootOf(`/join/${code}?t=${crypto.randomUUID()}`);
  const ws = new WebSocket(`ws://localhost:${PORT}/api/${code}/ws?id=${encodeURIComponent(boot.id)}&sig=${encodeURIComponent(boot.sig)}`, "actor-kit.v1");
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return { id: boot.id, send: (e) => ws.send(JSON.stringify(e)), close: () => ws.close() };
}

const newCode = () => Array.from({ length: 4 }, () => "BCDFGHJKLMNPQRSTVWXZ"[Math.floor(Math.random() * 20)]).join("");

/** A room with `people` phones and `ai` AI players, started (the first phone hosts). */
async function startedRoom(people: number, ai: number): Promise<{ code: string; phones: Phone[] }> {
  const code = newCode();
  await bootOf(`/tv/${code}?t=${crypto.randomUUID()}`);
  const phones: Phone[] = [];
  for (let i = 0; i < people; i++) {
    const p = await phone(code);
    p.send({ type: "JOIN", name: `P${i + 1}` });
    phones.push(p);
    await until(`seat ${i + 1}`, () => (read(code).state.shared.seats.length === i + 1 ? true : null));
  }
  for (let i = 0; i < ai; i++) phones[0]?.send({ type: "ADD_AI" });
  await until("AI seats", () => (read(code).state.shared.seats.length === people + ai ? true : null));
  phones[0]?.send({ type: "START" });
  await until("the cut", () => (read(code).state.phase === "cutting" ? true : null));
  return { code, phones };
}

/** Everything that happened after `seq`: each one must be the room's own timer, never a caller. */
const after = (code: string, seq: number) => read(code).events.filter((e) => e.seq > seq);

describe("a room evicted mid-game carries on by itself (durable timers, no client TICK)", () => {
  rmSync(STATE, { recursive: true, force: true });

  it("evicted during the buy window: the window closes with nobody connected", async () => {
    await startServer();
    const { code, phones } = await startedRoom(3, 0);
    const { state } = read(code);
    const cutter = phones.find((p) => p.id === state.shared.seats[state.shared.cutter ?? -1]?.id);
    cutter?.send({ type: "CUT", at: 0.4 });
    const endsAt = await until("the buy window", () => {
      const s = read(code).state;
      return s.phase === "window" ? DeadlineZ.parse(s.local).endsAt : null;
    });
    const lastSeq = read(code).events.at(-1)?.seq ?? 0;
    for (const p of phones) p.close();
    await killServer();
    expect(Date.now()).toBeLessThan(endsAt); // evicted before the window's time was up

    const ready = await startServer();
    const closed = await until("the window to close", () => (read(code).state.phase === "acting" ? read(code) : null), 30_000);
    const since = closed.events.filter((e) => e.seq > lastSeq);
    expect(since.map((e) => `${e.cause_type}:${e.name}`)).toEqual(["timer:buyWindow"]);
    expect(since.every((e) => e.caller === null)).toBe(true);
    // It fired as soon as the room was back (its deadline passed while the server was down).
    const fired = since[0]?.created_at ?? 0;
    expect(fired).toBeGreaterThanOrEqual(endsAt);
    expect(fired - Math.max(ready, endsAt)).toBeLessThan(3000);
    await replayJournal(RoomContract, journalOf(code));
  }, 180_000);

  it("evicted during the cut: the room cuts for the cutter on time, after coming back", async () => {
    await startServer();
    const { code, phones } = await startedRoom(3, 0);
    const endsAt = DeadlineZ.parse(read(code).state.local).endsAt;
    const lastSeq = read(code).events.at(-1)?.seq ?? 0;
    for (const p of phones) p.close();
    await killServer();
    await startServer();
    expect(Date.now()).toBeLessThan(endsAt - 1000); // back before the deadline: it must wait for it
    expect(read(code).state.phase).toBe("cutting");
    const dealt = await until("the room's cut", () => (read(code).state.phase === "window" ? read(code) : null), CUT_TIMEOUT_MS + 10_000);
    const cutEvent = dealt.events.find((e) => e.seq > lastSeq && e.name === "cutTimeout");
    expect(cutEvent?.cause_type).toBe("timer");
    expect(cutEvent?.created_at ?? 0).toBeGreaterThanOrEqual(endsAt);
    expect((cutEvent?.created_at ?? 0) - endsAt).toBeLessThan(1500);
    expect(after(code, lastSeq).every((e) => e.caller === null)).toBe(true);
    await replayJournal(RoomContract, journalOf(code));
  }, 180_000);

  it("evicted while an AI player is thinking: the AI players play on to the person's turn with nobody connected", async () => {
    await startServer();
    // One person and two AI players: round 1's dealer is the person, so an AI cuts and an AI plays first.
    const { code, phones } = await startedRoom(1, 2);
    const person = phones[0]?.id ?? "";
    await until("an AI player to be thinking", () => {
      const { state, timers } = read(code);
      const turn = state.shared.round?.seats[state.shared.round.turn]?.id ?? "";
      return state.phase !== "cutting" && turn.startsWith("ai:") && timers.some((t) => t.name === "aiThink") ? true : null;
    });
    const lastSeq = read(code).events.at(-1)?.seq ?? 0;
    for (const p of phones) p.close();
    await killServer();
    await wait(AI_THINK_MS); // the AI's moment passes while the room is down
    await startServer();
    const done = await until(
      "the AI players to finish their turns",
      () => {
        const r = read(code);
        const round = r.state.shared.round;
        const turn = round?.seats[round.turn]?.id;
        return turn === person && r.state.phase === "acting" ? r : null;
      },
      60_000,
    );
    const since = done.events.filter((e) => e.seq > lastSeq);
    expect(since.length).toBeGreaterThan(2);
    expect(since.every((e) => e.cause_type === "timer" && e.caller === null)).toBe(true);
    expect(since.some((e) => e.name === "aiThink")).toBe(true);
    expect(since.some((e) => e.name === "buyWindow")).toBe(true);
    // The pauses between AI moves stay the room's own pace (no burst of moves at wake-up).
    const aiMoves = since.filter((e) => e.name === "aiThink").map((e) => e.created_at);
    for (let i = 1; i < aiMoves.length; i++) expect((aiMoves[i] ?? 0) - (aiMoves[i - 1] ?? 0)).toBeGreaterThanOrEqual(Math.min(AI_THINK_MS, BUY_WINDOW_MS) - 50);
    await replayJournal(RoomContract, journalOf(code));
  }, 180_000);
});
