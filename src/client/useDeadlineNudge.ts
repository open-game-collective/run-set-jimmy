import { useEffect } from "react";
import { RoomContext } from "../room.context";
import { nudgeDue } from "./nudge";

const EVERY_MS = 1000;

/**
 * A restarted or sleeping room loses its timers (Durable Object eviction), so the buy window or the
 * cut could hang with everyone waiting. Every screen sends a TICK while a deadline has passed; the
 * room checks it against its own clock and moves on.
 */
export function useDeadlineNudge(): void {
  const send = RoomContext.useSend();
  const windowEnds = RoomContext.useSelector((s) => s.public.window?.endsAt ?? null);
  const cutEnds = RoomContext.useSelector((s) => (s.value === "cutting" ? s.public.cutEndsAt : null));
  const aiAt = RoomContext.useSelector((s) => s.public.aiActAt);
  useEffect(() => {
    if (windowEnds === null && cutEnds === null && aiAt === null) return;
    const timer = setInterval(() => {
      if (nudgeDue([windowEnds, cutEnds, aiAt], Date.now())) send({ type: "TICK" });
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [windowEnds, cutEnds, aiAt, send]);
}
