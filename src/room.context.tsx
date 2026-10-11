import { actorClient } from "@actor-kit/client";
import { createActorContext } from "@actor-kit/react";
import type { RoomContract } from "./room";
import type { RoomMessage } from "./room.types";
import { roomRoles, roomViews } from "./room.views";
import { RoomViewSchema, type RoomWireView } from "./room.wire";

const Ctx = createActorContext<RoomWireView, RoomMessage>();
const RoomClient = actorClient<RoomContract>({ roles: roomRoles, views: roomViews });

/** A page's live room: its socket (as its signed caller id), starting from the view the Worker inlined. */
export function connectRoom(opts: { roomCode: string; id: string; sig: string; view: unknown }) {
  const client = RoomClient.create({
    path: `/api/${opts.roomCode}/ws?id=${encodeURIComponent(opts.id)}&sig=${encodeURIComponent(opts.sig)}`,
    initialView: RoomViewSchema.parse(opts.view),
  });
  client.connect();
  return client;
}

/** The room as the screens read it: `value` (the phase), `public` (the table) and `private` (the caller's own slot). */
export const RoomContext = { Provider: Ctx.Provider, useSend: Ctx.useSend, useSelector: Ctx.useSelector };
