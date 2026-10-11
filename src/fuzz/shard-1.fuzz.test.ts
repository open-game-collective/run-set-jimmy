import { fuzzGames } from "./fuzz-games";

// 1,000 games in four shards (vitest runs files in parallel): seeds 1–250.
fuzzGames(1, 250);
