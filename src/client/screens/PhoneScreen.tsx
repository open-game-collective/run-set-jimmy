import { useOgsProfile } from "@open-game-system/profile-kit/react";
import { useEffect, useState } from "react";
import { RoomContext } from "../../room.context";
import { useClaim, useOgsSitting } from "../ogs";
import { startSound } from "../sound";
import { useStayConnected } from "../wake";
import { OwnTvPage, type Hosting } from "./HostPanel";
import { PhoneCut } from "./PhoneCut";
import { PhoneLobby } from "./PhoneLobby";
import { PhonePlay } from "./PhonePlay";
import { PhoneScores } from "./PhoneScores";

const TOKEN = /^[0-9a-f-]{36}$/;

/** `?tv=<token>` means this phone started the room (/host): it knows the TV page to show. */
function readHosting(roomCode: string): Hosting | null {
  const tv = new URLSearchParams(location.search).get("tv");
  if (!tv || !TOKEN.test(tv)) return null;
  return { tvUrl: `${location.origin}/tv/${roomCode}?t=${tv}`, joinUrl: `${location.origin}/join/${roomCode}` };
}

function Joining() {
  return (
    <div className="phone center">
      <p className="muted">Joining…</p>
    </div>
  );
}

/** Inside the OGS app: claim the verified profile, then take a seat. No name step. */
function ProfileJoin({ name }: { name: string }) {
  const send = RoomContext.useSend();
  const claim = useClaim();
  useEffect(() => {
    let live = true;
    void claim().then(() => {
      if (live) send({ type: "JOIN", name: name.trim().slice(0, 16) });
    });
    return () => {
      live = false;
    };
  }, [send, name, claim]);
  return <Joining />;
}

/** A plain browser: type a name. */
function NameStep() {
  const send = RoomContext.useSend();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("rsj:name") ?? "";
    } catch {
      return "";
    }
  });
  return (
    <div className="phone center name-step">
      <h1 className="wordmark">
        <span>Run</span>
        <span className="amp">Set</span>
        <span>Jimmy</span>
      </h1>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().slice(0, 16);
          try {
            localStorage.setItem("rsj:name", n);
          } catch {
            // Private mode: the name just isn't remembered.
          }
          send({ type: "JOIN", name: n });
        }}
      >
        <label htmlFor="name">Your name at the table</label>
        <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Name" autoComplete="nickname" />
        <button className="btn primary">Take a seat</button>
      </form>
    </div>
  );
}

function Join() {
  const lobby = RoomContext.useSelector((s) => s.value === "lobby");
  const full = RoomContext.useSelector((s) => s.public.seats.length >= 7);
  const profile = useOgsProfile();
  if (!lobby) {
    return (
      <div className="phone center">
        <p className="muted">A game is already being played at this table. You can join the next one.</p>
      </div>
    );
  }
  if (full) {
    return (
      <div className="phone center">
        <p className="muted">The table is full (7 players).</p>
      </div>
    );
  }
  if (profile === undefined) return <Joining />;
  if (profile) return <ProfileJoin name={profile.name} />;
  return <NameStep />;
}

/**
 * Puts this phone's own view (the public table and its own hand: what its screen shows) on
 * `window.__rsjView`, for the e2e driver and the recorder to read instead of scraping the DOM.
 */
function useExposeView(): void {
  const pub = RoomContext.useSelector((s) => s.public);
  const me = RoomContext.useSelector((s) => s.private.player);
  const value = RoomContext.useSelector((s) => s.value);
  useEffect(() => {
    Reflect.set(window, "__rsjView", { pub, me, value });
  }, [pub, me, value]);
}

/** A phone at the table: joins, then shows whatever the room is doing. */
export function PhoneScreen() {
  const role = RoomContext.useSelector((s) => s.private.role);
  const value = RoomContext.useSelector((s) => s.value);
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const hosting = readHosting(roomCode);
  useStayConnected();
  useOgsSitting(true);
  useExposeView();

  useEffect(() => {
    const unlock = () => startSound();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  if (role === "tv") {
    return (
      <div className="phone center">
        <p className="muted">This screen is the TV.</p>
      </div>
    );
  }
  const body =
    role !== "player" ? (
      <Join />
    ) : value === "lobby" ? (
      <PhoneLobby hosting={hosting} />
    ) : value === "cutting" ? (
      <PhoneCut />
    ) : value === "roundOver" || value === "gameOver" ? (
      <PhoneScores final={value === "gameOver"} />
    ) : (
      <PhonePlay />
    );
  return (
    <>
      {hosting ? <OwnTvPage hosting={hosting} /> : null}
      {body}
    </>
  );
}
