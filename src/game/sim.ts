import { applyBot, botMove, wantsBuy } from "./bot";
import { mulberry32 } from "./cards";
import { addRound, dealerFor, newScoreSheet, winners, type ScoreSheet } from "./game";
import { ROUNDS, closeBuyWindow, deal, requestBuy, scoreRound, windowIsOpen, type RoundState } from "./round";

const MAX_STEPS = 20_000;

export type RoundLog = { scores: Record<string, number>; turns: number; buys: number };
export type GameLog = { rounds: RoundLog[]; winners: string[]; sheet: ScoreSheet };

const turnIdOf = (s: RoundState): string => s.seats[s.turn]?.id ?? "";

/** A non-turn bot asks to buy the discard when it wants it (and the rules let it). */
function askToBuy(s: RoundState, seatId: string, turnId: string): RoundState {
  if (seatId === turnId || !wantsBuy(s, seatId)) return s;
  const r = requestBuy(s, seatId);
  return r.ok ? r.state : s;
}

/** During a buy window: everyone else may ask to buy, then the turn player moves or the window closes. */
function stepWindow(s: RoundState, turnId: string): RoundState {
  const next = s.seats.reduce((state, seat) => askToBuy(state, seat.id, turnId), s);
  const move = botMove(next, turnId);
  if (move) return must(applyBot(next, turnId, move), move.type);
  return must(closeBuyWindow(next), "close window");
}

/** One step of bots playing a round: buy requests during a window, then the turn player's move. */
export function stepRound(s: RoundState): RoundState {
  const turnId = turnIdOf(s);
  if (windowIsOpen(s.phase)) return stepWindow(s, turnId);
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
