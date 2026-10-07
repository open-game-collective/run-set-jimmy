/** A refusal rule: when `broken()` holds, the move is refused with `reason`. */
export type Rule = readonly [broken: () => boolean, reason: string];

/** The reason of the first broken rule, checked in order (later rules run only if earlier ones hold); null when all hold. */
export function firstBroken(rules: readonly Rule[]): string | null {
  const hit = rules.find(([broken]) => broken());
  return hit ? hit[1] : null;
}
