// Boulon — all tuning lives here. No magic numbers in the systems (spec rule).
// World units ≈ metres. The sim runs in the matter-js FLOOR plane: matter
// (x, y) → three (x, 0, z). The camera is tilted ~50° so the floor reads as a
// 3/4 voxel diorama. Gravity is OFF — motion is scripted, not falling.
//
// Vertical TOWER CLIMBER: you ascend a shaft toward matter −y (which the tilted
// camera projects to the TOP of the screen). A forced scroll drags the view
// upward; robots descend toward you; you auto-fire upward and climb as high as
// you can. Each SECTION (a few screens tall) is a level that ramps difficulty.

import * as THREE from 'three';

// --- Simulation -----------------------------------------------------------
export const FIXED_DT = 1 / 60; // physics step (s); accumulator in physics.ts
export const MAX_DT = 0.05; // clamp for the rAF loop (background-tab guard)

// --- Tower shaft -----------------------------------------------------------
// Open-ended along matter −y (ascent). Side rails are visual only; the player
// is clamped to ±LANE_HALF in code.
export const LANE_HALF = 7; // playable half-width in x
export const RAIL_THICKNESS = 0.8;
export const RAIL_HEIGHT = 1.4;

// --- Camera (follows the scroll; reuses Boulon's known-good 3/4 framing) ----
export const CAMERA = {
  // Position relative to the look centre. atan(24/20) ≈ 50° tilt → 3/4 voxels.
  offset: new THREE.Vector3(0, 24, 20),
  // Horizontal world half-extent to keep visible (a bit past the rails).
  fitRadius: LANE_HALF + 2,
  depthFactor: 0.8, // floor-depth foreshortening (~sin tilt), used by input unproject
  far: 200,
} as const;

// --- Forced scroll ---------------------------------------------------------
// `frontY` (matter y of the camera look-centre) decreases over time; the climb
// height score is −frontY. Speed ramps per level.
export const SCROLL = {
  baseSpeed: 3.2, // units/s at level 1
  perLevelSpeed: 0.85, // added units/s per level cleared
  maxSpeed: 14,
} as const;

// --- Player window (matter-y offsets relative to frontY) -------------------
// +y = toward the camera = lower on screen. Falling past `deathBelow` (off the
// bottom edge) ends the run.
export const WINDOW = {
  up: 7, // furthest the ship may climb above the look-centre (−y)
  down: 12, // furthest below it may drift (+y, toward camera)
  deathBelow: 15.5, // past this (off-screen bottom) = death
  followOffset: 3.5, // ship floats this far above the finger (−y) so the thumb doesn't cover it
} as const;

// --- Levels / sections -----------------------------------------------------
export const TOWER = {
  sectionDepth: 64, // world units climbed per level (≈ 2–3 screens)
} as const;

// --- Player ----------------------------------------------------------------
export const PLAYER = {
  radius: 0.7, // physics circle radius
  scale: 0.5, // voxel mesh multiplier (smaller assets)
  followLerp: 16, // position-lerp stiffness toward the finger target
  hp: 5,
  iframes: 1.0, // s of invulnerability after taking a hit
};

// --- Weapon / projectiles (auto-fire straight up = matter −y) --------------
export const WEAPON = {
  fireInterval: 0.15, // s between auto-shots
  projectileSpeed: 34, // units/s
  projectileRadius: 0.22,
  projectileLife: 1.4, // s before auto-despawn
  damage: 1,
  muzzleOffset: 1.0, // spawn this far in front (−y) of the ship
  poolSize: 96, // pre-allocated; zero alloc per shot
};

// --- Enemies (descending voxel robots) -------------------------------------
export const ENEMY = {
  radius: 0.7,
  scale: 0.4, // smaller than the hero
  hp: 2,
  poolSize: 56,
  baseSpeed: 4.5, // downward (+y) units/s at level 1
  perLevelSpeed: 0.7,
  maxSpeed: 16,
  contactDamage: 1,
  spawnInterval: 0.85, // s between spawns at level 1
  spawnIntervalMin: 0.26,
  perLevelSpawn: 0.07, // interval reduction per level
  spawnAhead: 5, // spawn this far above the play window (extra −y beyond the top)
  cullBelow: 5, // despawn once this far below the window bottom (+y)
  score: 25, // points per kill
};

// --- Debris budget (kill-burst of voxel cubes; kinematic, not matter) ------
export const DEBRIS = {
  globalCap: 160, // max simultaneous debris cubes
  perEnemy: 7, // cubes spawned per enemy death
  lifetime: 0.7, // s before recycle (shrink-out)
  size: 0.3,
  speed: 7, // outward burst speed (units/s)
  gravity: 22, // downward (−world y) accel so cubes arc and settle
};

// --- Palette (bright toy-robot world; band tints mark each level) ----------
export const PALETTE = {
  clear: 0xe9edf2, // sky/background
  floor: 0xd7dde6,
  floorGrid: 0xc2cad6,
  rail: 0xb6c0cf,
  hero: 0x2f7fed, // friendly blue robot
  heroDark: 0x1f5fc0,
  heroAccent: 0xffd166,
  eye: 0x16324f,
  projectile: 0xffb627, // warm bolt
  enemy: 0xef5350, // red robots
  enemyDark: 0xc62828,
  // Per-level floor band tints (cycled) so sections read as you climb.
  bands: [0xd7dde6, 0xdbe6dd, 0xe6dedb, 0xdbdce6, 0xe6dbe2, 0xdbe5e6] as number[],
} as const;

// --- Lighting (lit voxel exception — Lambert + flatShading; see scene.ts) --
export const LIGHTS = {
  sun: { color: 0xfff4e0, intensity: 1.15, position: new THREE.Vector3(-8, 16, 6) },
  ambient: { color: 0xbcd0e8, intensity: 0.78 },
  fill: { color: 0xffe6c0, intensity: 6, distance: 40, decay: 1.4, position: new THREE.Vector3(0, 9, 4) },
} as const;
