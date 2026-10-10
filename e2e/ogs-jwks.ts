/**
 * The OGS key set for the seam tests: game tokens are signed with a fixed test key
 * (fixtures/ogs-test-key.json; the dev server caches the key set, so every run must use the same key)
 * and its public half is served on OGS_JWKS_PORT (8837, Run Set Jimmy's own: other games use 8831+). Run the server with
 * `--var OGS_JWKS_URL:http://localhost:8837/.well-known/jwks.json`.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ogsTestKeyFrom } from "../src/test/ogsTestKeys";

export const JWKS_PORT = Number(process.env.OGS_JWKS_PORT ?? 8837);

const Fixture = z.object({ kid: z.string(), privateJwk: z.object({ kty: z.string(), crv: z.string(), x: z.string(), y: z.string(), d: z.string() }) });

export function ogsSeamKey() {
  const fixture = Fixture.parse(JSON.parse(readFileSync(new URL("./fixtures/ogs-test-key.json", import.meta.url), "utf8")));
  return ogsTestKeyFrom(fixture.kid, fixture.privateJwk);
}
