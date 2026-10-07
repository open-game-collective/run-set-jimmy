import { ROUNDS } from "../game/round";

/** Seven pips for the seven rounds: played, this one, still to come. No "Round 3 of 7" text. */
export function RoundPips({ round, className = "" }: { round: number; className?: string }) {
  return (
    <span className={`round-pips ${className}`} role="img" aria-label={`Round ${round} of ${ROUNDS}`} data-testid="round-pips">
      {Array.from({ length: ROUNDS }, (_, i) => (
        <i key={i} className={i + 1 < round ? "done" : i + 1 === round ? "now" : ""} />
      ))}
    </span>
  );
}
