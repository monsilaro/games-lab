// Fixed-step multi-owner simulation: economy + directional expansion + combat.
// Works on the FRONT only (a global border-cell queue shared by every owner),
// never a full-grid rescan per tick, and allocates nothing in the hot loop.
//
// Phase 3: every owner (player + bots) is a first-class actor with its own
// behavior `mode` and target. The player's mode is set by touch; bots' modes
// are set by the AI (see ai.ts). Conquest is symmetric and force-based.

import {
  GRID_W,
  GRID_H,
  CELL_COUNT,
  MAX_OWNERS,
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
  ECO_SPEED,
  BOT_ECO_HANDICAP,
  NODE_BONUS_INCOME,
  DECISION_INTERVAL,
} from './config';
import type { Grid } from './grid';

// Behavior modes (per owner).
export const MODE_IDLE = 0; // bank Balance, don't push (bot DEFEND / surrounded)
export const MODE_DIRECTED = 1; // advance the front toward target[o] (steer / ATTACK)
export const MODE_GREEDY = 2; // grab every affordable fringe cell (neutral + enemy) — bot EXPAND
export const MODE_GREEDY_NEUTRAL = 3; // grab neutral only, omnidirectional — the player's default

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
  /** Per-owner behavior + target (cell coords). */
  mode: Uint8Array;
  targetX: Int32Array;
  targetY: Int32Array;
  /** Per-bot AI scratch (see ai.ts): last decision's state, timer, owned count. */
  botState: Uint8Array;
  decisionTimer: Float32Array;
  lastOwned: Uint32Array;
  /** Per-owner power-node income tallied each tick (scratch). */
  nodeIncome: Float32Array;
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
    mode: new Uint8Array(MAX_OWNERS),
    targetX: new Int32Array(MAX_OWNERS),
    targetY: new Int32Array(MAX_OWNERS),
    botState: new Uint8Array(MAX_OWNERS),
    decisionTimer: new Float32Array(MAX_OWNERS),
    lastOwned: new Uint32Array(MAX_OWNERS),
    nodeIncome: new Float32Array(MAX_OWNERS),
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

  // Init AI scratch: stagger bot decision timers so they don't all fire on one
  // tick; seed lastOwned for attack detection.
  let botIndex = 0;
  let botTotal = 0;
  for (const o of sim.activeOwners) if (o !== OWNER_PLAYER) botTotal++;
  for (const o of sim.activeOwners) {
    sim.lastOwned[o] = grid.ownedCount[o];
    if (o !== OWNER_PLAYER) {
      sim.decisionTimer[o] = botTotal > 0 ? (DECISION_INTERVAL * botIndex) / botTotal : 0;
      botIndex++;
    }
  }

  return sim;
}

// --- per-owner behavior setters (used by main for the player, by ai for bots) ---
export function setTarget(sim: Sim, o: number, cx: number, cy: number): void {
  sim.mode[o] = MODE_DIRECTED;
  sim.targetX[o] = cx;
  sim.targetY[o] = cy;
}
export function setGreedy(sim: Sim, o: number): void {
  sim.mode[o] = MODE_GREEDY;
}
export function setGreedyNeutral(sim: Sim, o: number): void {
  sim.mode[o] = MODE_GREEDY_NEUTRAL;
}
export function setIdle(sim: Sim, o: number): void {
  sim.mode[o] = MODE_IDLE;
}
export function clearTarget(sim: Sim, o: number): void {
  sim.mode[o] = MODE_IDLE;
}

export function strengthOf(sim: Sim, o: number): number {
  return sim.grid.balance[o] + STRENGTH_SIZE_FACTOR * sim.grid.ownedCount[o];
}

// Drain the renderer's change list after it has consumed `dirty`.
export function clearDirty(sim: Sim): void {
  sim.dirtyLen = 0;
}

// --- one fixed step (economy + front processing). AI runs separately (ai.ts,
//     called from the main loop before this) to keep sim.ts cycle-free. -------
export function simTick(sim: Sim, dt: number): void {
  compactBorder(sim);

  const grid = sim.grid;
  const active = sim.activeOwners;

  // Tally power-node income per owner (just a few nodes).
  const nodeIncome = sim.nodeIncome;
  nodeIncome.fill(0);
  const nodes = grid.nodes;
  for (let n = 0; n < nodes.length; n++) {
    const no = grid.owner[nodes[n]];
    if (no !== OWNER_NEUTRAL && no !== OWNER_WATER) nodeIncome[no] += NODE_BONUS_INCOME;
  }

  // Economy: every owner's income scales with its area; Balance is soft-capped.
  for (let a = 0; a < active.length; a++) {
    const o = active[a];
    const owned = grid.ownedCount[o];
    if (owned === 0) continue;
    let income = (BASE_INCOME_PER_SEC + BALANCE_PER_CELL_PER_SEC * owned) * ECO_SPEED;
    if (o !== OWNER_PLAYER) income *= BOT_ECO_HANDICAP; // bots out-thought, not out-economied
    income += nodeIncome[o]; // power nodes — a flat, swingy bonus
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
  const m = sim.mode[o];
  if (m === MODE_IDLE) return;

  const grid = sim.grid;
  const owner = grid.owner;
  const border = sim.border;
  const isBorder = sim.isBorder;
  const fringe = sim.fringe;
  const fringeMark = sim.fringeMark;

  // 1. Gather this owner's conquerable targets (deduped). GREEDY_NEUTRAL skips
  //    enemy cells so the player auto-grows into neutral without auto-attacking.
  const includeEnemy = m !== MODE_GREEDY_NEUTRAL;
  let fl = 0;
  const len = sim.borderLen;
  for (let i = 0; i < len; i++) {
    const c = border[i];
    if (!isBorder[c] || owner[c] !== o) continue;
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    if (x > 0) fl = addTarget(sim, fringe, fl, c - 1, o, includeEnemy);
    if (x < GRID_W - 1) fl = addTarget(sim, fringe, fl, c + 1, o, includeEnemy);
    if (y > 0) fl = addTarget(sim, fringe, fl, c - GRID_W, o, includeEnemy);
    if (y < GRID_H - 1) fl = addTarget(sim, fringe, fl, c + GRID_W, o, includeEnemy);
  }

  if (fl === 0) return;

  // 2. Directed owners take the cells nearest their target first.
  if (m === MODE_DIRECTED) {
    cmpTx = sim.targetX[o];
    cmpTy = sim.targetY[o];
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

/** Add `t` to `o`'s target list if conquerable by `o`. With `includeEnemy`
 *  false, only neutral land is taken (the player's auto-expand). */
function addTarget(
  sim: Sim,
  fringe: Int32Array,
  fl: number,
  t: number,
  o: number,
  includeEnemy: boolean,
): number {
  const od = sim.grid.owner[t];
  if (od === o || od === OWNER_WATER) return fl;
  if (od !== OWNER_NEUTRAL && !includeEnemy) return fl;
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
