// Targets: matte-paper rings sitting on/in the structures. A target dies on a
// hard enough impact (ball, falling block, or hitting the ground) — main.ts
// decides, this module owns the entities. Drawn as a single CanvasTexture (baked
// offset shadow + disc + core hole + centre pip), shared across all targets and
// rebuilt per theme. The radius is fixed, so one texture serves the whole pool.

import * as THREE from 'three';
import Matter from 'matter-js';
import * as C from './config';
import * as physics from './physics';
import type { TargetDesc } from './levelgen';

const { Bodies } = Matter;

const PXU = 128;
const PAD = 0.18;
const PLANE = 2 * (C.TARGET_RADIUS + PAD); // world size of the textured quad

let theme: C.Theme = C.THEMES.day;
const canvas = document.createElement('canvas');
canvas.width = Math.round(PLANE * PXU);
canvas.height = Math.round(PLANE * PXU);
const tex = new THREE.CanvasTexture(canvas);
tex.colorSpace = THREE.SRGBColorSpace;
const sharedMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
const geo = new THREE.PlaneGeometry(1, 1);

function drawTarget(): void {
  const ctx = canvas.getContext('2d')!;
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  const r = C.TARGET_RADIUS * PXU;
  ctx.fillStyle = 'rgba(70,45,30,0.20)';
  ctx.beginPath();
  ctx.arc(c + 0.05 * PXU, c + 0.13 * PXU, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.target;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.targetCore;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.target;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  tex.needsUpdate = true;
}

export interface Target {
  alive: boolean;
  body: Matter.Body | null;
  mesh: THREE.Mesh;
  phase: number;
}

const pool: Target[] = [];
const byBodyId = new Map<number, Target>();

export function init(scene: THREE.Scene): void {
  drawTarget();
  for (let i = 0; i < C.TARGET_POOL; i++) {
    const mesh = new THREE.Mesh(geo, sharedMat);
    mesh.scale.set(PLANE, PLANE, 1);
    mesh.position.z = 0.2;
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ alive: false, body: null, mesh, phase: Math.random() * Math.PI * 2 });
  }
}

export function setTheme(next: C.Theme): void {
  theme = next;
  drawTarget();
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
    target.mesh.position.set(desc.x, desc.y, 0.2);
    target.mesh.scale.set(PLANE, PLANE, 1);
    target.mesh.visible = true;
    byBodyId.set(body.id, target);
    physics.addBody(body, target.mesh);
  }
}

export function fromBody(body: Matter.Body): Target | undefined {
  return byBodyId.get(body.id);
}

export function kill(target: Target): void {
  if (!target.alive) return;
  target.alive = false;
  target.mesh.visible = false;
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
    const s = PLANE * (1 + C.TARGET_PULSE_AMP * Math.sin(elapsed * C.TARGET_PULSE_HZ * Math.PI * 2 + target.phase));
    target.mesh.scale.set(s, s, 1);
  }
}
