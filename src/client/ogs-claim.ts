type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * OGS: tells the room who this page is and which household it sits with, by posting its OGS game
 * token (the room verifies it on the worker). False when there is no token or it was refused.
 */
export async function claimOgs(opts: { fetch: Fetch; room: string; t: string; token: string }): Promise<boolean> {
  if (!opts.token) return false;
  try {
    const res = await opts.fetch(`/ogs/claim/${opts.room}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: opts.t, token: opts.token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** This page's room caller id (`?t=`). */
export const callerToken = (href: string): string | null => new URL(href).searchParams.get("t");

/** Where the OGS app's phone goes to host: into another household's room when OGS names one. */
export function joinedRoomUrl(href: string): string {
  const room = new URL(href).searchParams.get("ogsRoom")?.toUpperCase() ?? "";
  return /^[A-Z]{4}$/.test(room) ? `/host?ogsRoom=${room}` : "/host";
}
