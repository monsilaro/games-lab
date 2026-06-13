// All tuning lives here. Tweak, push, replay.
//
// Papercraft re-skin: the look is fully theme-driven. One active `Theme` (a flat
// set of paper colors) is pushed into every render module per level via
// `themeForLevel`. The day→night cycle advances one mood per level.

// --- paper moods (the whole look) ----------------------------------------------
export interface ThemeMat {
  woodLight: string;
  woodDark: string;
  ice: string;
  stone: string;
  tnt: string;
  fuse: string; // the "!" glyph on TNT
  balloon: string; // floaty block (buoyant)
  bouncy: string; // ricochet block
}
export interface Theme {
  name: string;
  stars?: boolean; // night: scatter twinkling paper stars; sun reads as a moon
  skyTop: string;
  skyBot: string;
  sun: string;
  sunRing: string;
  cloud: string;
  hillBack: string;
  hillMid: string;
  hillFront: string;
  groundEdge: string;
  mat: ThemeMat;
  target: string;
  targetCore: string;
  sling: string;
  slingDark: string;
  band: string;
  ball: string;
  ballRing: string;
  preview: string;
  confetti: string[];
}

export type ThemeName = 'day' | 'sunset' | 'meadow' | 'night';

export const THEMES: Record<ThemeName, Theme> = {
  day: {
    name: 'Day',
    skyTop: '#ffd58f', skyBot: '#fff4e2',
    sun: '#ffc24d', sunRing: '#ffd882', cloud: '#fffaf2',
    hillBack: '#bcd66e', hillMid: '#8cc057', hillFront: '#69a64d', groundEdge: '#7dba59',
    mat: { woodLight: '#e2895a', woodDark: '#c2663e', ice: '#bfe0e8', stone: '#cbc4b4', tnt: '#e0533f', fuse: '#ffb43c', balloon: '#ff8fab', bouncy: '#8fd3c7' },
    target: '#1f9d8f', targetCore: '#fff6e9',
    sling: '#b07a4f', slingDark: '#875734', band: '#74502f',
    ball: '#ef6f51', ballRing: '#ff9070', preview: '#e98a55',
    confetti: ['#e2895a', '#e9c46a', '#f4a261', '#1f9d8f', '#fffaf2'],
  },
  sunset: {
    name: 'Sunset',
    skyTop: '#f5805e', skyBot: '#ffd7a3',
    sun: '#ff7a45', sunRing: '#ffb06b', cloud: '#ffe7da',
    hillBack: '#94a060', hillMid: '#728c4e', hillFront: '#566f3f', groundEdge: '#67804a',
    mat: { woodLight: '#d97a4f', woodDark: '#a85a36', ice: '#dcc4e4', stone: '#bba99a', tnt: '#d63f4f', fuse: '#ffce6b', balloon: '#ff9eb0', bouncy: '#8fb8a0' },
    target: '#16a394', targetCore: '#fff2e6',
    sling: '#9a6a44', slingDark: '#724b2d', band: '#5e3a22',
    ball: '#ef6f51', ballRing: '#ff9070', preview: '#ff9a6b',
    confetti: ['#d97a4f', '#ffce6b', '#ff7a45', '#16a394', '#ffe7da'],
  },
  meadow: {
    name: 'Meadow',
    skyTop: '#a9def8', skyBot: '#f1fbff',
    sun: '#fff0a8', sunRing: '#ffe27a', cloud: '#ffffff',
    hillBack: '#a3d46c', hillMid: '#74c25b', hillFront: '#4fa358', groundEdge: '#63b35e',
    mat: { woodLight: '#e3a25b', woodDark: '#b87a3e', ice: '#c2e9f5', stone: '#d0d3cd', tnt: '#e0573f', fuse: '#ffc14d', balloon: '#ff9ec0', bouncy: '#9fd6c0' },
    target: '#e76f51', targetCore: '#fff6e9',
    sling: '#b07a4f', slingDark: '#875734', band: '#74502f',
    ball: '#e94f37', ballRing: '#ff7a5f', preview: '#5fa6bb',
    confetti: ['#e3a25b', '#e9c46a', '#e76f51', '#4fa358', '#ffffff'],
  },
  night: {
    name: 'Night',
    stars: true,
    skyTop: '#161d44', skyBot: '#3a3f6e',
    sun: '#f3ecd0', sunRing: '#cdd6f0', cloud: '#525d8a', // sun => pale moon
    hillBack: '#3f6357', hillMid: '#2f4d42', hillFront: '#243c33', groundEdge: '#365446',
    mat: { woodLight: '#d98a5e', woodDark: '#a85f3a', ice: '#9fb8d8', stone: '#8a93a6', tnt: '#e0533f', fuse: '#ffce6b', balloon: '#e58fb0', bouncy: '#7fb8c8' },
    target: '#2fd0b0', targetCore: '#e9f4ef',
    sling: '#b07a4f', slingDark: '#875734', band: '#9a7a55',
    ball: '#ff8a5c', ballRing: '#ffb088', preview: '#ffce8a',
    confetti: ['#ffce6b', '#ff8a5c', '#2fd0b0', '#cdd6f0', '#ffffff'],
  },
};

// Day → night cycle: advance one mood per level when the cycle is on. Meadow is
// a standalone alternate (not part of the cycle).
export const CYCLE: ThemeName[] = ['day', 'sunset', 'night'];
export function themeForLevel(level: number): Theme {
  return THEMES[CYCLE[(level - 1) % CYCLE.length]!];
}

// view / world — 1 unit ≈ 1 m, y up, ground top surface at y = 0.
// The playfield spans x ∈ [-1, MIN_VIEW_WIDTH - 1] and is always fully visible:
// on narrow portrait screens the camera zooms out to guarantee MIN_VIEW_WIDTH.
export const WORLD_HEIGHT = 14; // world units visible vertically (min)
export const MIN_VIEW_WIDTH = 24; // world units guaranteed visible horizontally
export const GROUND_Y = 0;
export const GROUND_BAND = 1.4; // visible ground strip below GROUND_Y (camera framing)
export const STAR_COUNT = 60; // night-only paper stars
export const MAX_DT = 0.05; // clamp delta time (background tab, hiccups), s

// physics — matter runs directly in world units (see physics.ts)
export const FIXED_DT = 1 / 60; // fixed matter timestep, s
export const GRAVITY = 20; // units/s² (snappier than 9.8 at this scale)

// slingshot
export const ANCHOR = { x: 2.7, y: 3.0 } as const; // pouch rest position
export const LAUNCH_K = 4.6; // launch speed (units/s) per unit of drag
export const V_MAX = 23; // speed cap → 45° range ≈ V_MAX²/GRAVITY ≈ 26 units
export const MAX_DRAG = V_MAX / LAUNCH_K;
export const MIN_DRAG = 0.35; // below this, release cancels instead of firing
export const BALL_RADIUS = 0.38;
export const BALL_DENSITY = 0.004; // ~4× block density: satisfying knockdowns
export const BALL_RESTITUTION = 0.36;
export const BALL_FRICTION = 0.5;
export const PREVIEW_DOTS = 28; // dashed trajectory arc
export const PREVIEW_STEP = 7; // physics ticks between consecutive dots
// 28 × 7 = 196 ticks ≈ 3.3 s of flight: a full-power shot is previewed all the
// way down to the ground, never truncated mid-air.

// blocks (chunkier paper silhouettes)
export const COL_W = 0.46; // vertical column size
export const COL_H = 1.3;
export const PLANK_H = 0.4; // horizontal plank thickness
export const PLANK_OVERHANG = 0.95; // plank width = column gap + this
export const BLOCK_FRICTION = 0.6;

// targets
export const TARGET_RADIUS = 0.44;
export const TARGET_PULSE_AMP = 0.06; // scale pulse amplitude
export const TARGET_PULSE_HZ = 1; // pulses per second

// shot flow / settling
export const SETTLE_MIN = 1.0; // s a fresh structure settles before aiming
export const STILL_SPEED = 0.08; // units/s — "not moving" threshold
export const STILL_TIME = 0.8; // s of stillness before auto-advancing a shot
export const SHOT_TIMEOUT = 8.0; // s hard cap per shot (the button skips sooner)

// kills / juice — impact thresholds are relative speeds in units/s
export const KILL_IMPACT = 4.0; // any hit this hard eliminates a target
export const GROUND_KILL_IMPACT = 2.0; // gentler: targets falling to the ground
export const SHAKE_IMPACT = 6.0; // hits this hard shake the screen
export const SHAKE_DURATION = 0.25; // s
export const SHAKE_MAGNITUDE = 0.22; // world units
export const IMPACT_BURST = 8; // confetti bits per hard impact
export const KILL_BURST = 16; // confetti bits per eliminated target

// confetti (flat paper bits — replaces the old ember particle burst)
export const CONFETTI_POOL = 160;
export const CONFETTI_SPEED = 5.5; // units/s initial burst speed
export const CONFETTI_GRAVITY = 16; // units/s² (lighter than the world — paper)
export const CONFETTI_LIFE = 1.1; // s
export const CONFETTI_SIZE = 0.13; // base half-size of a bit (world units)

// slow-mo juice (main.ts) — brief timestep ease-down on big moments
export const SLOWMO_COMBO_DUR = 0.45;
export const SLOWMO_COMBO_SCALE = 0.35;
export const SLOWMO_TNT_DUR = 0.5;
export const SLOWMO_TNT_SCALE = 0.3;

// pools
export const BLOCK_POOL = 48;
export const TARGET_POOL = 8;

// scoring
export const POINTS_PER_TARGET = 50;
export const BONUS_PER_SHOT = 100; // per unspent shot on level clear

// difficulty curve — the single source of truth for level feel
export interface LevelParams {
  towers: number; // 1 → 3
  maxFloors: number; // tower height cap, 1 → 4
  targets: number; // 1 → 6
  shots: number; // budget, tightens with level
  buildXMin: number; // structures start further away as levels go up
  buildXMax: number; // never generate outside the guaranteed view
}

export function levelParams(level: number): LevelParams {
  const targets = Math.min(1 + Math.floor((level + 1) / 2), 6);
  return {
    towers: Math.min(1 + Math.floor((level - 1) / 3), 3),
    maxFloors: Math.min(1 + Math.ceil(level / 2), 4),
    targets,
    shots: Math.max(2, targets + 2 - Math.floor(level / 4)),
    buildXMin: 10 + Math.min(level, 6) * 0.6,
    buildXMax: MIN_VIEW_WIDTH - 2,
  };
}

// tower geometry randomness (levelgen.ts)
export const GAP_MIN = 1.2; // column gap — keep > 2·TARGET_RADIUS + margin
export const GAP_MAX = 1.7;
export const GAP_SHRINK = 0.9; // gap multiplier per floor going up
export const FLOOR_JITTER = 0.05; // ≪ COL_W so towers stay stable

// --- slingshot / aim polish (slingshot.ts) --------------------------------------
export const BAND_WIDTH = 0.12; // thickness of each elastic band quad (world units)

// --- block materials (physics only; the look comes from the theme palette) ------
export type BlockMaterial = 'wood' | 'ice' | 'stone' | 'tnt' | 'balloon' | 'bouncy';
export interface MaterialDef {
  breakImpact: number; // relative speed (units/s) above which it shatters
  density: number; // matter density — wood matches the prior default
  restitution: number;
  burst: number; // confetti bits spawned when it shatters
  buoyant?: boolean; // floats up (balloon) — main applies the rise force
}
export const MATERIALS: Record<BlockMaterial, MaterialDef> = {
  wood: { breakImpact: 6.5, density: 0.001, restitution: 0, burst: 12 },
  ice: { breakImpact: 3.6, density: 0.0007, restitution: 0.12, burst: 18 },
  stone: { breakImpact: 17.0, density: 0.0026, restitution: 0, burst: 8 },
  tnt: { breakImpact: 5.0, density: 0.0013, restitution: 0, burst: 20 },
  balloon: { breakImpact: 2.5, density: 0.0004, restitution: 0.05, burst: 22, buoyant: true }, // pops easily, floats
  bouncy: { breakImpact: 20.0, density: 0.0015, restitution: 0.72, burst: 10 }, // survives, ricochets the ball
};

// balloon buoyancy (main applies this each tick to live buoyant bodies)
export const BALLOON_RISE = 2.2; // target upward speed, units/s
export const BALLOON_DAMP = 0.94; // horizontal velocity damping per tick

// TNT explosion (main.ts orchestrates, physics.ts applies the impulse)
export const TNT_RADIUS = 3.4; // world units of blast reach
export const TNT_SPEED = 17; // outward launch speed (units/s) at the blast center
export const TNT_BURST = 28; // confetti bits on a blast

// --- combo & skill-shot scoring (main.ts) ---------------------------------------
// combo multiplier = number of targets killed so far this shot (1×, 2×, 3× …)
export const COMBO_NAMES = ['', '', 'DOUBLE', 'TRIPLE', 'MULTI', 'WONDERFUL'] as const;
export const SKILL_NOBOUNCE_BONUS = 75; // target killed before the ball first bounces
export const SKILL_LONGSHOT_BONUS = 100; // kill far downrange from the launch point
export const LONGSHOT_DIST = 12; // world units from launch X to the kill
export const STAR3_SPARE = 2; // spare shots on clear → 3 stars
export const STAR2_SPARE = 1; // → 2 stars (else 1)

// --- audio (audio.ts) -----------------------------------------------------------
export const SFX_MASTER_GAIN = 0.36; // 0..1 master volume for the paper SFX
