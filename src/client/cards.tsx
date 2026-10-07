import type { CSSProperties } from "react";
import type { Card } from "../game/cards";
import { rankName, rankPlural, suitSymbol } from "../game/words";
import type { RoomPublicContext } from "../room.types";

type MeldView = RoomPublicContext["melds"][number];

const red = (card: Card) => card.kind === "card" && (card.suit === "H" || card.suit === "D");

/**
 * A playing card drawn in CSS: rank and suit in two corners, a big centre pip (or, for J/Q/K, a
 * big italic letter in a ruled frame: no faces). A joker is a brass starburst. `as` labels what a
 * joker stands for on the table.
 */
export function PlayingCard({
  card,
  as,
  className = "",
  style,
  testId,
}: {
  card: Card;
  as?: string | null;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  if (card.kind === "joker") {
    return (
      <div className={`card joker ${className}`} style={style} data-card={card.id} data-testid={testId} aria-label={as ? `Joker as ${as}` : "Joker"}>
        <span className="joker-burst" aria-hidden />
        <span className="joker-word" aria-hidden>
          JOKER
        </span>
        {as ? <span className="joker-as">{as}</span> : null}
      </div>
    );
  }
  const rank = rankName(card.rank);
  const suit = suitSymbol(card.suit);
  const face = card.rank >= 11;
  return (
    <div
      className={`card ${red(card) ? "red" : "black"} ${face ? "face" : ""} ${className}`}
      style={style}
      data-card={card.id}
      data-testid={testId}
      aria-label={`${rank}${suit}`}
    >
      <span className="corner tl" aria-hidden>
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      <span className="pip" aria-hidden>
        {face ? <span className="face-letter">{rank}</span> : suit}
      </span>
      <span className="corner br" aria-hidden>
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
    </div>
  );
}

export function CardBack({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`card back ${className}`} style={style} aria-hidden />;
}

/** What a joker in this meld stands for ("6♥"), by its position. */
export function jokerAs(meld: MeldView, index: number): string | null {
  if (meld.kind === "run" && meld.low !== null && meld.suit) return `${rankName(meld.low + index)}${suitSymbol(meld.suit)}`;
  if (meld.kind === "set" && meld.rank !== null) return rankName(meld.rank);
  return null;
}

/** A short name for a meld: "5♥ to 9♥", "8s" or "Kings". */
export function meldTitle(meld: MeldView): string {
  if (meld.kind === "run" && meld.low !== null && meld.suit) {
    const s = suitSymbol(meld.suit);
    return `${rankName(meld.low)}${s} to ${rankName(meld.low + meld.cards.length - 1)}${s}`;
  }
  return rankPlural(meld.rank ?? 0);
}

/** A meld laid out as an overlapping row of cards. */
export function MeldCards({ meld, className = "" }: { meld: MeldView; className?: string }) {
  return (
    <div className={`meld-cards ${meld.kind} ${className}`} data-meld={meld.id}>
      {meld.cards.map((card, i) => (
        <PlayingCard key={card.id} card={card} as={card.kind === "joker" ? jokerAs(meld, i) : null} style={{ zIndex: i }} />
      ))}
    </div>
  );
}
