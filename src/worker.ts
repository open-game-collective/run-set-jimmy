import { createActorClass, withCallerIdentity } from "@actor-kit/worker";
import { verifyOgsToken } from "@open-game-system/profile-kit/server";
import type { Env } from "./env";
import { APP_ID } from "./game/sitting";
import { signId, verifyId } from "./identity";
import { hostTarget, ogsClaim } from "./ogs-claim";
import { RoomContract } from "./room";
import type { Boot, RoomClientEvent } from "./room.types";

/** The room actor (actor-kit v2). v1's `Room` class stays as a placeholder (src/legacy-objects.ts). */
export const RoomActor = createActorClass(RoomContract);
export { Game, Remix, Room, Session } from "./legacy-objects";

type RoomStub = {
  spawn(input: { actorId: string; caller: string; callerType: "service"; input: { code: string; tvId: string } }): Promise<void>;
  getSnapshot(caller: string, callerType: "user" | "service"): Promise<{ checksum: string; snapshot: unknown; role: string }>;
  send(caller: string, callerType: "user" | "service", event: RoomClientEvent | { type: "OGS_CLAIM"; callerId: string; claim: unknown }): Promise<{ ok: boolean; error?: string }>;
  fetch(req: Request): Promise<Response>;
};

export interface WorkerEnv extends Env {
  ASSETS: Fetcher;
  ROOM: { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): RoomStub };
}

const stubFor = (env: WorkerEnv, code: string): RoomStub => env.ROOM.get(env.ROOM.idFromName(code));

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_CODE = /^[A-Z]{4}$/;
const TOKEN = /^[0-9a-f-]{36}$/;

function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** JSON safe to inline inside a <script> tag. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * Serves /tv/:roomId and /join/:roomCode. The `t` query param is the caller's rejoin token: it is
 * the room's caller id, so a refreshed page keeps its role. The page gets it signed, for its socket.
 */
async function servePage(req: Request, env: WorkerEnv, page: "tv" | "join", roomCode: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token || !TOKEN.test(token)) {
    url.searchParams.set("t", crypto.randomUUID());
    return Response.redirect(url.toString(), 302);
  }

  const stub = stubFor(env, roomCode);
  // The first TV page makes the room (later TVs, of other households, just watch it).
  if (page === "tv") await stub.spawn({ actorId: roomCode, caller: "worker", callerType: "service", input: { code: roomCode, tvId: token } });

  let snap: Awaited<ReturnType<RoomStub["getSnapshot"]>>;
  try {
    snap = await stub.getSnapshot(token, "user");
  } catch {
    return new Response("No game with that code.", { status: 404 });
  }

  const boot: Boot = { roomCode, id: token, sig: await signId(token, env.ACTOR_KIT_SECRET), view: snap.snapshot };
  const html = await (await env.ASSETS.fetch(new URL(`/${page}`, url))).text();
  return new Response(html.replace("<!--BOOT-->", `<script id="boot" type="application/json">${inlineJson(boot)}</script>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** /api/:code/ws?id&sig: a page's socket, opened as the caller id the Worker signed for it. */
async function socket(req: Request, env: WorkerEnv, code: string): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!TOKEN.test(id) || !(await verifyId(id, sig, env.ACTOR_KIT_SECRET))) return new Response("Forbidden", { status: 403 });
  return stubFor(env, code).fetch(withCallerIdentity(req, { callerId: id, callerType: "user", supportsBinary: true }));
}

/**
 * /host — start a game from a phone (e.g. inside the OGS app) whose TV will be cast.
 * Creates the room with its own TV caller, then sends the phone in to take its seat. The `tv` param
 * lets the host phone tell the OGS app which TV page to show.
 */
async function hostRoom(req: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(req.url);
  // OGS: a room the app names (?ogsRoom=KQTP: this couch's TV made it, or another couch's) is joined
  // with a TV page of this phone's own (the app only uses the host phone's).
  const { join: joining } = hostTarget(url);
  const roomCode = joining ?? newRoomCode();
  const tvToken = crypto.randomUUID();
  if (!joining) await stubFor(env, roomCode).spawn({ actorId: roomCode, caller: "worker", callerType: "service", input: { code: roomCode, tvId: tvToken } });
  const join = new URL(`/join/${roomCode}`, url);
  join.searchParams.set("t", crypto.randomUUID());
  join.searchParams.set("tv", tvToken);
  return Response.redirect(join.toString(), 302);
}

/** Debug: a WebSocket echo, so a TV (e.g. in the cloud stream server) can check WebSockets work. */
function wsProbe(req: Request): Response {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.addEventListener("message", (e) => server.send(`echo:${String(e.data)}`));
  // ?push=1: also send unprompted messages, like a game server pushing state.
  if (new URL(req.url).searchParams.has("push")) {
    let n = 0;
    const timer = setInterval(() => {
      try {
        server.send(`tick:${++n}`);
      } catch {
        clearInterval(timer);
      }
      if (n >= 30) clearInterval(timer);
    }, 2000);
    server.addEventListener("close", () => clearInterval(timer));
  }
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(req.url);
    const [, head, rawCode] = url.pathname.split("/");
    const roomCode = rawCode?.toUpperCase() ?? "";

    // OGS: the app opens the start page with ?ogsRoom= to follow the TV into its room.
    const joining = hostTarget(url).join;
    if (url.pathname === "/" && joining) return Response.redirect(new URL(`/host?ogsRoom=${joining}`, url).toString(), 302);
    // A plain browser gets a new room's TV page; ?as=tv keeps a phone or tablet on it (the start screen's "Use this screen as the TV").
    if (url.pathname === "/") return Response.redirect(new URL(`/tv/${newRoomCode()}${url.searchParams.get("as") === "tv" ? "?as=tv" : ""}`, url).toString(), 302);
    if (head === "api" && ROOM_CODE.test(roomCode) && url.pathname.split("/")[3] === "ws") return socket(req, env, roomCode);
    if (url.pathname === "/host") return hostRoom(req, env);
    if (url.pathname === "/ws-probe") return wsProbe(req);
    if (head === "ogs" && rawCode === "claim") {
      const room = url.pathname.split("/")[3]?.toUpperCase() ?? "";
      if (!ROOM_CODE.test(room)) return new Response("Not found", { status: 404 });
      return ogsClaim(req, room, {
        verify: (token) => verifyOgsToken(token, { appId: APP_ID, ...(env.OGS_JWKS_URL ? { jwksUrl: env.OGS_JWKS_URL } : {}) }),
        send: async (code, event) => {
          const stub = stubFor(env, code);
          // Throws for a room that doesn't exist.
          await stub.getSnapshot("ogs", "service");
          const sent = await stub.send("ogs", "service", event);
          if (!sent.ok) throw new Error(`OGS_CLAIM refused: ${sent.error ?? "unknown"}`);
        },
      });
    }
    if ((head === "tv" || head === "join") && ROOM_CODE.test(roomCode)) return servePage(req, env, head, roomCode);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<WorkerEnv>;
