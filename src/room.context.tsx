import { actorClient } from "@actor-kit/client";
import { createActorContext } from "@actor-kit/react";
import { RoomContract } from "./room";
import type { RoomClientEvent } from "./room.types";
import { fromWire, RoomWireViewZ, type RoomSnapshot, type RoomWireView } from "./room.wire";

const Ctx = createActorContext<RoomWireView, RoomClientEvent>();

/** Each view is parsed once (at the boundary), however many selectors read it. */
const parsed = new WeakMap<RoomWireView, RoomSnapshot>();
function snapshotOf(view: RoomWireView): RoomSnapshot {
  const known = parsed.get(view);
  if (known) return known;
  const snapshot = fromWire(view);
  parsed.set(view, snapshot);
  return snapshot;
}

/** A page's live room: its socket (as its signed caller id), starting from the view the Worker inlined. */
export function connectRoom(opts: { roomCode: string; id: string; sig: string; view: unknown }) {
  const client = actorClient(RoomContract)
    .messages<RoomClientEvent>()
    .create({
      path: `/api/${opts.roomCode}/ws?id=${encodeURIComponent(opts.id)}&sig=${encodeURIComponent(opts.sig)}`,
      initialView: RoomWireViewZ.parse(opts.view),
    });
  client.connect();
  return client;
}

export const RoomContext = {
  Provider: Ctx.Provider,
  useSend: Ctx.useSend,
  /** Reads the room as the screens know it: `value`, `public`, and the caller's own `private` slot. */
  useSelector: <T,>(selector: (snapshot: RoomSnapshot) => T): T => Ctx.useSelector((view) => selector(snapshotOf(view))),
};
