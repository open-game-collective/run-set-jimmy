import { fuzzGames } from "./fuzz-games";

// 1,000 games in four shards (vitest runs files in parallel): seeds 751–1000.
fuzzGames(751, 250);
