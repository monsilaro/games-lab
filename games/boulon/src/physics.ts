// matter-js world + three.js sync for Boulon. The sim runs in the FLOOR plane:
// matter (x, y) → three (x, 0, y), matter angle → mesh rotation about Y.
// Gravity is OFF (top-down field seen at a tilt). Damping comes from each
// body's frictionAir, never gravity. Adapted from games/slingshot/src/physics.ts.

import type * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';

const { Engine, Composite, Events, Sleeping } = Matter;

export const engine = Engine.create({ enableSleeping: true });
// No gravity: the matter plane is the ground seen from above.
engine.gravity.x = 0;
engine.gravity.y = 0;
engine.gravity.scale = 0;

// Matter's sleep/wake thresholds are tuned for pixel-scale worlds; in metre
// units speeds are ~100× smaller, so rescale or debris would never sleep (and
// never wake on impact). Matters for the Phase 2 debris perf budget.
const sleepTuning = Sleeping as unknown as {
  _motionSleepThreshold: number;
  _motionWakeThreshold: number;
};
sleepTuning._motionSleepThreshold = 2e-5; // sleep below ~0.27 units/s sustained
sleepTuning._motionWakeThreshold = 4e-4; // wake when hit at > ~1.2 units/s

// Collision categories so projectiles ignore the player, etc.
export const CAT = {
  rail: 0x0001,
  player: 0x0002,
  projectile: 0x0004,
  enemy: 0x0008,
} as const;

// Matter velocities are per-tick (normalised to 16.666 ms); the game thinks in
// units/s. Convert at every boundary.
export function toTick(v: number): number {
  return v * C.FIXED_DT;
}
export function toPerSec(v: number): number {
  return v / C.FIXED_DT;
}

export type ImpactHandler = (a: Matter.Body, b: Matter.Body, relSpeed: number) => void;
let onImpact: ImpactHandler | null = null;
export function setImpactHandler(handler: ImpactHandler): void {
  onImpact = handler;
}

Events.on(engine, 'collisionStart', (ev) => {
  if (!onImpact) return;
  for (const pair of ev.pairs) {
    const { bodyA, bodyB } = pair;
    const rel = toPerSec(
      Math.hypot(bodyA.velocity.x - bodyB.velocity.x, bodyA.velocity.y - bodyB.velocity.y),
    );
    onImpact(bodyA, bodyB, rel);
  }
});

// --- Fixed-timestep accumulator -------------------------------------------
let acc = 0;
export function stepPhysics(dt: number): void {
  acc += dt;
  let steps = 0;
  while (acc >= C.FIXED_DT && steps < 5) {
    Engine.update(engine, C.FIXED_DT * 1000);
    acc -= C.FIXED_DT;
    steps += 1;
  }
  if (steps === 5) acc = 0; // spiral-of-death guard
}

// --- Body registry + floor-plane mesh sync --------------------------------
interface SyncPair {
  body: Matter.Body;
  mesh: THREE.Object3D;
}
const pairs: SyncPair[] = [];

export function addBody(body: Matter.Body, mesh?: THREE.Object3D): void {
  Composite.add(engine.world, body);
  if (mesh) pairs.push({ body, mesh });
}

export function removeBody(body: Matter.Body): void {
  Composite.remove(engine.world, body);
  const p = pairs.findIndex((pair) => pair.body === body);
  if (p !== -1) pairs.splice(p, 1);
}

/** Copy body transforms onto their meshes — call once per rendered frame. */
export function syncMeshes(): void {
  for (const pair of pairs) {
    pair.mesh.position.x = pair.body.position.x;
    pair.mesh.position.z = pair.body.position.y; // matter y → world Z (floor)
    pair.mesh.rotation.y = -pair.body.angle;
  }
}

/** Dev aid for the Phase 2 perf budget: how many dynamic bodies are asleep. */
export function sleepingCount(): number {
  let n = 0;
  for (const pair of pairs) if (pair.body.isSleeping) n += 1;
  return n;
}
