import { z } from "zod";

/**
 * Run Set Jimmy as an installable web app, for players without the OGS app: when to offer
 * installing it, remembering the player's table so the home-screen app can rejoin it, and when to
 * register the service worker.
 */

export type InstallOffer = "button" | "ios-hint" | null;

/** Chrome's install prompt where there is one; iOS Safari has none, so it gets a how-to. */
export function installOffer(i: { inOgs: boolean; standalone: boolean; ios: boolean; canPrompt: boolean }): InstallOffer {
  if (i.inOgs || i.standalone) return null;
  if (i.canPrompt) return "button";
  return i.ios ? "ios-hint" : null;
}

type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void } | null;

const KEY = "rsj:table";
const KEEP_MS = 12 * 3600_000;
const SEAT = /^\/join\/([A-Z]{4})$/;
const TOKEN = /^[0-9a-f-]{36}$/;
const Saved = z.object({ code: z.string().regex(/^[A-Z]{4}$/), t: z.string().regex(TOKEN), at: z.number() });

/** Remembers this phone's seat (the room and its rejoin token); other pages are ignored. */
export function rememberTable(store: Store, href: string, now: number): void {
  const url = new URL(href);
  const code = SEAT.exec(url.pathname)?.[1];
  const t = url.searchParams.get("t");
  if (!store || !code || !t || !TOKEN.test(t)) return;
  try {
    store.setItem(KEY, JSON.stringify({ code, t, at: now }));
  } catch {
    // Private mode or full storage: the app just won't offer to rejoin.
  }
}

/** The seat to rejoin, if this phone sat at a table in the last 12 hours. */
export function lastTable(store: Store, now: number): { code: string; url: string } | null {
  try {
    const parsed = Saved.safeParse(JSON.parse(store?.getItem(KEY) ?? "null"));
    if (!parsed.success || now - parsed.data.at > KEEP_MS) return null;
    return { code: parsed.data.code, url: `/join/${parsed.data.code}?t=${parsed.data.t}` };
  } catch {
    return null;
  }
}

/** The service worker serves the app's shell and offline page; never on the OGS TV. */
export const shouldRegisterWorker = (i: { supported: boolean; framed: boolean; streamed: boolean }): boolean =>
  i.supported && !i.framed && !i.streamed;
