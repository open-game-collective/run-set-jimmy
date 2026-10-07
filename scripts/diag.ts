import { mulberry32 } from "../src/game/cards";
import { dealerFor } from "../src/game/game";
import { deal } from "../src/game/round";
import { stepRound } from "../src/game/sim";
const rng = mulberry32(1);
const seatIds = ["p1","p2","p3","p4"];
for (let round = 1; round <= 7; round++) {
  let s = deal({ seatIds, round, dealer: dealerFor(round, 4), rng, cutAt: Math.floor(rng()*1000) });
  let turns = 0, step = 0;
  while (s.phase.kind !== "out" && step < 20000) { const b = s.turn; s = stepRound(s); if (s.turn !== b) turns++; step++;
    if (turns === 60 || turns === 400) console.log(`r${round} t${turns}`, s.seats.map(x => `${x.id}:${x.down?"D":"-"}${x.hand.length}b${x.buys}`).join(" "), "deck", s.deck.length, "melds", s.melds.length);
  }
  console.log(`round ${round}: ${s.phase.kind} after ${turns} turns`);
  if (s.phase.kind !== "out") { for (const x of s.seats) console.log(x.id, x.down, x.hand.map(c => c.kind==="joker"?"J":`${c.rank}${c.suit}`).join(" ")); console.log(s.melds.map(m => m.meld.kind + ":" + m.meld.cards.map(c => c.kind==="joker"?"J":`${c.rank}${c.suit}`).join(",")).join(" | ")); break; }
}
