// Assignment + the per-trait yield maths for the production work cycle. The
// actual state machine (toWork → working → toStorage → deposit) lives in ai.ts
// where the shared march code is; this module just holds the helpers it and the
// HUD call: assign/unassign a worker and compute a gathered load.
import { TRAITS } from './../config';
import type { BuildingInstance } from './../buildings';
import type { Villager } from './villager';

/** Try to put villager `v` to work at `building` (respects maxWorkers). */
export function assign(building: BuildingInstance, v: Villager): boolean {
  const max = building.def.maxWorkers ?? 0;
  if (building.assigned.length >= max) return false;
  v.job = building;
  building.assigned.push(v);
  startWork(v);
  return true;
}

/** Free a villager back to idle, dropping anything it carried. */
export function unassign(v: Villager): void {
  const b = v.job;
  if (b) {
    const i = b.assigned.indexOf(v);
    if (i >= 0) b.assigned.splice(i, 1);
  }
  v.job = null;
  v.carryKind = null;
  v.carryAmt = 0;
  v.state = 'wander';
  v.pauseT = 0;
}

/** Free the most-recently-added worker (the HUD's [−] button). */
export function unassignOne(building: BuildingInstance): Villager | null {
  const v = building.assigned[building.assigned.length - 1];
  if (!v) return null;
  unassign(v);
  return v;
}

/** Assign the nearest idle (jobless, non-wanderer) villager (the [+] button). */
export function assignNearestIdle(building: BuildingInstance, villagers: Villager[]): Villager | null {
  let best: Villager | null = null;
  let bestD = Infinity;
  for (const v of villagers) {
    if (v.job || v.recruiting) continue;
    const dx = v.x - building.world.x;
    const dz = v.z - building.world.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  if (!best) return null;
  return assign(building, best) ? best : null;
}

/** Send a worker to its building's work node to (re)start the loop. */
export function startWork(v: Villager): void {
  const ws = v.job?.workSpot;
  if (!ws) {
    v.state = 'pause';
    return;
  }
  v.tx = ws.x;
  v.tz = ws.z;
  v.state = 'toWork';
}

/** Size of one gathered load, with the villager's trait applied. */
export function yieldFor(v: Villager): number {
  const prod = v.job?.def.produces;
  if (!prod) return 0;
  let amt = prod.perTrip;
  if (v.trait) {
    const tr = TRAITS[v.trait];
    if (tr.yieldMult) amt *= tr.yieldMult;
    if (tr.carryMult) amt *= tr.carryMult;
  }
  return amt;
}
