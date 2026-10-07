import { mulberry32 } from "../src/game/cards";
import { dealerFor } from "../src/game/game";
import { deal } from "../src/game/round";
import { stepRound } from "../src/game/sim";
const seed = Number(process.argv[2] ?? 1);
const rng = mulberry32(seed);
const seatIds = ["p1","p2","p3","p4"];
const fmt = (c: any) => c.kind==="joker"?"J":`${c.rank}${c.suit}`;
for (let round = 1; round <= 7; round++) {
  let s = deal({ seatIds, round, dealer: dealerFor(round, 4), rng, cutAt: Math.floor(rng()*1000) });
  let step = 0;
  while (s.phase.kind !== "out" && step < 20000) { s = stepRound(s); step++; }
  if (s.phase.kind !== "out") {
    console.log("stalled round", round);
    for (const x of s.seats) console.log(x.id, x.down, x.buys, x.hand.map(fmt).join(" "));
    console.log(s.melds.map(m => m.meld.cards.map(fmt).join(",")).join(" | "));
    console.log("deck", s.deck.length, "discard", s.discard.length);
    break;
  }
}
