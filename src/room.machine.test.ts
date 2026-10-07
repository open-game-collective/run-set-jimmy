import { describe, expect, it } from "vitest";
import { BUY_WINDOW_MS, CUT_TIMEOUT_MS } from "./room.machine";
import {
  ANN,
  BEN,
  CAT,
  DAN,
  TV,
  claim,
  createTestActor,
  cut,
  joinPlayers,
  playOutRound,
  pub,
  round,
  send,
  snap,
  startedRoom,
  turnId,
  value,
  view,
  type TestRoom,
} from "./test/room-test-helpers";

const seatIndex = (room: TestRoom, id: string) => snap(room).context.server.seats.findIndex((s) => s.id === id);

describe("lobby", () => {
  it("starts empty with the room code; the creator is the TV", () => {
    const room = createTestActor();
    expect(value(room)).toBe("lobby");
    expect(pub(room).roomCode).toBe("ABCD");
    expect(view(room, TV).role).toBe("tv");
  });

  it("seats phones in join order; the first one hosts", () => {
    const room = createTestActor();
    joinPlayers(room);
    expect(pub(room).seats.map((s) => s.name)).toEqual(["ann", "ben", "cat", "dan"]);
    expect(view(room, ANN).player?.isHost).toBe(true);
    expect(view(room, BEN).player?.isHost).toBe(false);
    expect(pub(room).hostSeat).toBe(0);
  });

  it("joining twice keeps one seat", () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN", name: "Ann" });
    send(room, ANN, { type: "JOIN", name: "Annie" });
    expect(pub(room).seats).toHaveLength(1);
  });

  it("names a blank or repeated name", () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN" });
    send(room, BEN, { type: "JOIN", name: "Sam" });
    send(room, CAT, { type: "JOIN", name: "Sam" });
    expect(pub(room).seats.map((s) => s.name)).toEqual(["Player 1", "Sam", "Sam 2"]);
  });

  it("holds at most 7 players", () => {
    const room = createTestActor();
    for (let i = 0; i < 9; i++) send(room, `p-${i}`, { type: "JOIN", name: `P${i}` });
    expect(pub(room).seats).toHaveLength(7);
  });

  it("the TV can't take a seat", () => {
    const room = createTestActor();
    send(room, TV, { type: "JOIN", name: "TV" });
    expect(pub(room).seats).toHaveLength(0);
  });

  it("needs 2 players to start, and only the host starts", () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN", name: "Ann" });
    expect(pub(room).canStart).toBe(false);
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("lobby");
    send(room, BEN, { type: "JOIN", name: "Ben" });
    send(room, BEN, { type: "START" });
    expect(value(room)).toBe("lobby");
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("cutting");
  });

  it("the host reorders seats to match the couch, and can remove one", () => {
    const room = createTestActor();
    joinPlayers(room);
    send(room, ANN, { type: "MOVE_SEAT", seat: 3, to: 1 });
    expect(pub(room).seats.map((s) => s.name)).toEqual(["ann", "dan", "ben", "cat"]);
    send(room, BEN, { type: "MOVE_SEAT", seat: 0, to: 3 });
    expect(pub(room).seats.map((s) => s.name)).toEqual(["ann", "dan", "ben", "cat"]);
    send(room, ANN, { type: "REMOVE_SEAT", seat: 2 });
    expect(pub(room).seats.map((s) => s.name)).toEqual(["ann", "dan", "cat"]);
    expect(view(room, BEN).player).toBeUndefined();
  });
});

describe("OGS identities", () => {
  it("a verified OGS profile names the seat (and its avatar), whatever the phone sent", () => {
    const room = createTestActor();
    claim(room, ANN, { profileId: "p1", name: "Grandma Jo", avatar: "https://x/a.png", couch: null });
    send(room, ANN, { type: "JOIN", name: "Hacker" });
    expect(pub(room).seats[0]).toMatchObject({ name: "Grandma Jo", avatar: "https://x/a.png" });
  });

  it("only the OGS service may claim", () => {
    const room = createTestActor();
    snap(room); // the TV can't send OGS_CLAIM: it isn't a client event at all (schema), nothing to test there
    send(room, ANN, { type: "JOIN", name: "Ann" });
    expect(pub(room).seats[0]?.name).toBe("Ann");
  });
});

describe("several couches (OGS multiCouch)", () => {
  const couchA = { sid: "couch-a", label: "Jonathan" };
  const couchB = { sid: "couch-b", label: "Sam" };

  function twoCouches(): TestRoom {
    const room = createTestActor();
    claim(room, TV, { profileId: "h1", name: "Jonathan", avatar: "", couch: couchA });
    claim(room, ANN, { profileId: "a", name: "Ann", avatar: "", couch: couchA });
    claim(room, BEN, { profileId: "b", name: "Ben", avatar: "", couch: couchA });
    claim(room, CAT, { profileId: "c", name: "Cat", avatar: "", couch: couchB });
    claim(room, DAN, { profileId: "d", name: "Dan", avatar: "", couch: couchB });
    joinPlayers(room);
    return room;
  }

  it("one household: no household labels", () => {
    const room = createTestActor();
    claim(room, ANN, { profileId: "a", name: "Ann", avatar: "", couch: couchA });
    claim(room, BEN, { profileId: "b", name: "Ben", avatar: "", couch: couchA });
    joinPlayers(room, 2);
    expect(pub(room).households).toEqual([]);
    expect(pub(room).seats.map((s) => s.couch)).toEqual([null, null]);
  });

  it("two players on each of two couches: every seat shows its household", () => {
    const room = twoCouches();
    expect(pub(room).households).toEqual([
      { sid: "couch-a", label: "Jonathan", away: false, seats: [0, 1] },
      { sid: "couch-b", label: "Sam", away: false, seats: [2, 3] },
    ]);
    expect(pub(room).seats.map((s) => s.couch)).toEqual(["Jonathan", "Jonathan", "Sam", "Sam"]);
  });

  it("a plain-browser phone sits with the room's first TV's household", () => {
    const room = createTestActor();
    claim(room, TV, { profileId: "h1", name: "Jonathan", avatar: "", couch: couchA });
    claim(room, CAT, { profileId: "c", name: "Cat", avatar: "", couch: couchB });
    send(room, ANN, { type: "JOIN", name: "Ann" });
    send(room, CAT, { type: "JOIN" });
    expect(pub(room).seats.map((s) => s.couch)).toEqual(["Jonathan", "Sam"]);
  });

  it("a household's TV parked by OGS shows it away; its players keep playing from their phones", () => {
    const room = twoCouches();
    const tvB = "tv-b";
    claim(room, tvB, { profileId: "h2", name: "Sam", avatar: "", couch: couchB });
    send(room, tvB, { type: "AWAY", away: true });
    expect(pub(room).households[1]?.away).toBe(true);
    send(room, ANN, { type: "START" });
    cut(room);
    expect(value(room)).toBe("playing.window");
    send(room, tvB, { type: "AWAY", away: false });
    expect(pub(room).households[1]?.away).toBe(false);
  });

  it("plays a whole round across two couches", () => {
    const room = twoCouches();
    send(room, ANN, { type: "START" });
    cut(room);
    playOutRound(room);
    expect(value(room)).toBe("roundOver");
  });
});

describe("the cut and the deal", () => {
  it("the player right of the dealer cuts; round 1's dealer is seat 0, so the last seat cuts", () => {
    const room = createTestActor();
    joinPlayers(room);
    send(room, ANN, { type: "START" });
    expect(pub(room).dealer).toBe(0);
    expect(pub(room).cutter).toBe(3);
    expect(view(room, DAN).player?.mustCut).toBe(true);
    expect(view(room, ANN).player?.mustCut).toBe(false);
  });

  it("only the cutter cuts", () => {
    const room = createTestActor();
    joinPlayers(room);
    send(room, ANN, { type: "START" });
    send(room, ANN, { type: "CUT", at: 0.3 });
    expect(value(room)).toBe("cutting");
    send(room, DAN, { type: "CUT", at: 0.3 });
    expect(value(room)).toBe("playing.window");
    expect(pub(room).cut?.seat).toBe(3);
  });

  it("cuts by itself if the cutter doesn't", () => {
    const room = createTestActor();
    joinPlayers(room);
    send(room, ANN, { type: "START" });
    room.clock.increment(CUT_TIMEOUT_MS);
    expect(value(room)).toBe("playing.window");
  });

  it("each phone sees only its own hand; the TV and the public see counts", () => {
    const room = startedRoom();
    for (const id of [ANN, BEN, CAT, DAN]) expect(view(room, id).player?.hand.length).toBeGreaterThanOrEqual(10);
    expect(view(room, TV).player).toBeUndefined();
    const json = JSON.stringify(pub(room));
    for (const card of view(room, ANN).player?.hand ?? []) expect(json).not.toContain(`"${card.id}"`);
    expect(pub(room).seats.map((s) => s.cards).every((n) => n >= 10)).toBe(true);
    expect(pub(room).round).toBe(1);
    expect(pub(room).requirement).toEqual({ runs: 1, sets: 1, text: "1 run and 1 set", name: "One run, one set" });
    expect(pub(room).turn).toBe(1);
  });
});

describe("a turn", () => {
  it("opens a buy window on the first discard; the next player can take it at once", () => {
    const room = startedRoom();
    expect(value(room)).toBe("playing.window");
    expect(pub(room).window?.requests).toEqual([]);
    send(room, BEN, { type: "DRAW", from: "discard" });
    expect(value(room)).toBe("playing.acting");
    expect(pub(room).turnPhase).toBe("play");
    expect(view(room, BEN).player?.hand).toHaveLength(12);
  });

  it("drawing from the deck waits for the window to close", () => {
    const room = startedRoom();
    send(room, BEN, { type: "DRAW", from: "deck" });
    expect(view(room, BEN).player?.hand).toHaveLength(11);
    expect(view(room, BEN).player?.oops?.line).toMatch(/buy window/);
    room.clock.increment(BUY_WINDOW_MS);
    expect(value(room)).toBe("playing.acting");
    send(room, BEN, { type: "DRAW", from: "deck" });
    expect(view(room, BEN).player?.hand).toHaveLength(12);
  });

  it("a buy: requested in the window, offered to the next player, who lets it go", () => {
    const room = startedRoom();
    expect(view(room, CAT).player?.canBuy).toBe(true);
    expect(view(room, BEN).player?.canBuy).toBe(false);
    send(room, CAT, { type: "BUY" });
    expect(pub(room).window?.requests).toEqual([seatIndex(room, CAT)]);
    expect(view(room, CAT).player?.buyRequested).toBe(true);
    room.clock.increment(BUY_WINDOW_MS);
    expect(pub(room).turnPhase).toBe("offer");
    expect(pub(room).offer).toEqual({ requests: [2], buyer: 2 });
    send(room, BEN, { type: "ANSWER", answer: "let-go" });
    expect(view(room, CAT).player?.hand).toHaveLength(13);
    expect(pub(room).seats[2]?.buys).toBe(1);
    expect(view(room, BEN).player?.hand).toHaveLength(12);
    expect(pub(room).log.at(-1)?.text).toMatch(/cat bought/);
  });

  it("a refused move tells only that phone why", () => {
    const room = startedRoom();
    send(room, CAT, { type: "DRAW", from: "discard" });
    expect(view(room, CAT).player?.oops?.line).toMatch(/not your turn/);
    expect(view(room, BEN).player?.oops).toBeNull();
  });

  it("a discard passes the turn and opens the next window", () => {
    const room = startedRoom();
    send(room, BEN, { type: "DRAW", from: "discard" });
    const card = view(room, BEN).player?.hand[0]?.id ?? "";
    send(room, BEN, { type: "DISCARD", cardId: card });
    expect(pub(room).discardTop?.id).toBe(card);
    expect(pub(room).turn).toBe(2);
    expect(value(room)).toBe("playing.window");
    expect(view(room, CAT).player?.myTurn).toBe(true);
  });

  it("the TV log tells the table what happened", () => {
    const room = startedRoom();
    send(room, BEN, { type: "DRAW", from: "discard" });
    expect(pub(room).log.at(-1)?.text).toMatch(/ben took the/);
  });
});

describe("rounds and the game", () => {
  it("a round ends when someone goes out; scores are shown; the host deals the next round", () => {
    const room = startedRoom();
    playOutRound(room);
    expect(value(room)).toBe("roundOver");
    const winner = pub(room).roundWinner;
    expect(winner).not.toBeNull();
    expect(pub(room).scores).toHaveLength(1);
    expect(pub(room).scores[0]?.[winner ?? 0]).toBe(0);
    send(room, BEN, { type: "NEXT_ROUND" });
    expect(value(room)).toBe("roundOver");
    send(room, ANN, { type: "NEXT_ROUND" });
    expect(value(room)).toBe("cutting");
    expect(pub(room).round).toBe(2);
    expect(pub(room).dealer).toBe(1);
    expect(pub(room).cutter).toBe(0);
  });

  it("plays all 7 rounds to a winner, then the host can start a new game", () => {
    const room = startedRoom();
    for (let r = 1; r <= 7; r++) {
      playOutRound(room);
      if (r < 7) {
        send(room, ANN, { type: "NEXT_ROUND" });
        cut(room);
      }
    }
    expect(value(room)).toBe("gameOver");
    expect(pub(room).scores).toHaveLength(7);
    expect(pub(room).winners.length).toBeGreaterThanOrEqual(1);
    const best = Math.min(...pub(room).totals);
    for (const w of pub(room).winners) expect(pub(room).totals[w]).toBe(best);
    send(room, ANN, { type: "NEW_GAME" });
    expect(value(room)).toBe("cutting");
    expect(pub(room).round).toBe(1);
    expect(pub(room).scores).toEqual([]);
    expect(pub(room).gameNumber).toBe(2);
  });

  it("2 players can play", () => {
    const room = startedRoom(2);
    playOutRound(room);
    expect(value(room)).toBe("roundOver");
  });

  it("late phones can't join a game in progress", () => {
    const room = startedRoom();
    send(room, "eve-1", { type: "JOIN", name: "Eve" });
    expect(pub(room).seats).toHaveLength(4);
    expect(turnId(room)).toBe(BEN);
    expect(round(room).seats).toHaveLength(4);
  });
});
