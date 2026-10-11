import { applyDelta, decode, encode, encodeDelta } from "@actor-kit/core";
import { describe, expect, it } from "vitest";
import { RoomViewSchema, type RoomWireView } from "./room.wire";
import { ANN, BEN, CAT, botStep, pub, seen, startedRoom, value } from "./test/room-test-helpers";

/** Every view a seated phone was sent while bots played a round (as the socket would send them). */
function viewsOfARound(): Map<string, RoomWireView[]> {
  const room = startedRoom(3);
  const views = new Map<string, RoomWireView[]>([ANN, BEN, CAT].map((id) => [id, [seen(room, id)]]));
  for (let i = 0; i < 20_000 && value(room).startsWith("playing"); i++) {
    botStep(room);
    for (const [id, list] of views) list.push(seen(room, id));
  }
  expect(pub(room).roundWinner).not.toBeNull();
  return views;
}

describe("the view on the wire (binary snapshot and delta frames)", () => {
  it("a snapshot decodes to the view sent", () => {
    for (const list of viewsOfARound().values()) for (const v of list.slice(0, 50)) expect(decode(RoomViewSchema, encode(RoomViewSchema, v))).toEqual(v);
  });

  it("each delta applied to the phone's previous view gives exactly the next view (hand included)", () => {
    for (const list of viewsOfARound().values()) {
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const next = list[i];
        if (!prev || !next) continue;
        const delta = encodeDelta(RoomViewSchema, prev, next);
        // No delta: nothing changed for this phone.
        const applied = delta === null ? prev : applyDelta(RoomViewSchema, prev, delta);
        expect(applied.private.player?.hand.map((c) => c.id)).toEqual(next.private.player?.hand.map((c) => c.id));
        expect(applied).toEqual(next);
      }
    }
  });
});
