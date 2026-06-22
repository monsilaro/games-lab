// Boulon — all tuning lives here. No magic numbers in the systems (spec rule).
// World units ≈ metres, like slingshot. The sim runs in the matter-js FLOOR
// plane: matter (x, y) maps to three (x, 0, y). The camera is tilted ~50° so
// the floor reads as a 3/4 voxel diorama. Gravity is OFF — this is a top-down
// field seen at an angle, not a side view.

import * as THREE from 'three';

// --- Simulation -----------------------------------------------------------
export const FIXED_DT = 1 / 60; // physics step (s); accumulator in physics.ts
export const MAX_DT = 0.05; // clamp for the rAF loop (background-tab guard)

// --- Arena ----------------------------------------------------------------
// Square play-field centred on the origin. Walls are static bodies at ±half.
export const ARENA_HALF = 13; // half-width/half-depth in world units
export const WALL_THICKNESS = 1.2; // visual + physical wall depth
export const WALL_HEIGHT = 1.6; // visual cube height of the border walls

// --- Camera (fixed, frames the whole arena; see scene.ts) -----------------
export const CAMERA = {
  // Position relative to the look target (origin). atan(height/depth) sets the
  // tilt: 24/20 ≈ 50° from horizontal → the spec's 45–55° 3/4 view.
  offset: new THREE.Vector3(0, 24, 20),
  // Half-extent of the arena to keep visible (a little past ARENA_HALF for
  // margin) and the foreshortening factor of floor depth (~sin(tilt)).
  fitRadius: ARENA_HALF + 2.4,
  depthFactor: 0.8,
  far: 120,
} as const;

// --- Palette (bright toy-robot world on a light workshop floor) -----------
export const PALETTE = {
  clear: 0xe9edf2, // sky/background
  floor: 0xd7dde6,
  floorGrid: 0xc2cad6,
  wall: 0xb6c0cf,
  wallTop: 0xccd4df,
  hero: 0x2f7fed, // friendly blue robot
  heroDark: 0x1f5fc0,
  heroAccent: 0xffd166, // antenna / trim
  eye: 0x16324f,
  projectile: 0xffb627, // warm bolt
  target: 0xef5350, // red training dummies
  targetDark: 0xc62828,
} as const;

// --- Lighting (lit voxel exception — Lambert + flatShading; see scene.ts) --
export const LIGHTS = {
  sun: { color: 0xfff4e0, intensity: 1.15, position: new THREE.Vector3(-8, 16, 6) },
  ambient: { color: 0xbcd0e8, intensity: 0.75 },
  fill: { color: 0xffe6c0, intensity: 6, distance: 40, decay: 1.4, position: new THREE.Vector3(0, 9, 4) },
} as const;

// --- Player ----------------------------------------------------------------
export const PLAYER = {
  radius: 0.9, // physics circle radius
  moveSpeed: 9.5, // units/s at full stick
  hp: 5, // unused until Phase 3 (declared now)
};

// --- Weapon / projectiles (single blaster for Phase 1) ---------------------
export const WEAPON = {
  fireInterval: 0.14, // s between shots while the aim stick is held
  projectileSpeed: 28, // units/s
  projectileRadius: 0.28,
  projectileLife: 1.1, // s before auto-despawn
  damage: 1,
  muzzleOffset: 1.1, // spawn this far in front of the hero centre
  poolSize: 64, // pre-allocated; zero alloc per shot
};

// --- Training targets (static; disappear when killed — no explosion yet) ---
export const TARGETS = {
  radius: 0.95,
  hp: 3,
  poolSize: 16,
  count: 6, // how many stand in the arena at once
  spawnMargin: 3.5, // keep this far inside the walls
  minPlayerDist: 6, // don't spawn on top of the hero
};

// --- Twin-stick input ------------------------------------------------------
export const STICK = {
  radiusPx: 66, // knob travel radius (matches .boulon-stick-base in CSS)
  deadzone: 0.16, // fraction of radius ignored
};

// --- Debris budget (PHASE 2 — declared now, not yet exercised) -------------
// First-order perf constraint from the spec. Keep these here so the debris
// system is built against hard caps from its very first line.
export const DEBRIS = {
  globalCap: 200, // max simultaneous physical debris cubes
  perEnemy: 10, // bounded cubes spawned per enemy death
  lifetime: 2.2, // s on the ground before fade + recycle
  fade: 0.5, // s of fade-out at end of life
};
