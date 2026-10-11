import { describe, expect, it } from "vitest";
import { playFuzzGame } from "../test/fuzz";

/** Plays `count` seeded games from `first`: each must end, replay exactly and never leak a hand. */
export function fuzzGames(first: number, count: number): void {
  describe(`seeded games ${first}–${first + count - 1} through simulate()`, () => {
    it("every game ends, every journal replays exactly, and no view ever shows another player's hand", async () => {
      const failures: string[] = [];
      let events = 0;
      let switches = 0;
      for (let seed = first; seed < first + count; seed++) {
        const g = await playFuzzGame(seed);
        events += g.replayed;
        switches += g.switches;
        if (g.phase !== "gameOver") failures.push(`seed ${seed}: stopped in ${g.phase} after ${g.steps} steps`);
        if (g.rounds !== 7) failures.push(`seed ${seed}: ${g.rounds} rounds scored`);
        if (g.leaks.length > 0) failures.push(`seed ${seed}: ${g.leaks.slice(0, 3).join("; ")}`);
        const names = g.events.map((e) => e.name);
        if (names.filter((n) => n === "RoundScored").length !== 7 || names.at(-1) !== "GameOver") failures.push(`seed ${seed}: events end ${names.slice(-3).join(",")}`);
      }
      expect(failures).toEqual([]);
      expect(events).toBeGreaterThan(count * 50);
      // playing.window ⇄ playing.acting switches, each checked to keep playing's local.
      expect(switches).toBeGreaterThan(count * 50);
    }, 3_600_000);
  });
}
