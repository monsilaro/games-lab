// Night threats (Phase 4): faceted "shades" with glowing violet eyes that prowl
// in from the dark each night. They march toward the fire and halt at its light
// ring (fireRadius); while the fire is strong they can't reach the camp. When the
// fire weakens the ring tightens past the huddle, a shade slips within reach of a
// villager, grabs one (onKill) and flees. All shades flee and despawn at dawn.
import * as THREE from 'three';
import { PALETTE, THREAT } from './config';
import { isNightForVillagers, type Clock } from './time';
import type { Village } from './village/ai';
import type { Villager } from './village/villager';

interface Shade {
  active: boolean;
  fleeing: boolean;
  x: number;
  z: number;
  bobPhase: number;
  root: THREE.Group;
}

export interface Threats {
  group: THREE.Group;
  pool: Shade[];
  spawnT: number;
}

function lambert(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// A low, hunched shadow with two emissive violet eyes (the prepared supernatural
// accent finally pays off). Dark faceted lambert so it still sits in the lit look.
function buildShade(): THREE.Group {
  const g = new THREE.Group();
  // Dark indigo (not pure black) so the facets still catch the firelight and the
  // shape reads against the night ground.
  const dark = 0x1a1a30;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), lambert(dark));
  body.scale.set(1.2, 0.8, 1.7);
  body.position.y = 0.5;
  g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), lambert(dark));
  head.position.set(0, 0.68, 0.66);
  g.add(head);
  const eyeMat = new THREE.MeshLambertMaterial({
    color: PALETTE.violet,
    emissive: PALETTE.violet,
    flatShading: true,
  });
  eyeMat.emissiveIntensity = 1.8;
  for (const ex of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), eyeMat);
    eye.position.set(ex, 0.72, 0.9);
    g.add(eye);
  }
  g.visible = false;
  return g;
}

export function createThreats(scene: THREE.Scene): Threats {
  const group = new THREE.Group();
  scene.add(group);
  const pool: Shade[] = [];
  for (let i = 0; i < THREAT.maxCount; i++) {
    const root = buildShade();
    group.add(root);
    pool.push({ active: false, fleeing: false, x: 0, z: 0, bobPhase: Math.random() * Math.PI * 2, root });
  }
  return { group, pool, spawnT: 0 };
}

/** How many shades a given night should field (scales with the day count). */
function targetCount(day: number): number {
  const n = THREAT.base + (day - 1 - THREAT.graceDays) * THREAT.perDay;
  return Math.max(0, Math.min(THREAT.maxCount, n));
}

function activeCount(threats: Threats): number {
  let n = 0;
  for (const s of threats.pool) if (s.active && !s.fleeing) n++;
  return n;
}

function spawnShade(threats: Threats): void {
  const s = threats.pool.find((p) => !p.active);
  if (!s) return;
  const ang = Math.random() * Math.PI * 2;
  s.x = Math.cos(ang) * THREAT.spawnRadius;
  s.z = Math.sin(ang) * THREAT.spawnRadius;
  s.active = true;
  s.fleeing = false;
  s.root.visible = true;
}

/** One fixed sim step of the threat system. `onKill` removes the given villager. */
export function tickThreats(
  threats: Threats,
  village: Village,
  clock: Clock,
  dt: number,
  fireRadius: number,
  onKill: (v: Villager) => void,
): void {
  const night = isNightForVillagers(clock);

  if (night && clock.day > THREAT.graceDays) {
    threats.spawnT -= dt;
    if (threats.spawnT <= 0 && activeCount(threats) < targetCount(clock.day)) {
      spawnShade(threats);
      threats.spawnT = THREAT.spawnInterval;
    }
  } else {
    // Day / dawn: everyone still prowling turns tail and flees.
    for (const s of threats.pool) if (s.active && !s.fleeing) s.fleeing = true;
  }

  for (const s of threats.pool) {
    if (!s.active) continue;

    if (s.fleeing) {
      const d = Math.hypot(s.x, s.z) || 1;
      const step = THREAT.speed * dt;
      s.x += (s.x / d) * step;
      s.z += (s.z / d) * step;
      if (d >= THREAT.fleeRadius) {
        s.active = false;
        s.root.visible = false;
      }
      continue;
    }

    // Approach the fire, but never cross inside the light ring.
    const d = Math.hypot(s.x, s.z) || 0.001;
    if (d > fireRadius + 0.02) {
      const step = Math.min(THREAT.speed * dt, d - fireRadius);
      s.x -= (s.x / d) * step;
      s.z -= (s.z / d) * step;
    } else {
      // Held at the wall of light: prowl tangentially and probe for prey.
      const ang = Math.atan2(s.z, s.x) + THREAT.prowl * dt;
      const r = Math.max(fireRadius, 0.001);
      s.x = Math.cos(ang) * r;
      s.z = Math.sin(ang) * r;
      for (const v of village.villagers) {
        if (v.recruiting) continue;
        if (Math.hypot(v.x - s.x, v.z - s.z) < THREAT.attackDist) {
          onKill(v);
          s.fleeing = true;
          break;
        }
      }
    }
  }
}

/** Render-rate visuals: position, face travel direction, a low menacing bob. */
export function updateThreatVisuals(threats: Threats, t: number): void {
  for (const s of threats.pool) {
    if (!s.active) continue;
    s.root.position.set(s.x, 0, s.z);
    // Face the fire (or, when fleeing, away from it).
    const yaw = Math.atan2(s.fleeing ? s.x : -s.x, s.fleeing ? s.z : -s.z);
    s.root.rotation.y = yaw;
    s.root.position.y = Math.abs(Math.sin(t * 4 + s.bobPhase)) * 0.08;
  }
}
