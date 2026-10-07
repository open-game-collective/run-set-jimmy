import { describe, expect, it } from "vitest";
import { installOffer, lastTable, rememberTable, shouldRegisterWorker } from "./pwa";

describe("installOffer: how the page offers to install the app", () => {
  const base = { inOgs: false, standalone: false, ios: false, canPrompt: false };
  it("Android/desktop Chrome with an install prompt: a button", () => {
    expect(installOffer({ ...base, canPrompt: true })).toBe("button");
  });
  it("iPhone/iPad Safari: how to add it to the home screen", () => {
    expect(installOffer({ ...base, ios: true })).toBe("ios-hint");
  });
  it("nothing inside the OGS app, once installed, or with no way to install", () => {
    expect(installOffer({ ...base, inOgs: true, canPrompt: true })).toBeNull();
    expect(installOffer({ ...base, standalone: true, ios: true })).toBeNull();
    expect(installOffer(base)).toBeNull();
  });
});

describe("rememberTable / lastTable: the home-screen app rejoins your table", () => {
  const T = "0b9c5d1e-1111-4222-8333-944445555666";
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("keeps a phone's seat URL and gives it back", () => {
    const s = store();
    rememberTable(s, `https://rsj.test/join/KQTP?t=${T}`, 1000);
    expect(lastTable(s, 2000)).toEqual({ code: "KQTP", url: `/join/KQTP?t=${T}` });
  });
  it("drops the host's tv token (only the seat matters) and anything else", () => {
    const s = store();
    rememberTable(s, `https://rsj.test/join/KQTP?t=${T}&tv=${T}&x=1`, 1000);
    expect(lastTable(s, 2000)?.url).toBe(`/join/KQTP?t=${T}`);
  });
  it("ignores pages that aren't a seat", () => {
    const s = store();
    rememberTable(s, "https://rsj.test/tv/KQTP?t=" + T, 1000);
    rememberTable(s, "https://rsj.test/join/KQTP", 1000);
    expect(lastTable(s, 2000)).toBeNull();
  });
  it("forgets a table after 12 hours, and survives junk or a missing store", () => {
    const s = store();
    rememberTable(s, `https://rsj.test/join/KQTP?t=${T}`, 0);
    expect(lastTable(s, 13 * 3600_000)).toBeNull();
    s.setItem("rsj:table", "{not json");
    expect(lastTable(s, 0)).toBeNull();
    expect(lastTable(null, 0)).toBeNull();
    expect(() => rememberTable(null, `https://rsj.test/join/KQTP?t=${T}`, 0)).not.toThrow();
  });
});

describe("shouldRegisterWorker", () => {
  it("in a browser tab or the installed app", () => {
    expect(shouldRegisterWorker({ supported: true, framed: false, streamed: false })).toBe(true);
  });
  it("not on the OGS TV (framed or streamed) or without service workers", () => {
    expect(shouldRegisterWorker({ supported: true, framed: true, streamed: false })).toBe(false);
    expect(shouldRegisterWorker({ supported: true, framed: false, streamed: true })).toBe(false);
    expect(shouldRegisterWorker({ supported: false, framed: false, streamed: false })).toBe(false);
  });
});
