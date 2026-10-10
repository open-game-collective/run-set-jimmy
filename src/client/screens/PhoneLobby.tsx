import { MAX_PLAYERS, MIN_PLAYERS } from "../../game/cards";
import { RoomContext } from "../../room.context";
import type { RoomPublicContext } from "../../room.types";
import { InstallOffer } from "../install";
import { HostPanel, type Hosting } from "./HostPanel";

type SeatView = RoomPublicContext["seats"][number];

function SeatRow({ s, i, count, me, isHost }: { s: SeatView; i: number; count: number; me: boolean; isHost: boolean }) {
  const send = RoomContext.useSend();
  const hostSeat = RoomContext.useSelector((x) => x.public.hostSeat);
  return (
    <li className={`slot-row ${me ? "me" : ""} ${s.ai ? "ai" : ""}`} data-testid="lobby-seat">
      <span className="seat-no">{i + 1}</span>
      <span className="seat-label">
        {s.name}
        <small>{s.ai ? "AI player" : i === hostSeat ? "Player · host" : "Player"}</small>
        {s.couch ? <small>{s.couch}</small> : null}
      </span>
      {isHost ? (
        <span className="seat-tools">
          <button aria-label={`Move ${s.name} earlier`} disabled={i === 0} onClick={() => send({ type: "MOVE_SEAT", seat: i, to: i - 1 })}>
            ↑
          </button>
          <button aria-label={`Move ${s.name} later`} disabled={i === count - 1} onClick={() => send({ type: "MOVE_SEAT", seat: i, to: i + 1 })}>
            ↓
          </button>
          {i !== hostSeat ? (
            <button aria-label={`Remove ${s.name}`} onClick={() => send({ type: "REMOVE_SEAT", seat: i })}>
              ×
            </button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

function OpenSlot({ n, isHost }: { n: number; isHost: boolean }) {
  const send = RoomContext.useSend();
  return isHost ? (
    <li className="slot-row open">
      <button className="open-slot" onClick={() => send({ type: "ADD_AI" })} data-testid="add-ai">
        <span className="seat-no">{n}</span>
        Open slot <small>Tap to add an AI player</small>
      </button>
    </li>
  ) : (
    <li className="slot-row open">
      <span className="seat-no">{n}</span>
      <span className="open-label">Open slot</span>
    </li>
  );
}

/**
 * Lobby: the table's seven seats, like a game-lobby slot list. People who scanned in fill seats in
 * turn order; the host taps an open slot to put an AI player there, matches the order to the couch,
 * then deals. Three seats (people or AI) are needed.
 */
export function PhoneLobby({ hosting }: { hosting: Hosting | null }) {
  const send = RoomContext.useSend();
  const seats = RoomContext.useSelector((s) => s.public.seats);
  const me = RoomContext.useSelector((s) => s.private.player);
  const canStart = RoomContext.useSelector((s) => s.public.canStart);
  const hostSeat = RoomContext.useSelector((s) => s.public.hostSeat);
  const isHost = me?.isHost === true;
  const open = Math.max(0, MAX_PLAYERS - seats.length);
  const hostName = hostSeat === null ? "The host" : (seats[hostSeat]?.name ?? "The host");
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
        <p className="slots-head">
          <span className="kicker">Turn order {isHost ? "(match the couch)" : ""}</span>
          <span className="player-count" data-testid="player-count">
            Players {seats.length} / {MAX_PLAYERS}
          </span>
        </p>
        <ol className="slots">
          {seats.map((s, i) => (
            <SeatRow key={`${s.name}-${i}`} s={s} i={i} count={seats.length} me={i === me?.seat} isHost={isHost} />
          ))}
          {Array.from({ length: open }, (_, k) => (
            <OpenSlot key={`open-${k}`} n={seats.length + k + 1} isHost={isHost} />
          ))}
        </ol>
      </section>
      <footer className="phone-foot">
        <InstallOffer compact />
        {isHost ? (
          <button className="btn primary big" disabled={!canStart} onClick={() => send({ type: "START" })}>
            {canStart ? `Deal round 1 (${seats.length} players)` : `Need ${MIN_PLAYERS} players: add an AI player`}
          </button>
        ) : (
          <p className="muted center-text">
            {canStart ? `${hostName} deals when everyone's in.` : `${hostName} deals once there are ${MIN_PLAYERS} players.`}
          </p>
        )}
      </footer>
    </div>
  );
}
