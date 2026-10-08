import { useOgsSession } from "@open-game-system/profile-kit/react";
import qrcode from "qrcode-generator";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ROUNDS } from "../../game/round";
import { cardName } from "../../game/words";
import { RoomContext } from "../../room.context";
import type { RoomPublicContext } from "../../room.types";
import { CardBack, MeldCards, PlayingCard, meldTitle } from "../cards";
import { useOgsSitting, useOgsTv } from "../ogs";
import { useDeadlineNudge } from "../useDeadlineNudge";
import { soundForLog, sounds } from "../sound";
import { Seats } from "./Seats";

type Pub = RoomPublicContext;

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 2);
}

/** Scales the 1920×1080 stage to whatever the TV (or laptop window) is. */
function useStageScale(): number {
  const [scale, setScale] = useState(() => Math.min(innerWidth / 1920, innerHeight / 1080));
  useEffect(() => {
    const onResize = () => setScale(Math.min(innerWidth / 1920, innerHeight / 1080));
    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);
  return scale;
}

/** Plays each new log entry's sound once. */
function useLogSounds(log: Pub["log"]): void {
  const last = useRef(log.at(-1)?.seq ?? 0);
  useEffect(() => {
    for (const entry of log) if (entry.seq > last.current) soundForLog(entry.kind);
    last.current = Math.max(last.current, log.at(-1)?.seq ?? 0);
  }, [log]);
}

const STATE_LABELS = { lobby: "lobby", cutting: "cutting", roundOver: "roundOver", gameOver: "gameOver" } as const;

export function TvScreen({ joinUrl }: { joinUrl: string }) {
  useOgsTv();
  useDeadlineNudge();
  useOgsSitting(false);
  const scale = useStageScale();
  const pub = RoomContext.useSelector((s) => s.public);
  const value = RoomContext.useSelector((s) => s.value);
  const phase = typeof value === "string" ? STATE_LABELS[value] : "playing";
  useLogSounds(pub.log);

  return (
    <div className="tv-viewport">
      <div className="stage" style={{ "--scale": scale } as CSSProperties} data-phase={phase} data-round={pub.round}>
        <div className="lamp" aria-hidden />
        {phase === "lobby" ? (
          <Lobby pub={pub} joinUrl={joinUrl} />
        ) : (
          <>
            <RoundBanner pub={pub} />
            {phase === "cutting" ? <Cutting pub={pub} /> : null}
            {phase === "playing" ? (
              <>
                <Pile pub={pub} />
                <Table pub={pub} />
              </>
            ) : null}
            {phase === "roundOver" || phase === "gameOver" ? <Scoreboard pub={pub} final={phase === "gameOver"} /> : null}
            {phase === "playing" || phase === "cutting" ? <Ticker log={pub.log} /> : null}
          </>
        )}
        <Seats pub={pub} />
      </div>
    </div>
  );
}

function Wordmark({ big = false }: { big?: boolean }) {
  return (
    <h1 className={`wordmark ${big ? "big" : ""}`}>
      <span>Run</span>
      <span className="amp">Set</span>
      <span>Jimmy</span>
    </h1>
  );
}

function Lobby({ pub, joinUrl }: { pub: Pub; joinUrl: string }) {
  // Inside OGS the launcher shows how to join; a plain browser shows the game's own code and QR.
  const session = useOgsSession();
  const inOgs = session !== null && session !== undefined;
  const qr = useMemo(() => qrDataUrl(joinUrl), [joinUrl]);
  const host = pub.hostSeat === null ? null : pub.seats[pub.hostSeat];
  return (
    <div className="tv-lobby">
      <Wordmark big />
      <p className="tagline">Seven rounds of runs and sets. Lowest score wins.</p>
      <div className="lobby-row">
        {!inOgs && session !== undefined ? (
          <div className="join-card" data-testid="tv-join">
            <img src={qr} alt="" className="join-qr" />
            <div>
              <p className="kicker">Join on your phone</p>
              <p className="join-code" data-testid="room-code">
                {pub.roomCode}
              </p>
              <p className="join-url">{joinUrl.replace(/^https?:\/\//, "")}</p>
            </div>
          </div>
        ) : null}
        <div className="lobby-rules">
          {["One run, one set", "Two sets", "Two runs", "Two sets, one run", "Two runs, one set", "Three sets", "Three runs"].map((r, i) => (
            <p key={r}>
              <b>{i + 1}</b>
              {r}
            </p>
          ))}
        </div>
      </div>
      <p className="lobby-wait">
        {pub.seats.length === 0
          ? "Waiting for players…"
          : pub.canStart
            ? `${host?.name ?? "The host"} deals when everyone's in.`
            : "One more player to start."}
      </p>
    </div>
  );
}

function RoundBanner({ pub }: { pub: Pub }) {
  return (
    <header className="round-banner">
      <Wordmark />
      <p className="round-of">
        Round {pub.round} <span>of {ROUNDS}</span>
      </p>
      <p className="requirement" data-testid="requirement">
        {pub.requirement?.name ?? ""}
      </p>
    </header>
  );
}

function Cutting({ pub }: { pub: Pub }) {
  const cutter = pub.cutter === null ? null : pub.seats[pub.cutter];
  return (
    <div className="tv-cutting">
      <div className="cut-fan" aria-hidden>
        {Array.from({ length: 28 }, (_, i) => (
          <CardBack key={i} style={{ transform: `translateX(${(i - 14) * 34}px) rotate(${(i - 14) * 1.4}deg)` }} />
        ))}
      </div>
      <p className="cut-line">
        <b>{cutter?.name ?? "Someone"}</b> is cutting the deck
      </p>
      <p className="cut-sub">Cut a Joker and you keep it.</p>
    </div>
  );
}

/** Seconds left in the buy window, ticking. */
function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [endsAt]);
  return endsAt === null ? 0 : Math.max(0, endsAt - now);
}

function Pile({ pub }: { pub: Pub }) {
  const left = useCountdown(pub.window?.endsAt ?? null);
  const name = (seat: number) => pub.seats[seat]?.name ?? "?";
  const turn = pub.turn === null ? null : pub.seats[pub.turn];
  const lastTick = useRef(0);
  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (pub.window && secs > 0 && secs !== lastTick.current) sounds.tick();
    lastTick.current = secs;
  }, [secs, pub.window]);
  const cut = pub.cut;
  const fresh = cut !== null && pub.log.at(-1)?.kind === (cut.kept ? "joker" : "cut");

  let status = "";
  if (pub.offer) status = `${name(pub.offer.buyer)} wants the ${pub.discardTop ? cardName(pub.discardTop) : "card"}. ${turn?.name ?? ""}: take it or let it go?`;
  else if (pub.turnPhase === "draw") status = `${turn?.name ?? ""} to draw`;
  else if (pub.turnPhase === "play") status = `${turn?.name ?? ""} is playing`;

  return (
    <aside className="pile">
      <div className="pile-row">
        <div className="deck" data-testid="deck">
          <CardBack />
          <CardBack className="d2" />
          <CardBack className="d3" />
          <span className="deck-count">{pub.deckCount}</span>
        </div>
        <div className={`discard ${pub.window ? "open" : ""} ${pub.offer ? "offer" : ""}`} data-testid="discard">
          {pub.discardTop ? <PlayingCard key={pub.discardTop.id} card={pub.discardTop} className="flip-in" /> : <div className="card empty" />}
          {pub.window ? (
            <svg className="ring" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="46" pathLength="100" style={{ strokeDashoffset: 100 - (left / 3000) * 100 }} />
            </svg>
          ) : null}
        </div>
      </div>
      <p className="pile-status" data-testid="pile-status">
        {status}
      </p>
      {pub.window && pub.window.requests.length > 0 ? (
        <p className="buyers">
          {pub.window.requests.map(name).join(", ")} want{pub.window.requests.length === 1 ? "s" : ""} to buy
        </p>
      ) : null}
      {fresh && cut ? (
        <div className={`cut-reveal ${cut.kept ? "kept" : ""}`}>
          <PlayingCard card={cut.card} />
          <p>{cut.kept ? `${name(cut.seat)} keeps the Joker!` : `${name(cut.seat)} cut the ${cardName(cut.card)}`}</p>
        </div>
      ) : null}
    </aside>
  );
}

function Table({ pub }: { pub: Pub }) {
  const byOwner = pub.seats.map((seat, i) => ({ seat, i, melds: pub.melds.filter((m) => m.owner === i) })).filter((g) => g.melds.length > 0);
  const count = pub.melds.length;
  const size = count <= 6 ? "l" : count <= 12 ? "m" : "s";
  return (
    <main className={`table size-${size}`} data-testid="table">
      {byOwner.length === 0 ? (
        <p className="table-empty">
          Nobody is down yet. <span>Go down with {pub.requirement?.name.toLowerCase() ?? ""}.</span>
        </p>
      ) : (
        byOwner.map((g) => (
          <section key={g.i} className={`owner ${pub.turn === g.i ? "turn" : ""}`}>
            <h3>{g.seat.name}</h3>
            <div className="owner-melds">
              {g.melds.map((m) => (
                <figure key={m.id} className="meld">
                  <MeldCards meld={m} />
                  <figcaption>{meldTitle(m)}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}

function Ticker({ log }: { log: Pub["log"] }) {
  const recent = log.slice(-3);
  return (
    <ol className="ticker" aria-live="polite">
      {recent.map((e, i) => (
        <li key={e.seq} className={`log-${e.kind} ${i === recent.length - 1 ? "latest" : ""}`}>
          {e.text}
        </li>
      ))}
    </ol>
  );
}

function Scoreboard({ pub, final }: { pub: Pub; final: boolean }) {
  const order = pub.seats.map((_, i) => i).sort((a, b) => (pub.totals[a] ?? 0) - (pub.totals[b] ?? 0));
  const winner = pub.roundWinner === null ? null : pub.seats[pub.roundWinner];
  return (
    <main className="scoreboard" data-testid="scoreboard">
      <h2>
        {final
          ? pub.winners.length > 1
            ? `${pub.winners.map((w) => pub.seats[w]?.name).join(" and ")} share the win!`
            : `${pub.seats[pub.winners[0] ?? 0]?.name ?? ""} wins the game!`
          : `${winner?.name ?? "Someone"} went out!`}
      </h2>
      <table>
        <thead>
          <tr>
            <th />
            {Array.from({ length: ROUNDS }, (_, r) => (
              <th key={r} className={r === pub.scores.length - 1 && !final ? "now" : ""}>
                {r + 1}
              </th>
            ))}
            <th className="total">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.map((seat, place) => (
            <tr key={seat} className={`${place === 0 ? "lead" : ""} ${pub.winners.includes(seat) ? "winner" : ""}`}>
              <th>{pub.seats[seat]?.name}</th>
              {Array.from({ length: ROUNDS }, (_, r) => {
                const pts = pub.scores[r]?.[seat];
                return (
                  <td key={r} className={pts === 0 ? "zero" : ""}>
                    {pts === undefined ? "" : pts}
                  </td>
                );
              })}
              <td className="total">{pub.totals[seat] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="score-next">
        {final ? `${pub.seats[0]?.name ?? "The host"} can start a new game.` : `${pub.seats[0]?.name ?? "The host"} deals round ${pub.round + 1}.`}
      </p>
    </main>
  );
}
