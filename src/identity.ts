// A caller id (the page's `t`) is signed by the Worker: the socket URL carries the id and its HMAC,
// so a socket can only be opened as an id the Worker handed out (never an AI seat's `ai:N`).

const enc = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signId(id: string, secret: string): Promise<string> {
  return b64url(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(id)));
}

export async function verifyId(id: string, sig: string, secret: string): Promise<boolean> {
  const bytes = fromB64url(sig);
  if (!bytes) return false;
  return crypto.subtle.verify("HMAC", await key(secret), bytes, enc.encode(id));
}
