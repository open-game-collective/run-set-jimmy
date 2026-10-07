import { useEffect, useMemo, useRef, useState } from "react";
import { placementsFor } from "../../game/arrange";
import type { Card } from "../../game/cards";
import type { Meld, RunMeld, RunPlacement } from "../../game/melds";
import { canPlayAnywhere, type TableMeld } from "../../game/round";
import { cardName } from "../../game/words";
import { RoomContext } from "../../room.context";
import type { RoomPublicContext } from "../../room.types";
import { MeldCards, PlayingCard, meldTitle } from "../cards";
import { applyOrder, builderSlots, placementLabel, slotStatus, sortHand, toProposals, type Slot } from "../hand";
import { haptic } from "../haptics";
import { sounds } from "../sound";
import { Hand } from "./Hand";
import { RoundPips } from "../RoundPips";
import { turnLine } from "../turn-line";

type MeldView = RoomPublicContext["melds"][number];

/** The table's melds as the rules engine sees them (to check where a card fits). */
function toTable(melds: readonly MeldView[]): TableMeld[] {
  return melds.map((m) => {
    const meld: Meld =
      m.kind === "run" ? { kind: "run", suit: m.suit ?? "S", low: m.low ?? 1, cards: m.cards } : { kind: "set", rank: m.rank ?? 0, cards: m.cards };
    return { id: m.id, owner: String(m.owner), meld };
  });
}

function fits(meld: Meld, card: Card): RunPlacement[] | "set" | null {
  if (meld.kind === "set") return card.kind === "joker" || card.rank === meld.rank ? "set" : null;
  const options = placementsFor(meld, card);
  return options.length > 0 ? options : null;
}

/** Counts down to `endsAt` in whole seconds. */
function useSecondsLeft(endsAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function Toast() {
  const oops = RoomContext.useSelector((s) => s.private.player?.oops ?? null);
  const [shown, setShown] = useState<{ line: string; seq: number } | null>(null);
  const seen = useRef(oops?.seq ?? 0);
  useEffect(() => {
    if (!oops || oops.seq <= seen.current) return;
    seen.current = oops.seq;
    setShown(oops);
    sounds.oops();
    haptic(60);
    const timer = setTimeout(() => setShown(null), 3200);
    return () => clearTimeout(timer);
  }, [oops]);
  return shown ? (
    <div className="toast" role="alert" data-testid="oops">
      {shown.line}
    </div>
  ) : null;
}

export function PhonePlay() {
  const send = RoomContext.useSend();
  const pub = RoomContext.useSelector((s) => s.public);
  const me = RoomContext.useSelector((s) => s.private.player);
  const hand = me?.hand ?? [];
  const mySeat = me?.seat ?? -1;
  const down = pub.seats[mySeat]?.down === true;
  const myTurn = me?.myTurn === true;
  const playing = myTurn && pub.turnPhase === "play";

  const [order, setOrder] = useState<string[]>(() => hand.map((c) => c.id));
  const cards = useMemo(() => applyOrder(hand, order), [hand, order]);
  const [selected, setSelected] = useState<string | null>(null);
  const [builder, setBuilder] = useState<Slot[] | null>(null);
  const [active, setActive] = useState(0);
  const [choice, setChoice] = useState<{ meldId: string; cardId: string; options: RunPlacement[]; run: RunMeld } | null>(null);

  // A card that left the hand (played, discarded) can't stay selected or in the builder.
  const handIds = useMemo(() => new Set(hand.map((c) => c.id)), [hand]);
  if (selected && !handIds.has(selected)) setSelected(null);
  if (builder && builder.some((s) => s.cards.some((c) => !handIds.has(c.id)))) setBuilder(null);
  if (builder && !playing) setBuilder(null);

  const table = useMemo(() => toTable(pub.melds), [pub.melds]);
  const playable = useMemo(
    () => (down ? new Set(hand.filter((c) => canPlayAnywhere(c, table)).map((c) => c.id)) : new Set<string>()),
    [down, hand, table],
  );
  const selectedCard = hand.find((c) => c.id === selected) ?? null;
  const top = pub.discardTop;
  const turnName = pub.turn === null ? "" : (pub.seats[pub.turn]?.name ?? "");
  const windowLeft = useSecondsLeft(pub.window?.endsAt ?? null);

  const act = (event: Parameters<typeof send>[0]) => {
    haptic();
    sounds.tap();
    send(event);
  };

  const inBuilder = new Map<string, number>();
  builder?.forEach((s, i) => s.cards.forEach((c) => inBuilder.set(c.id, i)));

  const tapCard = (card: Card) => {
    haptic(12);
    if (builder) {
      setBuilder(
        builder.map((s, i) => {
          const without = s.cards.filter((c) => c.id !== card.id);
          if (i === active && without.length === s.cards.length) return { ...s, cards: [...s.cards, card] };
          return { ...s, cards: without };
        }),
      );
      return;
    }
    setSelected(selected === card.id ? null : card.id);
  };

  const tapMeld = (m: MeldView) => {
    if (!playing || !down || !selectedCard) return;
    const meld = table.find((t) => t.id === m.id)?.meld;
    if (!meld) return;
    const where = fits(meld, selectedCard);
    if (!where) return;
    if (where === "set") return act({ type: "PLAY_ON", cardId: selectedCard.id, meldId: m.id });
    if (where.length === 1 && where[0]) return act({ type: "PLAY_ON", cardId: selectedCard.id, meldId: m.id, placement: where[0] });
    if (meld.kind === "run") setChoice({ meldId: m.id, cardId: selectedCard.id, options: where, run: meld });
  };

  const banner = turnLine({
    myTurn,
    phase: pub.turnPhase,
    down,
    windowOpen: pub.window !== null,
    offerFrom: pub.offer ? (pub.seats[pub.offer.buyer]?.name ?? null) : null,
    turnName,
    top: top ? cardName(top) : null,
    canBuy: me?.canBuy === true,
    buyRequested: me?.buyRequested === true,
  });
  // A tick and a chime when the turn comes round to this phone.
  const wasMine = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMine.current) {
      haptic(40);
      sounds.take();
    }
    wasMine.current = myTurn;
  }, [myTurn]);

  const req = pub.requirement;
  const allReady = builder !== null && builder.every((s) => slotStatus(s.kind, s.cards, s.spare).ok);

  return (
    <div className={`phone play ${myTurn ? "my-turn" : ""}`} data-testid="phone-play">
      <Toast />
      <header className="play-head">
        <div>
          <RoundPips round={pub.round} />
          <p className="req" data-testid="phone-requirement">
            {req?.name}
          </p>
        </div>
        <div className="mini-pile">
          <span className="mini-deck">{pub.deckCount}</span>
          {top ? <PlayingCard card={top} className="mini" /> : null}
        </div>
      </header>

      <p className={`turn-banner ${banner.mine ? "mine" : ""}`} data-testid="turn-banner" aria-live="polite">
        {banner.text}
      </p>

      <section className="phone-table" data-testid="phone-table">
        {pub.melds.length === 0 ? <p className="muted">Nobody is down yet.</p> : null}
        {pub.seats.map((seat, owner) => {
          const melds = pub.melds.filter((m) => m.owner === owner);
          if (melds.length === 0) return null;
          return (
            <div key={owner} className="phone-owner">
              <p className="owner-name">{owner === mySeat ? "You" : seat.name}</p>
              <div className="phone-melds">
                {melds.map((m) => {
                  const meld = table.find((t) => t.id === m.id)?.meld;
                  const fit = playing && down && selectedCard && meld ? fits(meld, selectedCard) : null;
                  return (
                    <button
                      key={m.id}
                      className={`phone-meld ${fit ? "fits" : ""}`}
                      onClick={() => tapMeld(m)}
                      disabled={!fit}
                      aria-label={`${meldTitle(m)}${fit ? ": play here" : ""}`}
                      data-meld={m.id}
                    >
                      <MeldCards meld={m} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="actions" data-testid="actions">
        {builder ? (
          <div className="builder" data-testid="builder">
            <p className="builder-help">
              Adding to <b>{builder[active]?.label}</b>: tap cards in your hand. Tap another box to switch.
            </p>
            <div className="slots">
              {builder.map((s, i) => {
                const status = slotStatus(s.kind, s.cards, s.spare);
                const spareJokers = s.kind === "run" && s.cards.some((c) => c.kind === "joker");
                return (
                  <div
                    key={s.label}
                    className={`slot ${i === active ? "active" : ""} ${status.ok ? "ok" : ""}`}
                    onClick={() => setActive(i)}
                    role="button"
                    data-testid={`slot-${i}`}
                  >
                    <p className="slot-label">
                      {s.label}
                      <span>{status.line}</span>
                    </p>
                    <div className="slot-cards">
                      {s.cards.map((c) => (
                        <PlayingCard key={c.id} card={c} className="tiny" />
                      ))}
                    </div>
                    {spareJokers && status.ok ? (
                      <button
                        className="spare"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBuilder(builder.map((x, k) => (k === i ? { ...x, spare: x.spare === "high" ? "low" : "high" } : x)));
                        }}
                      >
                        Spare Joker {s.spare === "high" ? "on top" : "at the bottom"}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="row">
              <button className="btn" onClick={() => setBuilder(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={!allReady} onClick={() => act({ type: "GO_DOWN", melds: toProposals(builder) })}>
                Lay down
              </button>
            </div>
          </div>
        ) : myTurn && pub.turnPhase === "draw" ? (
          <div className="row">
            <button className="btn primary" disabled={!top} onClick={() => act({ type: "DRAW", from: "discard" })}>
              Take the {top ? cardName(top) : "discard"}
            </button>
            <button className="btn" disabled={pub.window !== null} onClick={() => act({ type: "DRAW", from: "deck" })}>
              {pub.window ? `Deck in ${windowLeft}s` : "Draw from the deck"}
            </button>
          </div>
        ) : myTurn && pub.turnPhase === "offer" && pub.offer ? (
          <div className="offer">
            <p>
              <b>{pub.seats[pub.offer.buyer]?.name}</b> wants the {top ? cardName(top) : "discard"}.
            </p>
            <div className="row">
              <button className="btn primary" onClick={() => act({ type: "ANSWER", answer: "take" })}>
                Take it
              </button>
              <button className="btn" onClick={() => act({ type: "ANSWER", answer: "let-go" })}>
                Let it go
              </button>
            </div>
          </div>
        ) : playing ? (
          <div className="row">
            {!down ? (
              <button
                className="btn"
                onClick={() => {
                  if (!req) return;
                  setBuilder(builderSlots(req));
                  setActive(0);
                  setSelected(null);
                }}
              >
                Go down
              </button>
            ) : null}
            <button className="btn primary" disabled={!selectedCard} onClick={() => selectedCard && act({ type: "DISCARD", cardId: selectedCard.id })}>
              {selectedCard ? `Discard the ${cardName(selectedCard)}` : "Pick a card to discard"}
            </button>
          </div>
        ) : !myTurn && pub.window && top ? (
          me?.buyRequested ? (
            <p className="status">You asked to buy the {cardName(top)}…</p>
          ) : me?.canBuy ? (
            <button className="btn buy" onClick={() => act({ type: "BUY" })}>
              Buy the {cardName(top)} <small>({windowLeft}s · {3 - (pub.seats[mySeat]?.buys ?? 0)} buys left)</small>
            </button>
          ) : (
            <p className="status">{turnName} to draw</p>
          )
        ) : (
          <p className="status" data-testid="status">
            {pub.offer ? `${turnName} is deciding on the buy` : pub.turnPhase === "draw" ? `${turnName} to draw` : `${turnName} is playing`}
          </p>
        )}
        {playing && down && selectedCard && playable.has(selectedCard.id) && !builder ? (
          <p className="hint">Tap a glowing meld to play the {cardName(selectedCard)}.</p>
        ) : null}
      </section>

      <Hand
        cards={cards}
        selected={selected}
        playable={playable}
        inBuilder={inBuilder}
        onTap={tapCard}
        onReorder={setOrder}
        onSort={(by) => setOrder(sortHand(hand, by).map((c) => c.id))}
      />

      {choice ? (
        <div className="sheet" role="dialog" aria-label="Where should it go?">
          <p>Where should the {cardName(hand.find((c) => c.id === choice.cardId) ?? { id: "", kind: "joker" })} go?</p>
          {choice.options.map((p) => (
            <button
              key={JSON.stringify(p)}
              className="btn"
              onClick={() => {
                act({ type: "PLAY_ON", cardId: choice.cardId, meldId: choice.meldId, placement: p });
                setChoice(null);
              }}
            >
              {placementLabel(choice.run, p)}
            </button>
          ))}
          <button className="btn ghost" onClick={() => setChoice(null)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
