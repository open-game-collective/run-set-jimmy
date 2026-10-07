import { useRef, useState } from "react";
import type { Card } from "../../game/cards";
import { PlayingCard } from "../cards";
import { moveCard } from "../hand";

const DRAG_START_PX = 10;

/**
 * The player's hand, in their own order: tap to pick a card, drag sideways to move it. Cards that
 * fit the table glow (once down); cards already in the go-down builder are marked.
 */
export function Hand({
  cards,
  selected,
  playable,
  inBuilder,
  onTap,
  onReorder,
  onSort,
}: {
  cards: Card[];
  selected: string | null;
  playable: Set<string>;
  inBuilder: Map<string, number>;
  onTap: (card: Card) => void;
  onReorder: (order: string[]) => void;
  onSort: (by: "suit" | "rank") => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null);

  /** The index in the hand nearest to a screen point (by the cards' current positions). */
  const indexAt = (x: number, y: number): number => {
    const els = Array.from(box.current?.querySelectorAll<HTMLElement>("[data-hand-card]") ?? []);
    let best = 0;
    let bestDist = Infinity;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  };

  return (
    <section className="hand-wrap">
      <div className="hand-tools">
        <span className="kicker">Your hand · {cards.length}</span>
        <button onClick={() => onSort("suit")}>By suit</button>
        <button onClick={() => onSort("rank")}>By rank</button>
      </div>
      <div className={`hand n${Math.min(cards.length, 20)}`} ref={box} data-testid="hand">
        {cards.map((card) => {
          const slot = inBuilder.get(card.id);
          return (
            <div
              key={card.id}
              data-hand-card={card.id}
              className={`hand-card ${selected === card.id ? "selected" : ""} ${playable.has(card.id) ? "playable" : ""} ${
                slot !== undefined ? "in-slot" : ""
              } ${dragging?.id === card.id ? "dragging" : ""}`}
              style={dragging?.id === card.id ? { transform: `translate(${dragging.x}px, ${dragging.y}px)` } : undefined}
              onPointerDown={(e) => {
                drag.current = { id: card.id, x: e.clientX, y: e.clientY, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== card.id) return;
                const dx = e.clientX - d.x;
                const dy = e.clientY - d.y;
                if (!d.moved && Math.hypot(dx, dy) < DRAG_START_PX) return;
                d.moved = true;
                setDragging({ id: card.id, x: dx, y: dy });
              }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                setDragging(null);
                if (!d) return;
                if (!d.moved) return onTap(card);
                onReorder(
                  moveCard(
                    cards.map((c) => c.id),
                    card.id,
                    indexAt(e.clientX, e.clientY),
                  ),
                );
              }}
              onPointerCancel={() => {
                drag.current = null;
                setDragging(null);
              }}
            >
              <PlayingCard card={card} testId="hand-card" />
              {slot !== undefined ? <span className="slot-tag">{slot + 1}</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
