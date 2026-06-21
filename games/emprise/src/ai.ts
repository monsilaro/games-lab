// Bot AI: a tiny EXPAND / ATTACK / DEFEND state machine. Bots are full players
// — this just sets each bot's behavior mode + target on a throttled, staggered
// cadence. Sensing is one bounded scan of the global front per decision. Lives
// outside sim.ts (imports from it, never the reverse) so there's no import cycle;
// the main loop calls `aiStep` right before `simTick` each fixed step.

import {
  GRID_W,
  GRID_H,
  OWNER_PLAYER,
  OWNER_NEUTRAL,
  OWNER_WATER,
  DECISION_INTERVAL,
  BOT_AGGRESSION,
  ATTACK_MARGIN_BASE,
  ATTACK_MARGIN_MIN,
  DEFEND_RATIO,
  ATTACK_DETECT_CELLS,
} from './config';
import { setTarget, setGreedy, setIdle, strengthOf, type Sim } from './sim';

// Bot states (also stored on sim.botState for inspection).
const EXPAND = 0;
const ATTACK = 1;
const DEFEND = 2;

// Aggression lerps the attack margin: high aggression → attack nearer-equal foes.
const ATTACK_MARGIN =
  ATTACK_MARGIN_BASE + (ATTACK_MARGIN_MIN - ATTACK_MARGIN_BASE) * BOT_AGGRESSION;

export function aiStep(sim: Sim, dt: number): void {
  const active = sim.activeOwners;
  for (let a = 0; a < active.length; a++) {
    const o = active[a];
    if (o === OWNER_PLAYER) continue;
    if (sim.grid.ownedCount[o] === 0) continue;
    sim.decisionTimer[o] -= dt;
    if (sim.decisionTimer[o] > 0) continue;
    sim.decisionTimer[o] = DECISION_INTERVAL;
    decide(sim, o);
  }
}

// Scan results (module-scoped to avoid per-decision allocation).
let sHasNeutral = false;
let sWeakestStr = Infinity;
let sWeakestCell = -1;
let sStrongestStr = -Infinity;

function decide(sim: Sim, o: number): void {
  const owner = sim.grid.owner;
  const border = sim.border;
  const isBorder = sim.isBorder;

  sHasNeutral = false;
  sWeakestStr = Infinity;
  sWeakestCell = -1;
  sStrongestStr = -Infinity;

  // Sense: one scan of this bot's front for neutral land + adjacent rivals.
  const len = sim.borderLen;
  for (let i = 0; i < len; i++) {
    const c = border[i];
    if (!isBorder[c] || owner[c] !== o) continue;
    const x = c % GRID_W;
    const y = (c / GRID_W) | 0;
    if (x > 0) sense(sim, c - 1, o);
    if (x < GRID_W - 1) sense(sim, c + 1, o);
    if (y > 0) sense(sim, c - GRID_W, o);
    if (y < GRID_H - 1) sense(sim, c + GRID_W, o);
  }

  // Detect being attacked (lost cells since the last decision).
  const owned = sim.grid.ownedCount[o];
  const lost = sim.lastOwned[o] - owned;
  sim.lastOwned[o] = owned;
  const underAttack = lost >= ATTACK_DETECT_CELLS;
  const myStr = strengthOf(sim, o);

  // Decide.
  if (underAttack && sStrongestStr > myStr * DEFEND_RATIO) {
    sim.botState[o] = DEFEND;
    setIdle(sim, o); // bank Balance → harder to take
    return;
  }
  if (sWeakestCell >= 0 && myStr > sWeakestStr * ATTACK_MARGIN) {
    sim.botState[o] = ATTACK;
    setTarget(sim, o, sWeakestCell % GRID_W, (sWeakestCell / GRID_W) | 0);
    return;
  }
  if (sHasNeutral) {
    sim.botState[o] = EXPAND;
    setGreedy(sim, o);
    return;
  }
  sim.botState[o] = DEFEND;
  setIdle(sim, o);
}

/** Inspect a single neighbour cell `t` of bot `o`, folding into the scan vars. */
function sense(sim: Sim, t: number, o: number): void {
  const od = sim.grid.owner[t];
  if (od === o || od === OWNER_WATER) return;
  if (od === OWNER_NEUTRAL) {
    sHasNeutral = true;
    return;
  }
  // Rival cell.
  const s = strengthOf(sim, od);
  if (s < sWeakestStr) {
    sWeakestStr = s;
    sWeakestCell = t;
  }
  if (s > sStrongestStr) sStrongestStr = s;
}
