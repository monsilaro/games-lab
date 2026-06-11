// All tuning lives here. Tweak, push, replay.

import { AURORA } from '@games-lab/shared';

// "Aurora borealis" palette (shared theme) — the orange warmth belongs to the
// projectile ONLY; everything else stays cold.
export const PALETTE = {
  sky: AURORA.night,
  snow: AURORA.snow, // ground band
  blockDark: AURORA.deepBlue,
  blockLight: AURORA.slateBlue,
  projectile: AURORA.ember, // the ONLY warm color
  trail: AURORA.emberLight,
  target: AURORA.auroraGreen,
  targetCore: AURORA.night, // inner disc that makes targets read as rings
  sling: AURORA.violet,
  preview: AURORA.iceCyan,
  star: AURORA.white,
} as const;

// view / world — 1 unit ≈ 1 m, y up, ground top surface at y = 0.
// The playfield spans x ∈ [-1, MIN_VIEW_WIDTH - 1] and is always fully visible:
// on narrow portrait screens the camera zooms out to guarantee MIN_VIEW_WIDTH.
export const WORLD_HEIGHT = 14; // world units visible vertically (min)
export const MIN_VIEW_WIDTH = 24; // world units guaranteed visible horizontally
export const GROUND_Y = 0;
export const SNOW_BAND = 1.4; // visible snow strip below GROUND_Y
export const STAR_COUNT = 70;
export const MAX_DT = 0.05; // clamp delta time (background tab, hiccups), s

// physics — matter runs directly in world units (see physics.ts)
export const FIXED_DT = 1 / 60; // fixed matter timestep, s
export const GRAVITY = 20; // units/s² (snappier than 9.8 at this scale)

// slingshot
export const ANCHOR = { x: 2.2, y: 2.6 } as const; // pouch rest position
export const LAUNCH_K = 4.5; // launch speed (units/s) per unit of drag
export const V_MAX = 22; // speed cap → 45° range ≈ V_MAX²/GRAVITY ≈ 24 units
export const MAX_DRAG = V_MAX / LAUNCH_K;
export const MIN_DRAG = 0.3; // below this, release cancels instead of firing
export const BALL_RADIUS = 0.32;
export const BALL_DENSITY = 0.004; // ~4× block density: satisfying knockdowns
export const BALL_RESTITUTION = 0.4;
export const BALL_FRICTION = 0.5;
export const PREVIEW_DOTS = 22; // dashed trajectory arc
export const PREVIEW_STEP = 4; // physics ticks between consecutive dots

// blocks
export const COL_W = 0.35; // vertical column size
export const COL_H = 1.2;
export const PLANK_H = 0.3; // horizontal plank thickness
export const PLANK_OVERHANG = 0.8; // plank width = column gap + this
export const BLOCK_FRICTION = 0.6;

// targets
export const TARGET_RADIUS = 0.34;
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
export const IMPACT_BURST = 6; // particles per hard impact
export const KILL_BURST = 14; // particles per eliminated target
export const PARTICLE_POOL = 64;
export const PARTICLE_SPEED = 4.5; // units/s
export const PARTICLE_LIFE = 0.5; // s
export const TRAIL_LENGTH = 3; // fading sprites behind the flying ball
export const TRAIL_INTERVAL = 0.05; // s between trail stamps
export const TRAIL_LIFE = 0.35; // s for a stamp to fade out

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
export const GAP_MIN = 1.1; // column gap — keep > 2·TARGET_RADIUS + margin
export const GAP_MAX = 1.6;
export const GAP_SHRINK = 0.9; // gap multiplier per floor going up
export const FLOOR_JITTER = 0.05; // ≪ COL_W so towers stay stable
