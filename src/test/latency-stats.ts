/**
 * The numbers e2e/latency.ts reports: move round trips seen by a phone, and how late the room's own
 * timers (buy window, cut) moved on after their deadlines as the TV saw it. Pure, so it is tested
 * here; the browser part only collects timestamps.
 */

/** Nearest-rank percentile (`p` in 0–100); null without samples. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

/** A phone's view as it changed: when (page clock), and its progress fingerprint at that moment. */
export type ViewChange = { at: number; progress: string };
/** One move: the phone's clicks for it (the last one sends it), and its progress before the move. */
export type MoveClicks = { clicks: readonly number[]; after: string };

/** Each move's round trip: from its last click to the first view change whose progress differs. */
export function roundTrips(moves: readonly MoveClicks[], changes: readonly ViewChange[]): number[] {
  return moves.flatMap(({ clicks, after }) => {
    const sent = clicks.at(-1);
    if (sent === undefined) return [];
    const shown = changes.find((c) => c.at >= sent && c.progress !== after);
    return shown ? [shown.at - sent] : [];
  });
}

/** A deadline the TV showed and when the TV saw it end (both ms since epoch). */
export type TimerSeen = { deadline: number; endedAt: number };

/** How late each timer moved the room on; endings before the deadline were moves, not the timer. */
export const timerLateness = (seen: readonly TimerSeen[]): number[] =>
  seen.filter((t) => t.endedAt >= t.deadline).map((t) => t.endedAt - t.deadline);

export type Stats = { n: number; p50: number | null; p95: number | null; max: number | null };
export type Summary = { roundTrip: Stats; window: Stats; cut: Stats };

const stats = (xs: readonly number[]): Stats => ({
  n: xs.length,
  p50: percentile(xs, 50),
  p95: percentile(xs, 95),
  max: xs.length === 0 ? null : Math.max(...xs),
});

export function summarize(samples: { roundTrip: readonly number[]; window: readonly number[]; cut: readonly number[] }): Summary {
  return { roundTrip: stats(samples.roundTrip), window: stats(samples.window), cut: stats(samples.cut) };
}

export type Thresholds = { roundTripP95: number; windowP95: number; cutMax: number };

/** Every measure over its limit (or with no samples), as a sentence; empty when all pass. */
export function breaches(s: Summary, limits: Thresholds): string[] {
  const out: string[] = [];
  const check = (name: string, value: number | null, limit: number, label: string) => {
    if (value === null) out.push(`${name}: no samples`);
    else if (value > limit) out.push(`${name} ${label} ${value} ms > ${limit} ms`);
  };
  check("round trip", s.roundTrip.p95, limits.roundTripP95, "p95");
  check("buy window", s.window.p95, limits.windowP95, "late p95");
  check("cut", s.cut.max, limits.cutMax, "late max");
  return out;
}
