/** Test only: an ES256 key pair and a signer shaped like the OGS API's game tokens. */
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

/** A fresh key pair. */
export async function ogsTestKey(kid: string) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  if (!("privateKey" in pair)) throw new Error("expected a key pair");
  return signerFor(kid, pair.privateKey, pair.publicKey);
}

/**
 * A fixed key (a test fixture's private JWK): a server's verifier caches the key set, so a key that
 * stays the same across test runs keeps working against a long-running dev server.
 */
export async function ogsTestKeyFrom(kid: string, privateJwk: JsonWebKey) {
  const { d: _d, ...publicJwk } = privateJwk;
  const ec = { name: "ECDSA", namedCurve: "P-256" };
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, ec, true, ["sign"]);
  const publicKey = await crypto.subtle.importKey("jwk", { ...publicJwk, key_ops: ["verify"] }, ec, true, ["verify"]);
  return signerFor(kid, privateKey, publicKey);
}

async function signerFor(kid: string, privateKey: CryptoKey, publicKey: CryptoKey) {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  if (jwk instanceof ArrayBuffer) throw new Error("expected a JWK");
  const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, kid, alg: "ES256", use: "sig" };
  return {
    kid,
    jwks: { keys: [publicJwk] },
    async sign(claims: unknown): Promise<string> {
      const input = `${b64urlJson({ alg: "ES256", kid, typ: "JWT" })}.${b64urlJson(claims)}`;
      const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(input));
      return `${input}.${b64url(new Uint8Array(sig))}`;
    },
  };
}

/** Claims of a game token for `aud`, valid for an hour from now. */
export function gameClaims(aud: string, who: { id: string; handle: string; name: string }) {
  const iat = Math.floor(Date.now() / 1000);
  return {
    iss: "https://api.opengame.org",
    aud,
    sub: who.id,
    handle: who.handle,
    name: who.name,
    avatar: `https://tv.opengame.org/art/story-nook/char-${who.handle}.webp`,
    iat,
    exp: iat + 3600,
  };
}
