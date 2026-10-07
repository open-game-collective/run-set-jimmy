import { applyBot, botMove, wantsBuy } from "./bot";
import { mulberry32 } from "./cards";
import { addRound, dealerFor, newScoreSheet, winners, type ScoreSheet } from "./game";
import { ROUNDS, closeBuyWindow, deal, requestBuy, scoreRound, type RoundState } from "./round";

const MAX_STEPS = 20_000;

export type RoundLog = { scores: Record<string, number>; turns: number; buys: number };
export type GameLog = { rounds: RoundLog[]; winners: string[]; sheet: ScoreSheet };

/** One step of bots playing a round: buy requests during a window, then the turn player's move. */
export function stepRound(s: RoundState): RoundState {
  const turnId = s.seats[s.turn]?.id ?? "";
  if (s.phase.kind === "draw" && s.phase.window === "open") {
    let next = s;
    for (const seat of s.seats) {
      if (seat.id !== turnId && wantsBuy(next, seat.id)) {
        const r = requestBuy(next, seat.id);
        if (r.ok) next = r.state;
      }
    }
    const move = botMove(next, turnId);
    if (move) return must(applyBot(next, turnId, move), move.type);
    return must(closeBuyWindow(next), "close window");
  }
  const move = botMove(s, turnId);
  if (!move) throw new Error(`bot ${turnId} has no move in phase ${s.phase.kind}`);
  return must(applyBot(s, turnId, move), move.type);
}

function must(r: ReturnType<typeof closeBuyWindow>, what: string): RoundState {
  if (!r.ok) throw new Error(`${what} refused: ${r.reason}`);
  return r.state;
}

/** Plays one round with bots from the deal to someone going out. */
export function playRound(start: RoundState): { end: RoundState; turns: number; buys: number } {
  let s = start;
  let turns = 0;
  for (let step = 0; s.phase.kind !== "out"; step++) {
    if (step > MAX_STEPS) throw new Error(`round ${s.round} stalled after ${turns} turns`);
    const before = s.turn;
    s = stepRound(s);
    if (s.turn !== before) turns++;
  }
  return { end: s, turns, buys: s.seats.reduce((sum, x) => sum + x.buys, 0) };
}

/** A whole 7-round game played by bots. */
export function playGame(opts: { seed: number; players: number }): GameLog {
  const rng = mulberry32(opts.seed);
  const seatIds = Array.from({ length: opts.players }, (_, i) => `p${i + 1}`);
  let sheet = newScoreSheet(seatIds);
  const rounds: RoundLog[] = [];
  for (let round = 1; round <= ROUNDS; round++) {
    const start = deal({ seatIds, round, dealer: dealerFor(round, opts.players), rng, cutAt: Math.floor(rng() * 1000) });
    const { end, turns, buys } = playRound(start);
    const scores = scoreRound(end);
    sheet = addRound(sheet, scores);
    rounds.push({ scores, turns, buys });
  }
  return { rounds, winners: winners(sheet), sheet };
}
