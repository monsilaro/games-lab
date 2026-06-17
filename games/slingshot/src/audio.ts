// Procedural WebAudio SFX — "warm papercraft", 100% synthesized (zero assets).
// Real paper/cardboard/wood matter with per-trigger variation so nothing ever
// sounds like a repeated synth beep. Chosen variants (designer handoff):
//   launch=Élastique · thud=Sac de sable · shatter=Déchirure sèche ·
//   targetChime=Marimba · boom=Whoomp grave · levelClear=Harpe · uiTap=Pop doux
//
// Signal path: per-voice nodes → master gain → soft tanh saturator → limiter →
// out, with a small synthesized "room" reverb bus for air/cohesion.
//
// Two platform caveats:
//   • iOS Safari only starts/resumes an AudioContext inside a user gesture, so
//     `unlock()` must be called from a pointer handler (boot tap + sling grab).
//   • iOS Safari has no Vibration API, so `vibrate()` is a no-op there; it fires
//     on Android Chrome and other supporting browsers.

import * as C from './config';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let revBus: GainNode | null = null;
let muted = false;
let vol = C.SFX_MASTER_GAIN;

/** Round-robin bank of pink-tilted noise buffers → paper texture varies per hit. */
let bank: AudioBuffer[] = [];

/** Mute/unmute all SFX (the graph stays up; calls just early-out). */
export function setMuted(m: boolean): void {
  muted = m;
}

/** Live master volume (0..1). Additive helper; unused by the game loop today. */
export function setVolume(v: number): void {
  vol = v;
  if (master) master.gain.value = v;
}

/** Lazily build/resume the audio graph. Safe to call on every gesture. */
export function unlock(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();

    // master chain: bus → soft saturator → limiter → out
    master = ctx.createGain();
    master.gain.value = vol;
    const sat = ctx.createWaveShaper();
    sat.curve = satCurve(1.6);
    sat.oversample = '2x';
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -8;
    lim.knee.value = 24;
    lim.ratio.value = 6;
    lim.attack.value = 0.003;
    lim.release.value = 0.18;
    master.connect(sat).connect(lim).connect(ctx.destination);

    // small warm room for cohesion + air
    revBus = ctx.createGain();
    revBus.gain.value = 1;
    const conv = ctx.createConvolver();
    conv.buffer = roomIR(0.26, 2600);
    const ret = ctx.createGain();
    ret.gain.value = 0.34;
    revBus.connect(conv).connect(ret).connect(sat);

    buildBank();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

const now = (): number => (ctx ? ctx.currentTime : 0);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const choose = (a: AudioBuffer[]): AudioBuffer => a[(Math.random() * a.length) | 0]!;

// --- graph builders -------------------------------------------------------------

/** Soft tanh saturation curve, normalized so |x|≤1 maps to |y|≤1. */
function satCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

/** Synthesized room impulse: lowpassed decaying noise (~`dur` s, `lp` Hz cutoff). */
function roomIR(dur: number, lp: number): AudioBuffer {
  if (!ctx) throw new Error('no ctx');
  const len = (ctx.sampleRate * dur) | 0;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let last = 0;
    const a = Math.exp((-2 * Math.PI * lp) / ctx.sampleRate);
    for (let i = 0; i < len; i++) {
      const e = Math.pow(1 - i / len, 2.5);
      last = a * last + (1 - a) * (Math.random() * 2 - 1);
      d[i] = last * e * 0.7;
    }
  }
  return b;
}

/** Build 5 pink-tilted 0.6 s noise buffers for the round-robin grain texture. */
function buildBank(): void {
  if (!ctx) return;
  bank = [];
  for (let k = 0; k < 5; k++) {
    const b = ctx.createBuffer(1, (ctx.sampleRate * 0.6) | 0, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * w;
      d[i] = w * 0.6 + last * 2.2;
    }
    bank.push(b);
  }
}

/** Route a voice to master, plus an optional wet send to the reverb bus. */
function out(node: AudioNode, wet = 0.18): void {
  if (!ctx || !master) return;
  node.connect(master);
  if (wet > 0 && revBus) {
    const s = ctx.createGain();
    s.gain.value = wet;
    node.connect(s).connect(revBus);
  }
}

/** Optional stereo pan node (Safari-safe); null if unsupported. */
function panNode(panv: number): StereoPannerNode | null {
  if (!ctx || typeof ctx.createStereoPanner !== 'function') return null;
  const p = ctx.createStereoPanner();
  p.pan.value = panv;
  return p;
}

// --- primitives -----------------------------------------------------------------

/** Exponential attack/decay (and optional sustain/release) on a gain param. */
function env(g: AudioParam, t0: number, a: number, d: number, peak: number, sus = 0, rel = 0): void {
  g.cancelScheduledValues(t0);
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(Math.max(0.0003, peak), t0 + a);
  g.exponentialRampToValueAtTime(Math.max(0.0002, sus || 0.0001), t0 + a + d);
  if (rel) g.exponentialRampToValueAtTime(0.0001, t0 + a + d + rel);
}

/** Pitched sub "thump" gliding f0 → f1 — felt weight of an impact. */
function thump(t0: number, f0: number, f1: number, dur: number, peak: number, wet = 0.1): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  env(g.gain, t0, 0.004, dur, peak);
  o.connect(g);
  out(g, wet);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

type Partial = readonly [ratio: number, gain: number, decay: number];

/** Modal struck body = sum of damped sine partials at inharmonic ratios. */
function modal(t0: number, f: number, parts: ReadonlyArray<Partial>, peak: number, wet = 0.22, panv = 0): void {
  if (!ctx) return;
  const pan = panNode(panv);
  const dest: AudioNode = pan ?? master!;
  for (const [r, gm, dec] of parts) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f * r * rand(0.997, 1.003);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0003, peak * gm), t0 + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.003 + dec);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dec + 0.05);
  }
  if (pan) out(pan, wet);
}

/** Short noise transient — attack bite. */
function click(t0: number, peak: number, hz = 1800, panv = 0): void {
  if (!ctx || !master || bank.length === 0) return;
  const s = ctx.createBufferSource();
  s.buffer = choose(bank);
  s.playbackRate.value = rand(0.9, 1.15);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hz;
  const g = ctx.createGain();
  env(g.gain, t0, 0.0006, 0.012, peak);
  const p = panNode(panv);
  s.connect(f).connect(g);
  if (p) g.connect(p).connect(master);
  else g.connect(master);
  s.start(t0, rand(0, 0.3));
  s.stop(t0 + 0.05);
}

interface GrainOpts {
  type?: 'bp' | 'lp';
  freq?: number;
  q?: number;
  peak?: number;
  sweepTo?: number;
  wet?: number;
  pan?: number;
}

/** Filtered-noise grain ('bp' papery / 'lp' airy), optional filter sweep. */
function grain(t0: number, dur: number, o: GrainOpts = {}): void {
  if (!ctx || !master || bank.length === 0) return;
  const { type = 'bp', freq = 2600, q = 1, peak = 0.2, sweepTo = 0, wet = 0.16, pan = 0 } = o;
  const s = ctx.createBufferSource();
  s.buffer = choose(bank);
  s.playbackRate.value = rand(0.85, 1.2);
  const f = ctx.createBiquadFilter();
  f.type = type === 'bp' ? 'bandpass' : 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(80, sweepTo), t0 + dur);
  const g = ctx.createGain();
  env(g.gain, t0, 0.004, dur, peak);
  const p = panNode(pan);
  s.connect(f).connect(g);
  if (p) {
    g.connect(p);
    out(p, wet);
  } else {
    out(g, wet);
  }
  s.start(t0, rand(0, 0.25));
  s.stop(t0 + dur + 0.05);
}

interface CrinkleOpts {
  spread?: number;
  fLo?: number;
  fHi?: number;
  peak?: number;
  wet?: number;
}

/** Scatter of tiny bandpass grains → paper crinkle. */
function crinkle(t0: number, count: number, o: CrinkleOpts = {}): void {
  const { spread = 0.16, fLo = 2200, fHi = 5200, peak = 0.13, wet = 0.18 } = o;
  for (let i = 0; i < count; i++) {
    grain(t0 + Math.random() * spread, rand(0.025, 0.06), {
      type: 'bp',
      freq: rand(fLo, fHi),
      q: rand(4, 9),
      peak: peak * rand(0.5, 1),
      wet,
      pan: rand(-0.4, 0.4),
    });
  }
}

const MAR: ReadonlyArray<Partial> = [
  [1, 1, 0.5],
  [3.95, 0.32, 0.22],
  [10.2, 0.08, 0.1],
];
const KAL: ReadonlyArray<Partial> = [
  [1, 1, 0.6],
  [2.0, 0.4, 0.4],
  [3.01, 0.2, 0.22],
];

/** Marimba ('mar') / kalimba ('kal') mallet note, with optional octave sparkle. */
function mallet(f: number, t0: number, peak: number, sparkle = 0, style: 'mar' | 'kal' = 'mar'): void {
  if (style === 'kal') {
    click(t0, peak * 0.22, 2600, rand(-0.15, 0.15)); // softer, lower-pitched attack (less "peck")
    modal(t0, f, KAL, peak, 0.3, rand(-0.12, 0.12));
  } else {
    click(t0, peak * 0.5, 2400, rand(-0.15, 0.15));
    modal(t0, f, MAR, peak, 0.26, rand(-0.12, 0.12));
  }
  if (sparkle > 0) {
    modal(
      t0 + 0.012,
      f * 2,
      [
        [1, 0.5 * sparkle, 0.3],
        [3, 0.12 * sparkle, 0.14],
      ],
      peak * 0.6,
      0.4,
      rand(-0.2, 0.2),
    );
  }
}

/** Pentatonic of C — rewards can never land on a wrong note. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1567.98, 1760] as const;

// --- public SFX -----------------------------------------------------------------

/** launch — "Élastique": band tension release + paper flick + air whoosh. */
export function launch(): void {
  if (muted || !ctx) return;
  const t = now();
  const j = rand(0.94, 1.07);
  thump(t, 240 * j, 150 * j, 0.16, 0.28, 0.08);
  modal(t, 196 * j, [[1, 0.5, 0.14], [2.4, 0.18, 0.08]], 0.18, 0.14, rand(-0.1, 0.1));
  crinkle(t, 3, { spread: 0.05, fLo: 2600, fHi: 4200, peak: 0.12 });
  grain(t + 0.01, 0.2, { type: 'lp', freq: 500, sweepTo: 1700, q: 0.7, peak: 0.12, wet: 0.1, pan: rand(-0.2, 0.2) });
}

/** thud(rel) — "Sac de sable": very matte, dull, no tonality. rel ≈ 0..14+. */
export function thud(rel: number): void {
  if (muted || !ctx) return;
  const t = now();
  const v = Math.min(1, rel / 12);
  const j = rand(0.9, 1.1);
  thump(t, (96 + v * 30) * j, 42 * j, 0.14, 0.26 + v * 0.26, 0.05);
  grain(t, 0.1 + v * 0.05, { type: 'lp', freq: 420 + v * 320, q: 0.6, peak: 0.2 + v * 0.22, sweepTo: 220, wet: 0.08, pan: rand(-0.3, 0.3) });
  grain(t + 0.01, 0.05, { type: 'bp', freq: 900, q: 1.2, peak: 0.08 + v * 0.1, wet: 0.06 });
}

/** shatter(material) — "Déchirure sèche": crisp rip + snap, per-material flavour. */
export function shatter(material: C.BlockMaterial): void {
  if (muted || !ctx) return;
  const t = now();
  const j = rand(0.93, 1.08);
  click(t, 0.2, 2600, rand(-0.2, 0.2));
  if (material === 'ice') {
    for (let i = 0; i < 5; i++) {
      grain(t + i * rand(0.012, 0.03), 0.04, { type: 'bp', freq: rand(3800, 7200), q: 9, peak: 0.12, wet: 0.18, pan: rand(-0.5, 0.5) });
    }
  } else if (material === 'stone') {
    thump(t, 150 * j, 64 * j, 0.1, 0.32, 0.05);
    grain(t, 0.07, { type: 'bp', freq: 1100, q: 2, peak: 0.2, sweepTo: 500, wet: 0.1 });
    click(t + 0.01, 0.16, 900);
  } else {
    // wood / balloon / bouncy → paper rip (two gliding bandpass grains)
    grain(t, 0.11, { type: 'bp', freq: 3000 * j, q: 5, peak: 0.24, sweepTo: 1100, wet: 0.16, pan: rand(-0.3, 0.3) });
    grain(t + 0.03, 0.09, { type: 'bp', freq: 2000, q: 6, peak: 0.16, sweepTo: 700, wet: 0.12 });
  }
}

/** targetChime(combo) — "Marimba": warm wood mallet, climbs the pentatonic. */
export function targetChime(combo: number): void {
  if (muted || !ctx) return;
  const t = now();
  const f = PENTA[Math.max(0, Math.min(combo - 1, PENTA.length - 1))]! * rand(0.997, 1.004);
  const sp = Math.max(0, Math.min(1, (combo - 2) * 0.4));
  mallet(f, t, 0.34, sp, 'mar');
  if (combo >= 4) mallet(f * 1.5, t + 0.04, 0.16, sp * 0.6, 'mar');
}

/** boom — "Whoomp grave": deep cinematic-soft paper poof (felt, no blast). */
export function boom(): void {
  if (muted || !ctx) return;
  const t = now();
  const j = rand(0.96, 1.05);
  thump(t, 100 * j, 26 * j, 0.6, 0.8, 0.28);
  thump(t + 0.01, 60 * j, 30 * j, 0.4, 0.4, 0.16);
  grain(t, 0.42, { type: 'lp', freq: 900, sweepTo: 160, q: 0.7, peak: 0.3, wet: 0.2 });
  crinkle(t + 0.02, 6, { spread: 0.3, fLo: 1200, fHi: 3000, peak: 0.1, wet: 0.18 });
}

/** levelClear(stars) — "Harpe": gentle ascending pentatonic run, no pad.
 *  Clean climb straight up PENTA (no leaps), slower spacing, soft decrescendo,
 *  one mild sparkle on the final note. More stars = a couple extra notes. */
export function levelClear(stars: number): void {
  if (muted || !ctx) return;
  const t = now();
  const s = Math.max(0, Math.min(2, stars));
  const n = 5 + s; // 5..7 notes
  const dt = 0.09; // slower than the old 0.06 → less frantic
  for (let i = 0; i < n; i++) {
    const f = PENTA[i % PENTA.length]! * (i >= PENTA.length ? 2 : 1); // straight ascending climb
    const peak = 0.2 * (1 - i / (n * 2.4)); // gentle decrescendo as it rises
    mallet(f, t + i * dt, peak, i === n - 1 ? 0.35 : 0, 'kal'); // only the last note sparkles, softly
  }
}

/** uiTap — "Pop doux": soft felted little bubble. */
export function uiTap(): void {
  if (muted || !ctx) return;
  const t = now();
  const j = rand(0.97, 1.04);
  thump(t, 420 * j, 200 * j, 0.07, 0.22, 0.05);
  click(t, 0.1, 2600);
}

// --- haptics --------------------------------------------------------------------
/** Vibration if supported (no-op on iOS Safari). */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
