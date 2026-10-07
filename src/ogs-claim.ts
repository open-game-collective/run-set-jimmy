import type { GameToken } from "@open-game-system/profile-kit/server";
import { z } from "zod";
import type { OgsClaim } from "./room.types";

/**
 * OGS identity (open-game-system contract §4, §7). A TV page or phone inside OGS posts its OGS game
 * token with its own room caller id (`t`); a token that verifies tells the room who that caller is
 * (name, avatar) and, when it names a couch, which household they sit with (the OGS_CLAIM service
 * event). Nothing else is trusted from the page.
 */
const BodySchema = z.object({ t: z.string().regex(/^[0-9a-f-]{36}$/), token: z.string().min(1) });

export type ClaimDeps = {
  verify: (token: string) => Promise<GameToken | null>;
  send: (roomCode: string, event: { type: "OGS_CLAIM"; callerId: string; claim: OgsClaim }) => Promise<void>;
};

export async function ogsClaim(req: Request, roomCode: string, deps: ClaimDeps): Promise<Response> {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("expected JSON", { status: 400 });
  }
  const body = BodySchema.safeParse(raw);
  if (!body.success) return new Response("expected { t, token }", { status: 400 });
  const claims = await deps.verify(body.data.token);
  if (!claims) return new Response("token did not verify", { status: 401 });
  await deps.send(roomCode, {
    type: "OGS_CLAIM",
    callerId: body.data.t,
    claim: { profileId: claims.sub, name: claims.name, avatar: claims.avatar, couch: claims.couch ?? null },
  });
  return new Response(null, { status: 204 });
}

const ROOM_CODE = /^[A-Z]{4}$/;

/** /host?ogsRoom=<code>: a room to join (this couch's TV made it, or another couch's did); else make one. */
export function hostTarget(url: URL): { join: string | null } {
  const room = url.searchParams.get("ogsRoom")?.toUpperCase() ?? "";
  return { join: ROOM_CODE.test(room) ? room : null };
}
