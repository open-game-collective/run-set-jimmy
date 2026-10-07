import { ROUNDS } from "./round";

export type ScoreSheet = { seatIds: string[]; rounds: Record<string, number>[] };

/** Round 1 is dealt by seat 0; the dealer moves one seat left each round. */
export const dealerFor = (round: number, seats: number) => (round - 1) % seats;

export const newScoreSheet = (seatIds: readonly string[]): ScoreSheet => ({ seatIds: [...seatIds], rounds: [] });

export function addRound(sheet: ScoreSheet, scores: Record<string, number>): ScoreSheet {
  if (sheet.rounds.length >= ROUNDS) throw new Error(`A game has ${ROUNDS} rounds`);
  return { ...sheet, rounds: [...sheet.rounds, scores] };
}

/** Totals so far, lowest first (seat order breaks display ties). */
export function standings(sheet: ScoreSheet): { id: string; total: number }[] {
  return sheet.seatIds
    .map((id) => ({ id, total: sheet.rounds.reduce((sum, r) => sum + (r[id] ?? 0), 0) }))
    .sort((a, b) => a.total - b.total);
}

/** After round 7: everyone tied for the lowest total. Empty until then. */
export function winners(sheet: ScoreSheet): string[] {
  if (sheet.rounds.length < ROUNDS) return [];
  const table = standings(sheet);
  const best = table[0]?.total;
  return table.filter((s) => s.total === best).map((s) => s.id);
}
