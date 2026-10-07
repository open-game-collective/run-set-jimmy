import { describe, expect, it } from "vitest";
import { createAudioPause, type PausableContext } from "./audio-pause";

function fakeCtx(state: AudioContextState = "running") {
  const calls: string[] = [];
  const ctx: PausableContext = {
    state,
    suspend: () => {
      calls.push("suspend");
      ctx.state = "suspended";
      return Promise.resolve();
    },
    resume: () => {
      calls.push("resume");
      ctx.state = "running";
      return Promise.resolve();
    },
  };
  return { ctx, calls };
}

describe("parking the game (OGS launcher ogs:suspend / ogs:resume)", () => {
  it("suspends playing audio while parked and resumes it on Continue", () => {
    const { ctx, calls } = fakeCtx("running");
    const gate = createAudioPause(() => ctx);
    gate.setPaused(true);
    expect(ctx.state).toBe("suspended");
    expect(gate.paused()).toBe(true);
    gate.setPaused(false);
    expect(ctx.state).toBe("running");
    expect(gate.paused()).toBe(false);
    expect(calls).toEqual(["suspend", "resume"]);
  });

  it("does nothing when sound was never unlocked", () => {
    const gate = createAudioPause(() => null);
    gate.setPaused(true);
    gate.setPaused(false);
    expect(gate.paused()).toBe(false);
  });

  it("does not start sound on resume that was not playing before the park", () => {
    const { ctx, calls } = fakeCtx("suspended");
    const gate = createAudioPause(() => ctx);
    gate.setPaused(true);
    gate.setPaused(false);
    expect(ctx.state).toBe("suspended");
    expect(calls).toEqual([]);
  });

  it("ignores repeated suspends and resumes", () => {
    const { ctx, calls } = fakeCtx("running");
    const gate = createAudioPause(() => ctx);
    gate.setPaused(true);
    gate.setPaused(true);
    gate.setPaused(false);
    gate.setPaused(false);
    expect(calls).toEqual(["suspend", "resume"]);
    expect(ctx.state).toBe("running");
  });

  it("keeps a sound unlocked while parked silent until Continue, then plays it", () => {
    const gate = createAudioPause(() => null);
    gate.setPaused(true);
    const { ctx, calls } = fakeCtx("running");
    expect(gate.unlocked(ctx)).toBe(false);
    expect(ctx.state).toBe("suspended");
    gate.setPaused(false);
    expect(calls).toEqual(["suspend", "resume"]);
    expect(ctx.state).toBe("running");
  });

  it("plays on Continue a sound unlocked while parked even if the browser had it suspended", () => {
    const gate = createAudioPause(() => null);
    gate.setPaused(true);
    const { ctx, calls } = fakeCtx("suspended");
    expect(gate.unlocked(ctx)).toBe(false);
    expect(ctx.state).toBe("suspended");
    gate.setPaused(false);
    expect(calls).toEqual(["resume"]);
  });

  it("lets an unlock run normally when not parked", () => {
    const { ctx, calls } = fakeCtx("suspended");
    const gate = createAudioPause(() => ctx);
    expect(gate.unlocked(ctx)).toBe(true);
    expect(calls).toEqual([]);
  });
});
