import { onOgsPause, reportOgsRoom, reportOgsSitting } from "@open-game-system/profile-kit";
import { useOgsProfile, useOgsSession } from "@open-game-system/profile-kit/react";
import { useCallback, useEffect, useRef } from "react";
import { sittingReport } from "../game/sitting";
import { RoomContext } from "../room.context";
import { callerToken, claimOgs } from "./ogs-claim";

/**
 * OGS on the TV: says which room it shows (ogs:room, so the couch's phones follow), tells the room
 * who this TV's couch is (its session token), and marks that household away while the launcher
 * parks it. In a plain browser none of this does anything.
 */
export function useOgsTv(): void {
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const send = RoomContext.useSend();
  const session = useOgsSession();
  const token = session?.token ?? "";
  useEffect(() => {
    if (session) reportOgsRoom(roomCode);
  }, [session, roomCode]);
  useEffect(() => {
    const t = callerToken(location.href);
    if (token && t) void claimOgs({ fetch: (u, i) => fetch(u, i), room: roomCode, t, token });
  }, [token, roomCode]);
  useEffect(() => onOgsPause((paused) => send({ type: "AWAY", away: paused })), [send]);
}

/**
 * OGS on a phone: before taking a seat, tell the room who this phone is (the verified profile names
 * the seat) and which household it sits with. Resolves at once in a plain browser.
 */
export function useClaim(): () => Promise<void> {
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const profile = useOgsProfile();
  const token = profile?.token ?? "";
  const claimed = useRef<{ token: string; done: Promise<unknown> } | null>(null);
  return useCallback(async () => {
    const t = callerToken(location.href);
    if (!token || !t) return;
    if (claimed.current?.token !== token) claimed.current = { token, done: claimOgs({ fetch: (u, i) => fetch(u, i), room: roomCode, t, token }) };
    await claimed.current.done;
  }, [token, roomCode]);
}

/**
 * Tells OGS this sitting's label ("Room KQTP", then "Round 3 of 7") whenever it changes: through the
 * app bridge inside the OGS app, to the launcher on a framed TV, nowhere in a plain browser.
 * `resume`: report this page's own URL as where to come back to (the phone's, not the TV's).
 */
export function useOgsSitting(resume: boolean): void {
  const roomCode = RoomContext.useSelector((s) => s.public.roomCode);
  const round = RoomContext.useSelector((s) => s.public.round);
  const gameOver = RoomContext.useSelector((s) => s.value === "gameOver");
  const report = sittingReport({ roomCode, round, gameOver, ...(resume ? { resumeUrl: location.href } : {}) });
  const key = `${report.instanceId}|${report.status}|${report.title}`;
  // Reporting is a side effect on an external system (OGS), keyed by the label itself.
  useEffect(() => {
    reportOgsSitting(report);
  }, [key]);
}
