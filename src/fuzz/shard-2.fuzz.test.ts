import { fuzzGames } from "./fuzz-games";

// 1,000 games in four shards (vitest runs files in parallel): seeds 251–500.
fuzzGames(251, 250);
