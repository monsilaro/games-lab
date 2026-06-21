// Villager behaviour + the village container. Three modes per villager:
//   • idle (no job)      — wander to a random free cell, pause, repeat (Phase 1)
//   • assigned (job set) — the production loop: toWork → working → toStorage → deposit
//   • night (any)        — everyone drops what they're doing and huddles at the fire
// The march toward (tx,tz) is shared; the arrival switch resolves per state. Seek
// stays straight-line (no A* yet — single-cell huts on an open island don't maze).
import * as THREE from 'three';
import { VILLAGER, TUQUE_COLORS, TRAIT_POOL, WORK, type TraitId } from './../config';
import { cellToWorld, isFree, type Grid } from './../grid';
import type { Clock } from './../time';
import { isNightForVillagers } from './../time';
import type { Buildings } from './../buildings';
import { add as addResource, type Store } from './../resources';
import { startWork, yieldFor } from './jobs';
import { createVillager, updateVillagerVisual, type Villager } from './villager';

export interface Village {
  villagers: Villager[];
  group: THREE.Group;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Pick a random free land cell, returning its world centre (fallbacks to centre). */
export function randomFreeWorld(grid: Grid): { x: number; z: number } {
  for (let i = 0; i < 40; i++) {
    const cx = (Math.random() * grid.size) | 0;
    const cy = (Math.random() * grid.size) | 0;
    if (isFree(grid, cx, cy)) return cellToWorld(grid, cx, cy);
  }
  return cellToWorld(grid, grid.centre, grid.centre);
}

function setWanderTarget(v: Villager, grid: Grid): void {
  const w = randomFreeWorld(grid);
  v.tx = w.x;
  v.tz = w.z;
  v.state = 'wander';
}

function setFireTarget(v: Villager): void {
  const ang = rand(0, Math.PI * 2);
  const r = rand(VILLAGER.fireRingMin, VILLAGER.fireRingMax);
  v.tx = Math.cos(ang) * r;
  v.tz = Math.sin(ang) * r;
  v.state = 'toFire';
}

function rollTrait(): TraitId | null {
  return TRAIT_POOL[(Math.random() * TRAIT_POOL.length) | 0] ?? null;
}

/** Spawn a villager at a world point and register it in the village. */
export function spawnVillager(
  village: Village,
  x: number,
  z: number,
  i: number,
  recruiting: boolean,
): Villager {
  const v = createVillager(x, z, TUQUE_COLORS[i % TUQUE_COLORS.length] ?? 0xffffff, rand(0, Math.PI * 2), rollTrait());
  v.recruiting = recruiting;
  village.villagers.push(v);
  village.group.add(v.root);
  return v;
}

export function createVillage(scene: THREE.Scene, grid: Grid): Village {
  const group = new THREE.Group();
  scene.add(group);
  const village: Village = { villagers: [], group };
  for (let i = 0; i < VILLAGER.startCount; i++) {
    const w = randomFreeWorld(grid);
    const v = spawnVillager(village, w.x, w.z, i, false);
    setWanderTarget(v, grid);
  }
  return village;
}

/** One fixed sim step of villager decisions + movement. */
export function tickVillage(
  village: Village,
  grid: Grid,
  clock: Clock,
  dt: number,
  buildings: Buildings,
  store: Store,
): void {
  const night = isNightForVillagers(clock);
  for (const v of village.villagers) {
    if (v.recruiting) continue; // wanderers are driven by recruit.ts until they join

    // Day/night role switch.
    if (night) {
      if (v.state !== 'toFire' && v.state !== 'idleFire') {
        v.carryKind = null;
        v.carryAmt = 0;
        setFireTarget(v);
      }
    } else if (v.state === 'toFire' || v.state === 'idleFire') {
      if (v.job) startWork(v);
      else setWanderTarget(v, grid);
    }

    // March toward the current target.
    const dx = v.tx - v.x;
    const dz = v.tz - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VILLAGER.arriveDist) {
      const step = Math.min(VILLAGER.speed * dt, dist);
      v.x += (dx / dist) * step;
      v.z += (dz / dist) * step;
      v.facing = Math.atan2(dx, dz);
      v.moving = true;
      continue;
    }

    // Arrived → resolve state.
    v.moving = false;
    switch (v.state) {
      case 'wander':
        v.state = 'pause';
        v.pauseT = rand(VILLAGER.wanderPauseMin, VILLAGER.wanderPauseMax);
        break;
      case 'pause':
        v.pauseT -= dt;
        if (v.pauseT <= 0) setWanderTarget(v, grid);
        break;
      case 'toFire':
        v.state = 'idleFire';
        v.facing = Math.atan2(-v.x, -v.z);
        break;
      case 'idleFire':
        v.facing = Math.atan2(-v.x, -v.z);
        break;
      case 'toWork':
        v.state = 'working';
        v.pauseT = WORK.gatherTime;
        break;
      case 'working':
        v.pauseT -= dt;
        if (v.pauseT <= 0) {
          const prod = v.job?.def.produces;
          if (v.job && prod) {
            v.carryKind = prod.resource;
            v.carryAmt = yieldFor(v);
            const drop = buildings.nearestDropoff(v.x, v.z);
            v.tx = drop.x;
            v.tz = drop.z;
            v.state = 'toStorage';
          } else {
            setWanderTarget(v, grid); // job gone → fall back to idle
          }
        }
        break;
      case 'toStorage':
        v.state = 'deposit';
        v.pauseT = WORK.depositTime;
        break;
      case 'deposit':
        v.pauseT -= dt;
        if (v.pauseT <= 0) {
          if (v.carryKind) addResource(store, v.carryKind, v.carryAmt);
          v.carryKind = null;
          v.carryAmt = 0;
          startWork(v); // loop back to the work node
        }
        break;
    }
  }
}

/**
 * Animate every villager mesh (called each render frame, not each sim step).
 * `running` is false when paused so the walk cycle freezes.
 */
export function updateVillageVisuals(
  village: Village,
  t: number,
  dt: number,
  night: boolean,
  running: boolean,
): void {
  for (const v of village.villagers) updateVillagerVisual(v, t, dt, night, v.moving && running);
}
