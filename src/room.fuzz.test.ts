import { fuzzGames } from "./fuzz/fuzz-games";

// A quick sample on every `pnpm test`; `pnpm test:fuzz` plays the full 1,000 (src/fuzz/).
fuzzGames(1001, 25);
