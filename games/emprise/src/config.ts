// Emprise — all tuning lives here. No magic numbers anywhere else.
// Phase 1: single-player expansion sandbox (the perf GO/NO-GO).

// --- Grid ----------------------------------------------------------------
// Square cells. Grid is portrait, sized to roughly fill an iPhone screen so
// the map is full-bleed (the renderer "contain"-fits it, so a slightly off
// aspect just adds thin letterbox bars). ~40k cells = the Phase-1 perf target.
// All sizes are constants so we can retune after measuring fps on device.
export const GRID_W = 144;
export const GRID_H = 280; // 144 * 280 = 40_320 cells ≈ 40k
export const CELL_COUNT = GRID_W * GRID_H;

// --- Owners --------------------------------------------------------------
// Owner id is one Uint8 per cell. 0 = neutral, 1 = player, 255 = water
// (impassable sentinel). 2..254 reserved for bots (Phase 3) — model is
// multi-owner from day one so later phases extend without a data rewrite.
export const OWNER_NEUTRAL = 0;
export const OWNER_PLAYER = 1;
export const OWNER_WATER = 255;
export const MAX_OWNERS = 256; // Uint8 id space; per-owner arrays sized to this

// --- Map -----------------------------------------------------------------
export const WATER_BORDER = true; // impassable frame for a visible boundary
export const WATER_BORDER_THICKNESS = 3; // cells
export const START_ZONE_RADIUS = 4; // half-size of the player's spawn square
export const SPAWN_X = Math.floor(GRID_W / 2);
export const SPAWN_Y = Math.floor(GRID_H / 2);

// --- Simulation ----------------------------------------------------------
export const SIM_HZ = 30; // fixed-step frequency (decoupled from render)
export const SIM_STEP = 1 / SIM_HZ; // seconds per sim tick

// --- Economy -------------------------------------------------------------
// Balance income (per second) = base + per owned cell. Bigger = richer.
export const BASE_INCOME_PER_SEC = 10;
export const BALANCE_PER_CELL_PER_SEC = 0.08;
// Stored Balance is soft-capped (can't bank infinitely; pushes you to spend).
export const BALANCE_CAP_BASE = 80;
export const BALANCE_CAP_PER_CELL = 2.5;
// Cost to conquer one neutral cell rises with territory size, so growth
// self-slows the bigger you get (the territorial.io feel). The asymptotic
// expansion rate ≈ BALANCE_PER_CELL_PER_SEC / EXPAND_COST_SIZE_FACTOR cells/s.
export const EXPAND_COST_BASE = 1.0;
export const EXPAND_COST_SIZE_FACTOR = 0.001; // per owned cell
// Hard cap on neutral cells converted per sim tick (front advance speed).
export const MAX_CONVERSIONS_PER_TICK = 120;

// --- Combat (Phase 2) ----------------------------------------------------
// Force of an owner = banked Balance + a bonus for sheer size, so a big empire
// is inherently tougher even just after spending.
export const STRENGTH_SIZE_FACTOR = 0.5; // per owned cell
// Cost to conquer an ENEMY cell = base * (1 + DEFENSE_FACTOR * defStr/atkStr).
// Attacking someone stronger gets expensive fast → you stall and drain.
export const ATTACK_COST_BASE = 3;
export const DEFENSE_FACTOR = 1.5;

// --- Enemies (Phase 2: passive defenders, fixed spawns) ------------------
// Phase 3 replaces these fixed spawns with distributed spawns + difficulty.
export interface SpawnPoint {
  x: number;
  y: number;
}
export const ENEMY_SPAWNS: readonly SpawnPoint[] = [
  { x: 40, y: 56 },
  { x: 104, y: 56 },
  { x: 72, y: 224 },
];
export const ENEMY_START_RADIUS = 6; // bigger than the player's start (a threat)
// Phase 2 enemies never grab neutral — they only bank, defend, and counter.
export const ENEMY_DEFENSIVE = true;

// --- Colors (0xRRGGBB; packed to RGBA in render.ts) ----------------------
// Reuse the repo AURORA night palette: warm ember is reserved for the player,
// everything else stays cold.
export const COLOR_NEUTRAL = 0x1b2233; // dark slate land
export const COLOR_WATER = 0x0a1128; // night blue, impassable
export const COLOR_PLAYER = 0xff9f1c; // ember — the player (warm, repérable)
export const COLOR_LETTERBOX = 0x05070d; // page background / fit bars
