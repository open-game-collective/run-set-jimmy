import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "~": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The 1,000-game fuzz runs on its own (pnpm test:fuzz); room.fuzz.test.ts samples it.
  test: { include: ["src/**/*.test.ts"], exclude: ["src/fuzz/**", "**/node_modules/**"] },
});
