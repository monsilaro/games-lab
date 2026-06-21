// Passive recruitment: every so often a wanderer appears at the shore and walks
// to the fire; on arrival it joins the colony (more hands, more mouths). While
// inbound it carries a "!" marker (rendered by the HUD) and is skipped by the
// normal AI. Nothing spawns once the population cap (base + houses) is reached.
import { RECRUIT, GRID, VILLAGER } from './../config';
import type { Grid } from './../grid';
import { spawnVillager, type Village } from './ai';

export interface Recruiter {
  timer: number;
}

export function createRecruiter(): Recruiter {
  return { timer: RECRUIT.interval };
}

/** Colonists actually living here (wanderers in transit don't count yet). */
export function population(village: Village): number {
  let n = 0;
  for (const v of village.villagers) if (!v.recruiting) n++;
  return n;
}

export function popCap(houseCapacity: number): number {
  return RECRUIT.basePopCap + houseCapacity;
}

export function tickRecruit(
  rec: Recruiter,
  village: Village,
  _grid: Grid,
  dt: number,
  houseCapacity: number,
): void {
  // Drive inbound wanderers toward the fire at the origin.
  let incoming = 0;
  for (const v of village.villagers) {
    if (!v.recruiting) continue;
    const dx = -v.x;
    const dz = -v.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VILLAGER.fireRingMax) {
      const step = Math.min(VILLAGER.speed * dt, dist);
      v.x += (dx / dist) * step;
      v.z += (dz / dist) * step;
      v.facing = Math.atan2(dx, dz);
      v.moving = true;
      incoming++;
    } else {
      // Reached the fire → join as an idle colonist (AI takes over next tick).
      v.recruiting = false;
      v.moving = false;
      v.state = 'pause';
      v.pauseT = 0;
      v.tx = v.x; // arrive in place — don't march back to the shore spawn
      v.tz = v.z;
    }
  }

  // Periodically spawn a new wanderer if there's room.
  rec.timer -= dt;
  if (rec.timer > 0) return;
  rec.timer = RECRUIT.interval;
  if (population(village) + incoming >= popCap(houseCapacity)) return;

  const ang = Math.random() * Math.PI * 2;
  const r = (GRID.islandRadius + 0.5) * GRID.cell;
  const x = Math.cos(ang) * r;
  const z = Math.sin(ang) * r;
  const v = spawnVillager(village, x, z, village.villagers.length, true);
  v.facing = Math.atan2(-x, -z);
}
