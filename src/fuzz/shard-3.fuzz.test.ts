import { fuzzGames } from "./fuzz-games";

// 1,000 games in four shards (vitest runs files in parallel): seeds 501–750.
fuzzGames(501, 250);
