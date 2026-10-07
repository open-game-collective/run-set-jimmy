import { RoomContext } from "../../room.context";
import { CardBack } from "../cards";
import { haptic } from "../haptics";
import { sounds } from "../sound";

/** Before each deal: the cutter taps anywhere along the deck. Everyone else waits. */
export function PhoneCut() {
  const send = RoomContext.useSend();
  const mustCut = RoomContext.useSelector((s) => s.private.player?.mustCut === true);
  const cutter = RoomContext.useSelector((s) => (s.public.cutter === null ? null : s.public.seats[s.public.cutter]?.name));
  const round = RoomContext.useSelector((s) => s.public.round);
  const req = RoomContext.useSelector((s) => s.public.requirement?.name ?? "");
  return (
    <div className="phone cut">
      <header className="phone-head">
        <p className="kicker">Round {round} of 7</p>
        <h2 className="req-big">{req}</h2>
      </header>
      {mustCut ? (
        <>
          <p className="cut-ask">Cut the deck: tap anywhere along it. Find a Joker and it's yours.</p>
          <div
            className="cut-deck"
            role="button"
            aria-label="Cut the deck here"
            data-testid="cut-deck"
            onClick={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const at = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
              haptic();
              sounds.tap();
              send({ type: "CUT", at });
            }}
          >
            {Array.from({ length: 18 }, (_, i) => (
              <CardBack key={i} style={{ left: `calc((100% - 70px) * ${i / 17})` }} />
            ))}
          </div>
        </>
      ) : (
        <p className="muted center-text">{cutter ?? "Someone"} is cutting the deck…</p>
      )}
    </div>
  );
}
