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
  BOT_COUNT,
  SPAWN_MIN_DIST,
  SPAWN_PLACE_TRIES,
} from './config';

export interface Grid {
  /** owner id per cell (0 neutral, 1 player, 255 water, 2..N bots). */
  owner: Uint8Array;
  /** per-owner Balance reserve. */
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

/** Deterministic PRNG so each seed reproduces a map (varied spawns per game). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGrid(seed = 1): Grid {
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

  // Distributed spawns: player (id 1) + BOT_COUNT bots (2..N), spread apart.
  const spawns = placeSpawns(seed, 1 + BOT_COUNT);
  for (let s = 0; s < spawns.length; s++) {
    const id = s === 0 ? OWNER_PLAYER : 1 + s; // player first, then 2,3,…
    stampZone(owner, ownedCount, spawns[s].x, spawns[s].y, START_ZONE_RADIUS, id);
  }

  return { owner, balance, ownedCount, landCount: CELL_COUNT - waterCount };
}

interface Pt {
  x: number;
  y: number;
}

/** Rejection-sample `count` spawn centres inside the land, spread by SPAWN_MIN_DIST. */
function placeSpawns(seed: number, count: number): Pt[] {
  const rng = mulberry32(seed);
  const margin = WATER_BORDER_THICKNESS + START_ZONE_RADIUS + 1;
  const xLo = margin;
  const xHi = GRID_W - 1 - margin;
  const yLo = margin;
  const yHi = GRID_H - 1 - margin;
  const minD2 = SPAWN_MIN_DIST * SPAWN_MIN_DIST;
  const pts: Pt[] = [];
  let tries = 0;
  while (pts.length < count && tries < SPAWN_PLACE_TRIES) {
    tries++;
    const x = xLo + Math.floor(rng() * (xHi - xLo + 1));
    const y = yLo + Math.floor(rng() * (yHi - yLo + 1));
    let ok = true;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - x;
      const dy = pts[i].y - y;
      if (dx * dx + dy * dy < minD2) {
        ok = false;
        break;
      }
    }
    if (ok) pts.push({ x, y });
  }
  // If the map couldn't fit them all spread out, fill the rest without the
  // spacing constraint so the player/bot count is always honoured.
  while (pts.length < count) {
    const x = xLo + Math.floor(rng() * (xHi - xLo + 1));
    const y = yLo + Math.floor(rng() * (yHi - yLo + 1));
    pts.push({ x, y });
  }
  return pts;
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
