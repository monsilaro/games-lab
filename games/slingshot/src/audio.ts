// Procedural WebAudio SFX tuned for papercraft — soft, warm, woody. Marimba
// pings, felt thuds, paper rustle. Zero assets; every sound is synthesized.
// Two platform caveats:
//   • iOS Safari only starts/resumes an AudioContext inside a user gesture, so
//     `unlock()` must be called from a pointer handler (boot tap + sling grab).
//   • iOS Safari has no Vibration API, so `vibrate()` is a no-op there; it fires
//     on Android Chrome and other supporting browsers.

import * as C from './config';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

/** Mute/unmute all SFX (the graph stays up; calls just early-out). */
export function setMuted(m: boolean): void {
  muted = m;
}

/** Lazily build/resume the audio graph. Safe to call on every gesture. */
export function unlock(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = C.SFX_MASTER_GAIN;
    master.connect(ctx.destination);
    noiseBuf = makeNoise(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function makeNoise(c: AudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * 0.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

const now = (): number => (ctx ? ctx.currentTime : 0);

/** Attack/decay envelope on a gain param (exponential, click-free). */
function env(g: AudioParam, t0: number, a: number, d: number, peak: number): void {
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

/** A pitched blip, optionally gliding f0 → f1 over its duration. */
function tone(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, peak: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  env(g.gain, t0, 0.006, dur, peak);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** A filtered noise burst — `bp` switches lowpass → bandpass (crinkle/rip). */
function noise(t0: number, dur: number, peak: number, freq: number, bp = false): void {
  if (!ctx || !master || !noiseBuf) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = bp ? 'bandpass' : 'lowpass';
  f.frequency.value = freq;
  if (bp) f.Q.value = 0.7;
  const g = ctx.createGain();
  env(g.gain, t0, 0.004, dur, peak);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.05);
}

/** Soft woody "marimba" note = sine body + a touch of triangle 2nd partial. */
function marimba(f: number, t0: number, peak: number): void {
  tone('sine', f, f, t0, 0.32, peak);
  tone('triangle', f * 2.01, f * 2.01, t0, 0.12, peak * 0.35);
}

// --- public SFX -----------------------------------------------------------------
export function launch(): void {
  if (muted || !ctx) return;
  const t = now();
  noise(t, 0.18, 0.32, 2600); // paper flick
  tone('sine', 200, 110, t, 0.2, 0.32);
}

export function thud(rel: number): void {
  if (muted || !ctx) return;
  const t = now();
  const v = Math.min(1, rel / 12);
  tone('sine', 130, 60, t, 0.16, 0.35 + v * 0.3); // felt thump
  noise(t, 0.07, 0.16 + v * 0.2, 900);
}

export function shatter(material: C.BlockMaterial): void {
  if (muted || !ctx) return;
  const t = now();
  if (material === 'ice') {
    noise(t, 0.18, 0.22, 5200, true); // tissue crinkle
    for (let i = 0; i < 3; i++) tone('triangle', 1300 + Math.random() * 900, 800, t + i * 0.02, 0.1, 0.1);
  } else if (material === 'stone') {
    tone('sine', 120, 70, t, 0.12, 0.22); // cardboard whump
    noise(t, 0.1, 0.2, 700);
  } else {
    noise(t, 0.16, 0.22, 3200, true); // paper rip
    tone('triangle', 320, 180, t, 0.1, 0.14);
  }
}

export function targetChime(combo: number): void {
  if (muted || !ctx) return;
  const steps = [523, 587, 659, 784, 880, 988, 1175]; // pentatonic, climbs with the combo
  const f = steps[Math.min(combo, steps.length) - 1] ?? 523;
  marimba(f, now(), 0.34);
}

export function boom(): void {
  if (muted || !ctx) return;
  const t = now();
  tone('sine', 110, 38, t, 0.4, 0.7); // soft paper "pomf", not a blast
  tone('triangle', 150, 60, t, 0.22, 0.22);
  noise(t, 0.28, 0.34, 1400);
}

export function levelClear(stars: number): void {
  if (muted || !ctx) return;
  const t = now();
  const notes = [523, 659, 784, 1047, 1319];
  for (let i = 0; i <= stars + 1; i++) marimba(notes[i] ?? 1047, t + i * 0.12, 0.3);
}

export function uiTap(): void {
  if (muted || !ctx) return;
  marimba(740, now(), 0.18);
}

// --- haptics --------------------------------------------------------------------
/** Vibration if supported (no-op on iOS Safari). */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
