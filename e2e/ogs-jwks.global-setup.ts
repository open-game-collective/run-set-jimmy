import { createServer } from "node:http";
import { JWKS_PORT, ogsSeamKey } from "./ogs-jwks";

/** One JWKS server for the whole seam run (several test files sign OGS tokens with the same key). */
export default async function setup() {
  const key = await ogsSeamKey();
  const server = createServer((req, res) => {
    if (req.url !== "/.well-known/jwks.json") return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(key.jwks));
  });
  // Fail loudly if another game's tooling holds the port (otherwise every test times out in this hook).
  await new Promise<void>((resolve, reject) => {
    server.once("error", (e) => reject(new Error(`OGS test key server can't listen on ${JWKS_PORT}: ${String(e)}`)));
    server.listen(JWKS_PORT, resolve);
  });
  return () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
}
