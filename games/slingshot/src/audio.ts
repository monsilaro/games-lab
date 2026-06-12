// Procedural WebAudio SFX (zero assets — every sound is synthesized) plus a
// guarded haptics helper. Two platform caveats:
//   • iOS Safari only starts/resumes an AudioContext inside a user gesture, so
//     `unlock()` must be called from a pointer handler (boot tap + sling grab).
//   • iOS Safari has no Vibration API, so `vibrate()` is a no-op there; it fires
//     on Android Chrome and other supporting browsers.

import * as C from './config';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let ambientOn = false;

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
    if (C.AMBIENT_ENABLED) startAmbient();
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

/** A pitched blip with an attack/decay envelope, optionally gliding + delayed. */
function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  glideTo?: number,
  delay = 0,
): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A filtered noise burst (impacts / shatter / explosion body). */
function noise(dur: number, gain: number, filterType: BiquadFilterType, freq: number): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// --- public SFX -----------------------------------------------------------------
export function launch(): void {
  tone(420, 0.22, 'sawtooth', 0.22, 90); // downward whoosh
}

export function thud(rel: number): void {
  const amt = Math.min(1, rel / 12);
  tone(70, 0.16, 'sine', 0.16 + 0.28 * amt, 45);
  noise(0.09, 0.05 + 0.12 * amt, 'lowpass', 600);
}

export function shatter(material: C.BlockMaterial): void {
  const bright = material === 'ice';
  noise(bright ? 0.22 : 0.14, bright ? 0.17 : 0.11, 'highpass', bright ? 2600 : 1300);
}

export function targetChime(combo: number): void {
  const f = 600 + Math.min(combo - 1, 6) * 130; // pitch climbs with the combo
  tone(f, 0.28, 'triangle', 0.22, f * 1.4);
}

export function boom(): void {
  tone(50, 0.5, 'sine', 0.4, 28);
  noise(0.4, 0.28, 'lowpass', 420);
}

export function levelClear(stars: number): void {
  const notes = [523, 659, 784, 1046];
  for (let i = 0; i <= stars && i < notes.length; i++) {
    tone(notes[i]!, 0.18, 'triangle', 0.22, undefined, i * 0.12);
  }
}

export function uiTap(): void {
  tone(880, 0.05, 'square', 0.09);
}

/** Optional sustained drone pad — off by default (AMBIENT_ENABLED). */
function startAmbient(): void {
  if (!ctx || !master || ambientOn) return;
  ambientOn = true;
  const g = ctx.createGain();
  g.gain.value = 0.04;
  g.connect(master);
  for (const f of [55, 82.5]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(g);
    osc.start();
  }
}

// --- haptics --------------------------------------------------------------------
/** Vibration if supported (no-op on iOS Safari). */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
