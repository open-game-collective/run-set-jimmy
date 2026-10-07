import { ROUNDS } from "../../game/round";
import { RoomContext } from "../../room.context";

/** Between rounds and at the end: this round's points and the running totals. The host deals on. */
export function PhoneScores({ final }: { final: boolean }) {
  const send = RoomContext.useSend();
  const pub = RoomContext.useSelector((s) => s.public);
  const me = RoomContext.useSelector((s) => s.private.player);
  const last = pub.scores.at(-1) ?? [];
  const order = pub.seats.map((_, i) => i).sort((a, b) => (pub.totals[a] ?? 0) - (pub.totals[b] ?? 0));
  const mine = me ? last[me.seat] : undefined;
  const iWon = final && me !== undefined && pub.winners.includes(me.seat);
  return (
    <div className="phone scores">
      <header className="phone-head">
        <p className="kicker">{final ? "Final scores" : `Round ${pub.round} of ${ROUNDS}`}</p>
        <h2 className="req-big">
          {final
            ? iWon
              ? "You win!"
              : `${pub.winners.map((w) => pub.seats[w]?.name).join(" and ")} win${pub.winners.length === 1 ? "s" : ""}`
            : mine === 0
              ? "You went out!"
              : `+${mine ?? 0} points`}
        </h2>
      </header>
      <ol className="standings" data-testid="standings">
        {order.map((seat) => (
          <li key={seat} className={seat === me?.seat ? "me" : ""}>
            <span>{pub.seats[seat]?.name}</span>
            <span className="round-pts">{final ? "" : `+${last[seat] ?? 0}`}</span>
            <b>{pub.totals[seat] ?? 0}</b>
          </li>
        ))}
      </ol>
      <footer className="phone-foot">
        {me?.isHost ? (
          <button className="btn primary big" onClick={() => send({ type: final ? "NEW_GAME" : "NEXT_ROUND" })}>
            {final ? "New game" : `Deal round ${pub.round + 1}`}
          </button>
        ) : (
          <p className="muted center-text">{pub.seats[0]?.name ?? "The host"} deals next.</p>
        )}
      </footer>
    </div>
  );
}
