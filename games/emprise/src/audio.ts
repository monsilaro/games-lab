// Tiny WebAudio synth — no assets (repo rule). One shared context + master gain;
// every SFX is a short oscillator blip/sweep. All calls are no-ops until
// initAudio() runs on the first user gesture (iOS autoplay policy), and nothing
// here ever throws.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  slideTo = 0,
  delay = 0,
): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Soft tick when you take ground; pitch rises with how much (intensity 0..1). */
export function sfxCapture(intensity: number): void {
  blip(320 + intensity * 460, 0.06, 'triangle', 0.1);
}

/** Low buzz when a rival is eating your land. */
export function sfxUnderAttack(): void {
  blip(130, 0.2, 'sawtooth', 0.16, 70);
}

/** Bright two-note reward when a power node changes hands in your favour. */
export function sfxNode(): void {
  blip(660, 0.1, 'triangle', 0.18, 940);
  blip(990, 0.12, 'triangle', 0.16, 0, 0.08);
}

export function sfxWin(): void {
  const notes = [523, 659, 784, 1047];
  for (let i = 0; i < notes.length; i++) blip(notes[i], 0.18, 'triangle', 0.2, 0, i * 0.1);
}

export function sfxLose(): void {
  const notes = [440, 349, 277, 196];
  for (let i = 0; i < notes.length; i++) blip(notes[i], 0.22, 'sawtooth', 0.18, 0, i * 0.12);
}
