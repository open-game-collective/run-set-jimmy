/**
 * Every sound is synthesized: a card flick (filtered noise), a buy chime, a rising arpeggio when
 * someone goes down, a short fanfare when someone goes out, and a soft tick in the buy window.
 * One AudioContext per page; parked by the OGS launcher → silent (audio-pause.ts).
 */
import { createAudioPause } from "./audio-pause";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

const pause = createAudioPause(() => ctx);
export const setSoundPaused = (paused: boolean): void => pause.setPaused(paused);

/** Creates (or resumes) the shared context. The TV calls it on load; phones on their first tap. */
export function startSound(): AudioContext {
  if (!ctx) {
    // iOS: play like a game, so the silent switch doesn't mute it.
    const session: unknown = Reflect.get(navigator, "audioSession");
    if (session && typeof session === "object") Reflect.set(session, "type", "playback");
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended" && pause.unlocked(ctx)) void ctx.resume();
  return ctx;
}

/** Resume on the first tap or click (browsers that blocked autoplay). */
export function resumeOnGesture(): void {
  const go = () => {
    startSound();
    window.removeEventListener("pointerdown", go);
  };
  window.addEventListener("pointerdown", go);
}

function ready(): { c: AudioContext; out: GainNode } | null {
  if (!ctx || !master || ctx.state !== "running" || pause.paused()) return null;
  return { c: ctx, out: master };
}

function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "triangle"): void {
  const r = ready();
  if (!r) return;
  const t = r.c.currentTime + at;
  const osc = r.c.createOscillator();
  const g = r.c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(r.out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** A card sliding off the deck: a short band of filtered noise. */
export function flick(at = 0, bright = 1): void {
  const r = ready();
  if (!r || !noise) return;
  const t = r.c.currentTime + at;
  const src = r.c.createBufferSource();
  src.buffer = noise;
  const band = r.c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2400 * bright;
  band.Q.value = 0.9;
  const g = r.c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  src.connect(band).connect(g).connect(r.out);
  src.start(t, Math.random() * 0.3, 0.12);
}

// A major-sixth lounge palette (C6): every cue harmonizes with the others.
const NOTES = [261.63, 329.63, 392.0, 440.0, 523.25, 659.25, 783.99, 880.0];

export const sounds = {
  draw: () => flick(0, 0.9),
  take: () => {
    flick(0, 1.1);
    tone(NOTES[2] ?? 392, 0.02, 0.18, 0.12);
  },
  discard: () => flick(0, 1.25),
  buy: () => {
    tone(NOTES[4] ?? 523, 0, 0.35, 0.16, "sine");
    tone(NOTES[6] ?? 784, 0.07, 0.4, 0.12, "sine");
  },
  bought: () => {
    flick(0);
    flick(0.08);
    tone(NOTES[5] ?? 659, 0.05, 0.3, 0.12, "sine");
  },
  down: () => [0, 1, 2, 3, 4].forEach((i) => tone(NOTES[i + 1] ?? 440, i * 0.07, 0.5, 0.13)),
  play: () => {
    flick(0, 1.05);
    tone(NOTES[3] ?? 440, 0.02, 0.2, 0.08, "sine");
  },
  out: () => {
    [0, 2, 4, 7].forEach((i, k) => tone(NOTES[i] ?? 523, k * 0.11, 0.9, 0.14));
    [0, 0.05, 0.1, 0.15, 0.2].forEach((at) => flick(at, 0.8 + at));
  },
  joker: () => [7, 6, 7, 6, 7].forEach((i, k) => tone(NOTES[i] ?? 880, k * 0.06, 0.25, 0.08, "sine")),
  tick: () => tone(NOTES[7] ?? 880, 0, 0.05, 0.04, "square"),
  tap: () => tone(NOTES[4] ?? 523, 0, 0.06, 0.05, "sine"),
  oops: () => {
    tone(196, 0, 0.18, 0.1, "sawtooth");
    tone(185, 0.09, 0.2, 0.08, "sawtooth");
  },
} as const;

export type SoundKind = keyof typeof sounds;

/** Plays the sound for a TV log entry's kind, if it has one. */
export function soundForLog(kind: string): void {
  if (kind in sounds) sounds[kind as SoundKind]();
  else if (kind === "cut") flick();
}

/** The gameplay recorder (e2e/record-game.ts) records the TV's sound through this tap (?record). */
export function captureStream(): MediaStream | null {
  if (!ctx || !master) return null;
  const dest = ctx.createMediaStreamDestination();
  master.connect(dest);
  return dest.stream;
}
