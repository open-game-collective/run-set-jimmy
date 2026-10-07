import type { RoomPublicContext } from "../../room.types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The seats along the bottom of the TV: who's in, whose turn, cards left, down or not, buys used. */
export function Seats({ pub }: { pub: RoomPublicContext }) {
  const playing = pub.round > 0;
  const away = new Set(pub.households.filter((h) => h.away).flatMap((h) => h.seats));
  return (
    <footer className={`seats n${pub.seats.length}`} data-testid="seats">
      {pub.seats.map((s, i) => (
        <div
          key={`${s.name}-${i}`}
          className={`seat ${pub.turn === i ? "turn" : ""} ${s.down ? "down" : ""} ${pub.roundWinner === i ? "out" : ""} ${away.has(i) ? "away" : ""}`}
          data-seat={i}
        >
          <div className="seat-disc">
            {s.avatar ? <img src={s.avatar} alt="" /> : <span>{initials(s.name)}</span>}
            {playing && pub.dealer === i ? <em className="dealer">D</em> : null}
          </div>
          <div className="seat-text">
            <p className="seat-name">{s.name}</p>
            {s.couch ? <p className="seat-couch">{away.has(i) ? `${s.couch} · away` : s.couch}</p> : null}
            {playing ? (
              <p className="seat-meta">
                <span className="seat-cards">{s.cards === 1 ? "1 card" : `${s.cards} cards`}</span>
                {s.down ? <span className="badge">Down</span> : null}
                <span className="buys" aria-label={`${s.buys} of 3 buys used`}>
                  {[0, 1, 2].map((b) => (
                    <i key={b} className={b < s.buys ? "used" : ""} />
                  ))}
                </span>
              </p>
            ) : (
              <p className="seat-meta">{i === 0 ? "Host" : "Ready"}</p>
            )}
          </div>
        </div>
      ))}
    </footer>
  );
}
