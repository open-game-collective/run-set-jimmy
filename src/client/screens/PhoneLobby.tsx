import { RoomContext } from "../../room.context";
import { HostPanel, type Hosting } from "./HostPanel";
import { InstallOffer } from "../install";

/** Lobby: who's at the table, in turn order. The host can match the order to the couch, then deal. */
export function PhoneLobby({ hosting }: { hosting: Hosting | null }) {
  const send = RoomContext.useSend();
  const seats = RoomContext.useSelector((s) => s.public.seats);
  const me = RoomContext.useSelector((s) => s.private.player);
  const canStart = RoomContext.useSelector((s) => s.public.canStart);
  const isHost = me?.isHost === true;
  return (
    <div className="phone lobby">
      <header className="phone-head">
        <h1 className="wordmark small">
          <span>Run</span>
          <span className="amp">Set</span>
          <span>Jimmy</span>
        </h1>
        <p className="muted">{isHost ? "You're hosting." : `You're in, ${seats[me?.seat ?? 0]?.name ?? ""}.`}</p>
      </header>
      {isHost && hosting ? <HostPanel hosting={hosting} /> : null}
      <section className="lobby-seats">
        <p className="kicker">Turn order {isHost ? "(match the couch, left to right)" : ""}</p>
        <ol>
          {seats.map((s, i) => (
            <li key={`${s.name}-${i}`} className={i === me?.seat ? "me" : ""} data-testid="lobby-seat">
              <span className="seat-no">{i + 1}</span>
              <span className="seat-label">
                {s.name}
                {s.couch ? <small>{s.couch}</small> : null}
              </span>
              {isHost ? (
                <span className="seat-tools">
                  <button aria-label={`Move ${s.name} earlier`} disabled={i === 0} onClick={() => send({ type: "MOVE_SEAT", seat: i, to: i - 1 })}>
                    ↑
                  </button>
                  <button
                    aria-label={`Move ${s.name} later`}
                    disabled={i === seats.length - 1}
                    onClick={() => send({ type: "MOVE_SEAT", seat: i, to: i + 1 })}
                  >
                    ↓
                  </button>
                  {i !== 0 ? (
                    <button aria-label={`Remove ${s.name}`} onClick={() => send({ type: "REMOVE_SEAT", seat: i })}>
                      ×
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <footer className="phone-foot">
        <InstallOffer compact />
        {isHost ? (
          <button className="btn primary big" disabled={!canStart} onClick={() => send({ type: "START" })}>
            {canStart ? `Deal round 1 (${seats.length} players)` : "Waiting for one more player"}
          </button>
        ) : (
          <p className="muted center-text">{seats[0]?.name ?? "The host"} deals when everyone's in.</p>
        )}
      </footer>
    </div>
  );
}
