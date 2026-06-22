// Le Feu — all tuning lives here. No magic numbers in the systems; everything a
// designer would touch (grid, sim rate, cycle lengths, light rig, palette,
// villager/building stats) is a named constant in this file. Phase 1 scope:
// campement + day/night cycle. Resources/combat/expeditions land in later phases.
import * as THREE from 'three';
import { AURORA } from '@games-lab/shared';

// --- Palette ---------------------------------------------------------------
// Reuse the shared AURORA names (spec palette is AURORA verbatim) plus a couple
// of le-feu-local earth tones. ember = the fire = the only strong warm color.
export const PALETTE = {
  night: AURORA.night, // 0x0a1128 darkest sky / deep night
  dusk: AURORA.deepBlue, // 0x1c2541 day-sky / dusk floor
  fire: AURORA.ember, // 0xff9f1c the central fire
  fireHot: AURORA.emberLight, // 0xffd166 inner flame / torch tip
  snow: AURORA.snow, // 0xe8edf2 snow ground band
  snowDim: 0xb7c4d6, // shaded snow (drifts / island rim band)
  wood: 0x8b5a2b, // logs, hut walls
  woodDark: 0x5e3d1d, // hut frame / shadow tone
  ground: 0x2b3a5e, // island top (cold lit lambert) — lifted for contrast vs sky/sea
  groundEdge: 0x10182e, // island cliff sides — darker for depth
  water: 0x081024, // surrounding sea — darker so the island reads
  aurora: AURORA.auroraGreen, // 0x2ec4b6 supernatural accent (night aurora)
  violet: AURORA.violet, // 0x9d4edd second supernatural accent (night aurora)
  skin: 0xd9a679, // villager faces/hands
  stone: 0x8a93a6, // quarry / stone resource
  foliage: 0x2f5a3a, // tree canopy (lumberjack work node)
  meat: 0xc0533f, // food / game resource
} as const;

// Resource → carried-block / icon colour.
export const RESOURCE_COLORS = {
  wood: PALETTE.wood,
  food: PALETTE.meat,
  stone: PALETTE.stone,
} as const;

// Tuque color variants so the crowd reads as distinct people.
export const TUQUE_COLORS = [0xc1121f, 0x2ec4b6, 0x9d4edd, 0xffd166, 0x3a86ff, 0xe8edf2] as const;

// --- Light rig (mirrors Veillée's "Nuit de veillée" look) ------------------
// Two ambient/directional targets that the day/night clock lerps between, plus
// the central FIRE point light which is always warm and pulses at night.
export const LIGHTS = {
  // Cold directional "moon" — winter sky. Brighter by day, dimmer at night.
  moon: {
    color: 0xbcd2ff,
    position: new THREE.Vector3(-14, 26, 10),
    dayIntensity: 1.15,
    nightIntensity: 0.22,
  },
  // Deep-blue fill. Lighter by day so the camp is readable; near-black at night.
  ambient: {
    dayColor: 0x6b7da8,
    nightColor: 0x141d33,
    dayIntensity: 0.85,
    nightIntensity: 0.32,
  },
  // The hearth. Warm point light at camp centre — the showpiece.
  fire: {
    color: PALETTE.fire,
    dayIntensity: 1.6, // still visible by day, but the moon dominates
    nightIntensity: 8.5, // at night it (and torches) are the only real source
    distance: 30,
    decay: 1.4,
    height: 2.2, // y of the light above the logs
    flickerAmp: 0.12, // ± fraction of intensity, fast pulse
    flickerHz: 7,
  },
  // Per-villager handheld torch, lit only at night.
  torch: {
    color: PALETTE.fireHot,
    intensity: 2.6,
    distance: 6,
    decay: 1.6,
  },
} as const;

// Sky clear-color endpoints (lerped by the clock).
export const SKY = {
  day: 0x33507a, // cold lit blue-grey — lighter than the ground so a horizon reads
  night: PALETTE.night, // deep night
} as const;

// --- Camera (tilted ortho diorama) -----------------------------------------
// Frustum is sized to FIT a target radius of the world on screen regardless of
// orientation (portrait phones are narrow, so we must drive the frustum from the
// width need, not a fixed height — otherwise the island spills off-screen). See
// camera.ts apply(). `seedHeight` is only the bootstrap value handed to
// createOrthoApp before the controller takes over on the first frame.
export const CAMERA = {
  seedHeight: 30,
  // Offset from the look target: above and behind → steep diorama tilt.
  offset: new THREE.Vector3(0, 22, 17),
  // Half-extent (world units) we guarantee visible around the look target at
  // zoom 1. Island world radius is islandRadius*cell ≈ 12, so 13.5 frames it +margin.
  fitRadius: 13.5,
  // Ground depth (z) is foreshortened by the tilt; this is roughly sin(pitch).
  depthFactor: 0.8,
  minZoom: 0.5, // zoomed IN (smaller frustum → closer on the fire)
  maxZoom: 1.4, // zoomed OUT (whole island + sea margin)
  panClampMargin: 5, // how far past island edge the look target may pan (units)
  far: 160,
} as const;

// --- Simulation ------------------------------------------------------------
export const SIM_HZ = 30;
export const SIM_STEP = 1 / SIM_HZ;
export const MAX_STEPS_PER_FRAME = 5; // spiral-of-death guard (emprise idiom)
export const SPEEDS = [0, 1, 2, 3] as const; // pause / ×1 / ×2 / ×3

// --- Grid + island ---------------------------------------------------------
export const GRID = {
  size: 19, // cells per side (odd → a true centre cell for the fire)
  cell: 1.5, // world units per cell
  islandRadius: 8.0, // cells from centre that are land (round mask) → ~12u radius
} as const;

// Cell occupancy codes (Uint8Array).
export const CELL_OFFISLAND = 2; // water / not buildable
export const CELL_FREE = 0;
export const CELL_OCCUPIED = 1;

// --- Day / night cycle -----------------------------------------------------
// One full day = day + dusk + night + dawn. Durations in *sim seconds* at ×1.
export const CYCLE = {
  day: 30,
  dusk: 5,
  night: 24,
  dawn: 5,
} as const;
export const CYCLE_TOTAL = CYCLE.day + CYCLE.dusk + CYCLE.night + CYCLE.dawn;

// --- Villagers -------------------------------------------------------------
export const VILLAGER = {
  startCount: 7,
  speed: 2.4, // world units / sec while walking
  arriveDist: 0.18, // distance to target that counts as arrived (units)
  wanderPauseMin: 1.2, // idle seconds between day wander hops
  wanderPauseMax: 3.5,
  fireRingMin: 1.8, // night: gather on a ring this far from fire centre (units)
  fireRingMax: 3.4,
  walkBobHz: 9, // procedural walk bob frequency
  walkBobAmp: 0.08, // vertical bob amplitude (units)
  scale: 1.0,
} as const;

// --- Resources & economy (Phase 2) -----------------------------------------
export type ResourceKind = 'wood' | 'food' | 'stone';
export const RESOURCE_KINDS: readonly ResourceKind[] = ['wood', 'food', 'stone'] as const;

export const RESOURCE_ICON: Record<ResourceKind, string> = {
  wood: '🪵',
  food: '🍖',
  stone: '🪨',
};

export const ECONOMY = {
  start: { wood: 45, food: 35, stone: 12 } as Record<ResourceKind, number>,
  // The fire is base storage so the loop works before any entrepôt is built.
  fireBaseCap: { wood: 60, food: 60, stone: 40 } as Record<ResourceKind, number>,
  foodPerVillagerPerSec: 0.11, // population eats this each sim-second
  starveGrace: 9, // seconds at zero food before one villager dies
} as const;

// Work cycle timing (shared by all production buildings).
export const WORK = {
  gatherTime: 2.4, // seconds standing at the work spot per load
  depositTime: 0.35, // seconds dropping a load at storage
  estCycleSec: 6.5, // rough full-loop time, only for the HUD "+/min" estimate
} as const;

// --- Villager traits (data-driven rendement modifiers) ---------------------
export type TraitId = 'travaillant' | 'costaud' | 'robuste';
export interface Trait {
  name: string;
  yieldMult?: number; // multiplies what a work-load gathers
  carryMult?: number; // multiplies load size (fewer trips)
}
export const TRAITS: Record<TraitId, Trait> = {
  travaillant: { name: 'Travaillant', yieldMult: 1.35 },
  costaud: { name: 'Costaud', carryMult: 1.5 },
  robuste: { name: 'Robuste' }, // hook for reduced hunger / combat later
};
// Each new villager rolls one of these (or none).
export const TRAIT_POOL: readonly (TraitId | null)[] = ['travaillant', 'costaud', 'robuste', null, null] as const;

// --- Recruitment -----------------------------------------------------------
export const RECRUIT = {
  interval: 20, // sim seconds between arrival attempts
  basePopCap: 8, // population cap before any house is built
  perHouse: 3, // each maison raises the cap by this
} as const;

// --- Buildings -------------------------------------------------------------
// Souple unlock: every buildable is available from the start, gated ONLY by
// affordability — no prereq chains (the deliberate fix vs the original).
export type BuildingKind = 'production' | 'storage' | 'house' | 'fire';
export type Cost = Partial<Record<ResourceKind, number>>;
export type WorkDecor = 'tree' | 'game' | 'rock';

export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  color: number; // wall colour
  cost: Cost;
  buildable: boolean; // appears in the build picker
  icon: string; // picker label
  produces?: { resource: ResourceKind; perTrip: number };
  maxWorkers?: number;
  storageCap?: Cost; // storage buildings add this to global capacity
  houseCapacity?: number; // houses raise the population cap
  workSpotOffset?: number; // cells from the hut to its work node
  workDecor?: WorkDecor; // decor placed at the work node
}

export const BUILDINGS: Record<string, BuildingDef> = {
  bucheron: {
    id: 'bucheron',
    name: 'Bûcheron',
    kind: 'production',
    color: PALETTE.wood,
    cost: { wood: 15 },
    buildable: true,
    icon: '🪓',
    produces: { resource: 'wood', perTrip: 4 },
    maxWorkers: 3,
    workSpotOffset: 1.5,
    workDecor: 'tree',
  },
  chasse: {
    id: 'chasse',
    name: 'Cabane de chasse',
    kind: 'production',
    color: PALETTE.woodDark,
    cost: { wood: 20 },
    buildable: true,
    icon: '🏹',
    produces: { resource: 'food', perTrip: 3 },
    maxWorkers: 3,
    workSpotOffset: 1.6,
    workDecor: 'game',
  },
  carriere: {
    id: 'carriere',
    name: 'Carrière',
    kind: 'production',
    color: PALETTE.stone,
    cost: { wood: 25 },
    buildable: true,
    icon: '⛏️',
    produces: { resource: 'stone', perTrip: 3 },
    maxWorkers: 2,
    workSpotOffset: 1.5,
    workDecor: 'rock',
  },
  entrepot: {
    id: 'entrepot',
    name: 'Entrepôt',
    kind: 'storage',
    color: PALETTE.snow,
    cost: { wood: 20, stone: 10 },
    buildable: true,
    icon: '📦',
    storageCap: { wood: 80, food: 80, stone: 60 },
  },
  maison: {
    id: 'maison',
    name: 'Maison',
    kind: 'house',
    color: PALETTE.wood,
    cost: { wood: 25 },
    buildable: true,
    icon: '🏠',
    houseCapacity: 3,
  },
};

// Order shown in the build picker.
export const BUILD_ORDER: readonly string[] = ['bucheron', 'chasse', 'carriere', 'entrepot', 'maison'];

// --- Visual: scattered island decor (Phase 3) ------------------------------
// Static low-poly props dressed near the cliff band so the island isn't an empty
// disc. Placed once at boot; their cells are marked occupied so build/AI agree.
export const DECOR = {
  count: 16, // total props scattered on the rim band
  ringMin: 5.2, // cells from centre: keep the inner camp clear
  ringMax: 7.6, // ...out to just inside the cliff edge (islandRadius 8)
  // Relative weights for the three prop kinds.
  weights: { tree: 5, drift: 3, rock: 3 } as Record<'tree' | 'drift' | 'rock', number>,
} as const;

// --- Visual: fire FX (Phase 3) ---------------------------------------------
// The hearth showpiece: a warm ground-glow disc + a single rising-ember Points
// system (one fixed pool, one attribute upload per frame — cheap on mobile).
export const FIRE_FX = {
  glowRadius: 2.4, // ground glow disc radius (world units)
  glowIntensity: 0.5, // base emissive of the glow disc (pulsed by the flicker)
  emberCount: 40, // particle pool size
  emberRise: 1.7, // base upward speed (units/sec)
  emberDrift: 0.5, // horizontal curl amplitude (units/sec)
  emberLifeMin: 0.9, // seconds an ember lives before respawn
  emberLifeMax: 1.8,
  emberSize: 0.16, // PointsMaterial size (world units)
  emberSpawnR: 0.35, // spawn radius around the ember bed
} as const;

// --- Visual: night aurora curtain (Phase 3) --------------------------------
// A wide arced ribbon high behind the island, vertex-gradient aurora→violet.
// Emissive Lambert (NOT MeshBasic) so it stays within the lit convention; its
// opacity is ramped by (1 - daylight) in applyLighting so it only shows at night.
// Placement is tuned to the tilted-ortho camera (pos ~(0,22,17) looking at the
// origin, frustum half-height ~29u): centre projects into the upper third of the
// frame, sitting in the sky *behind* the island rim.
export const AURORA_FX = {
  width: 38, // ribbon width — gradient spans the visible frame (half-width ~13.5)
  height: 11, // ribbon height (soft vertical falloff fades the edges)
  segments: 30, // horizontal segments (smooth arc + colour gradient)
  ySegments: 6, // vertical segments (for the soft top/bottom fade)
  arc: 5, // how far the ends bow toward the camera (units)
  y: 8, // height of the ribbon centre
  z: -20, // pushed back behind the island rim (rim ~z -12.75)
  maxOpacity: 0.55, // opacity at full night
} as const;

// --- Quest tuning (Phase 3) ------------------------------------------------
// Numeric targets for the onboarding quest chain (predicates carry no magics).
export const QUEST_TUNING = {
  popTarget: 10, // "grow the camp" objective
  dayTarget: 5, // "survive to day N" objective
} as const;
