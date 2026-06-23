// Boulon — all tuning lives here. World units ≈ metres. The sim runs in the
// matter-js FLOOR plane: matter (x, y) → three (x, 0, z), tilted ~50° so the
// floor reads as a 3/4 voxel diorama. Gravity is OFF — motion is scripted.
//
// ROOM-BY-ROOM TOWER CLIMBER: rooms stack along matter −y (= up the screen).
// Each room has solid pillars, static enemies you must destroy to open the top
// gate, two pickups, and a full-width floor that RISES (the crusher). Get
// pinned between the rising floor and the ceiling/a pillar → instant death.

import * as THREE from 'three';

// --- Simulation -----------------------------------------------------------
export const FIXED_DT = 1 / 60;
export const MAX_DT = 0.05;

// --- Room geometry ---------------------------------------------------------
// A room is bounded in x to ±LANE_HALF (solid side walls) and ROOM.height tall.
// Room i bottom sits at matter y = -i*ROOM.height; the top (gate) is more −y.
export const LANE_HALF = 8;
export const WALL_THICKNESS = 0.8;
export const WALL_HEIGHT = 1.8;
export const ROOM = {
  height: 30, // world units per room (≈ a screenful at this framing)
  fitHalf: 15, // vertical half-extent the camera must show (tune framing)
  marginX: 1.6, // extra world units past the rails kept on-screen
  wallTop: 1.8,
} as const;

// --- Camera (frames the current room; pans on room change) ----------------
export const CAMERA = {
  offset: new THREE.Vector3(0, 24, 16), // ~56° tilt
  far: 200,
  panLerp: 3.2, // room-to-room camera pan stiffness
} as const;

// --- Crusher (rising floor) ------------------------------------------------
export const CRUSHER = {
  thickness: 2.4, // visual/physical height of the rising slab
  baseSpeed: 1.5, // units/s rise at room 1
  perRoomSpeed: 0.28, // added per room
  maxSpeed: 6.5,
  startDelay: 1.1, // s of grace after entering a room before it rises
  crushMargin: 0.6, // overlap into the player (or gap-to-gate) that means death
} as const;

// --- Player ----------------------------------------------------------------
export const PLAYER = {
  radius: 0.7,
  scale: 0.5,
  seekGain: 13, // velocity = (target − pos) * seekGain, capped at maxSpeed
  maxSpeed: 22, // units/s — responsive finger-follow
  hp: 5,
  iframes: 0.9, // s invulnerable after an enemy graze
};

// --- Finger-follow input ---------------------------------------------------
// The ship aims for a point this far ABOVE the finger (−y) so the thumb never
// covers it.
export const FOLLOW = { offset: 2.2 } as const;

// --- Weapon (auto-fire, auto-aims the nearest enemy; else straight up) ------
export const WEAPON = {
  fireInterval: 0.2,
  projectileSpeed: 30,
  projectileRadius: 0.22,
  projectileLife: 1.2,
  damage: 1,
  muzzleOffset: 0.9,
  poolSize: 96,
  autoAimRange: 30, // units; nearest enemy within this is targeted
  spreadDeg: 11, // angle between bolts when MULTISHOT > 1
};

// --- Enemies (static; destroy all to open the gate; contact hurts) ---------
export const ENEMY = {
  radius: 0.7,
  scale: 0.42,
  hp: 2,
  poolSize: 40,
  contactDamage: 1,
  baseCount: 3, // enemies in room 1
  perRoomCount: 0.8, // +per room
  maxCount: 10,
  placeMargin: 2.2, // keep this far inside the walls / off the gate & floor
  minSpacing: 3.0, // min distance between enemies
};

// --- Pickups (2 per room: easy + hard; grant a stacking run upgrade) -------
export const ITEM = {
  radius: 0.7, // pickup collection radius
  scale: 0.5,
  bobAmp: 0.25,
  bobSpeed: 2.5,
  spin: 1.6,
} as const;

// --- Upgrade magnitudes (see upgrades.ts) ----------------------------------
export const UPGRADE = {
  fireRateMul: 0.84, // FIRE_RATE: fireInterval *= this
  speedMul: 1.12, // SPEED: maxSpeed *= this
  damageAdd: 1, // DAMAGE: +damage
  hpAdd: 1, // MAX_HP: +max hp (and heal 1)
  multishotAdd: 1, // MULTISHOT: +1 bolt
} as const;

// --- Debris budget (kill-burst of voxel cubes; kinematic) ------------------
export const DEBRIS = {
  globalCap: 160,
  perEnemy: 7,
  lifetime: 0.7,
  size: 0.3,
  speed: 7,
  gravity: 22,
};

// --- Palette ---------------------------------------------------------------
export const PALETTE = {
  clear: 0xe9edf2,
  floor: 0xd7dde6,
  floorGrid: 0xc2cad6,
  rail: 0xb6c0cf,
  pillar: 0x9aa6b8,
  gate: 0xff7043, // closed top gate (warning orange)
  crusher: 0x5b6478, // the rising slab (heavy grey)
  crusherEdge: 0xff5252, // its leading edge stripe (danger)
  hero: 0x2f7fed,
  heroDark: 0x1f5fc0,
  heroAccent: 0xffd166,
  eye: 0x16324f,
  projectile: 0xffb627,
  enemy: 0xef5350,
  enemyDark: 0xc62828,
  itemEasy: 0x35c46b, // green = easy pickup
  itemHard: 0xffc107, // gold = hard pickup
} as const;

// --- Lighting (lit voxel exception — Lambert + flatShading; see scene.ts) --
export const LIGHTS = {
  sun: { color: 0xfff4e0, intensity: 1.15, position: new THREE.Vector3(-8, 16, 6) },
  ambient: { color: 0xbcd0e8, intensity: 0.8 },
  fill: { color: 0xffe6c0, intensity: 6, distance: 44, decay: 1.4, position: new THREE.Vector3(0, 9, 4) },
} as const;
