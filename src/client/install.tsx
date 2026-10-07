import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { useSyncExternalStore } from "react";
import { isFramed } from "./framed";
import { installOffer, shouldRegisterWorker } from "./pwa";

/** Chrome's install prompt event (not in the DOM typings). */
type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Registers the service worker (not on the OGS TV) and catches Chrome's install prompt. Call once per page. */
export function setUpApp(): void {
  const streamed = new URLSearchParams(location.search).has("stream");
  if (shouldRegisterWorker({ supported: "serviceWorker" in navigator, framed: isFramed(window), streamed })) {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || Reflect.get(navigator, "standalone") === true;

function useCanPrompt(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred !== null,
    () => false,
  );
}

/** "Install Run Set Jimmy": a button where the browser can install it, Safari's steps on iOS, else nothing. */
export function InstallOffer({ compact = false }: { compact?: boolean }) {
  const canPrompt = useCanPrompt();
  const offer = installOffer({ inOgs: isOGSCastAvailable(), standalone: isStandalone(), ios: isIos(), canPrompt });
  if (offer === "button") {
    return (
      <button
        className={`btn ${compact ? "ghost" : ""}`}
        onClick={() => {
          void deferred?.prompt();
        }}
      >
        Install Run Set Jimmy on this device
      </button>
    );
  }
  if (offer === "ios-hint") {
    return <p className="install-hint">To keep Run Set Jimmy on your home screen: tap Share, then “Add to Home Screen”.</p>;
  }
  return null;
}
