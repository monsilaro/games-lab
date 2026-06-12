// Matter.js world + three.js sync. Convention: matter coordinates ARE three
// world coordinates — y up, 1 unit ≈ 1 m, no axis flip anywhere. Only gravity
// knows which way is down (engine.gravity.y < 0).

import type * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';

const { Engine, Composite, Events, Sleeping, Body } = Matter;

export const engine = Engine.create({ enableSleeping: true });
// Matter applies gravity per tick as gravity.y · gravity.scale · dt_ms²; with a
// constant FIXED_DT step the effective acceleration in units/s² is
// gravity.y · gravity.scale · 1e6, so scale 1e-6 makes GRAVITY exact.
engine.gravity.x = 0;
engine.gravity.y = -C.GRAVITY;
engine.gravity.scale = 1e-6;

// Matter's sleep/wake thresholds compare `motion` (≈ speed², speed in units per
// 16.666 ms tick) against constants tuned for pixel-scale worlds. In metre
// units speeds are ~100× smaller, so without rescaling, toppling blocks would
// fall asleep mid-motion and a flying ball couldn't wake a sleeping tower.
const sleepTuning = Sleeping as unknown as {
  _motionSleepThreshold: number;
  _motionWakeThreshold: number;
};
sleepTuning._motionSleepThreshold = 2e-5; // sleep below ~0.27 units/s sustained
sleepTuning._motionWakeThreshold = 4e-4; // wake when hit at > ~1.2 units/s

// Matter velocities are per-tick (time-normalised to 16.666 ms); the game
// thinks in units/s. Convert at every boundary with these two helpers.
export function toTick(v: number): number {
  return v * C.FIXED_DT;
}
export function toPerSec(v: number): number {
  return v / C.FIXED_DT;
}

export type ImpactHandler = (
  a: Matter.Body,
  b: Matter.Body,
  relSpeed: number, // units/s
  x: number, // contact point (world units)
  y: number,
) => void;
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
    const support = pair.collision.supports[0];
    const cx = support ? support.x : (bodyA.position.x + bodyB.position.x) / 2;
    const cy = support ? support.y : (bodyA.position.y + bodyB.position.y) / 2;
    onImpact(bodyA, bodyB, rel, cx, cy);
  }
});

// --- Fixed-timestep accumulator -------------------------------------------------
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

// --- Body registry + mesh sync ---------------------------------------------------
interface SyncPair {
  body: Matter.Body;
  mesh: THREE.Object3D;
}
const pairs: SyncPair[] = [];
const dynamicBodies: Matter.Body[] = []; // tracked ourselves: allStill() runs per frame

export function addBody(body: Matter.Body, mesh?: THREE.Object3D): void {
  Composite.add(engine.world, body);
  if (!body.isStatic) dynamicBodies.push(body);
  if (mesh) pairs.push({ body, mesh });
}

export function removeBody(body: Matter.Body): void {
  Composite.remove(engine.world, body);
  const d = dynamicBodies.indexOf(body);
  if (d !== -1) dynamicBodies.splice(d, 1);
  const p = pairs.findIndex((pair) => pair.body === body);
  if (p !== -1) pairs.splice(p, 1);
  // Matter only wakes sleeping bodies on collision — removing a body from
  // under a sleeping stack would leave the stack frozen in mid-air (e.g. a
  // shattered column whose floor never falls). Wake everyone; bodies already
  // at rest go straight back to sleep.
  for (const b of dynamicBodies) if (b.isSleeping) Sleeping.set(b, false);
}

/** Copy body transforms onto their meshes — call once per rendered frame. */
export function syncMeshes(): void {
  for (const pair of pairs) {
    pair.mesh.position.x = pair.body.position.x;
    pair.mesh.position.y = pair.body.position.y;
    pair.mesh.rotation.z = pair.body.angle;
  }
}

/** True when every dynamic body is asleep or moving slower than STILL_SPEED. */
export function allStill(): boolean {
  for (const body of dynamicBodies) {
    if (body.isSleeping) continue;
    if (toPerSec(body.speed) > C.STILL_SPEED) return false;
  }
  return true;
}

/** Dev aid for the perf budget: how many dynamic bodies matter put to sleep. */
export function sleepingCount(): number {
  let n = 0;
  for (const body of dynamicBodies) if (body.isSleeping) n += 1;
  return n;
}

/** Remove every dynamic body (between levels / on restart). */
export function resetWorld(): void {
  while (dynamicBodies.length > 0) removeBody(dynamicBodies[dynamicBodies.length - 1]!);
}

/**
 * Radial blast at (x, y): every dynamic body within `radius` is shoved outward
 * with `speed` (units/s) at the center, falling off linearly to 0 at the edge.
 * Returns the bodies that were hit (excluding the blast origin) so the caller
 * can decide which to break. Velocity replaces (not adds to) the current one —
 * a clean kick reads better than accumulating momentum on a chained explosion.
 */
export function explode(x: number, y: number, radius: number, speed: number): Matter.Body[] {
  const hit: Matter.Body[] = [];
  for (const body of dynamicBodies) {
    const dx = body.position.x - x;
    const dy = body.position.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;
    if (body.isSleeping) Sleeping.set(body, false);
    const falloff = 1 - dist / radius;
    const v = speed * falloff;
    // a body sitting exactly on the origin gets pushed straight up
    const nx = dist > 1e-4 ? dx / dist : 0;
    const ny = dist > 1e-4 ? dy / dist : 1;
    Body.setVelocity(body, { x: toTick(nx * v), y: toTick(ny * v) });
    hit.push(body);
  }
  return hit;
}
