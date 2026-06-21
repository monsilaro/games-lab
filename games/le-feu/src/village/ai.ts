// Villager behaviour + the village container. Day: each villager wanders to a
// random free cell, pauses, repeats. Dusk/night: they walk to a ring around the
// fire and idle there with torches lit. Seek is a straight march toward the
// target (no A* in Phase 1 — the island is open, only the fire + a hut or two
// are obstacles; real pathfinding lands in Phase 2 when buildings form mazes).
import * as THREE from 'three';
import { VILLAGER, TUQUE_COLORS } from './../config';
import { cellToWorld, isFree, type Grid } from './../grid';
import type { Clock } from './../time';
import { isNightForVillagers } from './../time';
import { createVillager, updateVillagerVisual, type Villager } from './villager';

export interface Village {
  villagers: Villager[];
  group: THREE.Group;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Pick a random free land cell, returning its world centre (fallbacks to centre). */
function randomFreeWorld(grid: Grid): { x: number; z: number } {
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

export function createVillage(scene: THREE.Scene, grid: Grid): Village {
  const group = new THREE.Group();
  scene.add(group);
  const villagers: Villager[] = [];
  for (let i = 0; i < VILLAGER.startCount; i++) {
    const w = randomFreeWorld(grid);
    const tuque = TUQUE_COLOR(i);
    const v = createVillager(w.x, w.z, tuque, rand(0, Math.PI * 2));
    setWanderTarget(v, grid);
    villagers.push(v);
    group.add(v.root);
  }
  return { villagers, group };
}

// Cycle tuque colors through the palette set so the crowd reads as individuals.
function TUQUE_COLOR(i: number): number {
  return TUQUE_COLORS[i % TUQUE_COLORS.length] ?? 0xffffff;
}

/** One fixed sim step of villager decisions + movement. */
export function tickVillage(village: Village, grid: Grid, clock: Clock, dt: number): void {
  const night = isNightForVillagers(clock);
  for (const v of village.villagers) {
    // Forced day/night role switch.
    if (night && (v.state === 'wander' || v.state === 'pause')) {
      setFireTarget(v);
    } else if (!night && (v.state === 'toFire' || v.state === 'idleFire')) {
      setWanderTarget(v, grid);
    }

    // March toward target.
    const dx = v.tx - v.x;
    const dz = v.tz - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VILLAGER.arriveDist) {
      const step = Math.min(VILLAGER.speed * dt, dist);
      v.x += (dx / dist) * step;
      v.z += (dz / dist) * step;
      v.facing = Math.atan2(dx, dz);
      v.moving = true;
    } else {
      v.moving = false;
      // Arrived → resolve state.
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
          v.facing = Math.atan2(-v.x, -v.z); // face the fire at origin
          break;
        case 'idleFire':
          v.facing = Math.atan2(-v.x, -v.z);
          break;
      }
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
