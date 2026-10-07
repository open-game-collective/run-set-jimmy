import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.seam.test.ts"],
    // actor-kit's browser build imports named exports from CJS fast-json-patch; let Vite handle the interop.
    server: { deps: { inline: ["actor-kit"] } },
  },
});
