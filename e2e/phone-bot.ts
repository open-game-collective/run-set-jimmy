/**
 * Drives a real phone page like a player would: reads the phone's own view (window.__rsjView: the
 * table and its own hand), asks the engine's bot what to do, and does it by tapping the same
 * buttons a person would.
 */
import type { Page } from "playwright";
import { botMove, wantsBuy, type BotAction } from "../src/game/bot";
import type { Card } from "../src/game/cards";
import type { Meld } from "../src/game/melds";
import type { Phase, RoundState } from "../src/game/round";
import { placementLabel } from "../src/client/hand";
import type { PlayerView, RoomPublicContext, RoomStateValue } from "../src/room.types";

export type PhoneView = { pub: RoomPublicContext; me: PlayerView | undefined; value: RoomStateValue };

export async function readView(page: Page): Promise<PhoneView | null> {
  return (await page.evaluate(() => Reflect.get(window, "__rsjView") ?? null)) as PhoneView | null;
}

export const stateName = (v: RoomStateValue): string => (typeof v === "string" ? v : `playing.${v.playing}`);

const seatId = (i: number) => `s${i}`;

/** The round as this phone can see it: its own hand, everyone's melds and the top discard. */
export function roundFromView(view: PhoneView): RoundState | null {
  const { pub, me } = view;
  if (!me || pub.turn === null || pub.turnPhase === null) return null;
  const phase: Phase =
    pub.turnPhase === "draw"
      ? { kind: "draw", window: pub.window ? "open" : "closed", requests: (pub.window?.requests ?? []).map(seatId) }
      : pub.turnPhase === "offer"
        ? { kind: "offer", requests: (pub.offer?.requests ?? []).map(seatId) }
        : pub.turnPhase === "play"
          ? { kind: "play" }
          : { kind: "out", winner: seatId(pub.roundWinner ?? 0) };
  return {
    round: pub.round,
    dealer: pub.dealer ?? 0,
    turn: pub.turn,
    seats: pub.seats.map((s, i) => ({ id: seatId(i), hand: i === me.seat ? me.hand : [], down: s.down, buys: s.buys })),
    deck: Array.from({ length: pub.deckCount }, (_, i): Card => ({ id: `deck${i}`, kind: "joker" })),
    discard: pub.discardTop ? [pub.discardTop] : [],
    melds: pub.melds.map((m) => {
      const meld: Meld =
        m.kind === "run" ? { kind: "run", suit: m.suit ?? "S", low: m.low ?? 1, cards: m.cards } : { kind: "set", rank: m.rank ?? 0, cards: m.cards };
      return { id: m.id, owner: seatId(m.owner), meld };
    }),
    phase,
    lastDiscarder: null,
    nextMeldId: 0,
    seed: 0,
    cut: null,
  };
}

/** What this phone's player would do now, or null (nothing, or wait). */
export function decide(view: PhoneView): BotAction | { type: "buy" } | null {
  const r = roundFromView(view);
  const me = view.me;
  if (!r || !me) return null;
  if (me.myTurn) return botMove(r, seatId(me.seat));
  if (me.canBuy && !me.buyRequested && wantsBuy(r, seatId(me.seat))) return { type: "buy" };
  return null;
}

const tap = async (page: Page, selector: string) => {
  await page.locator(selector).first().click({ timeout: 8000 });
};

/** Does the action through the phone's buttons. */
export async function perform(page: Page, view: PhoneView, action: BotAction | { type: "buy" }, beat: number): Promise<void> {
  const pause = (ms = beat) => page.waitForTimeout(ms);
  switch (action.type) {
    case "buy":
      return page.getByRole("button", { name: /^Buy the/ }).click({ timeout: 4000 });
    case "draw":
      if (action.from === "discard") return page.getByRole("button", { name: /^Take the/ }).click();
      return page.getByRole("button", { name: "Draw from the deck" }).click({ timeout: 8000 });
    case "answer":
      return page.getByRole("button", { name: action.answer === "take" ? "Take it" : "Let it go" }).click();
    case "goDown": {
      await page.getByRole("button", { name: "Go down" }).click();
      for (const [i, meld] of action.melds.entries()) {
        await tap(page, `[data-testid="slot-${i}"]`);
        for (const id of meld.cardIds) {
          await tap(page, `[data-hand-card="${id}"]`);
          await pause(beat / 4);
        }
        await pause(beat / 2);
      }
      await pause();
      return page.getByRole("button", { name: "Lay down" }).click();
    }
    case "playOn": {
      await tap(page, `[data-hand-card="${action.cardId}"]`);
      await pause(beat / 2);
      await tap(page, `button[data-meld="${action.meldId}"]`);
      const sheet = page.getByRole("dialog");
      if (action.placement && (await sheet.isVisible({ timeout: 600 }).catch(() => false))) {
        const m = view.pub.melds.find((x) => x.id === action.meldId);
        if (m?.kind === "run" && m.suit && m.low !== null) {
          const label = placementLabel({ kind: "run", suit: m.suit, low: m.low, cards: m.cards }, action.placement);
          await sheet.getByRole("button", { name: label }).click();
        }
      }
      return;
    }
    case "discard": {
      await tap(page, `[data-hand-card="${action.cardId}"]`);
      await pause(beat / 2);
      return page.getByRole("button", { name: /^Discard the/ }).click();
    }
  }
}

/** A short fingerprint of the room's progress, to wait for an action to land. */
export const progress = (v: PhoneView | null): string =>
  v ? `${stateName(v.value)}|${v.pub.log.at(-1)?.seq ?? 0}|${v.pub.turnPhase}|${v.me?.hand.length}|${v.me?.buyRequested}|${v.me?.oops?.seq ?? 0}` : "";
