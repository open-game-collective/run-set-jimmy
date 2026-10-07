/**
 * The OGS launcher parks a game (Home, or another game) without unloading it, so Continue resumes
 * instantly. While parked, every sound must stop: this gate suspends the shared AudioContext and
 * resumes it on Continue, but only if it was playing before (sound that was never unlocked stays off).
 */
export type PausableContext = {
  state: AudioContextState;
  suspend(): Promise<void>;
  resume(): Promise<void>;
};

export type AudioPause = {
  setPaused(paused: boolean): void;
  paused(): boolean;
  /** An unlock happened; returns whether it may make sound now (false while parked). */
  unlocked(ctx: PausableContext): boolean;
};

export function createAudioPause(getCtx: () => PausableContext | null): AudioPause {
  let paused = false;
  let parked: PausableContext | null = null;

  const park = (ctx: PausableContext) => {
    if (ctx.state !== "running") return;
    parked = ctx;
    void ctx.suspend();
  };

  return {
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) {
        const ctx = getCtx();
        if (ctx) park(ctx);
        return;
      }
      const ctx = parked;
      parked = null;
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    paused: () => paused,
    unlocked(ctx) {
      if (!paused) return true;
      // The unlock asked for sound: keep it silent now, play it on Continue.
      parked = ctx;
      if (ctx.state === "running") void ctx.suspend();
      return false;
    },
  };
}
