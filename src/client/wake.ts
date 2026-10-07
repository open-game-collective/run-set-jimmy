import { useEffect } from "react";

const STALE_AFTER_MS = 4000;

/**
 * Keeps the phone awake during a mission, and if the page was backgrounded long enough for the
 * socket to drop, reloads it — the rejoin token in the URL puts the phone straight back in its role.
 */
export function useStayConnected(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let hiddenAt = 0;
    const acquire = () => {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => { lock = l; }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) location.reload();
      acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, []);
}
