/** After a deadline, give the room's own timer this long before nudging it. */
const GRACE_MS = 500;

/** Is any deadline (ms since epoch) well past? */
export const nudgeDue = (deadlines: readonly (number | null)[], now: number): boolean =>
  deadlines.some((d) => d !== null && now - d >= GRACE_MS);
