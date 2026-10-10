import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_THINK_MS, BUY_WINDOW_MS, CUT_TIMEOUT_MS } from "./room.machine";
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
  botStep,
  playOutRound,
  restartRoom,
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

  it("needs 3 players to start, and only the host starts", () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN", name: "Ann" });
    send(room, BEN, { type: "JOIN", name: "Ben" });
    expect(pub(room).canStart).toBe(false);
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("lobby");
    send(room, CAT, { type: "JOIN", name: "Cat" });
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

  it("a claim that arrives after the phone took its seat renames that seat (still unique) and sets its avatar", () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN", name: "Typed" });
    send(room, BEN, { type: "JOIN", name: "Grandma Jo" });
    claim(room, ANN, { profileId: "p1", name: "Grandma Jo", avatar: "https://x/a.png", couch: null });
    expect(pub(room).seats[0]).toMatchObject({ name: "Grandma Jo 2", avatar: "https://x/a.png" });
    expect(pub(room).seats[1]?.name).toBe("Grandma Jo");
  });

  it("a late claim with no avatar clears the seat's picture; a claim for nobody seated changes no seat", () => {
    const room = createTestActor();
    claim(room, ANN, { profileId: "p1", name: "Ann", avatar: "https://x/a.png", couch: null });
    send(room, ANN, { type: "JOIN" });
    claim(room, ANN, { profileId: "p1", name: "Ann", avatar: "", couch: null });
    claim(room, CAT, { profileId: "p3", name: "Cat", avatar: "https://x/c.png", couch: null });
    expect(pub(room).seats).toEqual([expect.objectContaining({ name: "Ann", avatar: null })]);
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

  it("a known household takes the label of its latest claim", () => {
    const room = twoCouches();
    claim(room, "tv-b", { profileId: "h2", name: "Sam", avatar: "", couch: { sid: "couch-b", label: "Sam's place" } });
    expect(pub(room).households[1]?.label).toBe("Sam's place");
    expect(pub(room).seats.map((s) => s.couch)).toEqual(["Jonathan", "Jonathan", "Sam's place", "Sam's place"]);
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

  it("3 players can play", () => {
    const room = startedRoom(3);
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

describe("a room that restarts or sleeps keeps going (Durable Object eviction loses timers)", () => {
  afterEach(() => vi.restoreAllMocks());
  const later = (ms: number) => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + ms);
  };

  it("restarted after the buy window's time is up: closes it at once", () => {
    const room = startedRoom();
    later(BUY_WINDOW_MS + 100);
    const back = restartRoom(room);
    expect(value(back)).toBe("playing.acting");
    expect(pub(back).window).toBeNull();
  });

  it("restarted during the window: keeps its deadline and closes when the time left runs out", () => {
    const room = startedRoom();
    const endsAt = pub(room).window?.endsAt;
    const back = restartRoom(room);
    expect(value(back)).toBe("playing.window");
    expect(pub(back).window?.endsAt).toBe(endsAt);
    back.clock.increment(BUY_WINDOW_MS);
    expect(value(back)).toBe("playing.acting");
  });

  it("asleep with no timer: a phone's TICK after the deadline closes the window; before it, nothing", () => {
    const room = startedRoom();
    const asleep = restartRoom(room, { resume: false });
    send(asleep, CAT, { type: "TICK" });
    expect(value(asleep)).toBe("playing.window");
    later(BUY_WINDOW_MS + 100);
    send(asleep, CAT, { type: "TICK" });
    expect(value(asleep)).toBe("playing.acting");
  });

  it("the cut: a restart re-arms its timeout, and a TICK after it cuts for the cutter", () => {
    const room = createTestActor();
    joinPlayers(room);
    send(room, ANN, { type: "START" });
    expect(pub(room).cutEndsAt).toBeGreaterThan(Date.now());
    const back = restartRoom(room);
    expect(value(back)).toBe("cutting");
    back.clock.increment(CUT_TIMEOUT_MS);
    expect(value(back)).toBe("playing.window");

    const room2 = createTestActor();
    joinPlayers(room2);
    send(room2, ANN, { type: "START" });
    const asleep = restartRoom(room2, { resume: false });
    send(asleep, BEN, { type: "TICK" });
    expect(value(asleep)).toBe("cutting");
    later(CUT_TIMEOUT_MS + 100);
    send(asleep, BEN, { type: "TICK" });
    expect(value(asleep)).toBe("playing.window");
  });
});

describe("AI players (computer seats, played by the room)", () => {
  afterEach(() => vi.restoreAllMocks());
  const host = () => {
    const room = createTestActor();
    send(room, ANN, { type: "JOIN", name: "Ann" });
    return room;
  };
  const seats = (room: TestRoom) => pub(room).seats.map((s) => `${s.name}${s.ai ? "*" : ""}`);
  /** Lets the room's AI players think and act until a person is needed (or the round ends). */
  const letAiPlay = (room: TestRoom, steps = 400) => {
    for (let i = 0; i < steps; i++) {
      const r = snap(room).context.server.round;
      const turn = r?.seats[r.turn]?.id ?? "";
      if (value(room) === "roundOver" || (r && !turn.startsWith("ai:") && r.phase.kind !== "draw")) return;
      room.clock.increment(500);
    }
  };

  it("the host adds them in the lobby: supper-club regulars, marked as AI, up to 7 seats", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "ADD_AI" });
    expect(seats(room)).toEqual(["Ann", "Vera*", "Sal*"]);
    for (let i = 0; i < 6; i++) send(room, ANN, { type: "ADD_AI" });
    expect(pub(room).seats).toHaveLength(7);
    expect(seats(room).slice(1)).toEqual(["Vera*", "Sal*", "Dot*", "Monty*", "Lou*", "Bea*"]);
  });

  it("only the host adds them, only in the lobby; the host can take one away", () => {
    const room = host();
    send(room, BEN, { type: "JOIN", name: "Ben" });
    send(room, BEN, { type: "ADD_AI" });
    expect(pub(room).seats).toHaveLength(2);
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "REMOVE_SEAT", seat: 2 });
    expect(seats(room)).toEqual(["Ann", "Ben"]);
  });

  it("a game needs 3 seats, people or AI: one person and two AI players can play", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    expect(pub(room).canStart).toBe(false);
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("lobby");
    send(room, ANN, { type: "ADD_AI" });
    expect(pub(room).canStart).toBe(true);
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("cutting");
  });

  it("the host is the first person, never an AI, wherever the seats are moved", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "MOVE_SEAT", seat: 1, to: 0 });
    expect(seats(room)).toEqual(["Vera*", "Ann"]);
    expect(pub(room).hostSeat).toBe(1);
    expect(view(room, ANN).player?.isHost).toBe(true);
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    expect(value(room)).toBe("cutting");
  });

  it("an AI cutter cuts by itself after a moment", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    expect(pub(room).seats[pub(room).cutter ?? 0]?.ai).toBe(true);
    room.clock.increment(AI_THINK_MS);
    expect(value(room)).toBe("playing.window");
  });

  it("AI players take their turns with a pause, and the turn comes back to the person", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    room.clock.increment(AI_THINK_MS);
    // Round 1: the dealer is Ann (seat 0), so Vera plays first.
    expect(turnId(room)).toBe("ai:1");
    const logBefore = pub(room).log.length;
    letAiPlay(room);
    expect(pub(room).log.length).toBeGreaterThan(logBefore);
    expect(turnId(room)).toBe(ANN);
    expect(pub(room).aiActAt).toBeNull();
  });

  it("a person and two AI players play a whole round to its end", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    room.clock.increment(AI_THINK_MS);
    for (let i = 0; i < 4000 && value(room).startsWith("playing"); i++) {
      if (turnId(room) === ANN || round(room).phase.kind === "draw") botStep(room);
      else room.clock.increment(500);
    }
    expect(value(room)).toBe("roundOver");
    expect(pub(room).scores).toHaveLength(1);
  });

  it("an AI that wants the discard asks to buy it in the window", () => {
    let bought = false;
    for (let game = 0; game < 12 && !bought; game++) {
      const room = createTestActor();
      joinPlayers(room, 3);
      send(room, ANN, { type: "ADD_AI" });
      send(room, ANN, { type: "START" });
      cut(room);
      for (let i = 0; i < 3000 && value(room).startsWith("playing") && !bought; i++) {
        bought = pub(room).log.some((e) => e.kind === "buy" && e.text.startsWith("Vera"));
        if (turnId(room).startsWith("ai:")) room.clock.increment(500);
        else botStep(room);
      }
    }
    expect(bought).toBe(true);
  });

  it("a room restarted while an AI is thinking carries on (RESUME), and a TICK wakes a sleeping one", () => {
    const room = host();
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    room.clock.increment(AI_THINK_MS);
    room.clock.increment(BUY_WINDOW_MS);
    expect(turnId(room)).toBe("ai:1");
    const back = restartRoom(room);
    const before = pub(back).log.length;
    back.clock.increment(AI_THINK_MS);
    expect(pub(back).log.length).toBeGreaterThan(before);

    const asleep = restartRoom(back, { resume: false });
    const at = pub(asleep).aiActAt;
    if (at !== null) {
      const n = pub(asleep).log.length;
      vi.spyOn(Date, "now").mockReturnValue(at + 1000);
      send(asleep, ANN, { type: "TICK" });
      expect(pub(asleep).log.length).toBeGreaterThan(n);
    }
  });

  it("seven seats with five AI players play a whole game", () => {
    const room = createTestActor();
    joinPlayers(room, 2);
    for (let i = 0; i < 5; i++) send(room, ANN, { type: "ADD_AI" });
    send(room, ANN, { type: "START" });
    for (let r = 1; r <= 7; r++) {
      if (pub(room).cutter !== null && !pub(room).seats[pub(room).cutter ?? 0]?.ai) cut(room);
      room.clock.increment(AI_THINK_MS);
      for (let i = 0; i < 20_000 && value(room).startsWith("playing"); i++) {
        if (turnId(room).startsWith("ai:")) room.clock.increment(500);
        else botStep(room);
      }
      if (r < 7) send(room, ANN, { type: "NEXT_ROUND" });
    }
    expect(value(room)).toBe("gameOver");
    expect(pub(room).winners.length).toBeGreaterThanOrEqual(1);
  });
});
