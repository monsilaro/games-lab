// Fixed-step simulation: economy + directional expansion. Works on the FRONT
// only (a border-cell queue), never a full-grid rescan per tick, and allocates
// nothing in the hot loop. Phase 1: a single player flooding neutral terrain.

import {
  GRID_W,
  GRID_H,
  CELL_COUNT,
  OWNER_NEUTRAL,
  OWNER_PLAYER,
  BASE_INCOME_PER_SEC,
  BALANCE_PER_CELL_PER_SEC,
  BALANCE_CAP_BASE,
  BALANCE_CAP_PER_CELL,
  EXPAND_COST_BASE,
  EXPAND_COST_SIZE_FACTOR,
  MAX_CONVERSIONS_PER_TICK,
} from './config';
import type { Grid } from './grid';

export interface Sim {
  grid: Grid;
  /** Player frontier: owned cells with ≥1 neutral neighbour. May hold stale
   *  entries (lazy deletion) — `isBorder` is authoritative; compacted each tick. */
  border: Int32Array;
  borderLen: number;
  isBorder: Uint8Array;
  /** Scratch: neutral cells adjacent to the front this tick (deduped via mark). */
  fringe: Int32Array;
  fringeMark: Uint8Array;
  /** Cells whose owner changed — drained by the renderer each frame. */
  dirty: Int32Array;
  dirtyLen: number;
  /** Current expansion target (cell coords). Persists until re-tapped. */
  targetX: number;
  targetY: number;
  hasTarget: boolean;
}

export function createSim(grid: Grid): Sim {
  const sim: Sim = {
    grid,
    border: new Int32Array(CELL_COUNT),
    borderLen: 0,
    isBorder: new Uint8Array(CELL_COUNT),
    fringe: new Int32Array(CELL_COUNT),
    fringeMark: new Uint8Array(CELL_COUNT),
    dirty: new Int32Array(CELL_COUNT),
    dirtyLen: 0,
    targetX: 0,
    targetY: 0,
    hasTarget: false,
  };
  // Seed the frontier once (the only full-grid scan — happens at boot, not per tick).
  const owner = grid.owner;
  for (let c = 0; c < owner.length; c++) {
    if (owner[c] === OWNER_PLAYER && hasNeutralNeighbor(owner, c)) {
      sim.isBorder[c] = 1;
      sim.border[sim.borderLen++] = c;
    }
  }
  return sim;
}

export function setTarget(sim: Sim, cx: number, cy: number): void {
  sim.targetX = cx;
  sim.targetY = cy;
  sim.hasTarget = true;
}

export function clearTarget(sim: Sim): void {
  sim.hasTarget = false;
}

// --- one fixed step ------------------------------------------------------
export function simTick(sim: Sim, dt: number): void {
  const grid = sim.grid;
  const owned = grid.ownedCount[OWNER_PLAYER];

  // Economy: income scales with owned area, balance is soft-capped.
  const income = BASE_INCOME_PER_SEC + BALANCE_PER_CELL_PER_SEC * owned;
  const cap = BALANCE_CAP_BASE + BALANCE_CAP_PER_CELL * owned;
  let bal = grid.balance[OWNER_PLAYER] + income * dt;
  if (bal > cap) bal = cap;

  // Expansion: only when steering somewhere and we can afford ≥1 cell.
  if (sim.hasTarget) {
    const costPerCell = EXPAND_COST_BASE + EXPAND_COST_SIZE_FACTOR * owned;
    const affordable = Math.floor(bal / costPerCell);
    if (affordable > 0) {
      const budget =
        affordable < MAX_CONVERSIONS_PER_TICK ? affordable : MAX_CONVERSIONS_PER_TICK;
      const converted = expand(sim, budget);
      bal -= converted * costPerCell;
    }
  }

  grid.balance[OWNER_PLAYER] = bal;
}

// Drain the renderer's change list after it has consumed `dirty`.
export function clearDirty(sim: Sim): void {
  sim.dirtyLen = 0;
}

// --- internals -----------------------------------------------------------

// Module-scoped target for the in-place sort comparator, so sorting allocates
// no closure per tick.
let cmpTx = 0;
let cmpTy = 0;
function cmpDistToTarget(a: number, b: number): number {
  const ax = a % GRID_W;
  const ay = (a / GRID_W) | 0;
  const bx = b % GRID_W;
  const by = (b / GRID_W) | 0;
  const dxa = ax - cmpTx;
  const dya = ay - cmpTy;
  const dxb = bx - cmpTx;
  const dyb = by - cmpTy;
  return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb);
}

/** Advance the front by up to `budget` cells, biased toward the target.
 *  Returns how many cells were actually conquered. */
function expand(sim: Sim, budget: number): number {
  const owner = sim.grid.owner;
  const border = sim.border;
  const isBorder = sim.isBorder;
  const fringe = sim.fringe;
  const fringeMark = sim.fringeMark;

  // 1. Compact the frontier (drop stale entries) and gather its neutral
  //    neighbours into `fringe` (deduped). Both are O(frontier) ≪ O(grid).
  let bw = 0; // compacted border write cursor
  let fl = 0; // fringe length
  const len = sim.borderLen;
  for (let i = 0; i < len; i++) {
    const c = border[i];
    if (!isBorder[c]) continue; // stale
    border[bw++] = c; // keep
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    if (x > 0) {
      const nb = c - 1;
      if (owner[nb] === OWNER_NEUTRAL && !fringeMark[nb]) {
        fringeMark[nb] = 1;
        fringe[fl++] = nb;
      }
    }
    if (x < GRID_W - 1) {
      const nb = c + 1;
      if (owner[nb] === OWNER_NEUTRAL && !fringeMark[nb]) {
        fringeMark[nb] = 1;
        fringe[fl++] = nb;
      }
    }
    if (y > 0) {
      const nb = c - GRID_W;
      if (owner[nb] === OWNER_NEUTRAL && !fringeMark[nb]) {
        fringeMark[nb] = 1;
        fringe[fl++] = nb;
      }
    }
    if (y < GRID_H - 1) {
      const nb = c + GRID_W;
      if (owner[nb] === OWNER_NEUTRAL && !fringeMark[nb]) {
        fringeMark[nb] = 1;
        fringe[fl++] = nb;
      }
    }
  }
  sim.borderLen = bw;

  if (fl === 0) return 0;

  // 2. Pick which fringe cells advance. If the budget can't take the whole
  //    fringe, sort it so the cells nearest the target go first (directional
  //    growth). In-place sort over the shared buffer — no big allocation.
  let count = budget < fl ? budget : fl;
  if (count < fl) {
    cmpTx = sim.targetX;
    cmpTy = sim.targetY;
    fringe.subarray(0, fl).sort(cmpDistToTarget);
  }

  // 3. Conquer the chosen cells.
  for (let k = 0; k < count; k++) {
    conquer(sim, fringe[k]);
  }

  // 4. Reset the per-tick fringe marks (only the cells we touched).
  for (let k = 0; k < fl; k++) {
    fringeMark[fringe[k]] = 0;
  }

  return count;
}

/** Flip a neutral cell to the player and fix up frontier membership locally. */
function conquer(sim: Sim, c: number): void {
  const grid = sim.grid;
  grid.owner[c] = OWNER_PLAYER;
  grid.ownedCount[OWNER_PLAYER]++;
  sim.dirty[sim.dirtyLen++] = c;

  // This cell + its 4 neighbours may have changed frontier status.
  refreshBorder(sim, c);
  const x = c % GRID_W;
  const y = (c / GRID_W) | 0;
  if (x > 0) refreshBorder(sim, c - 1);
  if (x < GRID_W - 1) refreshBorder(sim, c + 1);
  if (y > 0) refreshBorder(sim, c - GRID_W);
  if (y < GRID_H - 1) refreshBorder(sim, c + GRID_W);
}

/** Recompute whether a player cell is on the frontier; push it on a 0→1 edge. */
function refreshBorder(sim: Sim, c: number): void {
  const owner = sim.grid.owner;
  if (owner[c] !== OWNER_PLAYER) {
    sim.isBorder[c] = 0;
    return;
  }
  if (hasNeutralNeighbor(owner, c)) {
    if (!sim.isBorder[c]) {
      sim.isBorder[c] = 1;
      sim.border[sim.borderLen++] = c;
    }
  } else {
    sim.isBorder[c] = 0;
  }
}

function hasNeutralNeighbor(owner: Uint8Array, c: number): boolean {
  const x = c % GRID_W;
  const y = (c / GRID_W) | 0;
  if (x > 0 && owner[c - 1] === OWNER_NEUTRAL) return true;
  if (x < GRID_W - 1 && owner[c + 1] === OWNER_NEUTRAL) return true;
  if (y > 0 && owner[c - GRID_W] === OWNER_NEUTRAL) return true;
  if (y < GRID_H - 1 && owner[c + GRID_W] === OWNER_NEUTRAL) return true;
  return false;
}
