import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["e2e/**/*.seam.test.ts"],
    // Each file drives a table of browsers against one dev server: one file at a time.
    fileParallelism: false,
    // The OGS key set the dev server checks game tokens against (e2e/ogs-jwks.ts).
    globalSetup: ["e2e/ogs-jwks.global-setup.ts"],
    // actor-kit's browser build imports named exports from CJS fast-json-patch; let Vite handle the interop.
    server: { deps: { inline: ["actor-kit"] } },
  },
});
