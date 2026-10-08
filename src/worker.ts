import type { Caller } from "actor-kit";
import { createAccessToken } from "actor-kit/server";
import { verifyOgsToken } from "@open-game-system/profile-kit/server";
import { APP_ID } from "./game/sitting";
import { hostTarget, ogsClaim } from "./ogs-claim";
import { actorKitRouter, type WorkerEnv } from "./room.server";
import type { Boot } from "./room.types";

export { Room } from "./room.server";
export { Game, Remix, Session } from "./legacy-objects";

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
 * Serves /tv/:roomId and /join/:roomCode. The `t` query param is the caller's
 * rejoin token: it becomes the actor-kit caller id, so a refreshed page keeps its role.
 */
async function servePage(req: Request, env: WorkerEnv, page: "tv" | "join", roomCode: string): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (!token || !TOKEN.test(token)) {
    url.searchParams.set("t", crypto.randomUUID());
    return Response.redirect(url.toString(), 302);
  }

  const caller: Caller = { id: token, type: "client" };
  const stub = env.ROOM.get(env.ROOM.idFromName(roomCode));
  if (page === "tv") {
    await stub.spawn({ actorType: "room", actorId: roomCode, caller, input: {} });
  }

  let payload: Awaited<ReturnType<typeof stub.getSnapshot>>;
  try {
    payload = await stub.getSnapshot(caller);
  } catch {
    return new Response("No game with that code.", { status: 404 });
  }

  const accessToken = await createAccessToken({
    signingKey: env.ACTOR_KIT_SECRET,
    actorId: roomCode,
    actorType: "room",
    callerId: caller.id,
    callerType: caller.type,
  });

  const boot: Boot = { host: url.host, roomCode, accessToken, checksum: payload.checksum, snapshot: payload.snapshot };
  const html = await (await env.ASSETS.fetch(new URL(`/${page}`, url))).text();
  return new Response(html.replace("<!--BOOT-->", `<script id="boot" type="application/json">${inlineJson(boot)}</script>`), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
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
  if (!joining) {
    const stub = env.ROOM.get(env.ROOM.idFromName(roomCode));
    await stub.spawn({ actorType: "room", actorId: roomCode, caller: { id: tvToken, type: "client" }, input: {} });
  }
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
  async fetch(req: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const [, head, rawCode] = url.pathname.split("/");
    const roomCode = rawCode?.toUpperCase() ?? "";

    // OGS: the app opens the start page with ?ogsRoom= to follow the TV into its room.
    const joining = hostTarget(url).join;
    if (url.pathname === "/" && joining) return Response.redirect(new URL(`/host?ogsRoom=${joining}`, url).toString(), 302);
    // A plain browser gets a new room's TV page; ?as=tv keeps a phone or tablet on it (the start screen's "Use this screen as the TV").
    if (url.pathname === "/") return Response.redirect(new URL(`/tv/${newRoomCode()}${url.searchParams.get("as") === "tv" ? "?as=tv" : ""}`, url).toString(), 302);
    if (head === "api") return actorKitRouter(req, env, ctx);
    if (url.pathname === "/host") return hostRoom(req, env);
    if (url.pathname === "/ws-probe") return wsProbe(req);
    if (head === "ogs" && rawCode === "claim") {
      const room = url.pathname.split("/")[3]?.toUpperCase() ?? "";
      if (!ROOM_CODE.test(room)) return new Response("Not found", { status: 404 });
      return ogsClaim(req, room, {
        verify: (token) => verifyOgsToken(token, { appId: APP_ID, ...(env.OGS_JWKS_URL ? { jwksUrl: env.OGS_JWKS_URL } : {}) }),
        send: async (code, event) => {
          const stub = env.ROOM.get(env.ROOM.idFromName(code));
          // Wakes the room's actor (and throws for a room that doesn't exist).
          await stub.getSnapshot({ id: "ogs", type: "service" });
          // actor-kit's RPC type leaves out `caller`, but the room reads it (only a service may say this).
          const fromOgs = { ...event, caller: { id: "ogs", type: "service" as const } };
          await stub.send(fromOgs);
        },
      });
    }
    if ((head === "tv" || head === "join") && ROOM_CODE.test(roomCode)) return servePage(req, env, head, roomCode);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<WorkerEnv>;
