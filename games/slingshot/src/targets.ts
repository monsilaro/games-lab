// Targets: aurora-green rings sitting on/in the structures. A target dies on a
// hard enough impact (ball, falling block, or hitting the ground) — main.ts
// decides, this module owns the entities.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { TargetDesc } from './levelgen';

const { Bodies } = Matter;

const ringGeo = new THREE.CircleGeometry(C.TARGET_RADIUS, 24);
const coreGeo = new THREE.CircleGeometry(C.TARGET_RADIUS * 0.45, 16);
const ringMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.target });
const coreMat = new THREE.MeshBasicMaterial({ color: C.PALETTE.targetCore });

export interface Target {
  alive: boolean;
  body: Matter.Body | null;
  group: THREE.Group;
  phase: number;
}

const pool: Target[] = [];
const byBodyId = new Map<number, Target>();

export function init(scene: THREE.Scene): void {
  for (let i = 0; i < C.TARGET_POOL; i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(ringGeo, ringMat));
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.z = 0.01;
    group.add(core);
    group.position.z = 0.2;
    group.visible = false;
    scene.add(group);
    pool.push({ alive: false, body: null, group, phase: Math.random() * Math.PI * 2 });
  }
}

export function spawnFromDescs(descs: TargetDesc[]): void {
  for (const desc of descs) {
    const target = pool.find((t) => !t.alive);
    if (!target) break;
    const body = Bodies.circle(desc.x, desc.y, C.TARGET_RADIUS, {
      label: 'target',
      friction: 0.6,
      restitution: 0.1,
    });
    target.alive = true;
    target.body = body;
    target.group.position.set(desc.x, desc.y, 0.2);
    target.group.visible = true;
    byBodyId.set(body.id, target);
    physics.addBody(body, target.group);
  }
}

export function fromBody(body: Matter.Body): Target | undefined {
  return byBodyId.get(body.id);
}

export function kill(target: Target): void {
  if (!target.alive) return;
  target.alive = false;
  target.group.visible = false;
  if (target.body) {
    byBodyId.delete(target.body.id);
    physics.removeBody(target.body);
    target.body = null;
  }
}

export function aliveCount(): number {
  let n = 0;
  for (const target of pool) if (target.alive) n += 1;
  return n;
}

export function alive(): readonly Target[] {
  return pool; // callers filter on .alive — avoids allocating a new array
}

export function reset(): void {
  for (const target of pool) kill(target);
}

/** Light scale pulse — applied after syncMeshes so it composes with physics. */
export function pulse(elapsed: number): void {
  for (const target of pool) {
    if (!target.alive) continue;
    const s = 1 + C.TARGET_PULSE_AMP * Math.sin(elapsed * C.TARGET_PULSE_HZ * Math.PI * 2 + target.phase);
    target.group.scale.set(s, s, 1);
  }
}
