import { describe, expect, it } from "vitest";
import { mulberry32, type Card, type Suit } from "./cards";
import {
  REQUIREMENTS,
  answerOffer,
  closeBuyWindow,
  deal,
  discard,
  draw,
  goDown,
  playOn,
  requestBuy,
  scoreRound,
  type Result,
  type RoundState,
} from "./round";

let n = 0;
const c = (rank: number, suit: Suit = "H"): Card => ({ id: `c${n++}`, kind: "card", suit, rank });
const J = (): Card => ({ id: `j${n++}`, kind: "joker" });
const filler = (count: number) => Array.from({ length: count }, (_, i) => c((i % 13) + 1, "C"));

const ok = (r: Result): RoundState => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`);
  return r.state;
};
const reason = (r: Result) => (r.ok ? "ok" : r.reason);
const ids = (cards: readonly Card[]) => cards.map((x) => x.id);

/** A round mid-play: seat 0 (a) to act, given hands, deck and discard (last = top). */
function rig(over: Partial<RoundState> & { hands: Card[][] }): RoundState {
  const { hands, ...rest } = over;
  return {
    round: 1,
    dealer: hands.length - 1,
    turn: 0,
    seats: hands.map((hand, i) => ({ id: "abcdefg"[i] ?? "?", hand, down: false, buys: 0 })),
    deck: filler(20),
    discard: [c(13, "D")],
    melds: [],
    phase: { kind: "draw", window: "closed", requests: [] },
    lastDiscarder: null,
    nextMeldId: 1,
    seed: 1,
    cut: null,
    ...rest,
  };
}
const seat = (s: RoundState, id: string) => {
  const found = s.seats.find((x) => x.id === id);
  if (!found) throw new Error(`no seat ${id}`);
  return found;
};

describe("REQUIREMENTS", () => {
  it("follows RULES.md: 1R1S, 2S, 2R, 2S1R, 2R1S, 3S, 3R", () => {
    expect(REQUIREMENTS).toEqual([
      { runs: 1, sets: 1 },
      { runs: 0, sets: 2 },
      { runs: 2, sets: 0 },
      { runs: 1, sets: 2 },
      { runs: 2, sets: 1 },
      { runs: 0, sets: 3 },
      { runs: 3, sets: 0 },
    ]);
  });
});

describe("deal", () => {
  const players = ["a", "b", "c", "d"];
  const fresh = (cutAt: number, seed = 3) =>
    deal({ seatIds: players, round: 1, dealer: 0, rng: mulberry32(seed), cutAt });

  it("deals 11 to everyone, flips one discard, keeps the rest as the deck", () => {
    const s = fresh(0);
    const total = s.seats.reduce((sum, x) => sum + x.hand.length, 0) + s.deck.length + s.discard.length;
    expect(total).toBe(162);
    expect(s.discard).toHaveLength(1);
    for (const x of s.seats) expect(x.hand.length).toBeGreaterThanOrEqual(10);
  });

  it("the player left of the dealer goes first, with a buy window open on the first discard", () => {
    const s = fresh(0);
    expect(s.turn).toBe(1);
    expect(s.phase).toEqual({ kind: "draw", window: "open", requests: [] });
  });

  it("the cutter (right of the dealer) keeps a joker found at the cut and is dealt 10", () => {
    // Find a seed and cut position that land on a joker.
    let found: RoundState | null = null;
    for (let seed = 1; seed < 50 && !found; seed++) {
      for (let at = 0; at < 162 && !found; at++) {
        const s = fresh(at, seed);
        if (s.cut?.kept) found = s;
      }
    }
    if (!found) throw new Error("no joker cut found");
    const cutter = seat(found, "d"); // dealer 0 → right of dealer is seat 3
    expect(found.cut?.seat).toBe("d");
    expect(cutter.hand).toHaveLength(11);
    expect(cutter.hand.some((x) => x.id === found.cut?.card.id)).toBe(true);
    for (const x of found.seats.filter((y) => y.id !== "d")) expect(x.hand).toHaveLength(11);
  });

  it("a non-joker cut goes back and changes nothing", () => {
    for (let at = 0; at < 20; at++) {
      const s = fresh(at);
      if (s.cut && !s.cut.kept) {
        for (const x of s.seats) expect(x.hand).toHaveLength(11);
        return;
      }
    }
    throw new Error("every cut was a joker?");
  });

  it("is reproducible", () => {
    expect(ids(fresh(5).seats[0]?.hand ?? [])).toEqual(ids(fresh(5).seats[0]?.hand ?? []));
  });

  it("uses the round's requirement and rotates nothing itself", () => {
    const s = deal({ seatIds: players, round: 7, dealer: 2, rng: mulberry32(1), cutAt: 0 });
    expect(s.round).toBe(7);
    expect(s.dealer).toBe(2);
    expect(s.turn).toBe(3);
    expect(s.cut?.seat).toBe("b");
  });
});

describe("draw", () => {
  it("takes the top of the deck once the buy window is closed", () => {
    const s0 = rig({ hands: [filler(11), filler(11)] });
    const top = s0.deck[0];
    const s = ok(draw(s0, "a", "deck"));
    expect(seat(s, "a").hand.at(-1)).toBe(top);
    expect(s.deck).toHaveLength(19);
    expect(s.phase).toEqual({ kind: "play" });
  });

  it("can't take from the deck while the buy window is open", () => {
    const s0 = rig({ hands: [filler(11), filler(11)], phase: { kind: "draw", window: "open", requests: [] } });
    expect(reason(draw(s0, "a", "deck"))).toMatch(/buy window/);
  });

  it("can take the discard while the window is open, which cancels buys", () => {
    const s0 = rig({ hands: [filler(11), filler(11)], phase: { kind: "draw", window: "open", requests: ["b"] } });
    const top = s0.discard.at(-1);
    const s = ok(draw(s0, "a", "discard"));
    expect(seat(s, "a").hand.at(-1)).toBe(top);
    expect(s.discard).toHaveLength(0);
    expect(s.phase).toEqual({ kind: "play" });
  });

  it("only the player whose turn it is draws, once", () => {
    const s0 = rig({ hands: [filler(11), filler(11)] });
    expect(reason(draw(s0, "b", "deck"))).toMatch(/not your turn/);
    const s = ok(draw(s0, "a", "deck"));
    expect(reason(draw(s, "a", "deck"))).toMatch(/already drew/);
  });

  it("can't take from an empty discard pile", () => {
    const s0 = rig({ hands: [filler(11), filler(11)], discard: [] });
    expect(reason(draw(s0, "a", "discard"))).toMatch(/empty/);
  });

  it("reshuffles the discards (keeping the top) when the deck runs out", () => {
    const pile = [c(2), c(3), c(4), c(5)];
    const s0 = rig({ hands: [filler(11), filler(11)], deck: [], discard: pile });
    const s = ok(draw(s0, "a", "deck"));
    expect(s.discard.map((x) => x.id)).toEqual([pile[3]?.id]);
    expect(s.deck).toHaveLength(2);
    expect(seat(s, "a").hand).toHaveLength(12);
    expect(s.seed).not.toBe(s0.seed);
  });
});

describe("buying", () => {
  const open = (requests: string[] = []) =>
    rig({
      hands: [filler(11), filler(11), filler(11), filler(11)],
      phase: { kind: "draw", window: "open", requests },
      lastDiscarder: "d",
    });

  it("others may request during the window", () => {
    const s = ok(requestBuy(open(), "c"));
    expect(s.phase).toEqual({ kind: "draw", window: "open", requests: ["c"] });
  });

  it("the next player can't buy (they just take it), nor the discarder, nor twice", () => {
    expect(reason(requestBuy(open(), "a"))).toMatch(/your draw/);
    expect(reason(requestBuy(open(), "d"))).toMatch(/your own discard/);
    expect(reason(requestBuy(open(["c"]), "c"))).toMatch(/already/);
  });

  it("only while the window is open", () => {
    const s0 = rig({ hands: [filler(11), filler(11), filler(11)] });
    expect(reason(requestBuy(s0, "b"))).toMatch(/window/);
  });

  it("at most 3 buys a round", () => {
    const s0 = open();
    const maxed = { ...s0, seats: s0.seats.map((x) => (x.id === "b" ? { ...x, buys: 3 } : x)) };
    expect(reason(requestBuy(maxed, "b"))).toMatch(/3 buys/);
  });

  it("closing the window with no requests lets the next player draw normally", () => {
    const s = ok(closeBuyWindow(open()));
    expect(s.phase).toEqual({ kind: "draw", window: "closed", requests: [] });
  });

  it("closing the window with requests offers the card to the next player", () => {
    const s = ok(closeBuyWindow(open(["c", "b"])));
    expect(s.phase).toEqual({ kind: "offer", requests: ["c", "b"] });
  });

  it("the next player may take it", () => {
    const s0 = ok(closeBuyWindow(open(["c"])));
    const top = s0.discard.at(-1);
    const s = ok(answerOffer(s0, "a", "take"));
    expect(seat(s, "a").hand.at(-1)).toBe(top);
    expect(seat(s, "c").hand).toHaveLength(11);
    expect(s.phase).toEqual({ kind: "play" });
  });

  it("or let it go: the requester closest after them buys it plus the top deck card, then they draw from the deck", () => {
    const s0 = ok(closeBuyWindow(open(["c", "b"])));
    const top = s0.discard.at(-1);
    const [deck0, deck1] = s0.deck;
    const s = ok(answerOffer(s0, "a", "let-go"));
    const b = seat(s, "b");
    expect(ids(b.hand.slice(-2))).toEqual([top?.id, deck0?.id]);
    expect(b.buys).toBe(1);
    expect(seat(s, "c").hand).toHaveLength(11);
    expect(seat(s, "a").hand.at(-1)).toBe(deck1);
    expect(s.phase).toEqual({ kind: "play" });
    expect(s.turn).toBe(0);
  });

  it("only the next player answers the offer", () => {
    const s0 = ok(closeBuyWindow(open(["c"])));
    expect(reason(answerOffer(s0, "c", "take"))).toMatch(/not your turn/);
    expect(reason(answerOffer(open(), "a", "take"))).toMatch(/no offer/);
  });
});

describe("goDown (round 1: one run, one set)", () => {
  const run = () => [c(4), c(5), c(6), c(7)];
  const set = () => [c(9, "S"), c(9, "D"), c(9, "C")];
  const playing = (hand: Card[]) => rig({ hands: [hand, filler(11)], phase: { kind: "play" } });

  it("lays out the melds and marks the player down", () => {
    const r = run();
    const st = set();
    const s0 = playing([...r, ...st, c(2, "S"), c(3, "S"), c(10, "S"), c(12, "S"), c(13, "S")]);
    const s = ok(
      goDown(s0, "a", [
        { kind: "run", cardIds: ids(r) },
        { kind: "set", cardIds: ids(st) },
      ]),
    );
    expect(seat(s, "a").down).toBe(true);
    expect(seat(s, "a").hand).toHaveLength(5);
    expect(s.melds.map((m) => [m.owner, m.meld.kind])).toEqual([
      ["a", "run"],
      ["a", "set"],
    ]);
  });

  it("needs exactly the required melds", () => {
    const r = run();
    const st = set();
    const s0 = playing([...r, ...st, ...filler(5)]);
    expect(reason(goDown(s0, "a", [{ kind: "run", cardIds: ids(r) }]))).toMatch(/1 run and 1 set/);
    const st2 = [c(11), c(11, "S"), c(11, "D")];
    const s1 = playing([...r, ...st, ...st2, c(2, "S"), c(3, "S")]);
    expect(
      reason(
        goDown(s1, "a", [
          { kind: "run", cardIds: ids(r) },
          { kind: "set", cardIds: ids(st) },
          { kind: "set", cardIds: ids(st2) },
        ]),
      ),
    ).toMatch(/1 run and 1 set/);
  });

  it("rejects an invalid meld with its reason", () => {
    const bad = [c(4), c(5), c(7), c(8)];
    const st = set();
    const s0 = playing([...bad, ...st, ...filler(5)]);
    expect(
      reason(
        goDown(s0, "a", [
          { kind: "run", cardIds: ids(bad) },
          { kind: "set", cardIds: ids(st) },
        ]),
      ),
    ).toMatch(/in order/);
  });

  it("only with cards from your hand, each used once", () => {
    const r = run();
    const st = set();
    const s0 = playing([...r, ...st, ...filler(5)]);
    expect(
      reason(
        goDown(s0, "a", [
          { kind: "run", cardIds: ids(r) },
          { kind: "set", cardIds: [...ids(st).slice(0, 2), "nope"] },
        ]),
      ),
    ).toMatch(/not in your hand/);
    expect(
      reason(
        goDown(s0, "a", [
          { kind: "run", cardIds: ids(r) },
          { kind: "set", cardIds: [ids(st)[0] ?? "", ids(st)[0] ?? "", ids(st)[1] ?? ""] },
        ]),
      ),
    ).toMatch(/twice/);
  });

  it("only after drawing, on your turn, once a round", () => {
    const r = run();
    const st = set();
    const melds = [
      { kind: "run" as const, cardIds: ids(r) },
      { kind: "set" as const, cardIds: ids(st) },
    ];
    const hand = [...r, ...st, ...filler(5)];
    expect(reason(goDown(rig({ hands: [hand, filler(11)] }), "a", melds))).toMatch(/draw first/);
    expect(reason(goDown(playing(hand), "b", melds))).toMatch(/not your turn/);
    const s0 = playing(hand);
    const downed = { ...s0, seats: s0.seats.map((x) => (x.id === "a" ? { ...x, down: true } : x)) };
    expect(reason(goDown(downed, "a", melds))).toMatch(/already down/);
  });

  it("going down with every card goes out", () => {
    const r = [c(4), c(5), c(6), c(7), c(8)];
    const st = [c(9, "S"), c(9, "D"), c(9, "C"), c(9, "H")];
    const s = ok(
      goDown(playing([...r, ...st]), "a", [
        { kind: "run", cardIds: ids(r) },
        { kind: "set", cardIds: ids(st) },
      ]),
    );
    expect(s.phase).toEqual({ kind: "out", winner: "a" });
  });

  it("can't leave a single card that has nowhere to go", () => {
    const r = run();
    const st = set();
    const s0 = playing([...r, ...st, c(2, "S")]);
    expect(
      reason(
        goDown(s0, "a", [
          { kind: "run", cardIds: ids(r) },
          { kind: "set", cardIds: ids(st) },
        ]),
      ),
    ).toMatch(/last card/);
  });

  it("may leave a single card that can still be played", () => {
    const r = run();
    const st = set();
    const eight = c(8);
    const s0 = playing([...r, ...st, eight]);
    const s = ok(
      goDown(s0, "a", [
        { kind: "run", cardIds: ids(r) },
        { kind: "set", cardIds: ids(st) },
      ]),
    );
    const meldId = s.melds[0]?.id ?? "";
    const out = ok(playOn(s, "a", eight.id, meldId, { at: "high" }));
    expect(out.phase).toEqual({ kind: "out", winner: "a" });
  });
});

describe("playOn", () => {
  const table = () => {
    const runCards = [c(5), J(), c(7), c(8)];
    const setCards = [c(10, "S"), c(10, "D"), c(10, "C")];
    return {
      runCards,
      state: (hand: Card[], down = true) =>
        rig({
          hands: [hand, filler(11)],
          phase: { kind: "play" },
          seats: [
            { id: "a", hand, down, buys: 0 },
            { id: "b", hand: filler(11), down: true, buys: 0 },
          ],
          melds: [
            { id: "m1", owner: "b", meld: { kind: "run", suit: "H", low: 5, cards: runCards } },
            { id: "m2", owner: "b", meld: { kind: "set", rank: 10, cards: setCards } },
          ],
        }),
    };
  };

  it("adds to anyone's run or set once you're down", () => {
    const t = table();
    const nine = c(9);
    const ten = c(10, "H");
    const s = ok(playOn(t.state([nine, ten, c(2, "S"), c(3, "S")]), "a", nine.id, "m1", { at: "high" }));
    expect(s.melds[0]?.meld.cards).toHaveLength(5);
    const s2 = ok(playOn(s, "a", ten.id, "m2"));
    expect(s2.melds[1]?.meld.cards).toHaveLength(4);
    expect(seat(s2, "a").hand).toHaveLength(2);
  });

  it("applies the slide rule", () => {
    const t = table();
    const six = c(6);
    const s = ok(playOn(t.state([six, c(2, "S"), c(3, "S")]), "a", six.id, "m1", { replace: 1, jokerTo: "low" }));
    const meld = s.melds[0]?.meld;
    expect(meld?.kind === "run" && meld.low).toBe(4);
    expect(meld?.cards[0]?.kind).toBe("joker");
  });

  it("not before going down", () => {
    const t = table();
    const nine = c(9);
    expect(reason(playOn(t.state([nine, c(2, "S"), c(3, "S")], false), "a", nine.id, "m1", { at: "high" }))).toMatch(
      /go down first/,
    );
  });

  it("needs a placement on a run, a real meld and a card in hand", () => {
    const t = table();
    const nine = c(9);
    const s0 = t.state([nine, c(2, "S"), c(3, "S")]);
    expect(reason(playOn(s0, "a", nine.id, "m1"))).toMatch(/which end/);
    expect(reason(playOn(s0, "a", nine.id, "m9", { at: "high" }))).toMatch(/no such meld/);
    expect(reason(playOn(s0, "a", "zz", "m1", { at: "high" }))).toMatch(/not in your hand/);
    expect(reason(playOn(s0, "a", nine.id, "m1", { at: "low" }))).toMatch(/doesn't fit/);
  });

  it("playing your last card goes out", () => {
    const t = table();
    const nine = c(9);
    const ten = c(10, "H");
    const s = ok(playOn(t.state([nine, ten]), "a", nine.id, "m1", { at: "high" }));
    const out = ok(playOn(s, "a", ten.id, "m2"));
    expect(out.phase).toEqual({ kind: "out", winner: "a" });
  });

  it("can't leave one card that has nowhere to go", () => {
    const t = table();
    const nine = c(9);
    expect(reason(playOn(t.state([nine, c(2, "S")]), "a", nine.id, "m1", { at: "high" }))).toMatch(/last card/);
  });
});

describe("discard", () => {
  const playing = (hand: Card[]) =>
    rig({ hands: [hand, filler(11), filler(11)], phase: { kind: "play" } });

  it("ends the turn and opens the buy window for the next player", () => {
    const hand = filler(12);
    const card = hand[3];
    const s = ok(discard(playing(hand), "a", card?.id ?? ""));
    expect(seat(s, "a").hand).toHaveLength(11);
    expect(s.discard.at(-1)).toBe(card);
    expect(s.turn).toBe(1);
    expect(s.lastDiscarder).toBe("a");
    expect(s.phase).toEqual({ kind: "draw", window: "open", requests: [] });
  });

  it("wraps around the table", () => {
    const s0 = rig({ hands: [filler(11), filler(11), filler(12)], phase: { kind: "play" }, turn: 2 });
    const s = ok(discard(s0, "c", seat(s0, "c").hand[0]?.id ?? ""));
    expect(s.turn).toBe(0);
  });

  it("jokers may be discarded", () => {
    const joker = J();
    const s = ok(discard(playing([joker, ...filler(11)]), "a", joker.id));
    expect(s.discard.at(-1)).toBe(joker);
  });

  it("never your last card", () => {
    const last = c(4);
    expect(reason(discard(playing([last]), "a", last.id))).toMatch(/last card/);
  });

  it("only after drawing, on your turn, with a card in hand", () => {
    const hand = filler(11);
    expect(reason(discard(rig({ hands: [hand, filler(11)] }), "a", hand[0]?.id ?? ""))).toMatch(/draw first/);
    expect(reason(discard(playing(hand), "b", hand[0]?.id ?? ""))).toMatch(/not your turn/);
    expect(reason(discard(playing(hand), "a", "zz"))).toMatch(/not in your hand/);
  });
});

describe("after going out", () => {
  it("nothing else happens", () => {
    const s0 = rig({ hands: [[], filler(11)], phase: { kind: "out", winner: "a" } });
    expect(reason(draw(s0, "a", "deck"))).toMatch(/round is over/);
    expect(reason(discard(s0, "b", "x"))).toMatch(/round is over/);
    expect(reason(requestBuy(s0, "b"))).toMatch(/round is over/);
  });
});

describe("scoreRound", () => {
  it("scores each hand; the player who went out scores 0", () => {
    const s = rig({
      hands: [[], [c(2), c(9), c(1), J()], [c(13)]],
      phase: { kind: "out", winner: "a" },
    });
    expect(scoreRound(s)).toEqual({ a: 0, b: 85, c: 10 });
  });
});
