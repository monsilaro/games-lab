// Fixed-step multi-owner simulation: economy + directional expansion + combat.
// Works on the FRONT only (a global border-cell queue shared by every owner),
// never a full-grid rescan per tick, and allocates nothing in the hot loop.
//
// Phase 2: player (tap/drag steered) + passive-defender enemies. Conquest is
// symmetric and force-based — attacking a stronger owner is expensive, so
// overextension gets punished by the defender's counter-attack with no
// special-case "recede" code.

import {
  GRID_W,
  GRID_H,
  CELL_COUNT,
  OWNER_NEUTRAL,
  OWNER_PLAYER,
  OWNER_WATER,
  BASE_INCOME_PER_SEC,
  BALANCE_PER_CELL_PER_SEC,
  BALANCE_CAP_BASE,
  BALANCE_CAP_PER_CELL,
  EXPAND_COST_BASE,
  EXPAND_COST_SIZE_FACTOR,
  MAX_CONVERSIONS_PER_TICK,
  STRENGTH_SIZE_FACTOR,
  ATTACK_COST_BASE,
  DEFENSE_FACTOR,
  ENEMY_DEFENSIVE,
} from './config';
import type { Grid } from './grid';

export interface Sim {
  grid: Grid;
  /** Every owner's front cells (owned + ≥1 conquerable neighbour). May hold
   *  stale entries (lazy deletion) — `isBorder` is authoritative; compacted +
   *  deduped each tick. A cell belongs to exactly one owner (`owner[c]`). */
  border: Int32Array;
  borderLen: number;
  isBorder: Uint8Array;
  /** Scratch: an owner's conquerable targets this pass (deduped via mark). */
  fringe: Int32Array;
  fringeMark: Uint8Array;
  /** Cells whose owner changed — drained by the renderer each frame. */
  dirty: Int32Array;
  dirtyLen: number;
  /** Owner ids with ≥1 cell at boot, ascending (player first) — fixed process order. */
  activeOwners: number[];
  /** Current player expansion target (cell coords). Persists until re-tapped. */
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
    activeOwners: [],
    targetX: 0,
    targetY: 0,
    hasTarget: false,
  };

  // Seed every owner's frontier once (the only full-grid scan — at boot).
  const owner = grid.owner;
  for (let c = 0; c < owner.length; c++) {
    const o = owner[c];
    if (o !== OWNER_NEUTRAL && o !== OWNER_WATER && hasConquerableNeighbor(owner, c, o)) {
      sim.isBorder[c] = 1;
      sim.border[sim.borderLen++] = c;
    }
  }

  // Active owners, ascending id (player = 1 first) → deterministic process order.
  for (let id = 1; id < 255; id++) {
    if (grid.ownedCount[id] > 0) sim.activeOwners.push(id);
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

// Drain the renderer's change list after it has consumed `dirty`.
export function clearDirty(sim: Sim): void {
  sim.dirtyLen = 0;
}

// --- one fixed step ------------------------------------------------------
export function simTick(sim: Sim, dt: number): void {
  compactBorder(sim);

  const grid = sim.grid;
  const active = sim.activeOwners;

  // Economy: every owner's income scales with its area; Balance is soft-capped.
  for (let a = 0; a < active.length; a++) {
    const o = active[a];
    const owned = grid.ownedCount[o];
    if (owned === 0) continue;
    const income = BASE_INCOME_PER_SEC + BALANCE_PER_CELL_PER_SEC * owned;
    const cap = BALANCE_CAP_BASE + BALANCE_CAP_PER_CELL * owned;
    let bal = grid.balance[o] + income * dt;
    if (bal > cap) bal = cap;
    grid.balance[o] = bal;
  }

  // Expansion / combat: each owner advances its own front, in fixed id order.
  for (let a = 0; a < active.length; a++) {
    const o = active[a];
    if (grid.ownedCount[o] === 0) continue;
    processOwner(sim, o);
  }
}

// --- internals -----------------------------------------------------------

/** Drop stale entries and de-duplicate the global frontier (O(border)). */
function compactBorder(sim: Sim): void {
  const border = sim.border;
  const isBorder = sim.isBorder;
  const seen = sim.fringeMark; // borrowed; fully cleared again below
  let bw = 0;
  const len = sim.borderLen;
  for (let i = 0; i < len; i++) {
    const c = border[i];
    if (isBorder[c] && !seen[c]) {
      seen[c] = 1;
      border[bw++] = c;
    }
  }
  sim.borderLen = bw;
  for (let i = 0; i < bw; i++) seen[border[i]] = 0;
}

// Module-scoped target for the in-place sort comparator (no per-tick closure).
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

/** Advance one owner's front by up to MAX_CONVERSIONS_PER_TICK affordable cells. */
function processOwner(sim: Sim, o: number): void {
  // The player only acts while steering; enemies (defensive) always react.
  if (o === OWNER_PLAYER && !sim.hasTarget) return;
  const defensive = o !== OWNER_PLAYER && ENEMY_DEFENSIVE;

  const grid = sim.grid;
  const owner = grid.owner;
  const border = sim.border;
  const isBorder = sim.isBorder;
  const fringe = sim.fringe;
  const fringeMark = sim.fringeMark;

  // 1. Gather this owner's conquerable targets (deduped).
  let fl = 0;
  const len = sim.borderLen;
  for (let i = 0; i < len; i++) {
    const c = border[i];
    if (!isBorder[c] || owner[c] !== o) continue;
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    if (x > 0) fl = addTarget(sim, fringe, fl, c - 1, o, defensive);
    if (x < GRID_W - 1) fl = addTarget(sim, fringe, fl, c + 1, o, defensive);
    if (y > 0) fl = addTarget(sim, fringe, fl, c - GRID_W, o, defensive);
    if (y < GRID_H - 1) fl = addTarget(sim, fringe, fl, c + GRID_W, o, defensive);
  }

  if (fl === 0) return;

  // 2. Player steers: take the cells nearest the target first (directional).
  if (o === OWNER_PLAYER) {
    cmpTx = sim.targetX;
    cmpTy = sim.targetY;
    fringe.subarray(0, fl).sort(cmpDistToTarget);
  }

  // 3. Conquer affordable cells, spending Balance per cell (force-scaled cost).
  let remaining = MAX_CONVERSIONS_PER_TICK;
  for (let k = 0; k < fl && remaining > 0; k++) {
    const t = fringe[k];
    const cost = costToTake(sim, o, t);
    if (grid.balance[o] >= cost) {
      grid.balance[o] -= cost;
      conquer(sim, o, t);
      remaining--;
    }
  }

  // 4. Reset this pass's marks (only the cells we touched).
  for (let k = 0; k < fl; k++) fringeMark[fringe[k]] = 0;
}

/** Add `t` to `o`'s target list if conquerable by `o` (and not yet marked). */
function addTarget(
  sim: Sim,
  fringe: Int32Array,
  fl: number,
  t: number,
  o: number,
  defensive: boolean,
): number {
  const od = sim.grid.owner[t];
  if (od === o || od === OWNER_WATER) return fl;
  if (od === OWNER_NEUTRAL && defensive) return fl; // defenders ignore neutral
  if (sim.fringeMark[t]) return fl;
  sim.fringeMark[t] = 1;
  fringe[fl] = t;
  return fl + 1;
}

function strength(grid: Grid, o: number): number {
  return grid.balance[o] + STRENGTH_SIZE_FACTOR * grid.ownedCount[o];
}

/** Per-cell cost: size-based for neutral, force-ratio-based for enemy cells. */
function costToTake(sim: Sim, o: number, t: number): number {
  const grid = sim.grid;
  const od = grid.owner[t];
  if (od === OWNER_NEUTRAL) {
    return EXPAND_COST_BASE + EXPAND_COST_SIZE_FACTOR * grid.ownedCount[o];
  }
  // Enemy `od`: harder the stronger the defender is relative to the attacker.
  return ATTACK_COST_BASE * (1 + (DEFENSE_FACTOR * strength(grid, od)) / (strength(grid, o) + 1));
}

/** Flip a cell to owner `o` (from neutral or an enemy) and fix up local fronts. */
function conquer(sim: Sim, o: number, t: number): void {
  const grid = sim.grid;
  const prev = grid.owner[t];
  if (prev !== OWNER_NEUTRAL) grid.ownedCount[prev]--; // taken from an enemy
  grid.owner[t] = o;
  grid.ownedCount[o]++;
  sim.dirty[sim.dirtyLen++] = t;

  // This cell + its 4 neighbours (any owner) may change frontier status.
  refreshBorder(sim, t);
  const x = t % GRID_W;
  const y = (t / GRID_W) | 0;
  if (x > 0) refreshBorder(sim, t - 1);
  if (x < GRID_W - 1) refreshBorder(sim, t + 1);
  if (y > 0) refreshBorder(sim, t - GRID_W);
  if (y < GRID_H - 1) refreshBorder(sim, t + GRID_W);
}

/** Recompute whether a cell is on its owner's front; push on a 0→1 edge. */
function refreshBorder(sim: Sim, c: number): void {
  const owner = sim.grid.owner;
  const o = owner[c];
  if (o === OWNER_NEUTRAL || o === OWNER_WATER) {
    sim.isBorder[c] = 0;
    return;
  }
  if (hasConquerableNeighbor(owner, c, o)) {
    if (!sim.isBorder[c]) {
      sim.isBorder[c] = 1;
      sim.border[sim.borderLen++] = c;
    }
  } else {
    sim.isBorder[c] = 0;
  }
}

/** True if any 4-neighbour is conquerable by `o` (neutral or a different
 *  non-water owner). */
function hasConquerableNeighbor(owner: Uint8Array, c: number, o: number): boolean {
  const x = c % GRID_W;
  const y = (c / GRID_W) | 0;
  if (x > 0 && conquerable(owner[c - 1], o)) return true;
  if (x < GRID_W - 1 && conquerable(owner[c + 1], o)) return true;
  if (y > 0 && conquerable(owner[c - GRID_W], o)) return true;
  if (y < GRID_H - 1 && conquerable(owner[c + GRID_W], o)) return true;
  return false;
}

function conquerable(nb: number, o: number): boolean {
  return nb !== o && nb !== OWNER_WATER;
}
