// Typed-array territory state. One Uint8 owner id per cell — never per-cell
// objects (40k objects would kill the perf budget). Multi-owner from day one.

import {
  GRID_W,
  GRID_H,
  CELL_COUNT,
  OWNER_PLAYER,
  OWNER_WATER,
  MAX_OWNERS,
  WATER_BORDER,
  WATER_BORDER_THICKNESS,
  START_ZONE_RADIUS,
  SPAWN_X,
  SPAWN_Y,
  BALANCE_CAP_BASE,
  BALANCE_CAP_PER_CELL,
  ENEMY_SPAWNS,
  ENEMY_START_RADIUS,
} from './config';

export interface Grid {
  /** owner id per cell (0 neutral, 1 player, 255 water, 2..254 bots later). */
  owner: Uint8Array;
  /** per-owner Balance reserve (only [OWNER_PLAYER] used in Phase 1). */
  balance: Float32Array;
  /** per-owner cell count, kept incrementally — never rescanned. */
  ownedCount: Uint32Array;
  /** conquerable cells (non-water) — the denominator for "% of map owned". */
  landCount: number;
}

export function idx(x: number, y: number): number {
  return y * GRID_W + x;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}

export function createGrid(): Grid {
  const owner = new Uint8Array(CELL_COUNT); // all neutral (0) by default
  const balance = new Float32Array(MAX_OWNERS);
  const ownedCount = new Uint32Array(MAX_OWNERS);

  // Impassable water frame.
  let waterCount = 0;
  if (WATER_BORDER) {
    const t = WATER_BORDER_THICKNESS;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (x < t || x >= GRID_W - t || y < t || y >= GRID_H - t) {
          owner[idx(x, y)] = OWNER_WATER;
          waterCount++;
        }
      }
    }
  }

  // Player start zone: a small square around the spawn, clamped to land.
  stampZone(owner, ownedCount, SPAWN_X, SPAWN_Y, START_ZONE_RADIUS, OWNER_PLAYER);

  // Enemy blobs (Phase 2: fixed spawns). Owner ids start at 2.
  for (let e = 0; e < ENEMY_SPAWNS.length; e++) {
    const s = ENEMY_SPAWNS[e];
    const id = 2 + e;
    stampZone(owner, ownedCount, s.x, s.y, ENEMY_START_RADIUS, id);
    // Start with Balance at the soft cap so they can defend from t=0.
    balance[id] = BALANCE_CAP_BASE + BALANCE_CAP_PER_CELL * ownedCount[id];
  }

  return { owner, balance, ownedCount, landCount: CELL_COUNT - waterCount };
}

/** Stamp a filled square of `id` centred at (cx,cy), skipping water/out-of-bounds. */
function stampZone(
  owner: Uint8Array,
  ownedCount: Uint32Array,
  cx: number,
  cy: number,
  radius: number,
  id: number,
): void {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(x, y)) continue;
      const i = idx(x, y);
      if (owner[i] === OWNER_WATER || owner[i] === id) continue;
      owner[i] = id;
      ownedCount[id]++;
    }
  }
}
